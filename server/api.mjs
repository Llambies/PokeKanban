// Tiny JSON-file storage API shared by the Vite dev server and the production server.
//
//   GET  /api/meta   -> { rev, savedAt }
//   GET  /api/data   -> { rev, savedAt, data }
//   PUT  /api/data   <- { baseRev, data, force? }  -> { rev, savedAt } | 409 { rev, savedAt }
//   GET  /api/backups         -> [{ name, size, mtime }]
//   GET  /api/backups/<name>  -> backup file
//
// Every save rewrites the data file atomically and refreshes a daily backup
// (data/backups/pokekanban-YYYY-MM-DD.json), keeping the last MAX_BACKUPS days.

import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_BODY = 50 * 1024 * 1024;
const MAX_BACKUPS = 30;
const FILE_NAME = 'pokekanban.json';

export function createApi({ dataDir }) {
  const file = path.join(dataDir, FILE_NAME);
  const backupsDir = path.join(dataDir, 'backups');
  let doc = null;
  let queue = Promise.resolve();

  async function load() {
    if (doc) return doc;
    try {
      doc = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      doc = { rev: 0, savedAt: null, data: null };
    }
    return doc;
  }

  async function persist(next) {
    await fs.mkdir(backupsDir, { recursive: true });
    const json = JSON.stringify(next);
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, json);
    await fs.rename(tmp, file);
    const day = new Date().toISOString().slice(0, 10);
    await fs.writeFile(path.join(backupsDir, `pokekanban-${day}.json`), json);
    const backups = (await fs.readdir(backupsDir)).filter((n) => n.endsWith('.json')).sort();
    for (const old of backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS))) {
      await fs.rm(path.join(backupsDir, old), { force: true });
    }
  }

  function send(res, status, body, headers = {}) {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    });
    res.end(payload);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          reject(Object.assign(new Error('Payload too large'), { status: 413 }));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  async function handleSave(req, res) {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (err) {
      return send(res, err.status ?? 400, { error: err.message ?? 'JSON inválido' });
    }
    if (!body || typeof body.data !== 'object' || body.data === null) {
      return send(res, 400, { error: 'Falta "data"' });
    }
    // Serialize writes so revisions stay consistent.
    const result = (queue = queue.then(async () => {
      const current = await load();
      if (!body.force && body.baseRev !== current.rev) {
        return { status: 409, body: { error: 'conflict', rev: current.rev, savedAt: current.savedAt } };
      }
      const next = { rev: current.rev + 1, savedAt: new Date().toISOString(), data: body.data };
      await persist(next);
      doc = next;
      return { status: 200, body: { rev: next.rev, savedAt: next.savedAt } };
    }).catch((err) => ({ status: 500, body: { error: String(err?.message ?? err) } })));
    const { status, body: out } = await result;
    return send(res, status, out);
  }

  /** Returns true when the request was handled. */
  return async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = url.pathname.replace(/\/+$/, '');
    if (!route.endsWith('/api/meta') && !route.includes('/api/data') && !route.includes('/api/backups')) return false;

    try {
      if (route.endsWith('/api/meta') && req.method === 'GET') {
        const { rev, savedAt } = await load();
        send(res, 200, { rev, savedAt });
        return true;
      }
      if (route.endsWith('/api/data')) {
        if (req.method === 'GET') {
          send(res, 200, await load());
          return true;
        }
        if (req.method === 'PUT' || req.method === 'POST') {
          await handleSave(req, res);
          return true;
        }
        send(res, 405, { error: 'Método no permitido' });
        return true;
      }
      const backupMatch = /\/api\/backups(?:\/([\w.-]+))?$/.exec(route);
      if (backupMatch && req.method === 'GET') {
        await fs.mkdir(backupsDir, { recursive: true });
        const name = backupMatch[1];
        if (!name) {
          const names = (await fs.readdir(backupsDir)).filter((n) => n.endsWith('.json')).sort().reverse();
          const list = await Promise.all(
            names.map(async (n) => {
              const st = await fs.stat(path.join(backupsDir, n));
              return { name: n, size: st.size, mtime: st.mtime.toISOString() };
            }),
          );
          send(res, 200, list);
          return true;
        }
        if (!/^pokekanban-[\d-]+\.json$/.test(name)) {
          send(res, 404, { error: 'No encontrado' });
          return true;
        }
        try {
          const content = await fs.readFile(path.join(backupsDir, name), 'utf8');
          send(res, 200, content, { 'content-disposition': `attachment; filename="${name}"` });
        } catch {
          send(res, 404, { error: 'No encontrado' });
        }
        return true;
      }
      return false;
    } catch (err) {
      send(res, 500, { error: String(err?.message ?? err) });
      return true;
    }
  };
}
