/**
 * Dates are stored as local strings: "YYYY-MM-DD" (all day) or "YYYY-MM-DDTHH:mm".
 * Keeping them timezone-less is simpler for a personal app and survives JSON round-trips.
 */

export type DueStatus = 'done' | 'overdue' | 'soon' | 'normal';

const pad = (n: number) => String(n).padStart(2, '0');

export function isAllDay(value: string): boolean {
  return !value.includes('T');
}

export function parseLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  if (h === undefined) return new Date(Number(y), Number(mo) - 1, Number(d), 23, 59, 59);
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateKeyOf(value: string): string {
  return value.slice(0, 10);
}

export function timeOf(value: string): string {
  return isAllDay(value) ? '' : value.slice(11, 16);
}

export function combine(dateKey: string, time: string): string {
  return time ? `${dateKey}T${time}` : dateKey;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function addDaysKey(days: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return toDateKey(d);
}

/** Next given weekday (1 = Monday), never today. */
export function nextWeekdayKey(weekday: number, from = new Date()): string {
  const diff = (weekday - from.getDay() + 7) % 7 || 7;
  return addDaysKey(diff, from);
}

/** Keeps the time part of `value` while moving it to another day. */
export function moveToDay(value: string | null, dateKey: string): string {
  if (!value) return dateKey;
  return combine(dateKey, timeOf(value));
}

export function dueStatus(due: string | null, done: boolean, now = new Date()): DueStatus | null {
  if (!due) return null;
  if (done) return 'done';
  const date = parseLocal(due);
  if (!date) return null;
  const diff = date.getTime() - now.getTime();
  if (diff < 0) return 'overdue';
  if (diff < 24 * 3600 * 1000) return 'soon';
  return 'normal';
}

export const DUE_STATUS_TEXT: Record<DueStatus, string> = {
  done: 'Completada',
  overdue: 'Vencida',
  soon: 'Vence pronto',
  normal: '',
};

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
export const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
export const WEEKDAYS_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

export function formatDate(value: string, opts: { withYear?: boolean } = {}): string {
  const date = parseLocal(value);
  if (!date) return value;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  let text = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  if (opts.withYear || !sameYear) text += ` ${date.getFullYear()}`;
  if (!isAllDay(value)) text += `, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return text;
}

export function formatRange(start: string | null, due: string | null): string {
  if (start && due) return `${formatDate(start)} – ${formatDate(due)}`;
  if (due) return formatDate(due);
  if (start) return `Empieza: ${formatDate(start)}`;
  return '';
}

export function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'hace un momento';
  if (diff < 3600_000) return `hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 24 * 3600_000 && date.getDate() === new Date().getDate()) {
    return `hoy, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return `${formatDate(toDateKey(date), { withYear: true })}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Monday-based matrix of 6 weeks covering the given month. */
export function monthMatrix(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d));
    }
    weeks.push(week);
  }
  return weeks;
}
