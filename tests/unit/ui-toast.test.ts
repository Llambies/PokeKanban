import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissToast, pauseToast, resumeToast, toast, useUI } from '../../src/store/ui';

function toastIds(): number[] {
  return useUI.getState().toasts.map((t) => t.id);
}

beforeEach(() => {
  vi.useFakeTimers();
  useUI.setState({ toasts: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('toast auto-dismiss', () => {
  it('dismisses a plain toast after the default 4s', () => {
    toast('Guardado');
    expect(toastIds().length).toBe(1);
    vi.advanceTimersByTime(3999);
    expect(toastIds().length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(toastIds().length).toBe(0);
  });

  it('gives a toast with an action a longer 8s timeout so there is time to act on it', () => {
    toast('Tarjeta eliminada', { actionText: 'Deshacer', action: () => {} });
    vi.advanceTimersByTime(4000);
    expect(toastIds().length).toBe(1);
    vi.advanceTimersByTime(4000);
    expect(toastIds().length).toBe(0);
  });

  it('an explicit duration still overrides the action-based default', () => {
    toast('Rápido', { actionText: 'Deshacer', action: () => {}, duration: 1000 });
    vi.advanceTimersByTime(1000);
    expect(toastIds().length).toBe(0);
  });

  it('pausing (hover/focus) stops the countdown, and resuming continues it for the remaining time', () => {
    toast('En pausa');
    const [id] = toastIds();
    vi.advanceTimersByTime(3000);
    pauseToast(id);
    // Well past the original 4s mark: paused, so it must not have dismissed.
    vi.advanceTimersByTime(5000);
    expect(toastIds()).toEqual([id]);
    resumeToast(id);
    // Only ~1s of the original budget was left when it was paused.
    vi.advanceTimersByTime(999);
    expect(toastIds()).toEqual([id]);
    vi.advanceTimersByTime(1);
    expect(toastIds()).toEqual([]);
  });

  it('dismissing a toast early clears its pending timer without throwing later', () => {
    toast('Cerrado a mano');
    const [id] = toastIds();
    dismissToast(id);
    expect(toastIds()).toEqual([]);
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
  });
});
