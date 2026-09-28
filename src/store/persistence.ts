import { create } from 'zustand';
import type { AppData } from '../types';
import { loadData, useStore } from './store';
import { normalizeData } from './normalize';
import { sampleData } from './factories';

/**
 * Storage strategy:
 *  - "server": the app is served by server/index.mjs (or the Vite dev server) and data lives in
 *    a JSON file on disk. Revisions protect against overwriting changes made from another device.
 *  - "local": no API available (e.g. static hosting) -> data lives in localStorage.
 */

export type StorageMode = 'server' | 'local';
export type SaveStatus = 'loading' | 'saved' | 'pending' | 'saving' | 'error' | 'conflict';

interface PersistState {
  mode: StorageMode;
  status: SaveStatus;
  error: string | null;
  lastSavedAt: number | null;
  /** The server exists but can't load the data: nothing is loaded so nothing gets overwritten. */
  fatal: string | null;
}

export const usePersist = create<PersistState>(() => ({
  mode: 'local',
  status: 'loading',
  error: null,
  lastSavedAt: null,
  fatal: null,
}));

const LS_KEY = 'pokekanban:data';
const API = 'api/data';
const SAVE_DELAY = 600;
const RETRY_DELAY = 5000;
/** Browsers cap keepalive request bodies at 64 KiB (in bytes). */
const KEEPALIVE_LIMIT = 60_000;

function byteLength(text: string): number {
  return new Blob([text]).size;
}

let rev = 0;
let dirty = false;
let inflight = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let applyingRemote = false;

function setStatus(status: SaveStatus, error: string | null = null): void {
  usePersist.setState({ status, error, ...(status === 'saved' ? { lastSavedAt: Date.now() } : {}) });
}

function readLocal(): AppData | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? normalizeData(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(data: AppData): boolean {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    setStatus('error', err instanceof Error && err.name === 'QuotaExceededError'
      ? 'El almacenamiento del navegador está lleno. Exporta una copia de seguridad.'
      : 'No se pudo guardar en el navegador.');
    return false;
  }
}

function applyRemote(data: AppData): void {
  applyingRemote = true;
  loadData(data);
  applyingRemote = false;
}

type Probe = { kind: 'ok'; rev: number; data: unknown } | { kind: 'broken'; message: string } | { kind: 'none' };

/**
 * "none": there is no storage API (static hosting) -> browser storage.
 * "broken": our server answered with an error (e.g. unreadable data file) -> stop, don't fall back.
 */
async function probeServer(): Promise<Probe> {
  let res: Response;
  try {
    res = await fetch(API, { cache: 'no-store', headers: { accept: 'application/json' } });
  } catch {
    return { kind: 'none' };
  }
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) return { kind: 'none' };
  const json = await res.json().catch(() => null);
  if (res.ok && typeof json?.rev === 'number') return { kind: 'ok', rev: json.rev, data: json.data };
  return { kind: 'broken', message: json?.error ? String(json.error) : `HTTP ${res.status}` };
}

async function fetchServer(): Promise<{ rev: number; data: unknown } | null> {
  const probe = await probeServer();
  return probe.kind === 'ok' ? probe : null;
}

async function flushServer(force = false): Promise<void> {
  if (inflight) return;
  if (!dirty && !force) return;
  inflight = true;
  dirty = false;
  setStatus('saving');
  const data = useStore.getState().data;
  try {
    const body = JSON.stringify({ baseRev: rev, data, force });
    const res = await fetch(API, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
      // Small payloads survive the tab being closed mid-request.
      keepalive: byteLength(body) < KEEPALIVE_LIMIT,
    });
    if (res.status === 409) {
      dirty = true;
      setStatus('conflict', 'Los datos se modificaron desde otra pestaña o dispositivo.');
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    rev = json.rev;
    if (!dirty) setStatus('saved');
  } catch {
    dirty = true;
    setStatus('error', 'No se pudo guardar en el servidor. Reintentando…');
    schedule(RETRY_DELAY);
  } finally {
    inflight = false;
    if (dirty && usePersist.getState().status !== 'conflict' && usePersist.getState().status !== 'error') schedule();
  }
}

function schedule(delay = SAVE_DELAY): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, delay);
}

async function flush(): Promise<void> {
  if (usePersist.getState().mode === 'server') {
    if (usePersist.getState().status === 'conflict') return;
    await flushServer();
  } else if (dirty) {
    dirty = false;
    if (writeLocal(useStore.getState().data)) setStatus('saved');
  }
}

/** Checks whether another device saved newer data and loads it if we have no pending changes. */
async function checkRemote(): Promise<void> {
  if (usePersist.getState().mode !== 'server' || dirty || inflight) return;
  try {
    const res = await fetch('api/meta', { cache: 'no-store' });
    if (!res.ok) return;
    const meta = await res.json();
    if (meta.rev === rev) return;
    const doc = await fetchServer();
    if (!doc || dirty || inflight) return;
    rev = doc.rev;
    applyRemote(normalizeData(doc.data));
    setStatus('saved');
  } catch {
    /* offline: ignore */
  }
}

export async function resolveConflict(keep: 'server' | 'mine'): Promise<void> {
  if (keep === 'mine') {
    usePersist.setState({ status: 'saving' });
    await flushServer(true);
    return;
  }
  const doc = await fetchServer();
  if (!doc) return;
  rev = doc.rev;
  dirty = false;
  applyRemote(normalizeData(doc.data));
  setStatus('saved');
}

export async function initPersistence(): Promise<void> {
  const probe = await probeServer();
  if (probe.kind === 'broken') {
    usePersist.setState({ mode: 'server', status: 'error', fatal: probe.message });
    return;
  }
  const server = probe.kind === 'ok' ? probe : null;
  if (server) {
    usePersist.setState({ mode: 'server' });
    rev = server.rev;
    if (server.data) {
      applyRemote(normalizeData(server.data));
      setStatus('saved');
    } else {
      // First run against this server: seed it with browser data (if any) or the sample board.
      applyRemote(readLocal() ?? sampleData());
      dirty = true;
      void flushServer();
    }
  } else {
    usePersist.setState({ mode: 'local' });
    const local = readLocal();
    applyRemote(local ?? sampleData());
    if (!local) writeLocal(useStore.getState().data);
    setStatus('saved');
  }

  useStore.subscribe((state, prev) => {
    if (state.data === prev.data || applyingRemote) return;
    dirty = true;
    if (usePersist.getState().status !== 'conflict') setStatus('pending');
    schedule(usePersist.getState().mode === 'local' ? 250 : SAVE_DELAY);
  });

  window.addEventListener('beforeunload', (e) => {
    if (usePersist.getState().mode === 'local') {
      if (dirty) writeLocal(useStore.getState().data);
      return;
    }
    if (!dirty && !inflight) return;
    const size = byteLength(JSON.stringify({ baseRev: rev, data: useStore.getState().data, force: false }));
    if (dirty && !inflight && size < KEEPALIVE_LIMIT && usePersist.getState().status !== 'conflict') {
      // Sent with keepalive: completes even though the page is closing.
      void flushServer();
      return;
    }
    void flushServer();
    e.preventDefault();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkRemote();
    else void flush();
  });

  // Keep several tabs in sync when running in local mode.
  window.addEventListener('storage', (e) => {
    if (e.key !== LS_KEY || !e.newValue || usePersist.getState().mode !== 'local' || dirty) return;
    try {
      applyRemote(normalizeData(JSON.parse(e.newValue)));
    } catch {
      /* ignore malformed data */
    }
  });
}

/** Replaces everything (import / restore). Saved like any other change and undoable. */
export function replaceAllData(data: AppData): void {
  const state = useStore.getState();
  useStore.setState({ data, past: [...state.past, state.data], future: [] });
}
