import { useSyncExternalStore } from 'react';
import type { BoardView } from '../types';

/**
 * Hash based routes (work with any static host or sub-path):
 *   #/                         home
 *   #/b/<boardId>[/<view>]     board (view: kanban | table | calendar)
 *   ...?c=<cardId>             open card on top of the board
 */
export interface Route {
  boardId: string | null;
  view: BoardView;
  cardId: string | null;
}

const VIEWS: BoardView[] = ['kanban', 'table', 'calendar'];

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  const route: Route = { boardId: null, view: 'kanban', cardId: params.get('c') };
  if (parts[0] === 'b' && parts[1]) {
    route.boardId = parts[1];
    if (VIEWS.includes(parts[2] as BoardView)) route.view = parts[2] as BoardView;
  }
  return route;
}

export function buildHash(route: Partial<Route>): string {
  if (!route.boardId) return '#/';
  let hash = `#/b/${route.boardId}`;
  if (route.view && route.view !== 'kanban') hash += `/${route.view}`;
  if (route.cardId) hash += `?c=${route.cardId}`;
  return hash;
}

let current = parseHash(window.location.hash);
const listeners = new Set<() => void>();
let cardOpenedInApp = false;

window.addEventListener('hashchange', () => {
  current = parseHash(window.location.hash);
  if (!current.cardId) cardOpenedInApp = false;
  listeners.forEach((l) => l());
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => current);
}

export function getRoute(): Route {
  return current;
}

export function navigate(route: Partial<Route>, replace = false): void {
  const hash = buildHash(route);
  if (hash === window.location.hash) return;
  if (replace) {
    window.history.replaceState(null, '', hash);
    current = parseHash(hash);
    listeners.forEach((l) => l());
  } else {
    window.location.hash = hash;
  }
}

export function openCard(cardId: string, boardId?: string): void {
  const route = getRoute();
  cardOpenedInApp = true;
  navigate({ boardId: boardId ?? route.boardId, view: route.view, cardId });
}

export function closeCard(): void {
  const route = getRoute();
  if (!route.cardId) return;
  if (cardOpenedInApp) {
    cardOpenedInApp = false;
    window.history.back();
  } else {
    navigate({ ...route, cardId: null }, true);
  }
}

export function cardLink(boardId: string, cardId: string): string {
  const base = window.location.href.split('#')[0];
  return base + buildHash({ boardId, cardId });
}
