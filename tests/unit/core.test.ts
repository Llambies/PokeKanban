import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module
import { createHandler } from '../../server/core.mjs';
// @ts-expect-error plain JS module
import { durableStorage } from '../../worker/store.js';

/** In-memory stand-in for Durable Object storage (get/put/delete with single keys, arrays or objects). */
function fakeDurableStorage() {
  const map = new Map<string, unknown>();
  return {
    map,
    async get(key: string | string[]) {
      if (Array.isArray(key)) return new Map(key.filter((k) => map.has(k)).map((k) => [k, structuredClone(map.get(k))]));
      return structuredClone(map.get(key));
    },
    async put(key: string | Record<string, unknown>, value?: unknown) {
      if (typeof key === 'string') map.set(key, structuredClone(value));
      else for (const [k, v] of Object.entries(key)) map.set(k, structuredClone(v));
    },
    async delete(key: string | string[]) {
      for (const k of Array.isArray(key) ? key : [key]) map.delete(k);
    },
  };
}

const BASE = 'https://kanban.example';

function makeApi(password = '', requirePassword = false) {
  const raw = fakeDurableStorage();
  const handle = createHandler({ storage: durableStorage(raw), password, requirePassword });
  let cookie = '';
  const call = async (path: string, init: RequestInit & { json?: unknown } = {}) => {
    const headers = new Headers(init.headers);
    if (cookie) headers.set('cookie', cookie);
    if (init.json !== undefined) headers.set('content-type', 'application/json');
    const res: Response = await handle(
      new Request(BASE + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body }),
      { ip: '1.2.3.4' },
    );
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0].endsWith('=') ? '' : setCookie.split(';')[0];
    return res;
  };
  return { raw, call, setCookie: (c: string) => (cookie = c) };
}

describe('storage API core', () => {
  it('stores documents with revisions and detects conflicts', async () => {
    const { call } = makeApi();
    expect(await (await call('/api/data')).json()).toEqual({ rev: 0, savedAt: null, data: null });
    const first = await call('/api/data', { method: 'PUT', json: { baseRev: 0, data: { boards: { a: 1 } } } });
    expect((await first.json()).rev).toBe(1);
    const stale = await call('/api/data', { method: 'PUT', json: { baseRev: 0, data: { boards: {} } } });
    expect(stale.status).toBe(409);
    const forced = await call('/api/data', { method: 'PUT', json: { baseRev: 0, data: { boards: { b: 2 } }, force: true } });
    expect((await forced.json()).rev).toBe(2);
    expect((await (await call('/api/data')).json()).data).toEqual({ boards: { b: 2 } });
  });

  it('splits big documents into chunks and reads them back intact', async () => {
    const { raw, call } = makeApi();
    const big = { text: 'ñ🙂'.repeat(60_000) }; // ~360 KB of multi-byte UTF-8
    await call('/api/data', { method: 'PUT', json: { baseRev: 0, data: big } });
    const meta = raw.map.get('doc:meta') as { chunks: number };
    expect(meta.chunks).toBeGreaterThan(2);
    // A fresh handler (new Durable Object instance) reads from storage, not from memory.
    const reread = createHandler({ storage: durableStorage(raw) });
    const res: Response = await reread(new Request(BASE + '/api/data'));
    expect((await res.json()).data).toEqual(big);
  });

  it('keeps an hourly snapshot of the previous state', async () => {
    const { call } = makeApi();
    await call('/api/data', { method: 'PUT', json: { baseRev: 0, data: { v: 1 } } });
    await call('/api/data', { method: 'PUT', json: { baseRev: 1, data: { v: 2 } } });
    const list = await (await call('/api/backups')).json();
    expect(list).toHaveLength(1);
    const backup = await (await call(`/api/backups/${list[0].name}`)).json();
    expect(backup.data).toEqual({ v: 1 });
  });

  it('stores and serves uploads', async () => {
    const { call } = makeApi();
    const bytes = new Uint8Array(300_000).map((_, i) => i % 251);
    const up = await call('/api/uploads?name=foto.png', { method: 'POST', body: bytes, headers: { 'x-pokekanban-upload': '1' } });
    const { url, size, type } = await up.json();
    expect(size).toBe(bytes.length);
    expect(type).toBe('image/png');
    const file = await call('/' + url);
    expect(file.headers.get('content-security-policy')).toContain('sandbox');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  });

  it('rejects cross-site writes', async () => {
    const { call } = makeApi();
    const res = await call('/api/data', { method: 'PUT', json: { baseRev: 0, data: {} }, headers: { origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
  });
});

describe('login', () => {
  it('requires a session when a password is set', async () => {
    const { call } = makeApi('secreto');
    expect((await call('/api/data')).status).toBe(401);
    expect(await (await call('/api/session')).json()).toMatchObject({ auth: true, authenticated: false });

    const wrong = await call('/api/login', { method: 'POST', json: { password: 'nope' } });
    expect(wrong.status).toBe(401);
    const ok = await call('/api/login', { method: 'POST', json: { password: 'secreto' } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('set-cookie')).toMatch(/pk_session=.+HttpOnly; SameSite=Strict; Secure/);
    expect((await call('/api/data')).status).toBe(200);
    expect(await (await call('/api/session')).json()).toMatchObject({ authenticated: true });

    await call('/api/logout', { method: 'POST' });
    expect((await call('/api/data')).status).toBe(401);
  });

  it('rejects forged or foreign session cookies', async () => {
    const a = makeApi('uno');
    await a.call('/api/login', { method: 'POST', json: { password: 'uno' } });
    const b = makeApi('dos');
    const exp = Date.now() + 1e9;
    b.setCookie(`pk_session=${exp}.AAAA`);
    expect((await b.call('/api/data')).status).toBe(401);
  });

  it('locks out after repeated failures', async () => {
    const { call } = makeApi('secreto');
    for (let i = 0; i < 5; i++) await call('/api/login', { method: 'POST', json: { password: 'x' } });
    const locked = await call('/api/login', { method: 'POST', json: { password: 'secreto' } });
    expect(locked.status).toBe(429);
  }, 10_000);

  it('refuses to serve data when a password is required but missing', async () => {
    const { call } = makeApi('', true);
    expect((await call('/api/data')).status).toBe(503);
    expect(await (await call('/api/session')).json()).toMatchObject({ configured: false });
  });
});
