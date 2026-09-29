import type { AppData, CalendarEvent, EventKind } from '../src/types';

export const WEEKDAY_NAMES: string[];
export const MONTH_NAMES: string[];
export const CHECKABLE_KINDS: EventKind[];
export const DEFAULT_KIND_ICONS: Record<EventKind | 'card', string>;

export function keyToDay(key: string): number;
export function dayToKey(day: number): string;
export function weekdayOf(day: number): number;
export function nthOfMonth(key: string): number;
export function isLastWeekdayOfMonth(key: string): boolean;

type EventLike = Pick<CalendarEvent, 'start' | 'end' | 'recurrence' | 'exdates'>;

export function spanDays(event: Pick<CalendarEvent, 'start' | 'end'>): number;
export function occurrences(event: EventLike, fromKey: string, toKey: string): string[];
export function occurrenceIndex(event: EventLike, occKey: string): number;
export function isOccurrence(event: EventLike, occKey: string): boolean;
export function occurrenceRange(event: Pick<CalendarEvent, 'start' | 'end'>, occKey: string): { start: string; end: string | null };
export function yearsAt(event: Pick<CalendarEvent, 'kind' | 'sinceYear'>, occKey: string): number | null;
export function isCheckable(event: Pick<CalendarEvent, 'kind'>): boolean;

export function wallToUtc(dateKey: string, time: string, timeZone?: string | null): number;
export function dayKeyAt(ms: number, timeZone?: string | null): string;
export function whenText(dateKey: string, time: string, todayKey: string): string;
export function iconEmoji(icon: string | null, kind: EventKind | 'card'): string;
export function eventUrl(eventId: string, occKey: string): string;
export function cardUrl(boardId: string, cardId: string): string;

export interface ReminderNotice {
  at: number;
  id: string;
  title: string;
  body: string;
  url: string;
  /** The event's icon value ("lucide:…", "poke:25", an emoji) or null. */
  icon?: string | null;
}

export function collectReminders(
  data: Partial<AppData>,
  fromMs: number,
  toMs: number,
  opts?: { timeZone?: string | null },
): ReminderNotice[];

export interface AgendaItem {
  id: string;
  kind: EventKind | 'card';
  title: string;
  date: string;
  time: string;
  endDate: string | null;
  endTime: string;
  colorKey: string | null;
  color: string | null;
  icon: string | null;
  emoji: string;
  detail: string;
  checkable: boolean;
  done: boolean;
  overdue: boolean;
  url: string;
  eventId?: string;
  occ?: string;
  cardId?: string;
  boardId?: string;
}

export function agenda(
  data: Partial<AppData>,
  fromKey: string,
  days: number,
  opts?: { timeZone?: string | null; now?: number },
): AgendaItem[];
