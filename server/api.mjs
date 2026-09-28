// Node adapter for the storage API (see server/core.mjs): converts Node's req/res to
// Request/Response and stores everything on disk (see server/fs-storage.mjs).
// Used by the production server (server/index.mjs) and the Vite dev server.

import { Readable } from 'node:stream';
import { createHandler, isApiPath } from './core.mjs';
import { fsStorage } from './fs-storage.mjs';

const SKIP_HEADERS = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'http2-settings']);

// setTimeout can't wait longer than ~24.8 days; the handler simply reschedules when woken early.
const MAX_DELAY = 2 ** 31 - 1;

export function createApi({ dataDir, password = '' }) {
  let timer = null;
  const scheduler = {
    set(at) {
      clearTimeout(timer);
      timer = null;
      if (at === null || at === undefined) return;
      timer = setTimeout(() => {
        handler.runAlarm().catch((err) => console.error('Error al enviar avisos:', err));
      }, Math.min(Math.max(0, at - Date.now()), MAX_DELAY));
      timer.unref?.();
    },
  };
  const handler = createHandler({ storage: fsStorage(dataDir), password, scheduler });
  handler.reschedule().catch(() => {});

  /** Returns true when the request was handled. */
  return async function handle(req, res) {
    const secure = Boolean(req.socket?.encrypted) || req.headers['x-forwarded-proto'] === 'https';
    const url = new URL(req.url ?? '/', `${secure ? 'https' : 'http'}://${req.headers.host ?? 'localhost'}`);
    if (!isApiPath(url.pathname)) return false;

    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined || SKIP_HEADERS.has(name)) continue;
      for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v);
    }
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(url, {
      method: req.method,
      headers,
      body: hasBody ? Readable.toWeb(req) : undefined,
      duplex: 'half',
    });

    const response = await handler(request, { ip: req.socket?.remoteAddress ?? '', secure });
    if (!response) return false;

    const out = {};
    response.headers.forEach((value, name) => {
      if (name !== 'set-cookie') out[name] = value;
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) out['set-cookie'] = cookies;
    res.writeHead(response.status, out);
    if (!response.body || req.method === 'HEAD') {
      res.end();
      return true;
    }
    Readable.fromWeb(response.body).pipe(res);
    return true;
  };
}
