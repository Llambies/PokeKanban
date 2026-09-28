// Tiny JSON-file storage API shared by the Vite dev server and the production server.
//
//   GET  /api/meta             -> { rev, savedAt, uploads }
//   GET  /api/data             -> { rev, savedAt, data }
//   PUT  /api/data             <- { baseRev, data, force? }  -> { rev, savedAt } | 409 { rev, savedAt }
//   GET  /api/backups          -> [{ name, size, mtime }]
//   GET  /api/backups/<name>   -> backup file
//   POST /api/uploads?name=x   <- raw file body            -> { url, name, size, type }
//   GET  /api/uploads/<file>   -> uploaded file (sandboxed)
//
// Every save rewrites the data file atomically. Before the first save of each hour the previous
// state is copied to data/backups/pokekanban-YYYY-MM-DD-HHh.json (UTC); snapshots from the last
// 48 hours are kept, plus the first one of each day for MAX_BACKUPS days.
//
// Writes are only accepted from the app's own origin (JSON body / custom header,
// which browsers never send cross-site without a CORS preflight we don't answer).

import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_BODY = 50 * 1024 * 1024;
const MAX_UPLOAD = 25 * 1024 * 1024;
const MAX_BACKUPS = 30;
const FILE_NAME = 'pokekanban.json';
const BACKUP_NAME = /^pokekanban-(\d{4}-\d{2}-\d{2})(?:-(\d{2})h)?\.json$/;
const ROUTE = /(?:^|\/)api\/(meta|data|backups|uploads)(?:\/([^/]+))?$/;

const UPLOAD_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.zip': 'application/zip',
};

export function createApi({ dataDir }) {
  const file = path.join(dataDir, FILE_NAME);
  const backupsDir = path.join(dataDir, 'backups');
  const uploadsDir = path.join(dataDir, 'uploads');
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

  /**
   * Before the first save of each hour, the current file (the state *before* the change) is copied
   * to backups/. A destructive save can therefore always be rolled back to at most an hour earlier.
   */
  async function snapshot() {
    const stamp = new Date().toISOString().slice(0, 13).replace('T', '-');
    const target = path.join(backupsDir, `pokekanban-${stamp}h.json`);
    if (await fs.stat(target).catch(() => null)) return;
    try {
      await fs.copyFile(file, target);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  /** Keeps every snapshot from the last 48 hours plus the first one of each day for MAX_BACKUPS days. */
  async function prune() {
    const now = Date.now();
    const names = (await fs.readdir(backupsDir)).filter((n) => BACKUP_NAME.test(n)).sort();
    const keptDays = new Set();
    for (const name of names) {
      const [, day, hour = '00'] = BACKUP_NAME.exec(name);
      const time = Date.parse(`${day}T${hour}:00:00Z`);
      const age = now - time;
      if (age < 48 * 3600e3) continue;
      if (age < MAX_BACKUPS * 24 * 3600e3 && !keptDays.has(day)) {
        keptDays.add(day);
        continue;
      }
      await fs.rm(path.join(backupsDir, name), { force: true });
    }
  }

  async function persist(next) {
    await fs.mkdir(backupsDir, { recursive: true });
    await snapshot();
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next));
    await fs.rename(tmp, file);
    await prune();
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

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > limit) {
          reject(Object.assign(new Error('Archivo demasiado grande'), { status: 413 }));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  /** Rejects cross-site writes (CSRF). Same-origin fetches send a matching Origin or none. */
  function sameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }

  async function handleSave(req, res) {
    if (!(req.headers['content-type'] ?? '').includes('application/json')) {
      return send(res, 415, { error: 'Se esperaba JSON' });
    }
    let body;
    try {
      body = JSON.parse((await readBody(req, MAX_BODY)).toString('utf8'));
    } catch (err) {
      return send(res, err.status ?? 400, { error: err.status ? err.message : 'JSON inválido' });
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

  async function handleUpload(req, res, url) {
    if (req.headers['x-pokekanban-upload'] !== '1') return send(res, 400, { error: 'Cabecera requerida' });
    const original = (url.searchParams.get('name') ?? 'archivo').slice(0, 180);
    const ext = path.extname(original).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
    let data;
    try {
      data = await readBody(req, MAX_UPLOAD);
    } catch (err) {
      return send(res, err.status ?? 400, { error: err.message });
    }
    await fs.mkdir(uploadsDir, { recursive: true });
    const stored = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    await fs.writeFile(path.join(uploadsDir, stored), data);
    return send(res, 200, {
      url: `api/uploads/${stored}`,
      name: original,
      size: data.length,
      type: UPLOAD_TYPES[ext] ?? 'application/octet-stream',
    });
  }

  async function serveUpload(req, res, name) {
    if (!/^[\w-]+(\.[a-z0-9]+)?$/.test(name)) return send(res, 404, { error: 'No encontrado' });
    const full = path.join(uploadsDir, name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat?.isFile()) return send(res, 404, { error: 'No encontrado' });
    const ext = path.extname(name).toLowerCase();
    const type = UPLOAD_TYPES[ext] ?? 'application/octet-stream';
    const inline = type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/') ||
      type === 'application/pdf' || type.startsWith('text/plain');
    res.writeHead(200, {
      'content-type': type,
      'content-length': stat.size,
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      // Uploaded content never runs scripts on our origin.
      'content-security-policy': "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      'content-disposition': inline ? 'inline' : 'attachment',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(full).pipe(res);
  }

  /** Returns true when the request was handled. */
  return async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const match = ROUTE.exec(url.pathname.replace(/\/+$/, ''));
    if (!match) return false;
    const [, resource, param] = match;
    const isRead = req.method === 'GET' || req.method === 'HEAD';

    try {
      if (!isRead && !sameOrigin(req)) {
        send(res, 403, { error: 'Origen no permitido' });
        return true;
      }
      if (resource === 'meta' && !param && isRead) {
        const { rev, savedAt } = await load();
        send(res, 200, { rev, savedAt, uploads: true });
        return true;
      }
      if (resource === 'data' && !param) {
        if (isRead) send(res, 200, await load());
        else if (req.method === 'PUT') await handleSave(req, res);
        else send(res, 405, { error: 'Método no permitido' });
        return true;
      }
      if (resource === 'uploads') {
        if (!param && req.method === 'POST') await handleUpload(req, res, url);
        else if (param && isRead) await serveUpload(req, res, param);
        else send(res, 405, { error: 'Método no permitido' });
        return true;
      }
      if (resource === 'backups' && isRead) {
        await fs.mkdir(backupsDir, { recursive: true });
        if (!param) {
          const names = (await fs.readdir(backupsDir)).filter((n) => BACKUP_NAME.test(n)).sort().reverse();
          const list = await Promise.all(
            names.map(async (n) => {
              const st = await fs.stat(path.join(backupsDir, n));
              return { name: n, size: st.size, mtime: st.mtime.toISOString() };
            }),
          );
          send(res, 200, list);
          return true;
        }
        if (!BACKUP_NAME.test(param)) {
          send(res, 404, { error: 'No encontrado' });
          return true;
        }
        try {
          const content = await fs.readFile(path.join(backupsDir, param), 'utf8');
          send(res, 200, content, { 'content-disposition': `attachment; filename="${param}"` });
        } catch {
          send(res, 404, { error: 'No encontrado' });
        }
        return true;
      }
      return false;
    } catch (err) {
      if (!res.headersSent) send(res, 500, { error: String(err?.message ?? err) });
      return true;
    }
  };
}
