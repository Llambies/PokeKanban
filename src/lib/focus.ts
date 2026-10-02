/**
 * Focus capture/restore helpers for overlays (modals, dialogs, popovers, panels).
 *
 * `captureFocus` reads `document.activeElement` at call time and returns a function
 * that puts focus back there once the overlay closes. If nothing meaningful had focus
 * when it was called (e.g. a click on a non-focusable tile never actually moved focus,
 * so `document.activeElement` is just `<body>`), the restore falls back to re-finding
 * an element via `fallbackSelector` — e.g. the card tile that opened the card modal,
 * found again by its `data-card-id`.
 */
export function captureFocus(fallbackSelector?: string): () => void {
  const previous = document.activeElement as HTMLElement | null;
  const hadRealFocus = !!previous && previous !== document.body && previous !== document.documentElement;

  return () => {
    if (hadRealFocus && previous && document.contains(previous)) {
      previous.focus({ preventScroll: true });
      return;
    }
    if (fallbackSelector) {
      document.querySelector<HTMLElement>(fallbackSelector)?.focus({ preventScroll: true });
    }
  };
}
