import { useCallback, useEffect, useRef, type RefObject } from 'react';

/**
 * Stack of open overlays (modals, popovers, dialogs, menus). Escape and outside
 * clicks only affect the top-most one, so closing a popover doesn't also close
 * the card modal underneath.
 */
interface Layer {
  id: number;
  onEscape: () => void;
  getContainer?: () => HTMLElement | null;
  /** True for overlays with their own backdrop (modal, dialog, side panel). */
  blocking?: boolean;
}

const stack: Layer[] = [];
let nextId = 1;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/** Keeps Tab/Shift+Tab from leaving the top-most layer's container. */
function trapTab(e: KeyboardEvent, container: HTMLElement): void {
  const items = focusableIn(container);
  if (items.length === 0) {
    e.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const outside = !active || !container.contains(active);
  if (e.shiftKey) {
    if (outside || active === first) {
      e.preventDefault();
      last.focus();
    }
  } else if (outside || active === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Whether the app content outside all overlays (the #root tree) should be `inert`:
 * excluded from Tab order, clicks and assistive tech while a blocking overlay — one
 * with its own backdrop, like a modal, dialog or side panel — is open. Plain popovers
 * and context menus don't set this: they have no backdrop and rely on a document click
 * listener to detect "click outside to close", which `inert` would silently swallow.
 */
function updateInert(): void {
  const root = document.getElementById('root');
  if (!root) return;
  if (stack.some((l) => l.blocking)) root.setAttribute('inert', '');
  else root.removeAttribute('inert');
}

document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    top.onEscape();
    return;
  }
  if (e.key === 'Tab') {
    const container = top.getContainer?.();
    if (container) trapTab(e, container);
  }
});

/**
 * Events already used to dismiss an overlay (e.g. the mousedown that closed a popover),
 * so the layer underneath doesn't react to the same click.
 */
const consumed = new WeakSet<Event>();

export function consumeEvent(e: Event): void {
  consumed.add(e);
}

export function isConsumed(e: Event): boolean {
  return consumed.has(e);
}

export function hasOpenLayers(): boolean {
  return stack.length > 0;
}

/** Closes the top-most overlay as Escape would (Android back button). */
export function closeTopLayer(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.onEscape();
  return true;
}

export interface LayerOptions {
  /** Container to keep Tab/Shift+Tab inside while this layer is top-most. */
  container?: RefObject<HTMLElement | null>;
  /** This overlay has its own backdrop, so the app behind it should become `inert`. */
  blocking?: boolean;
}

export function useLayer(onEscape: () => void, active = true, options?: LayerOptions): () => boolean {
  const handler = useRef(onEscape);
  handler.current = onEscape;
  const idRef = useRef(0);
  const { container, blocking } = options ?? {};

  useEffect(() => {
    if (!active) return;
    const layer: Layer = {
      id: nextId++,
      onEscape: () => handler.current(),
      getContainer: container ? () => container.current : undefined,
      blocking,
    };
    idRef.current = layer.id;
    stack.push(layer);
    updateInert();
    return () => {
      const i = stack.findIndex((l) => l.id === layer.id);
      if (i >= 0) stack.splice(i, 1);
      idRef.current = 0;
      updateInert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, container, blocking]);

  return useCallback(() => {
    const top = stack[stack.length - 1];
    return !!top && top.id === idRef.current;
  }, []);
}
