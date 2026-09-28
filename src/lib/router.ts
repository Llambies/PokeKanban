import { useSyncExternalStore } from 'react';
import type { BoardView, CalendarView } from '../types';

/**
 * Hash based routes (work with any static host or sub-path):
 *   #/                         home
 *   #/b/<boardId>[/<view>]     board (view: kanban | table | calendar)
 *   #/calendar[/<view>]        calendar (view: month | week | agenda)
 *   ...?c=<cardId>             open card on top of the page
 *   #/calendar?e=<id>&o=<day>  open an event (occurrence) · ?d=<day> shows that day
 */
export type Page = 'home' | 'board' | 'calendar';

export interface Route {
  page: Page;
  boardId: string | null;
  view: BoardView;
  cardId: string | null;
  calView: CalendarView | null;
  eventId: string | null;
  occ: string | null;
  date: string | null;
}

const VIEWS: BoardView[] = ['kanban', 'table', 'calendar'];
const CAL_VIEWS: CalendarView[] = ['month', 'week', 'agenda'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  const day = (v: string | null) => (v && DAY.test(v) ? v : null);
  const route: Route = {
    page: 'home', boardId: null, view: 'kanban', cardId: params.get('c'), calView: null, eventId: null, occ: null, date: null,
  };
  if (parts[0] === 'b' && parts[1]) {
    route.page = 'board';
    route.boardId = decodeURIComponent(parts[1]);
    if (VIEWS.includes(parts[2] as BoardView)) route.view = parts[2] as BoardView;
  } else if (parts[0] === 'calendar') {
    route.page = 'calendar';
    if (CAL_VIEWS.includes(parts[1] as CalendarView)) route.calView = parts[1] as CalendarView;
    route.eventId = params.get('e');
    route.occ = day(params.get('o'));
    route.date = day(params.get('d'));
  }
  return route;
}

export function buildHash(route: Partial<Route>): string {
  const query = new URLSearchParams();
  let hash: string;
  if (route.page === 'calendar') {
    hash = '#/calendar';
    if (route.calView) hash += `/${route.calView}`;
    if (route.date) query.set('d', route.date);
    if (route.eventId) query.set('e', route.eventId);
    if (route.eventId && route.occ) query.set('o', route.occ);
  } else if (route.boardId) {
    hash = `#/b/${route.boardId}`;
    if (route.view && route.view !== 'kanban') hash += `/${route.view}`;
  } else {
    return '#/';
  }
  if (route.cardId) query.set('c', route.cardId);
  const q = query.toString();
  return q ? `${hash}?${q}` : hash;
}

let current = parseHash(window.location.hash);
const listeners = new Set<() => void>();
let cardOpenedInApp = false;
let eventOpenedInApp = false;

window.addEventListener('hashchange', () => {
  current = parseHash(window.location.hash);
  if (!current.cardId) cardOpenedInApp = false;
  if (!current.eventId) eventOpenedInApp = false;
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
    if (!current.cardId) cardOpenedInApp = false;
    if (!current.eventId) eventOpenedInApp = false;
    listeners.forEach((l) => l());
  } else {
    window.location.hash = hash;
  }
}

export function openCard(cardId: string, boardId?: string): void {
  const route = getRoute();
  // On the calendar the card opens on top of it; elsewhere on top of its board.
  const target = route.page === 'calendar'
    ? { ...route, eventId: null, cardId }
    : { page: 'board' as const, boardId: boardId ?? route.boardId, view: route.view, cardId };
  // Only remember that we pushed a history entry if we really do (closing uses history.back()).
  if (buildHash(target) === window.location.hash) return;
  cardOpenedInApp = true;
  navigate(target);
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

/** Opens an event occurrence in the calendar (the editor is part of the route, like cards). */
export function openEvent(eventId: string, occ: string | null): void {
  const route = getRoute();
  const base = route.page === 'calendar' ? route : { page: 'calendar' as const, calView: null, date: occ };
  const target = { ...base, cardId: null, eventId, occ };
  if (buildHash(target) === window.location.hash) return;
  eventOpenedInApp = true;
  navigate(target);
}

export function closeEvent(): void {
  const route = getRoute();
  if (!route.eventId) return;
  if (eventOpenedInApp) {
    eventOpenedInApp = false;
    window.history.back();
  } else {
    navigate({ ...route, eventId: null, occ: null }, true);
  }
}

export function cardLink(boardId: string, cardId: string): string {
  const base = window.location.href.split('#')[0];
  return base + buildHash({ boardId, cardId });
}
