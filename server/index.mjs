#!/usr/bin/env node
// Production server: serves the built app (dist/) and the JSON storage API.
//
// Environment variables:
//   PORT                   (default 3000)
//   HOST                   (default 127.0.0.1; use 0.0.0.0 to allow other devices)
//   POKEKANBAN_DATA_DIR    where data and backups are stored (default ./data)
//   POKEKANBAN_PASSWORD    optional: the app asks for this password (login screen, 90-day session)

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const dataDir = path.resolve(process.env.POKEKANBAN_DATA_DIR ?? path.join(root, 'data'));
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const password = process.env.POKEKANBAN_PASSWORD ?? '';

const api = createApi({ dataDir, password });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest', '.txt']);
const cache = new Map();

async function serveStatic(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.join(distDir, path.normalize(rel));
  if (!file.startsWith(distDir + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  let stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) {
    // Unknown paths fall back to the app (hash based routing).
    file = path.join(distDir, 'index.html');
    stat = await fs.stat(file).catch(() => null);
    if (!stat) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('No se encontró dist/. Ejecuta "npm run build" antes de "npm start".');
      return;
    }
  }
  const ext = path.extname(file);
  const key = `${file}:${stat.mtimeMs}`;
  let entry = cache.get(key);
  if (!entry) {
    const raw = await fs.readFile(file);
    entry = { raw, gz: COMPRESSIBLE.has(ext) ? zlib.gzipSync(raw) : null };
    cache.set(key, entry);
  }
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  const headers = {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  };
  if (entry.gz && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
    res.writeHead(200, { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding' });
    res.end(req.method === 'HEAD' ? undefined : entry.gz);
  } else {
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : entry.raw);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    // The app shell is public; the data API checks the session itself.
    if (await api(req, res)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    await serveStatic(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

server.listen(port, host, () => {
  console.log(`PokeKanban escuchando en http://${host === '0.0.0.0' || host === '127.0.0.1' ? 'localhost' : host}:${port}`);
  console.log(`Datos en ${dataDir}${password ? ' (con contraseña)' : ''}`);
});
