import { useSyncExternalStore } from 'react';
import { skyPeriod, type SkyPeriod } from './backgrounds';

const listeners = new Set<() => void>();
let timer: number | undefined;
let last = skyPeriod(new Date());

function check(): void {
  const next = skyPeriod(new Date());
  if (next === last) return;
  last = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    timer = window.setInterval(check, 60_000);
    // Timers are throttled in the background: catch up as soon as the app is looked at again.
    document.addEventListener('visibilitychange', check);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', check);
  };
}

/**
 * Part of the day the "Cielo" background is showing. Components that paint a board background
 * call it so they render again when the sky changes (getBoardBackground reads the clock itself).
 */
export function useSkyPeriod(): SkyPeriod {
  return useSyncExternalStore(subscribe, () => skyPeriod(new Date()));
}
