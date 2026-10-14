import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { useStore } from '../store/store';
import { agenda, collectReminders } from '../../shared/calendar.js';
import { todayKey } from './dates';
import { iconTreeSvg, reactIconTree } from './reactIcons';

/**
 * Bridge with the Android app (android/, Capacitor). Inside the app the web page sends the native
 * side its agenda (widget) and upcoming reminders (exact alarms) whenever the data changes.
 */
export interface NativeStatus {
  notifications: boolean;
  exactAlarms: boolean;
  widgets: number;
}

interface PokeKanbanPlugin {
  /** `icons`: PNG (base64) of the react-icons in the agenda, which the widget can't draw by itself. */
  update(options: { agenda: string; reminders: string; icons?: string }): Promise<void>;
  status(): Promise<NativeStatus>;
  requestNotifications(): Promise<NativeStatus>;
  openExactAlarmSettings(): Promise<void>;
  test(): Promise<void>;
  sync(): Promise<void>;
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

async function sendToNative(): Promise<void> {
  const { data, ready } = useStore.getState();
  if (!ready) return;
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
