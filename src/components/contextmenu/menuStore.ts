import type { ReactNode } from 'react';
import { create } from 'zustand';

export interface MenuActionItem {
  kind?: 'item';
  label: string;
  icon?: ReactNode;
  /** Right aligned hint (shortcut, current value…). */
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Renders a check mark column; `false` keeps the space empty. */
  checked?: boolean;
  /** Keep the menu open after selecting (for toggles). */
  keepOpen?: boolean;
  onSelect?: () => void;
  submenu?: () => MenuItem[];
}

export type MenuItem =
  | MenuActionItem
  | { kind: 'separator' }
  | { kind: 'header'; label: string }
  | { kind: 'custom'; key: string; render: (close: () => void) => ReactNode };

interface MenuState {
  open: boolean;
  x: number;
  y: number;
  /** Re-evaluated on every render so toggles reflect the latest data. */
  build: (() => MenuItem[]) | null;
  /** Element that opened the menu (focus returns there on close). */
  returnFocus: HTMLElement | null;
}

export const useMenu = create<MenuState>(() => ({ open: false, x: 0, y: 0, build: null, returnFocus: null }));

interface PointerLike {
  clientX: number;
  clientY: number;
  preventDefault?: () => void;
  stopPropagation?: () => void;
  shiftKey?: boolean;
  target?: EventTarget | null;
}

/** Lets the browser menu through for text fields, selections and Shift + right click. */
export function wantsNativeMenu(e: PointerLike): boolean {
  if (e.shiftKey) return true;
  const target = e.target as HTMLElement | null;
  if (target?.closest?.('input, textarea, select, [contenteditable="true"], a[href]')) return true;
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed && selection.toString().trim() !== '') return true;
  return false;
}

export function openContextMenu(e: PointerLike, build: () => MenuItem[]): void {
  e.preventDefault?.();
  e.stopPropagation?.();
  useMenu.setState({
    open: true,
    x: e.clientX,
    y: e.clientY,
    build,
    returnFocus: null,
  });
}

/** Opens the menu below an element (for "…" buttons and keyboard access). */
export function openMenuAt(el: HTMLElement, build: () => MenuItem[]): void {
  const rect = el.getBoundingClientRect();
  useMenu.setState({ open: true, x: rect.left, y: rect.bottom + 4, build, returnFocus: el });
}

export function closeContextMenu(): void {
  const { open, returnFocus } = useMenu.getState();
  if (!open) return;
  useMenu.setState({ open: false, build: null, returnFocus: null });
  if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
}
