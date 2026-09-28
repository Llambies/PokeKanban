import { Capacitor, registerPlugin } from '@capacitor/core';
import { useStore } from '../store/store';
import { agenda, collectReminders } from '../../shared/calendar.js';
import { todayKey } from './dates';

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
  update(options: { agenda: string; reminders: string }): Promise<void>;
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

function sendToNative(): void {
  const { data, ready } = useStore.getState();
  if (!ready) return;
  const now = Date.now();
  const today = todayKey();
  // The device's own time zone (null): alarms ring at local time.
  const items = agenda(data, today, AGENDA_DAYS, { timeZone: null, now });
  const reminders = collectReminders(data, now - 60_000, now + REMINDER_DAYS * 86400e3, { timeZone: null });
  void Native.update({
    agenda: JSON.stringify({ today, generatedAt: now, items }),
    reminders: JSON.stringify(reminders),
  }).catch(() => {});
}

export function startNativeBridge(): void {
  if (!isNativeApp()) return;
  let timer: number | undefined;
  const schedule = (delay: number) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(sendToNative, delay);
  };
  useStore.subscribe((state, previous) => {
    if (state.data !== previous.data || state.ready !== previous.ready) schedule(1500);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendToNative();
  });
  // Refresh "today", overdue items and the reminders window from time to time.
  window.setInterval(() => schedule(0), 30 * 60_000);
  schedule(0);
}
