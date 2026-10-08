// Storage API core, shared by the Node server (server/index.mjs + Vite dev server) and the
// Cloudflare Worker (worker/index.js). It only uses web-standard APIs (Request, Response,
// Web Crypto, streams) so it runs unchanged on both platforms; each one supplies a storage adapter.
//
//   GET  /api/session          -> { auth, authenticated, configured }
//   POST /api/login            <- { password }            -> sets the session cookie
//   POST /api/logout           -> clears the session cookie
//   GET  /api/meta             -> { rev, savedAt, uploads }
//   GET  /api/data             -> { rev, savedAt, data }
//   PUT  /api/data             <- { baseRev, data, force? }  -> { rev, savedAt } | 409 { rev, savedAt }
//   GET  /api/backups          -> [{ name, size, mtime }]
//   GET  /api/backups/<name>   -> backup file
//   POST /api/uploads?name=x   <- raw file body            -> { url, name, size, type }
//   GET  /api/uploads/<file>   -> uploaded file (sandboxed)
//   GET  /api/push             -> { publicKey, devices }     (VAPID key for PushManager.subscribe)
//   POST /api/push/subscribe   <- { subscription, device }   POST /api/push/unsubscribe <- { endpoint }
//   POST /api/push/test        <- { endpoint }               -> sends a test notification
//   GET  /api/agenda?days=14   -> { today, timeZone, items[, reminders] }  (Android widget and alarms)
//   GET  /api/keys             -> [{ id, name, scope, prefix, createdAt, lastUsedAt }]   (session; API keys for agents)
//   POST /api/keys             <- { name, scope: 'read' | 'write' } -> { ...key, key: 'pk_…' } (shown only once)
//   DELETE /api/keys/<id>      -> revokes the key
//   POST /api/mcp              MCP server (JSON-RPC over HTTP) for Claude Code, Codex…   Authorization: Bearer pk_…
//   GET  /api/agent            -> tools list      POST /api/agent/<tool> <- arguments  -> result   (same tools, plain JSON)
//
// When a password is configured every route except session/login/logout needs a valid session
// cookie (HttpOnly, SameSite=Strict, HMAC-signed with a key derived from the password, so changing
// the password logs every device out). Writes are only accepted from the app's own origin.
// mcp and agent are the exception: they are for programs and need an API key instead (only its SHA-256 is stored).
//
// Storage adapter interface (all async):
//   readDoc() -> string | null            writeDoc(text)
//   snapshot(name)  copy the current doc to backup `name` unless it exists (no doc: no-op)
//   listBackups() -> [{ name, size, mtime }]   readBackup(name) -> string | null   deleteBackup(name)
//   putFile(name, bytes, type)             getFile(name) -> { body, size } | null
//   getItem(key) -> string | null          setItem(key, text)     small documents (push subscriptions)
//
// Reminders are sent as Web Push notifications. The platform passes a `scheduler` ({ set(ms|null) })
// that calls `handle.runAlarm()` at that time (setTimeout on Node, Durable Object alarms on Cloudflare).

import { agenda, collectReminders, dayKeyAt } from '../shared/calendar.js';
import { generateVapidKeys, sendPush } from './push.mjs';
import { pokemonKey, pokemonSpriteUrl } from '../shared/pokemon.js';
import { ToolError, findTool, mcpMessage, toolContext, toolList } from './agent.mjs';

const MAX_BODY = 50 * 1024 * 1024;
const MAX_UPLOAD = 25 * 1024 * 1024;
const MAX_DAILY_BACKUPS = 30;
const SESSION_DAYS = 90;
const COOKIE = 'pk_session';
const MAX_AGENT_BODY = 2 * 1024 * 1024;
const MAX_KEYS = 50;
const KEY_TOUCH_MS = 60_000;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

const ROUTE = /(?:^|\/)api\/(session|login|logout|meta|data|backups|uploads|push|agenda|keys|mcp|agent)(?:\/([^/]+))?\/?$/;
const MAX_LATE_ON_SAVE = 10 * 60 * 1000;
const MAX_LATE_ON_ALARM = 6 * 3600 * 1000;
const MAX_SUBSCRIPTIONS = 20;
export const BACKUP_NAME = /^pokekanban-(\d{4}-\d{2}-\d{2})(?:-(\d{2})h)?\.json$/;
const UPLOAD_NAME = /^[\w-]+(\.[a-z0-9]+)?$/;

export const UPLOAD_TYPES = {
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

export function isApiPath(pathname) {
  return ROUTE.test(pathname);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(status, body, headers = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/** Reads a request body, refusing anything bigger than `limit` bytes (even without content-length). */
async function readLimited(request, limit) {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > limit) throw new HttpError(413, 'Demasiado grande');
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, 'Demasiado grande');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(text) {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function randomId(bytes = 6) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function parseCookies(header) {
  const out = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function sessionCookie(value, maxAge, secure) {
  return `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}

/** Hour stamp used for backup names (UTC). */
function hourStamp(date = new Date()) {
  return date.toISOString().slice(0, 13).replace('T', '-');
}

export function createHandler({ storage, password = '', requirePassword = false, scheduler = null, fetchImpl = (...a) => fetch(...a) }) {
  const authEnabled = password !== '';
  let doc = null; // { rev, savedAt, text }
  let queue = Promise.resolve();
  let keyPromise = null;
  const failures = new Map(); // ip -> { count, first, until }

  function sessionKey() {
    keyPromise ??= crypto.subtle
      .digest('SHA-256', encoder.encode(`pokekanban-session\u0000${password}`))
      .then((raw) => crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
    return keyPromise;
  }

  async function issueToken() {
    const exp = Date.now() + SESSION_DAYS * 86400e3;
    const sig = await crypto.subtle.sign('HMAC', await sessionKey(), encoder.encode(`v1:${exp}`));
    return { token: `${exp}.${base64url(sig)}`, exp };
  }

  /** Returns the session expiry when the request carries a valid session, else 0. */
  async function sessionExpiry(request) {
    const token = parseCookies(request.headers.get('cookie'))[COOKIE];
    if (!token) return 0;
    const [expText, sig] = token.split('.');
    const exp = Number(expText);
    if (!sig || !Number.isFinite(exp) || exp < Date.now()) return 0;
    try {
      const ok = await crypto.subtle.verify('HMAC', await sessionKey(), fromBase64url(sig), encoder.encode(`v1:${exp}`));
      return ok ? exp : 0;
    } catch {
      return 0;
    }
  }

  /** Constant-time password check (compares digests, not the strings). */
  async function passwordMatches(candidate) {
    const [a, b] = await Promise.all([
      crypto.subtle.digest('SHA-256', encoder.encode(String(candidate))),
      crypto.subtle.digest('SHA-256', encoder.encode(password)),
    ]);
    const x = new Uint8Array(a);
    const y = new Uint8Array(b);
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
    return diff === 0;
  }

  async function load() {
    if (doc) return doc;
    const text = await storage.readDoc();
    if (text === null) {
      doc = { rev: 0, savedAt: null, text: JSON.stringify({ rev: 0, savedAt: null, data: null }) };
      return doc;
    }
    const parsed = JSON.parse(text); // a corrupt file throws: the client shows an error instead of overwriting it
    doc = { rev: Number(parsed.rev) || 0, savedAt: parsed.savedAt ?? null, text };
    return doc;
  }

  /** Keeps every snapshot from the last 48 hours plus the first one of each day for 30 days. */
  async function prune() {
    const now = Date.now();
    const names = (await storage.listBackups()).map((b) => b.name).filter((n) => BACKUP_NAME.test(n)).sort();
    const keptDays = new Set();
    for (const name of names) {
      const [, day, hour = '00'] = BACKUP_NAME.exec(name);
      const age = now - Date.parse(`${day}T${hour}:00:00Z`);
      if (age < 48 * 3600e3) continue;
      if (age < MAX_DAILY_BACKUPS * 86400e3 && !keptDays.has(day)) {
        keptDays.add(day);
        continue;
      }
      await storage.deleteBackup(name);
    }
  }

  async function handleSave(request) {
    if (!(request.headers.get('content-type') ?? '').includes('application/json')) {
      return json(415, { error: 'Se esperaba JSON' });
    }
    let body;
    try {
      body = JSON.parse(decoder.decode(await readLimited(request, MAX_BODY)));
    } catch (err) {
      return json(err.status ?? 400, { error: err.status ? err.message : 'JSON inválido' });
    }
    if (!body || typeof body.data !== 'object' || body.data === null) return json(400, { error: 'Falta "data"' });
    // Serialize writes so revisions stay consistent.
    const result = (queue = queue
      .then(async () => {
        const current = await load();
        if (!body.force && body.baseRev !== current.rev) {
          return json(409, { error: 'conflict', rev: current.rev, savedAt: current.savedAt });
        }
        const next = await commit(current, body.data);
        return json(200, { rev: next.rev, savedAt: next.savedAt });
      })
      .catch((err) => json(500, { error: String(err?.message ?? err) })));
    return result;
  }

  /** Writes a new revision (call it inside `queue`). */
  async function commit(current, data) {
    const next = { rev: current.rev + 1, savedAt: new Date().toISOString(), data };
    const text = JSON.stringify(next);
    // Before the first save of each hour, keep the previous state as a backup.
    await storage.snapshot(`pokekanban-${hourStamp()}h.json`);
    await storage.writeDoc(text);
    doc = { rev: next.rev, savedAt: next.savedAt, text };
    await prune();
    // Reminders may have changed: send what is due now and plan the next one.
    await pushWork(MAX_LATE_ON_SAVE).catch(() => {});
    return next;
  }

  /* ------------------------------------------------------------- API keys */

  let keys = null; // [{ id, name, scope, hash, prefix, createdAt, lastUsedAt }]
  let keysQueue = Promise.resolve();

  async function loadKeys() {
    if (keys) return keys;
    const raw = storage.getItem ? await storage.getItem('apikeys') : null;
    keys = raw ? JSON.parse(raw) : [];
    return keys;
  }

  /** Runs key changes one at a time and persists the result. */
  function withKeys(fn) {
    const result = keysQueue.then(async () => {
      const list = await loadKeys();
      const out = await fn(list);
      if (storage.setItem) await storage.setItem('apikeys', JSON.stringify(list));
      return out;
    });
    keysQueue = result.catch(() => {});
    return result;
  }

  async function sha256Hex(value) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
    return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  const publicKey = ({ hash, ...rest }) => rest;

  async function handleKeys(request, param) {
    if (request.method === 'GET' && !param) return json(200, (await loadKeys()).map(publicKey));
    if (request.method === 'POST' && !param) {
      let body;
      try {
        body = JSON.parse(decoder.decode(await readLimited(request, 10_000)));
      } catch {
        return json(400, { error: 'JSON inválido' });
      }
      const name = String(body?.name ?? '').trim().slice(0, 80);
      if (!name) return json(400, { error: 'Pon un nombre a la clave' });
      if (body.scope !== 'read' && body.scope !== 'write') return json(400, { error: 'El permiso debe ser "read" o "write"' });
      const secret = `pk_${base64url(crypto.getRandomValues(new Uint8Array(32)))}`;
      const entry = await withKeys(async (list) => {
        if (list.length >= MAX_KEYS) throw new HttpError(400, 'Demasiadas claves: revoca alguna');
        const created = { id: randomId(), name, scope: body.scope, hash: await sha256Hex(secret), prefix: secret.slice(0, 9), createdAt: Date.now(), lastUsedAt: null };
        list.push(created);
        return created;
      });
      return json(200, { ...publicKey(entry), key: secret });
    }
    if (request.method === 'DELETE' && param) {
      const removed = await withKeys((list) => {
        const index = list.findIndex((k) => k.id === param);
        if (index >= 0) list.splice(index, 1);
        return index >= 0;
      });
      return removed ? json(200, { ok: true }) : json(404, { error: 'No encontrada' });
    }
    return json(405, { error: 'Método no permitido' });
  }

  /** The API key of a `Bearer pk_…` request, or null. */
  async function authenticateKey(request) {
    const match = /^Bearer\s+(pk_[\w-]{20,})\s*$/i.exec(request.headers.get('authorization') ?? '');
    if (!match) return null;
    const hash = await sha256Hex(match[1]);
    const key = (await loadKeys()).find((k) => k.hash === hash);
    if (key && Date.now() - (key.lastUsedAt ?? 0) > KEY_TOUCH_MS) {
      void withKeys(() => void (key.lastUsedAt = Date.now())).catch(() => {});
    }
    return key ?? null;
  }

  /* --------------------------------------------------------------- agents */

  /** Runs a tool. Read-only tools see the current document; the others save a new revision. */
  async function runTool(name, args, key) {
    const tool = findTool(name);
    if (!tool) throw new ToolError(`Herramienta desconocida: ${name}`, 404);
    if (tool.write && key.scope !== 'write') throw new ToolError('Esta clave es de solo lectura', 403);
    if (args === null || typeof args !== 'object' || Array.isArray(args)) throw new ToolError('Los argumentos deben ser un objeto');
    if (!tool.write) {
      const data = await currentData();
      if (!data) throw new ToolError('Todavía no hay datos: abre la web una vez para crearlos', 409);
      return tool.run(toolContext(data), args);
    }
    const run = queue.then(async () => {
      const current = await load();
      const data = JSON.parse(current.text).data;
      if (!data) throw new ToolError('Todavía no hay datos: abre la web una vez para crearlos', 409);
      const result = tool.run(toolContext(data), args);
      await commit(current, data);
      return result;
    });
    queue = run.catch(() => {});
    return run;
  }

  async function handleAgent(request, resource, param, key) {
    if (resource === 'agent') {
      if (request.method === 'GET' && !param) return json(200, { tools: toolList() });
      if (request.method !== 'POST' || !param) return json(405, { error: 'Método no permitido' });
      let args = {};
      const raw = decoder.decode(await readLimited(request, MAX_AGENT_BODY)).trim();
      if (raw) {
        try {
          args = JSON.parse(raw);
        } catch {
          return json(400, { error: 'JSON inválido' });
        }
      }
      return json(200, await runTool(param, args, key));
    }
    // MCP over HTTP (stateless, plain JSON responses).
    if (request.method !== 'POST' || param) return json(405, { error: 'Método no permitido' }, { allow: 'POST' });
    let body;
    try {
      body = JSON.parse(decoder.decode(await readLimited(request, MAX_AGENT_BODY)));
    } catch {
      return json(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } });
    }
    const call = (name, args) => runTool(name, args, key);
    if (Array.isArray(body)) {
      const replies = (await Promise.all(body.map((m) => mcpMessage(m, call)))).filter(Boolean);
      return replies.length ? json(200, replies) : new Response(null, { status: 202 });
    }
    const reply = await mcpMessage(body, call);
    return reply ? json(200, reply) : new Response(null, { status: 202 });
  }

  /* ------------------------------------------------------------ reminders */

  let push = null; // { vapid, subject, subscriptions: [], lastCheck }
  let pushQueue = Promise.resolve();

  async function loadPush() {
    if (push) return push;
    const text = storage.getItem ? await storage.getItem('push') : null;
    push = { vapid: null, subject: null, subscriptions: [], lastCheck: null, ...(text ? JSON.parse(text) : {}) };
    return push;
  }

  async function savePush() {
    if (storage.setItem) await storage.setItem('push', JSON.stringify(push));
  }

  /** Runs push state changes one at a time. */
  function withPush(fn) {
    const result = pushQueue.then(fn);
    pushQueue = result.catch(() => {});
    return result;
  }

  async function currentData() {
    const { text } = await load();
    return JSON.parse(text).data ?? null;
  }

  async function sendToAll(state, messages) {
    const gone = new Set();
    let sent = 0;
    for (const message of messages) {
      for (const sub of state.subscriptions) {
        if (gone.has(sub.endpoint)) continue;
        const result = await sendPush(sub, message, state.vapid, state.subject, fetchImpl);
        if (result.gone) gone.add(sub.endpoint);
        if (result.ok) sent++;
      }
    }
    if (gone.size) state.subscriptions = state.subscriptions.filter((s) => !gone.has(s.endpoint));
    return sent;
  }

  /** Sends reminders due since the last check (at most `maxLate` old) and schedules the next one. */
  function pushWork(maxLate) {
    return withPush(async () => {
      const state = await loadPush();
      const now = Date.now();
      if (state.subscriptions.length === 0 || !state.vapid) {
        scheduler?.set(null);
        return 0;
      }
      const data = await currentData();
      const from = Math.max(state.lastCheck ?? now, now - maxLate);
      state.lastCheck = now;
      let sent = 0;
      if (data && from < now) {
        const due = collectReminders(data, from, now).slice(0, 20);
        sent = await sendToAll(
          state,
          due.map((r) => {
            const poke = pokemonKey(r.icon);
            return { title: r.title, body: r.body, tag: r.id, url: r.url, ...(poke ? { icon: pokemonSpriteUrl(poke) } : {}) };
          }),
        );
      }
      await savePush();
      if (scheduler) {
        const next = data && state.subscriptions.length ? collectReminders(data, now, now + 35 * 86400e3)[0] : null;
        // Wake up a bit after the reminder so it is inside the (lastCheck, now] window.
        scheduler.set(next ? next.at + 500 : state.subscriptions.length ? now + 30 * 86400e3 : null);
      }
      return sent;
    });
  }

  async function handlePush(request, url, action) {
    if (request.method === 'GET' && !action) {
      const state = await withPush(async () => {
        const s = await loadPush();
        if (!s.vapid) {
          s.vapid = await generateVapidKeys();
          await savePush();
        }
        return s;
      });
      return json(200, { publicKey: state.vapid.publicKey, devices: state.subscriptions.map((s) => s.device) });
    }
    if (request.method !== 'POST') return json(405, { error: 'Método no permitido' });
    let body;
    try {
      body = JSON.parse(decoder.decode(await readLimited(request, 16 * 1024)));
    } catch {
      return json(400, { error: 'Petición inválida' });
    }
    if (action === 'subscribe') {
      const sub = body?.subscription;
      const valid =
        sub && typeof sub.endpoint === 'string' && /^https:\/\//.test(sub.endpoint) &&
        typeof sub.keys?.p256dh === 'string' && typeof sub.keys?.auth === 'string';
      if (!valid) return json(400, { error: 'Suscripción inválida' });
      await withPush(async () => {
        const state = await loadPush();
        state.vapid ??= await generateVapidKeys();
        state.subject = url.protocol === 'https:' ? url.origin : 'mailto:pokekanban@localhost';
        state.lastCheck ??= Date.now();
        state.subscriptions = state.subscriptions.filter((s) => s.endpoint !== sub.endpoint);
        state.subscriptions.push({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          device: String(body.device ?? '').slice(0, 80) || 'Dispositivo',
          createdAt: Date.now(),
        });
        state.subscriptions = state.subscriptions.slice(-MAX_SUBSCRIPTIONS);
        await savePush();
      });
      await pushWork(0);
      return json(200, { ok: true });
    }
    if (action === 'unsubscribe') {
      await withPush(async () => {
        const state = await loadPush();
        state.subscriptions = state.subscriptions.filter((s) => s.endpoint !== body?.endpoint);
        await savePush();
      });
      await pushWork(0);
      return json(200, { ok: true });
    }
    if (action === 'test') {
      const state = await loadPush();
      const sub = state.subscriptions.find((s) => s.endpoint === body?.endpoint);
      if (!sub || !state.vapid) return json(404, { error: 'Este dispositivo no está suscrito' });
      const result = await sendPush(
        sub,
        { title: '🔔 Notificaciones activadas', body: 'Así te avisaré de tus eventos, cumpleaños y fechas límite.', tag: 'test', url: '#/calendar' },
        state.vapid,
        state.subject,
        fetchImpl,
      );
      if (result.gone) {
        await withPush(async () => {
          state.subscriptions = state.subscriptions.filter((s) => s.endpoint !== sub.endpoint);
          await savePush();
        });
      }
      return json(result.ok ? 200 : 502, { ok: result.ok, status: result.status });
    }
    return json(404, { error: 'No encontrado' });
  }

  async function handleAgenda(url) {
    const data = (await currentData()) ?? {};
    const timeZone = data.settings?.timeZone || 'UTC';
    const today = dayKeyAt(Date.now(), timeZone);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from') ?? '') ? url.searchParams.get('from') : today;
    const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days')) || 14));
    const now = Date.now();
    const body = { today, timeZone, generatedAt: now, items: agenda(data, from, days, { timeZone }) };
    // The Android app's background sync also schedules the upcoming reminders as alarms.
    if (url.searchParams.get('reminders') === '1') body.reminders = collectReminders(data, now - 60_000, now + 8 * 86400e3);
    return json(200, body);
  }

  async function handleUpload(request, url) {
    if (request.headers.get('x-pokekanban-upload') !== '1') return json(400, { error: 'Cabecera requerida' });
    const original = (url.searchParams.get('name') ?? 'archivo').slice(0, 180);
    const dot = original.lastIndexOf('.');
    const ext = dot > 0 ? original.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10) : '';
    let bytes;
    try {
      bytes = await readLimited(request, MAX_UPLOAD);
    } catch (err) {
      return json(err.status ?? 400, { error: err.status === 413 ? 'Archivo demasiado grande' : err.message });
    }
    const stored = `${Date.now().toString(36)}-${randomId()}${ext}`;
    const type = UPLOAD_TYPES[ext] ?? 'application/octet-stream';
    await storage.putFile(stored, bytes, type);
    return json(200, { url: `api/uploads/${stored}`, name: original, size: bytes.byteLength, type });
  }

  async function serveUpload(request, name) {
    if (!UPLOAD_NAME.test(name)) return json(404, { error: 'No encontrado' });
    const file = await storage.getFile(name);
    if (!file) return json(404, { error: 'No encontrado' });
    const dot = name.lastIndexOf('.');
    const type = UPLOAD_TYPES[dot > 0 ? name.slice(dot).toLowerCase() : ''] ?? 'application/octet-stream';
    const inline = /^(image|video|audio)\//.test(type) || type === 'application/pdf' || type.startsWith('text/plain');
    return new Response(request.method === 'HEAD' ? null : file.body, {
      status: 200,
      headers: {
        'content-type': type,
        'content-length': String(file.size),
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        // Uploaded content never runs scripts on our origin.
        'content-security-policy': "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
        'content-disposition': inline ? 'inline' : 'attachment',
      },
    });
  }

  async function handleLogin(request, ip, secure) {
    if (!authEnabled) return json(200, { ok: true });
    const now = Date.now();
    const record = failures.get(ip);
    if (record && record.until > now) {
      return json(429, { error: 'Demasiados intentos. Espera unos minutos y vuelve a probar.' });
    }
    let candidate = '';
    try {
      candidate = JSON.parse(decoder.decode(await readLimited(request, 4096)))?.password ?? '';
    } catch {
      return json(400, { error: 'Petición inválida' });
    }
    if (!(await passwordMatches(candidate))) {
      // Count failures within a window; too many locks this client out for a while.
      const recent = record && now - record.first < LOCKOUT_MS && record.until <= now;
      const count = recent ? record.count + 1 : 1;
      const first = recent ? record.first : now;
      failures.set(ip, { count, first, until: count >= MAX_FAILED_LOGINS ? now + LOCKOUT_MS : 0 });
      if (failures.size > 1000) failures.delete(failures.keys().next().value);
      await new Promise((r) => setTimeout(r, 400));
      return json(401, { error: 'Contraseña incorrecta' });
    }
    failures.delete(ip);
    const { token } = await issueToken();
    return json(200, { ok: true }, { 'set-cookie': sessionCookie(token, SESSION_DAYS * 86400, secure) });
  }

  /** Rejects cross-site writes (CSRF): same-origin fetches send a matching Origin or none. */
  function sameOrigin(request, url) {
    const origin = request.headers.get('origin');
    if (!origin) return true;
    try {
      return new URL(origin).host === url.host;
    } catch {
      return false;
    }
  }

  /** Scheduler callback: sends the reminders that are due. */
  handle.runAlarm = () => pushWork(MAX_LATE_ON_ALARM);
  /** Plans the next reminder (call once at startup). */
  handle.reschedule = () => pushWork(0);
  return handle;

  /**
   * Handles an API request. `ctx.ip` identifies the client for login throttling and
   * `ctx.secure` marks HTTPS (session cookies get the Secure flag). Returns null for non-API paths.
   */
  async function handle(request, ctx = {}) {
    const url = new URL(request.url);
    const match = ROUTE.exec(url.pathname);
    if (!match) return null;
    const [, resource, param] = match;
    const isRead = request.method === 'GET' || request.method === 'HEAD';
    const secure = ctx.secure ?? url.protocol === 'https:';

    try {
      const configured = authEnabled || !requirePassword;
      if (resource === 'mcp' || resource === 'agent') {
        // Programs, not browsers: an API key replaces the session cookie and the same-origin check.
        if (!configured) return json(503, { error: 'no-password', message: 'Falta configurar la contraseña (secreto POKEKANBAN_PASSWORD).' });
        const key = await authenticateKey(request);
        if (!key) return json(401, { error: 'auth', message: 'Falta una clave de API válida (Authorization: Bearer pk_…)' }, { 'www-authenticate': 'Bearer' });
        return await handleAgent(request, resource, param, key);
      }
      if (!isRead && !sameOrigin(request, url)) return json(403, { error: 'Origen no permitido' });

      if (resource === 'session' && isRead) {
        const authenticated = !authEnabled || (await sessionExpiry(request)) > 0;
        return json(200, { auth: authEnabled, authenticated, configured });
      }
      if (!configured) {
        return json(503, {
          error: 'no-password',
          message: 'Falta configurar la contraseña (secreto POKEKANBAN_PASSWORD).',
        });
      }
      if (resource === 'login' && request.method === 'POST') return await handleLogin(request, ctx.ip ?? '', secure);
      if (resource === 'logout' && request.method === 'POST') {
        return json(200, { ok: true }, { 'set-cookie': sessionCookie('', 0, secure) });
      }

      let refresh = null;
      if (authEnabled) {
        const exp = await sessionExpiry(request);
        if (!exp) return json(401, { error: 'auth' });
        // Sliding session: renew when less than a third of its life is left.
        if (exp - Date.now() < (SESSION_DAYS / 3) * 86400e3) refresh = (await issueToken()).token;
      }
      const response = await route(request, url, resource, param, isRead);
      if (refresh) response.headers.append('set-cookie', sessionCookie(refresh, SESSION_DAYS * 86400, secure));
      return response;
    } catch (err) {
      return json(err.status ?? 500, { error: String(err?.message ?? err) });
    }
  }

  async function route(request, url, resource, param, isRead) {
    if (resource === 'meta' && !param && isRead) {
      const { rev, savedAt } = await load();
      return json(200, { rev, savedAt, uploads: true });
    }
    if (resource === 'data' && !param) {
      if (isRead) return json(200, (await load()).text);
      if (request.method === 'PUT') return handleSave(request);
      return json(405, { error: 'Método no permitido' });
    }
    if (resource === 'uploads') {
      if (!param && request.method === 'POST') return handleUpload(request, url);
      if (param && isRead) return serveUpload(request, param);
      return json(405, { error: 'Método no permitido' });
    }
    if (resource === 'push') return handlePush(request, url, param);
    if (resource === 'keys') return handleKeys(request, param);
    if (resource === 'agenda' && !param && isRead) return handleAgenda(url);
    if (resource === 'backups' && isRead) {
      if (!param) {
        const list = (await storage.listBackups()).filter((b) => BACKUP_NAME.test(b.name));
        return json(200, list.sort((a, b) => b.name.localeCompare(a.name)));
      }
      const content = BACKUP_NAME.test(param) ? await storage.readBackup(param) : null;
      if (content === null) return json(404, { error: 'No encontrado' });
      return json(200, content, { 'content-disposition': `attachment; filename="${param}"` });
    }
    return json(404, { error: 'No encontrado' });
  }
}
