import { useCallback, useEffect, useRef } from 'react';

/**
 * Stack of open overlays (modals, popovers, dialogs, menus). Escape and outside
 * clicks only affect the top-most one, so closing a popover doesn't also close
 * the card modal underneath.
 */
interface Layer {
  id: number;
  onEscape: () => void;
}

const stack: Layer[] = [];
let nextId = 1;

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  e.stopPropagation();
  top.onEscape();
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

export function useLayer(onEscape: () => void, active = true): () => boolean {
  const handler = useRef(onEscape);
  handler.current = onEscape;
  const idRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    const layer: Layer = { id: nextId++, onEscape: () => handler.current() };
    idRef.current = layer.id;
    stack.push(layer);
    return () => {
      const i = stack.findIndex((l) => l.id === layer.id);
      if (i >= 0) stack.splice(i, 1);
      idRef.current = 0;
    };
  }, [active]);

  return useCallback(() => {
    const top = stack[stack.length - 1];
    return !!top && top.id === idRef.current;
  }, []);
}
