import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { useStore } from '../store/store';
import { setDeviceEndpoint, usePersist } from '../store/persistence';
import { agenda, collectReminders } from '../../shared/calendar.js';
import { todayKey } from './dates';
import { iconTreeSvg, reactIconTree } from './reactIcons';

/**
 * Bridge with the Android app (android/, Capacitor). Inside the app the web page sends the native
 * side its agenda (widget) and upcoming reminders (exact alarms) whenever the data changes. Changes
 * made on other devices reach the closed app through a push from the server (see `linkPush`).
 */
export interface NativeStatus {
  notifications: boolean;
  exactAlarms: boolean;
  widgets: number;
  /** Instant sync is set up (missing in older versions of the app). */
  push?: boolean;
  /** When the last push from the server arrived (ms, 0 = never). */
  pushAt?: number;
}

interface NativePushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PokeKanbanPlugin {
  /** `icons`: PNG (base64) of the react-icons in the agenda, which the widget can't draw by itself. */
  update(options: { agenda: string; reminders: string; icons?: string }): Promise<void>;
  status(): Promise<NativeStatus>;
  requestNotifications(): Promise<NativeStatus>;
  openExactAlarmSettings(): Promise<void>;
  test(): Promise<void>;
  sync(): Promise<void>;
  /** Subscribes to pushes signed with the server's VAPID key (needs Google Play services). */
  registerPush(options: { vapidKey: string }): Promise<NativePushSubscription>;
}

export const Native = registerPlugin<PokeKanbanPlugin>('PokeKanban');

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

const AGENDA_DAYS = 21;
const REMINDER_DAYS = 8;

const ICON_PX = 72;
const iconPngs = new Map<string, Promise<string | null>>();

/** A react-icons icon as a white PNG (base64) for the widget, which tints it like its other icons. */
function iconPng(value: string): Promise<string | null> {
  let png = iconPngs.get(value);
  if (!png) {
    png = (async () => {
      const tree = await reactIconTree(value);
      if (!tree) return null;
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(iconTreeSvg(tree, ICON_PX, '#ffffff'));
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = ICON_PX;
      canvas.getContext('2d')?.drawImage(img, 0, 0, ICON_PX, ICON_PX);
      return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
    })().catch(() => null);
    // Failed (offline…): try again on the next update.
    void png.then((result) => result === null && iconPngs.delete(value));
    iconPngs.set(value, png);
  }
  return png;
}

const ENDPOINT_KEY = 'pokekanban:push-endpoint';
const PUSH_RETRY = 10 * 60_000;
let pushLinked = false;
let pushTriedAt = 0;
let pushError = '';

function storedEndpoint(): string | null {
  try {
    return localStorage.getItem(ENDPOINT_KEY);
  } catch {
    return null;
  }
}

/**
 * Instant sync: subscribes the app to the server's pushes, once per launch (the endpoint can change).
 * The server then wakes the app up when the calendar changes on another device and when a reminder is due.
 */
async function linkPush(force = false): Promise<void> {
  if (pushLinked || usePersist.getState().mode !== 'server' || (!force && Date.now() - pushTriedAt < PUSH_RETRY)) return;
  pushTriedAt = Date.now();
  try {
    pushError = 'el servidor no responde';
    const info = await fetch('api/push', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
    if (typeof info?.publicKey !== 'string') return;
    const sub = await Native.registerPush({ vapidKey: info.publicKey });
    const previous = storedEndpoint();
    const res = await fetch('api/push/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        device: 'Android · App',
        native: true,
        ...(previous && previous !== sub.endpoint ? { replaces: previous } : {}),
      }),
    });
    if (!res.ok) return;
    pushLinked = true;
    pushError = '';
    setDeviceEndpoint(sub.endpoint);
    try {
      localStorage.setItem(ENDPOINT_KEY, sub.endpoint);
    } catch {
      // Only used to replace the old endpoint when it changes.
    }
  } catch (err) {
    // No Google Play services, an older app or no network: the app still syncs every half hour.
    pushError = err instanceof Error ? err.message : String(err);
  }
}

/**
 * Asks the server for a push and waits for it to arrive: checks instant sync end to end.
 * Returns null when it works, or what went wrong (to show the user).
 */
export async function testInstantSync(): Promise<string | null> {
  await linkPush(true);
  const endpoint = storedEndpoint();
  if (!pushLinked || !endpoint) return `No se pudo activar: ${pushError || 'sin conexión con el servidor'}`;
  const before = (await Native.status()).pushAt ?? 0;
  const res = await fetch('api/push/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint }) });
  if (!res.ok) {
    const info = await res.json().catch(() => null);
    return `Google no aceptó el aviso del servidor (${info?.status ? `HTTP ${info.status}` : `error ${res.status}`})`;
  }
  for (let i = 0; i < 15; i++) {
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
    if (((await Native.status()).pushAt ?? 0) > before) return null;
  }
  return 'El aviso salió del servidor pero no ha llegado al móvil';
}

async function sendToNative(): Promise<void> {
  const { data, ready } = useStore.getState();
  if (!ready) return;
  void linkPush();
  const now = Date.now();
  const today = todayKey();
  // The device's own time zone (null): alarms ring at local time.
  const items = agenda(data, today, AGENDA_DAYS, { timeZone: null, now });
  const reminders = collectReminders(data, now - 60_000, now + REMINDER_DAYS * 86400e3, { timeZone: null });
  const icons: Record<string, string> = {};
  for (const value of new Set(items.map((i) => i.reactIcon).filter((v): v is string => !!v))) {
    const png = await iconPng(value);
    if (png) icons[value] = png;
  }
  await Native.update({
    agenda: JSON.stringify({ today, generatedAt: now, items }),
    reminders: JSON.stringify(reminders),
    icons: JSON.stringify(icons),
  }).catch(() => {});
}

export function startNativeBridge(): void {
  if (!isNativeApp()) return;
  setDeviceEndpoint(storedEndpoint());
  let timer: number | undefined;
  const schedule = (delay: number) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void sendToNative(), delay);
  };
  useStore.subscribe((state, previous) => {
    if (state.data !== previous.data || state.ready !== previous.ready) schedule(1500);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void sendToNative();
  });
  // Refresh "today", overdue items and the reminders window from time to time.
  window.setInterval(() => schedule(0), 30 * 60_000);
  schedule(0);
  void askNotificationsOnce();
}

const ASKED_KEY = 'pokekanban:notifications-asked';

/** First launch: ask for the notification permission (a calendar is not much use without it). */
async function askNotificationsOnce(): Promise<void> {
  try {
    if (localStorage.getItem(ASKED_KEY)) return;
    localStorage.setItem(ASKED_KEY, '1');
    const status = await Native.status();
    if (!status.notifications) await Native.requestNotifications();
  } catch {
    // Not critical: the calendar settings have a button for it.
  }
}

/** Status bar icons readable on the app's top bar (light icons on dark bars and vice versa). */
export function syncSystemBars(dark: boolean): void {
  if (!isNativeApp()) return;
  void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
}
