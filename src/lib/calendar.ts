import type { AppData, CalendarEvent, Card, ColorKey, EventKind, Label, Recurrence } from '../types';
import {
  DEFAULT_KIND_ICONS, dayToKey, isCheckable, isLastWeekdayOfMonth, keyToDay, MONTH_NAMES, nthOfMonth, occurrenceRange, occurrences, spanDays,
  WEEKDAY_NAMES, weekdayOf, yearsAt,
} from '../../shared/calendar.js';
import { normalize } from './icons';
import { parseLocal } from './dates';

export interface KindInfo {
  label: string;
  /** Default icon ("lucide:<Name>"). */
  icon: string;
  color: ColorKey;
  placeholder: string;
}

export const KIND_ORDER: EventKind[] = ['event', 'birthday', 'anniversary', 'deadline', 'reminder'];

export const KIND_INFO: Record<EventKind, KindInfo> = {
  event: { label: 'Evento', icon: DEFAULT_KIND_ICONS.event, color: 'blue', placeholder: 'Título del evento' },
  birthday: { label: 'Cumpleaños', icon: DEFAULT_KIND_ICONS.birthday, color: 'pink', placeholder: 'Nombre (p. ej. Ana)' },
  anniversary: { label: 'Aniversario', icon: DEFAULT_KIND_ICONS.anniversary, color: 'red', placeholder: 'Aniversario de…' },
  deadline: { label: 'Fecha límite', icon: DEFAULT_KIND_ICONS.deadline, color: 'orange', placeholder: '¿Qué vence?' },
  reminder: { label: 'Recordatorio', icon: DEFAULT_KIND_ICONS.reminder, color: 'sky', placeholder: '¿Qué hay que recordar?' },
};

export const CARD_KIND_INFO: KindInfo = { label: 'Tarjetas', icon: DEFAULT_KIND_ICONS.card, color: 'black', placeholder: '' };

export function eventColorKey(event: Pick<CalendarEvent, 'color' | 'labelIds' | 'kind'>, labels: Label[]): ColorKey {
  if (event.color) return event.color;
  for (const id of event.labelIds) {
    const label = labels.find((l) => l.id === id);
    if (label?.color) return label.color;
  }
  return KIND_INFO[event.kind].color;
}

export function eventIcon(event: Pick<CalendarEvent, 'icon' | 'kind'>): string {
  return event.icon ?? KIND_INFO[event.kind].icon;
}

/* ------------------------------------------------------------- recurrence */

const ORDINALS = ['primer', 'segundo', 'tercer', 'cuarto', 'quinto'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

export const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export function dayMonthText(key: string, withYear = false): string {
  const text = `${Number(key.slice(8, 10))} de ${MONTH_NAMES[Number(key.slice(5, 7)) - 1]}`;
  return withYear ? `${text} de ${key.slice(0, 4)}` : text;
}

export function shortDate(key: string): string {
  return `${Number(key.slice(8, 10))} ${MONTHS_SHORT[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

export function monthlyText(mode: Recurrence['monthlyBy'], startKey: string): string {
  const weekday = WEEKDAY_NAMES[weekdayOf(keyToDay(startKey)) - 1];
  if (mode === 'weekday') return `el ${ORDINALS[nthOfMonth(startKey) - 1]} ${weekday}`;
  if (mode === 'last-weekday') return `el último ${weekday}`;
  return `el día ${Number(startKey.slice(8, 10))}`;
}

/** Spanish description of a rule: "Cada 2 semanas el lunes y el jueves, hasta el 3 oct 2026". */
export function recurrenceSummary(rule: Recurrence, startKey: string): string {
  const n = rule.interval;
  let text: string;
  switch (rule.freq) {
    case 'daily':
      text = n === 1 ? 'Cada día' : `Cada ${n} días`;
      break;
    case 'weekly': {
      const days = rule.byWeekday.length ? rule.byWeekday : [weekdayOf(keyToDay(startKey))];
      if (n === 1 && days.join() === '1,2,3,4,5') {
        text = 'Cada día laborable (de lunes a viernes)';
        break;
      }
      text = `${n === 1 ? 'Cada semana' : `Cada ${n} semanas`} el ${joinList(days.map((d) => WEEKDAY_NAMES[d - 1]))}`;
      break;
    }
    case 'monthly':
      text = `${n === 1 ? 'Cada mes' : `Cada ${n} meses`} ${monthlyText(rule.monthlyBy, startKey)}`;
      break;
    case 'yearly':
      text = `${n === 1 ? 'Cada año' : `Cada ${n} años`} el ${dayMonthText(startKey)}`;
      break;
  }
  if (rule.until) text += `, hasta el ${shortDate(rule.until)}`;
  if (rule.count) text += `, ${rule.count} ${rule.count === 1 ? 'vez' : 'veces'}`;
  return text;
}

export interface RepeatPreset {
  key: string;
  label: string;
  rule: Recurrence | null;
}

const baseRule = (freq: Recurrence['freq'], extra: Partial<Recurrence> = {}): Recurrence => ({
  freq, interval: 1, byWeekday: [], monthlyBy: 'day', until: null, count: null, ...extra,
});

/** Quick choices for the "Repetir" selector, worded for the chosen start day. */
export function repeatPresets(startKey: string): RepeatPreset[] {
  const weekday = weekdayOf(keyToDay(startKey));
  const presets: RepeatPreset[] = [
    { key: 'none', label: 'No se repite', rule: null },
    { key: 'daily', label: 'Cada día', rule: baseRule('daily') },
    { key: 'workdays', label: 'Días laborables (lun–vie)', rule: baseRule('weekly', { byWeekday: [1, 2, 3, 4, 5] }) },
    { key: 'weekly', label: `Cada semana el ${WEEKDAY_NAMES[weekday - 1]}`, rule: baseRule('weekly', { byWeekday: [weekday] }) },
    { key: 'biweekly', label: `Cada 2 semanas el ${WEEKDAY_NAMES[weekday - 1]}`, rule: baseRule('weekly', { byWeekday: [weekday], interval: 2 }) },
    { key: 'monthly', label: `Cada mes ${monthlyText('day', startKey)}`, rule: baseRule('monthly') },
    { key: 'monthly-weekday', label: `Cada mes ${monthlyText('weekday', startKey)}`, rule: baseRule('monthly', { monthlyBy: 'weekday' }) },
  ];
  if (isLastWeekdayOfMonth(startKey)) {
    presets.push({ key: 'monthly-last', label: `Cada mes ${monthlyText('last-weekday', startKey)}`, rule: baseRule('monthly', { monthlyBy: 'last-weekday' }) });
  }
  presets.push({ key: 'yearly', label: `Cada año el ${dayMonthText(startKey)}`, rule: baseRule('yearly') });
  return presets;
}

/** Preset matching a rule exactly (only interval, days and mode; no end), or null for custom rules. */
export function matchPreset(rule: Recurrence | null, startKey: string): string | null {
  if (!rule) return 'none';
  if (rule.until || rule.count) return null;
  const sig = (r: Recurrence) => `${r.freq}|${r.interval}|${(r.freq === 'weekly' ? r.byWeekday : []).join()}|${r.freq === 'monthly' ? r.monthlyBy : ''}`;
  const weekday = weekdayOf(keyToDay(startKey));
  const normalized = rule.freq === 'weekly' && rule.byWeekday.length === 0 ? { ...rule, byWeekday: [weekday] } : rule;
  return repeatPresets(startKey).find((p) => p.rule && sig(p.rule) === sig(normalized))?.key ?? null;
}

/* -------------------------------------------------------------- reminders */

export const TIMED_REMINDERS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
export const ALL_DAY_REMINDERS = [0, 1440, 2880, 4320, 10080, 20160];

function unitText(minutes: number): string {
  if (minutes % 10080 === 0) return `${minutes / 10080} ${minutes === 10080 ? 'semana' : 'semanas'}`;
  if (minutes % 1440 === 0) return `${minutes / 1440} ${minutes === 1440 ? 'día' : 'días'}`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

export function reminderText(minutes: number, allDay: boolean, allDayTime = '09:00'): string {
  if (allDay) {
    const at = `a las ${Number(allDayTime.slice(0, 2))}:${allDayTime.slice(3)}`;
    if (minutes === 0) return `El mismo día ${at}`;
    if (minutes % 1440 === 0) return `${unitText(minutes)} antes, ${at}`;
    return `${unitText(minutes)} antes de las ${allDayTime}`;
  }
  if (minutes === 0) return 'A la hora de inicio';
  return `${unitText(minutes)} antes`;
}

/* ------------------------------------------------------------ view items */

/** Something shown on a calendar day: an event occurrence or a board card with a due date. */
export interface CalItem {
  key: string;
  type: 'event' | 'card';
  event?: CalendarEvent;
  card?: Card;
  /** Occurrence start day (events) or due day (cards). */
  occ: string;
  /** Day where this piece is drawn (multi-day events appear on every day they cover). */
  day: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  time: string;
  endTime: string;
  colorKey: ColorKey | null;
  icon: string | null;
  checkable: boolean;
  done: boolean;
  overdue: boolean;
  years: number | null;
  /** Part of a multi-day item: first / last day flags. */
  first: boolean;
  last: boolean;
  multiDay: boolean;
}

export interface CalendarFilter {
  hiddenKinds: string[];
  labelIds: string[];
  text: string;
}

export const EMPTY_CAL_FILTER: CalendarFilter = { hiddenKinds: [], labelIds: [], text: '' };

export function isCalFilterActive(f: CalendarFilter): boolean {
  return f.hiddenKinds.length > 0 || f.labelIds.length > 0 || f.text.trim() !== '';
}

function eventPasses(event: CalendarEvent, filter: CalendarFilter, query: string): boolean {
  if (filter.hiddenKinds.includes(event.kind)) return false;
  if (filter.labelIds.length && !event.labelIds.some((id) => filter.labelIds.includes(id))) return false;
  if (query && !normalize(`${event.title} ${event.notes} ${event.location}`).includes(query)) return false;
  return true;
}

function isPast(value: string, now: Date): boolean {
  const date = parseLocal(value);
  return !!date && date.getTime() < now.getTime();
}

/** Items per day ("YYYY-MM-DD") for the range, sorted: all-day first, then by time. */
export function calendarItems(data: AppData, fromKey: string, toKey: string, filter: CalendarFilter, now = new Date()): Map<string, CalItem[]> {
  const byDay = new Map<string, CalItem[]>();
  const query = normalize(filter.text.trim());
  const push = (item: CalItem) => {
    const list = byDay.get(item.day);
    if (list) list.push(item);
    else byDay.set(item.day, [item]);
  };
  const from = keyToDay(fromKey);
  const to = keyToDay(toKey);

  for (const event of Object.values(data.events)) {
    if (!eventPasses(event, filter, query)) continue;
    const checkable = isCheckable(event);
    // A timed event that ends exactly at midnight doesn't reach into that day.
    const span = Math.max(0, spanDays(event) - (event.start.includes('T') && event.end?.endsWith('T00:00') ? 1 : 0));
    for (const occ of occurrences(event, fromKey, toKey)) {
      const { start, end } = occurrenceRange(event, occ);
      const done = checkable && event.done.includes(occ);
      const allDay = !start.includes('T');
      const first = keyToDay(occ);
      const base = {
        type: 'event' as const,
        event,
        occ,
        title: event.title || 'Sin título',
        start,
        end,
        allDay,
        time: allDay ? '' : start.slice(11, 16),
        endTime: end && !allDay ? end.slice(11, 16) : '',
        colorKey: eventColorKey(event, data.eventLabels),
        icon: eventIcon(event),
        checkable,
        done,
        overdue: checkable && !done && isPast(start, now),
        years: yearsAt(event, occ),
        multiDay: span > 0,
      };
      for (let day = Math.max(first, from); day <= Math.min(first + span, to); day++) {
        push({ ...base, key: `${event.id}:${occ}:${day}`, day: dayToKey(day), first: day === first, last: day === first + span });
      }
    }
  }

  if (data.settings.showCards && !filter.hiddenKinds.includes('card') && filter.labelIds.length === 0) {
    for (const boardId of data.boardOrder) {
      const board = data.boards[boardId];
      for (const listId of board?.listIds ?? []) {
        for (const cardId of data.lists[listId]?.cardIds ?? []) {
          const card = data.cards[cardId];
          if (!card?.due || card.kind !== 'card' || card.isTemplate) continue;
          const day = card.due.slice(0, 10);
          if (day < fromKey || day > toKey) continue;
          if (query && !normalize(`${card.title} ${card.description}`).includes(query)) continue;
          const allDay = !card.due.includes('T');
          push({
            key: `card:${card.id}`,
            type: 'card',
            card,
            occ: day,
            day,
            title: card.title || 'Tarjeta',
            start: card.due,
            end: null,
            allDay,
            time: allDay ? '' : card.due.slice(11, 16),
            endTime: '',
            colorKey: card.cover?.color ?? null,
            icon: DEFAULT_KIND_ICONS.card,
            checkable: true,
            done: card.dueDone,
            overdue: !card.dueDone && isPast(card.due, now),
            years: null,
            first: true,
            last: true,
            multiDay: false,
          });
        }
      }
    }
  }

  // Timed pieces that continue from the day before start at midnight.
  const sortTime = (it: CalItem) => (it.first ? it.time : '');
  for (const list of byDay.values()) {
    list.sort(
      (a, b) =>
        Number(!a.allDay) - Number(!b.allDay) ||
        Number(!(a.allDay && a.multiDay)) - Number(!(b.allDay && b.multiDay)) ||
        sortTime(a).localeCompare(sortTime(b)) ||
        Number(a.type === 'card') - Number(b.type === 'card') ||
        a.title.localeCompare(b.title),
    );
  }
  return byDay;
}

/** Title shown for an item: birthdays and anniversaries get the years. */
export function itemTitle(item: Pick<CalItem, 'title' | 'years' | 'event'>): string {
  if (!item.years || !item.event) return item.title;
  return item.event.kind === 'birthday' ? `${item.title} (${item.years})` : `${item.title} · ${item.years} años`;
}
