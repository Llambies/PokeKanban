import { create } from 'zustand';
import { EMPTY_FILTER, type CardFilter } from '../lib/filter';

/* ------------------------------------------------------------ preferences */

export type ThemePref = 'system' | 'light' | 'dark';

interface Prefs {
  theme: ThemePref;
  compactLabels: boolean;
}

const PREFS_KEY = 'pokekanban:prefs';

function readPrefs(): Prefs {
  const defaults: Prefs = { theme: 'system', compactLabels: false };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

export const usePrefs = create<Prefs>(readPrefs);

export function setPrefs(patch: Partial<Prefs>): void {
  usePrefs.setState(patch);
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(usePrefs.getState()));
  } catch {
    /* ignore */
  }
}

/* --------------------------------------------------------------- UI state */

export type BoardPanel = 'menu' | 'labels' | 'archive' | 'background' | null;

export interface Toast {
  id: number;
  text: string;
  actionText?: string;
  action?: () => void;
}

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmText?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

export interface PromptRequest {
  title: string;
  label?: string;
  value: string;
  placeholder?: string;
  confirmText?: string;
  inputType?: 'text' | 'number' | 'url';
  resolve: (value: string | null) => void;
}

interface UIState {
  filter: CardFilter;
  filterOpen: boolean;
  panel: BoardPanel;
  /** Card whose title is being edited directly on the board. */
  editingCardId: string | null;
  /** List whose "add card" composer is open. */
  composerListId: string | null;
  shortcutsOpen: boolean;
  searchOpen: boolean;
  toasts: Toast[];
  confirm: ConfirmRequest | null;
  prompt: PromptRequest | null;
}

export const useUI = create<UIState>(() => ({
  filter: EMPTY_FILTER,
  filterOpen: false,
  panel: null,
  editingCardId: null,
  composerListId: null,
  shortcutsOpen: false,
  searchOpen: false,
  toasts: [],
  confirm: null,
  prompt: null,
}));

export function setFilter(patch: Partial<CardFilter>): void {
  useUI.setState((s) => ({ filter: { ...s.filter, ...patch } }));
}

export function clearFilter(): void {
  useUI.setState({ filter: EMPTY_FILTER });
}

export function openPanel(panel: BoardPanel): void {
  useUI.setState({ panel });
}

let toastId = 0;

export function toast(text: string, opts: { actionText?: string; action?: () => void; duration?: number } = {}): void {
  const id = ++toastId;
  useUI.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, actionText: opts.actionText, action: opts.action }] }));
  setTimeout(() => dismissToast(id), opts.duration ?? 4000);
}

export function dismissToast(id: number): void {
  useUI.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function confirmDialog(req: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    useUI.setState({ confirm: { ...req, resolve } });
  });
}

export function promptDialog(req: Omit<PromptRequest, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => {
    useUI.setState({ prompt: { ...req, resolve } });
  });
}
