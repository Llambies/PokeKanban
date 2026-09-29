// Calendar engine shared by the web app, the API server (reminders sent as push notifications,
// agenda for the Android widget) and the tests. Plain JavaScript (types in calendar.d.ts) so Node
// and the Cloudflare Worker can run it without a build step.
//
// Dates are the app's local strings: "YYYY-MM-DD" (all day) or "YYYY-MM-DDTHH:mm". Day arithmetic
// uses "day numbers" (days since 1970-01-01, computed in UTC) so it never trips over DST changes.
// An occurrence is identified by the day it starts on ("YYYY-MM-DD").

import { colorHex } from './palette.js';

const DAY_MS = 86400000;
const MAX_STEPS = 200000;
const pad = (n) => String(n).padStart(2, '0');

export const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/* ------------------------------------------------------------ day numbers */

export function keyToDay(key) {
  return Math.floor(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))) / DAY_MS);
}

export function dayToKey(day) {
  const d = new Date(day * DAY_MS);
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** ISO weekday of a day number: 1 = Monday … 7 = Sunday (1970-01-01 was a Thursday). */
export function weekdayOf(day) {
  return ((((day + 3) % 7) + 7) % 7) + 1;
}

function dayOf(y, m0, d) {
  return Math.floor(Date.UTC(y, m0, d) / DAY_MS);
}

function daysInMonth(y, m0) {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/** Which "nth weekday" of its month a day is (1…5). */
export function nthOfMonth(key) {
  return Math.ceil(Number(key.slice(8, 10)) / 7);
}

/** True when there is no later day with the same weekday in the month. */
export function isLastWeekdayOfMonth(key) {
  const y = Number(key.slice(0, 4));
  const m0 = Number(key.slice(5, 7)) - 1;
  return Number(key.slice(8, 10)) + 7 > daysInMonth(y, m0);
}

const isAllDay = (value) => !value.includes('T');
const timeOf = (value) => (isAllDay(value) ? '' : value.slice(11, 16));

/* ------------------------------------------------------------- recurrence */

function monthlyDay(y, m0, mode, startDate, weekday, nth) {
  const dim = daysInMonth(y, m0);
  if (mode === 'weekday' || mode === 'last-weekday') {
    const firstWeekday = weekdayOf(dayOf(y, m0, 1));
    const first = 1 + ((weekday - firstWeekday + 7) % 7);
    if (mode === 'last-weekday') return dayOf(y, m0, first + 7 * Math.floor((dim - first) / 7));
    const date = first + 7 * (nth - 1);
    return date <= dim ? dayOf(y, m0, date) : null;
  }
  // Months without that day (31st, 30th, 29 Feb) use their last day.
  return dayOf(y, m0, Math.min(startDate, dim));
}

/**
 * Candidate occurrence days of a series in ascending order (exdates, until and count not applied).
 * `hint` lets it skip ahead to periods that may reach that day (only safe without a count).
 */
function* seriesDays(startKey, rule, hint) {
  const start = keyToDay(startKey);
  const interval = Math.max(1, Math.floor(rule.interval) || 1);
  const sy = Number(startKey.slice(0, 4));
  const sm = Number(startKey.slice(5, 7)) - 1;
  const sd = Number(startKey.slice(8, 10));
  const skip = (distance, period) => (hint > start ? Math.max(0, Math.floor(distance / period) - 1) * period : 0);

  switch (rule.freq) {
    case 'daily': {
      for (let day = start + skip(hint - start, interval); ; day += interval) yield day;
    }
    case 'weekly': {
      const days = [...new Set((rule.byWeekday ?? []).filter((d) => d >= 1 && d <= 7))].sort();
      if (days.length === 0) days.push(weekdayOf(start));
      const monday = start - (weekdayOf(start) - 1);
      for (let week = monday + skip(hint - monday, 7 * interval); ; week += 7 * interval) {
        for (const d of days) {
          const day = week + d - 1;
          if (day >= start) yield day;
        }
      }
    }
    case 'monthly': {
      const weekday = weekdayOf(start);
      const nth = nthOfMonth(startKey);
      const hintKey = hint > start ? dayToKey(hint) : startKey;
      const months = (Number(hintKey.slice(0, 4)) - sy) * 12 + Number(hintKey.slice(5, 7)) - 1 - sm;
      let misses = 0;
      for (let k = skip(months, interval); misses < 240; k += interval) {
        const day = monthlyDay(sy + Math.floor((sm + k) / 12), (sm + k) % 12, rule.monthlyBy, sd, weekday, nth);
        if (day === null || day < start) {
          misses++;
          continue;
        }
        misses = 0;
        yield day;
      }
      return;
    }
    case 'yearly': {
      const years = hint > start ? Number(dayToKey(hint).slice(0, 4)) - sy : 0;
      for (let k = skip(years, interval); ; k += interval) {
        const y = sy + k;
        // 29 February falls on the 28th in common years.
        yield dayOf(y, sm, Math.min(sd, daysInMonth(y, sm)));
      }
    }
    default:
      yield start;
  }
}

/** Length of an event in extra days (0 for single-day events). */
export function spanDays(event) {
  if (!event.end) return 0;
  return Math.max(0, keyToDay(event.end) - keyToDay(event.start));
}

/**
 * Occurrences (their start day, "YYYY-MM-DD") that touch the range [fromKey, toKey],
 * including multi-day occurrences that started before it.
 */
export function occurrences(event, fromKey, toKey) {
  const from = keyToDay(fromKey);
  const to = keyToDay(toKey);
  const start = keyToDay(event.start);
  const span = spanDays(event);
  if (!event.recurrence) return start <= to && start + span >= from ? [dayToKey(start)] : [];

  const rule = event.recurrence;
  const until = rule.until ? keyToDay(rule.until) : Infinity;
  const count = rule.count && rule.count > 0 ? rule.count : Infinity;
  const excluded = new Set(event.exdates ?? []);
  const result = [];
  let index = 0;
  let steps = 0;
  // With a count every occurrence from the start must be counted, so no skipping ahead.
  for (const day of seriesDays(event.start, rule, count === Infinity ? from - span : -Infinity)) {
    if (day > to || day > until || index >= count || ++steps > MAX_STEPS) break;
    index++;
    if (day + span < from) continue;
    const key = dayToKey(day);
    if (!excluded.has(key)) result.push(key);
  }
  return result;
}

/** Position of an occurrence in its series (0 = first), counting removed ones; -1 if it isn't one. */
export function occurrenceIndex(event, occKey) {
  const target = keyToDay(occKey);
  if (!event.recurrence) return keyToDay(event.start) === target ? 0 : -1;
  let index = 0;
  for (const day of seriesDays(event.start, event.recurrence, -Infinity)) {
    if (day > target || index > MAX_STEPS) return -1;
    if (day === target) return index;
    index++;
  }
  return -1;
}

/** Whether `occKey` is a (not removed) occurrence of the event. */
export function isOccurrence(event, occKey) {
  return occurrences(event, occKey, occKey).includes(occKey);
}

/** Start and end strings of one occurrence (same format as the event's). */
export function occurrenceRange(event, occKey) {
  const time = timeOf(event.start);
  const start = time ? `${occKey}T${time}` : occKey;
  if (!event.end) return { start, end: null };
  const endKey = dayToKey(keyToDay(occKey) + spanDays(event));
  const endTime = timeOf(event.end);
  return { start, end: endTime ? `${endKey}T${endTime}` : endKey };
}

/** Years since `sinceYear` at an occurrence (birthdays, anniversaries), or null. */
export function yearsAt(event, occKey) {
  if (!event.sinceYear || (event.kind !== 'birthday' && event.kind !== 'anniversary')) return null;
  const years = Number(occKey.slice(0, 4)) - event.sinceYear;
  return years > 0 ? years : null;
}

export const CHECKABLE_KINDS = ['deadline', 'reminder'];

/** Icon shown for each kind of item when it has none of its own (same as the app). */
export const DEFAULT_KIND_ICONS = {
  event: 'lucide:Calendar',
  birthday: 'lucide:CakeSlice',
  anniversary: 'lucide:Heart',
  deadline: 'lucide:Flag',
  reminder: 'lucide:Bell',
  card: 'lucide:ClipboardList',
};

export function isCheckable(event) {
  return CHECKABLE_KINDS.includes(event.kind);
}

/* -------------------------------------------------------------- time zones */

const formatters = new Map();

function zoneFormatter(timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
      });
    } catch {
      f = zoneFormatter('UTC');
    }
    formatters.set(timeZone, f);
  }
  return f;
}

function partsIn(ms, timeZone) {
  const out = {};
  for (const p of zoneFormatter(timeZone).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out;
}

function offsetAt(ms, timeZone) {
  const p = partsIn(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** Instant of a wall-clock time in a zone (null/undefined zone = this device's local time). */
export function wallToUtc(dateKey, time, timeZone) {
  const [y, mo, d] = [Number(dateKey.slice(0, 4)), Number(dateKey.slice(5, 7)) - 1, Number(dateKey.slice(8, 10))];
  const [h, mi] = time ? time.split(':').map(Number) : [0, 0];
  if (!timeZone) return new Date(y, mo, d, h, mi).getTime();
  const wall = Date.UTC(y, mo, d, h, mi);
  const guess = wall - offsetAt(wall, timeZone);
  return wall - offsetAt(guess, timeZone);
}

/** Day ("YYYY-MM-DD") of an instant in a zone (null/undefined zone = local). */
export function dayKeyAt(ms, timeZone) {
  if (!timeZone) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const p = partsIn(ms, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/* ------------------------------------------------------------------- texts */

/** "Hoy a las 10:00", "Mañana", "El viernes a las 9:30", "El 3 de octubre"… */
export function whenText(dateKey, time, todayKey) {
  const diff = keyToDay(dateKey) - keyToDay(todayKey);
  let day;
  if (diff === 0) day = 'Hoy';
  else if (diff === 1) day = 'Mañana';
  else if (diff === -1) day = 'Ayer';
  else if (diff > 1 && diff < 7) day = `El ${WEEKDAY_NAMES[weekdayOf(keyToDay(dateKey)) - 1]}`;
  else day = `El ${Number(dateKey.slice(8, 10))} de ${MONTH_NAMES[Number(dateKey.slice(5, 7)) - 1]}`;
  if (!time) return day;
  const hour = Number(time.slice(0, 2));
  return `${day} a la${hour === 1 ? '' : 's'} ${hour}:${time.slice(3, 5)}`;
}

const LUCIDE_EMOJI = {
  Star: '⭐', Flame: '🔥', Zap: '⚡', Bug: '🐛', TriangleAlert: '⚠️', CircleCheck: '✅', CircleX: '❌', Ban: '⛔',
  CircleHelp: '❓', Info: 'ℹ️', Flag: '🚩', Bookmark: '🔖', Tag: '🏷️', Pin: '📌', Heart: '❤️', Lightbulb: '💡',
  Sparkles: '✨', Wand2: '🪄', Rocket: '🚀', Target: '🎯', Trophy: '🏆', Award: '🏅', Crown: '👑', Gem: '💎',
  Diamond: '💎', Clock: '🕒', AlarmClock: '⏰', Timer: '⏱️', Hourglass: '⏳', Calendar: '📅', Repeat: '🔁',
  ListChecks: '📋', ClipboardList: '📋', Inbox: '📥', Archive: '🗄️', Package: '📦', Truck: '🚚', Code: '💻',
  Terminal: '💻', Laptop: '💻', Monitor: '🖥️', Smartphone: '📱', Globe: '🌍', Link: '🔗', Lock: '🔒', Key: '🔑',
  Shield: '🛡️', Settings: '⚙️', Wrench: '🔧', Hammer: '🔨', Construction: '🚧', Scissors: '✂️', Paperclip: '📎',
  Pencil: '✏️', FileText: '📄', Folder: '📁', BookOpen: '📖', GraduationCap: '🎓', Brain: '🧠', Palette: '🎨',
  Camera: '📷', Film: '🎬', Music: '🎵', Headphones: '🎧', Mic: '🎤', Megaphone: '📣', Mail: '✉️',
  MessageSquare: '💬', Phone: '📞', Send: '📨', Bell: '🔔', Search: '🔍', Eye: '👁️', User: '👤', Users: '👥',
  Baby: '👶', Hand: '✋', ThumbsUp: '👍', ThumbsDown: '👎', Smile: '😊', PartyPopper: '🎉', Gift: '🎁',
  CakeSlice: '🎂', Briefcase: '💼', Building2: '🏢', House: '🏠', ShoppingCart: '🛒', CreditCard: '💳',
  Wallet: '👛', PiggyBank: '🐷', Calculator: '🧮', BarChart3: '📊', TrendingUp: '📈', Plane: '✈️', Car: '🚗',
  Train: '🚆', Bike: '🚲', MapPin: '📍', Compass: '🧭', Tent: '⛺', Mountain: '⛰️', TreePine: '🌲', Leaf: '🍃',
  Sprout: '🌱', Flower2: '🌸', Recycle: '♻️', Sun: '☀️', Moon: '🌙', Cloud: '☁️', Umbrella: '☂️', Snowflake: '❄️',
  Droplet: '💧', Waves: '🌊', Feather: '🪶', Anchor: '⚓', Coffee: '☕', Utensils: '🍴', Pizza: '🍕', Salad: '🥗',
  Apple: '🍎', Dumbbell: '🏋️', Pill: '💊', Stethoscope: '🩺', Gamepad2: '🎮', Swords: '⚔️', Ghost: '👻',
  Skull: '💀', Dog: '🐶', Cat: '🐱', Bird: '🐦', Fish: '🐟', CircleDot: '🔘',
};

const KIND_EMOJI = { event: '📅', birthday: '🎂', anniversary: '💞', deadline: '🚩', reminder: '🔔', card: '📋' };

/** An emoji for an icon value ("lucide:Name" or an emoji), falling back to the kind's emoji. */
export function iconEmoji(icon, kind) {
  if (icon && !icon.startsWith('lucide:') && !icon.startsWith('poke:')) return icon;
  if (icon && LUCIDE_EMOJI[icon.slice(7)]) return LUCIDE_EMOJI[icon.slice(7)];
  return KIND_EMOJI[kind] ?? '📅';
}

export function eventUrl(eventId, occKey) {
  return `#/calendar?e=${encodeURIComponent(eventId)}&o=${occKey}`;
}

export function cardUrl(boardId, cardId) {
  return `#/b/${encodeURIComponent(boardId)}?c=${encodeURIComponent(cardId)}`;
}

function eventDetail(event, occKey, when) {
  const years = yearsAt(event, occKey);
  if (event.kind === 'birthday') return years ? `${when}: cumple ${years} años` : `${when}: cumpleaños`;
  if (event.kind === 'anniversary') return years ? `${when}: ${years} años` : `${when}: aniversario`;
  if (event.kind === 'deadline') return `Vence: ${when.charAt(0).toLowerCase()}${when.slice(1)}`;
  return event.location ? `${when} · ${event.location}` : when;
}

/* --------------------------------------------------------------- reminders */

function liveCards(data) {
  const out = [];
  for (const card of Object.values(data.cards ?? {})) {
    if (card.kind !== 'card' || card.archived || card.isTemplate) continue;
    const list = data.lists?.[card.listId];
    if (!list || list.archived || !data.boards?.[card.boardId]) continue;
    out.push(card);
  }
  return out;
}

/**
 * Reminders due in (fromMs, toMs], oldest first: [{ at, id, title, body, url }].
 * `timeZone` defaults to data.settings.timeZone; pass null to use the device's local time.
 */
export function collectReminders(data, fromMs, toMs, opts = {}) {
  const tz = opts.timeZone === undefined ? data.settings?.timeZone || 'UTC' : opts.timeZone;
  const allDayTime = data.settings?.allDayTime || '09:00';
  const out = [];
  const firstDay = keyToDay(dayKeyAt(fromMs, tz)) - 1;

  for (const event of Object.values(data.events ?? {})) {
    const reminders = (event.reminders ?? []).filter((m) => Number.isFinite(m) && m >= 0);
    if (reminders.length === 0) continue;
    const lastDay = keyToDay(dayKeyAt(toMs + Math.max(...reminders) * 60000, tz)) + 1;
    for (const occ of occurrences(event, dayToKey(firstDay), dayToKey(lastDay))) {
      if (isCheckable(event) && event.done?.includes(occ)) continue;
      const time = timeOf(event.start);
      const startMs = wallToUtc(occ, time || allDayTime, tz);
      for (const minutes of reminders) {
        const at = startMs - minutes * 60000;
        if (at <= fromMs || at > toMs) continue;
        const when = whenText(occ, time, dayKeyAt(at, tz));
        out.push({
          at,
          id: `ev:${event.id}:${occ}:${minutes}`,
          title: `${iconEmoji(event.icon, event.kind)} ${event.title || 'Sin título'}`,
          body: eventDetail(event, occ, when),
          url: eventUrl(event.id, occ),
          icon: event.icon ?? null,
        });
      }
    }
  }

  const cardReminders = (data.settings?.cardReminders ?? []).filter((m) => Number.isFinite(m) && m >= 0);
  if (cardReminders.length > 0) {
    for (const card of liveCards(data)) {
      if (!card.due || card.dueDone) continue;
      const key = card.due.slice(0, 10);
      const time = timeOf(card.due);
      const startMs = wallToUtc(key, time || allDayTime, tz);
      for (const minutes of cardReminders) {
        const at = startMs - minutes * 60000;
        if (at <= fromMs || at > toMs) continue;
        const board = data.boards[card.boardId];
        out.push({
          at,
          id: `card:${card.id}:${card.due}:${minutes}`,
          title: `📋 ${card.title || 'Tarjeta'}`,
          body: `Vence: ${whenText(key, time, dayKeyAt(at, tz)).toLowerCase()} · ${board.title}`,
          url: cardUrl(card.boardId, card.id),
        });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/* ------------------------------------------------------------------ agenda */

const OVERDUE_DAYS = 30;

/**
 * Flat, sorted agenda for `days` days from `fromKey` (plus overdue deadlines / reminders / cards
 * from the previous 30 days). Used by the Android widget and the home page.
 */
export function agenda(data, fromKey, days, opts = {}) {
  const tz = opts.timeZone === undefined ? data.settings?.timeZone || 'UTC' : opts.timeZone;
  const nowMs = opts.now ?? Date.now();
  const todayKey = dayKeyAt(nowMs, tz);
  const from = keyToDay(fromKey);
  const toKey = dayToKey(from + Math.max(1, days) - 1);
  const pastKey = dayToKey(from - OVERDUE_DAYS);
  const labels = new Map((data.eventLabels ?? []).map((l) => [l.id, l]));
  const items = [];

  const isPast = (dateKey, time) =>
    dateKey < todayKey || (dateKey === todayKey && !!time && wallToUtc(dateKey, time, tz) < nowMs);

  for (const event of Object.values(data.events ?? {})) {
    const checkable = isCheckable(event);
    const range = checkable ? occurrences(event, pastKey, toKey) : occurrences(event, fromKey, toKey);
    for (const occ of range) {
      const done = checkable && (event.done ?? []).includes(occ);
      const { start, end } = occurrenceRange(event, occ);
      const time = timeOf(start);
      const overdue = checkable && !done && isPast(occ, time);
      if (occ < fromKey && !overdue && keyToDay(occ) + spanDays(event) < from) continue;
      const labelColor = event.labelIds?.map((id) => labels.get(id)?.color).find(Boolean) ?? null;
      const colorKey = event.color ?? labelColor;
      const years = yearsAt(event, occ);
      items.push({
        id: `ev:${event.id}:${occ}`,
        kind: event.kind,
        title: event.title || 'Sin título',
        date: occ,
        time,
        endDate: end ? end.slice(0, 10) : null,
        endTime: end ? timeOf(end) : '',
        colorKey,
        color: colorHex(colorKey),
        // Effective icon: the event's own or its kind's (the widget draws the app's Lucide icons).
        icon: event.icon ?? DEFAULT_KIND_ICONS[event.kind] ?? null,
        emoji: iconEmoji(event.icon, event.kind),
        detail:
          event.kind === 'birthday' ? (years ? `Cumple ${years} años` : 'Cumpleaños')
          : event.kind === 'anniversary' ? (years ? `${years} años` : 'Aniversario')
          : event.location || '',
        checkable,
        done,
        overdue,
        eventId: event.id,
        occ,
        url: eventUrl(event.id, occ),
      });
    }
  }

  if (data.settings?.showCards !== false) {
    for (const card of liveCards(data)) {
      if (!card.due) continue;
      const key = card.due.slice(0, 10);
      const time = timeOf(card.due);
      const overdue = !card.dueDone && isPast(key, time);
      if (key > toKey || key < pastKey || (key < fromKey && !overdue)) continue;
      const colorKey = card.cover?.color ?? null;
      items.push({
        id: `card:${card.id}`,
        kind: 'card',
        title: card.title || 'Tarjeta',
        date: key,
        time,
        endDate: null,
        endTime: '',
        colorKey,
        color: colorHex(colorKey),
        icon: DEFAULT_KIND_ICONS.card,
        emoji: '📋',
        detail: data.boards[card.boardId].title,
        checkable: true,
        done: card.dueDone,
        overdue,
        cardId: card.id,
        boardId: card.boardId,
        url: cardUrl(card.boardId, card.id),
      });
    }
  }

  const rank = (it) => (it.overdue && it.date < fromKey ? 0 : 1);
  return items.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.date.localeCompare(b.date) ||
      Number(!!a.time) - Number(!!b.time) ||
      a.time.localeCompare(b.time) ||
      a.title.localeCompare(b.title),
  );
}
