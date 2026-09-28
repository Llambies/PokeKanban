import { create } from 'zustand';
import { usePersist } from '../store/persistence';
import { isNativeApp } from './native';

/**
 * Push notifications for this device: the service worker (public/sw.js) receives reminders the
 * server sends at the right time, even with the app closed.
 */
export type PushStatus = 'unsupported' | 'unavailable' | 'denied' | 'off' | 'on' | 'busy';

interface PushState {
  status: PushStatus;
  /** Devices subscribed on the server (names). */
  devices: string[];
  error: string | null;
}

export const usePush = create<PushState>(() => ({ status: 'off', devices: [], error: null }));

const API = 'api/push';
let resynced = false;

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** iPhone / iPad Safari only allows notifications for apps added to the home screen. */
export function needsHomeScreen(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && !window.matchMedia('(display-mode: standalone)').matches;
}

export function registerServiceWorker(): void {
  // The Android app shows reminders natively (and its WebView has no push support).
  if (!('serviceWorker' in navigator) || !window.isSecureContext || isNativeApp()) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // Taps on a notification while the app is open: go to the event.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type !== 'navigate' || typeof e.data.url !== 'string') return;
    const hash = new URL(e.data.url, window.location.href).hash;
    if (hash) window.location.hash = hash;
  });
}

function deviceName(): string {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return `${os} · ${browser}`;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const text = atob(base64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64url.length + 3) % 4));
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register('sw.js');
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${API}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

/** Works out whether this device is subscribed (and which devices are). */
export async function refreshPush(): Promise<void> {
  if (!pushSupported()) return usePush.setState({ status: 'unsupported' });
  if (usePersist.getState().mode !== 'server') return usePush.setState({ status: 'unavailable' });
  if (Notification.permission === 'denied') return usePush.setState({ status: 'denied' });
  try {
    const [reg, info] = await Promise.all([registration(), fetch(API).then((r) => (r.ok ? r.json() : null))]);
    const sub = await reg.pushManager.getSubscription();
    usePush.setState({ status: sub && Notification.permission === 'granted' ? 'on' : 'off', devices: info?.devices ?? [], error: null });
    // Once per visit, make sure the server still has it (e.g. after it dropped an expired one).
    if (sub && info && !resynced) {
      resynced = true;
      await post('subscribe', { subscription: sub.toJSON(), device: deviceName() });
    }
  } catch {
    usePush.setState({ status: 'off' });
  }
}

export async function enablePush(): Promise<boolean> {
  usePush.setState({ status: 'busy', error: null });
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      usePush.setState({ status: permission === 'denied' ? 'denied' : 'off' });
      return false;
    }
    const { publicKey } = await fetch(API).then((r) => r.json());
    const reg = await registration();
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    const res = await post('subscribe', { subscription: sub.toJSON(), device: deviceName() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await refreshPush();
    return true;
  } catch (err) {
    usePush.setState({ status: 'off', error: `No se pudieron activar: ${err instanceof Error ? err.message : String(err)}` });
    return false;
  }
}

export async function disablePush(): Promise<void> {
  usePush.setState({ status: 'busy', error: null });
  try {
    const sub = await (await registration()).pushManager.getSubscription();
    if (sub) {
      await post('unsubscribe', { endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  } finally {
    await refreshPush();
  }
}

export async function testPush(): Promise<boolean> {
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) return false;
  const res = await post('test', { endpoint: sub.endpoint });
  return res.ok;
}
