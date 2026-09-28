import type {
  AppData, AppSettings, Attachment, Board, CalendarEvent, Card, Checklist, ChecklistItem, Comment, CustomField, CustomFieldType,
  CustomFieldValue, EventKind, Label, List, Priority, Recurrence, RecurrenceFreq,
} from '../types';
import { uid } from '../lib/id';
import { defaultSettings, emptyData } from './factories';

type Raw = any;

const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low'];

const str = (v: Raw, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: Raw): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: Raw, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const arr = (v: Raw): Raw[] => (Array.isArray(v) ? v : []);
const bool = (v: Raw): boolean => v === true;
/** Ids may come as numbers from hand-written or foreign JSON. */
const idOf = (v: Raw): string => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const ids = (v: Raw): string[] => arr(v).map(idOf).filter(Boolean);

function normItem(raw: Raw): ChecklistItem {
  return {
    id: idOf(raw?.id) || uid(),
    text: str(raw?.text),
    done: bool(raw?.done),
    due: strOrNull(raw?.due),
    collapsed: bool(raw?.collapsed) || undefined,
    children: arr(raw?.children).map(normItem),
  };
}

function normChecklist(raw: Raw): Checklist {
  return {
    id: idOf(raw?.id) || uid(),
    title: str(raw?.title, 'Checklist'),
    items: arr(raw?.items).map(normItem),
    hideDone: bool(raw?.hideDone) || undefined,
  };
}

function normLabel(raw: Raw): Label {
  return { id: idOf(raw?.id) || uid(), name: str(raw?.name), color: strOrNull(raw?.color), icon: strOrNull(raw?.icon) };
}

const FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'checkbox', 'date', 'select'];

function normField(raw: Raw): CustomField {
  return {
    id: idOf(raw?.id) || uid(),
    name: str(raw?.name, 'Campo'),
    type: FIELD_TYPES.includes(raw?.type) ? raw.type : 'text',
    options: arr(raw?.options).map((o) => ({ id: idOf(o?.id) || uid(), name: str(o?.name), color: strOrNull(o?.color) })),
    showOnCard: raw?.showOnCard !== false,
  };
}

/** Keeps a value only if it fits the field type. */
export function validFieldValue(field: CustomField, value: unknown): CustomFieldValue | undefined {
  switch (field.type) {
    case 'text':
      return typeof value === 'string' && value !== '' ? value : undefined;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    case 'checkbox':
      return value === true ? true : undefined;
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined;
    case 'select':
      return typeof value === 'string' && field.options.some((o) => o.id === value) ? value : undefined;
  }
}

function normCard(raw: Raw, now: number): Card {
  const cover = raw?.cover && typeof raw.cover === 'object'
    ? {
        color: strOrNull(raw.cover.color),
        image: strOrNull(raw.cover.image),
        size: raw.cover.size === 'full' ? ('full' as const) : ('strip' as const),
      }
    : null;
  return {
    id: idOf(raw.id),
    boardId: idOf(raw.boardId),
    listId: idOf(raw.listId),
    kind: raw.kind === 'separator' ? 'separator' : 'card',
    title: str(raw.title),
    description: str(raw.description),
    labelIds: ids(raw.labelIds),
    cover: cover && (cover.color || cover.image) ? cover : null,
    start: strOrNull(raw.start),
    due: strOrNull(raw.due),
    dueDone: bool(raw.dueDone),
    priority: PRIORITIES.includes(raw.priority) ? raw.priority : null,
    checklists: arr(raw.checklists).map(normChecklist),
    attachments: arr(raw.attachments).map(
      (a): Attachment => ({
        id: idOf(a?.id) || uid(),
        name: str(a?.name),
        url: str(a?.url),
        createdAt: num(a?.createdAt, now),
        ...(a?.kind === 'file' ? { kind: 'file' as const } : {}),
        ...(typeof a?.size === 'number' ? { size: a.size } : {}),
        ...(typeof a?.mime === 'string' ? { mime: a.mime } : {}),
      }),
    ),
    comments: arr(raw.comments).map(
      (c): Comment => ({
        id: idOf(c?.id) || uid(),
        text: str(c?.text),
        createdAt: num(c?.createdAt, now),
        ...(typeof c?.editedAt === 'number' ? { editedAt: c.editedAt } : {}),
      }),
    ),
    fields: raw.fields && typeof raw.fields === 'object' && !Array.isArray(raw.fields) ? { ...raw.fields } : {},
    isTemplate: bool(raw.isTemplate),
    archived: bool(raw.archived),
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
  };
}

function normList(raw: Raw, now: number): List {
  const wip = num(raw.wipLimit, 0);
  return {
    id: idOf(raw.id),
    boardId: idOf(raw.boardId),
    title: str(raw.title),
    cardIds: ids(raw.cardIds),
    color: strOrNull(raw.color),
    colorMode: raw.colorMode === 'full' ? 'full' : 'header',
    collapsed: bool(raw.collapsed),
    wipLimit: wip > 0 ? Math.floor(wip) : null,
    archived: bool(raw.archived),
    createdAt: num(raw.createdAt, now),
  };
}

function normBoard(raw: Raw, now: number): Board {
  return {
    id: idOf(raw.id),
    title: str(raw.title, 'Tablero'),
    background: str(raw.background, 'ocean'),
    starred: bool(raw.starred),
    listIds: ids(raw.listIds),
    labels: arr(raw.labels).map(normLabel),
    fields: arr(raw.fields).map(normField),
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
  };
}

const EVENT_KINDS: EventKind[] = ['event', 'birthday', 'anniversary', 'deadline', 'reminder'];
const FREQS: RecurrenceFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const dateKey = (v: Raw): string | null => (typeof v === 'string' && DATE.test(v) ? v : null);
const minutesList = (v: Raw): number[] =>
  [...new Set(arr(v).filter((m) => typeof m === 'number' && Number.isFinite(m) && m >= 0).map(Math.round))].sort((a, b) => a - b);

function normRecurrence(raw: Raw): Recurrence | null {
  if (!raw || typeof raw !== 'object' || !FREQS.includes(raw.freq)) return null;
  const count = num(raw.count, 0);
  return {
    freq: raw.freq,
    interval: Math.max(1, Math.min(999, Math.floor(num(raw.interval, 1)))),
    byWeekday: [...new Set(arr(raw.byWeekday).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort(),
    monthlyBy: raw.monthlyBy === 'weekday' || raw.monthlyBy === 'last-weekday' ? raw.monthlyBy : 'day',
    until: dateKey(raw.until),
    count: count >= 1 ? Math.floor(count) : null,
  };
}

function normEvent(raw: Raw, now: number): CalendarEvent | null {
  const start = typeof raw?.start === 'string' && DATE_TIME.test(raw.start) ? raw.start : null;
  if (!start) return null;
  let end = typeof raw.end === 'string' && DATE_TIME.test(raw.end) ? raw.end : null;
  // Ends before the start (or all-day vs timed mismatches) are dropped.
  if (end && (end.includes('T') !== start.includes('T') || end < start)) end = null;
  const since = num(raw.sinceYear, 0);
  return {
    id: idOf(raw.id),
    kind: EVENT_KINDS.includes(raw.kind) ? raw.kind : 'event',
    title: str(raw.title),
    notes: str(raw.notes),
    location: str(raw.location),
    color: strOrNull(raw.color),
    icon: strOrNull(raw.icon),
    labelIds: ids(raw.labelIds),
    start,
    end,
    recurrence: normRecurrence(raw.recurrence),
    exdates: [...new Set(arr(raw.exdates).map(dateKey).filter((d): d is string => !!d))],
    reminders: minutesList(raw.reminders),
    done: [...new Set(arr(raw.done).map(dateKey).filter((d): d is string => !!d))],
    sinceYear: since >= 1 && since <= 9999 ? Math.floor(since) : null,
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
  };
}

function normSettings(raw: Raw): AppSettings {
  const defaults = defaultSettings();
  if (!raw || typeof raw !== 'object') return defaults;
  return {
    timeZone: typeof raw.timeZone === 'string' && raw.timeZone ? raw.timeZone : defaults.timeZone,
    allDayTime: typeof raw.allDayTime === 'string' && /^\d{2}:\d{2}$/.test(raw.allDayTime) ? raw.allDayTime : defaults.allDayTime,
    cardReminders: minutesList(raw.cardReminders),
    showCards: raw.showCards !== false,
  };
}

/**
 * Validates and repairs data coming from storage or an import: fills missing
 * fields and fixes broken references so the UI can trust the structure.
 */
export function normalizeData(input: Raw): AppData {
  const now = Date.now();
  const data = emptyData();
  if (!input || typeof input !== 'object') return data;

  for (const raw of Object.values<Raw>(input.boards ?? {})) {
    if (!raw || !idOf(raw.id)) continue;
    const board = normBoard(raw, now);
    data.boards[board.id] = board;
  }
  for (const raw of Object.values<Raw>(input.lists ?? {})) {
    if (!raw || !idOf(raw.id) || !data.boards[idOf(raw.boardId)]) continue;
    const list = normList(raw, now);
    data.lists[list.id] = list;
  }
  for (const raw of Object.values<Raw>(input.cards ?? {})) {
    if (!raw || !idOf(raw.id) || !data.lists[idOf(raw.listId)]) continue;
    const card = normCard(raw, now);
    card.boardId = data.lists[card.listId].boardId;
    data.cards[card.id] = card;
  }

  // Board order: keep known ids, append missing boards.
  const order = ids(input.boardOrder).filter((id) => data.boards[id]);
  for (const id of Object.keys(data.boards)) if (!order.includes(id)) order.push(id);
  data.boardOrder = [...new Set(order)];

  // Lists: non archived lists must be in their board's listIds exactly once.
  for (const board of Object.values(data.boards)) {
    const seen = new Set<string>();
    board.listIds = board.listIds.filter((id) => {
      const list = data.lists[id];
      if (!list || list.boardId !== board.id || list.archived || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    for (const list of Object.values(data.lists)) {
      if (list.boardId === board.id && !list.archived && !seen.has(list.id)) board.listIds.push(list.id);
    }
    const labelIds = new Set(board.labels.map((l) => l.id));
    const fields = new Map(board.fields.map((f) => [f.id, f]));
    for (const card of Object.values(data.cards)) {
      if (card.boardId !== board.id) continue;
      card.labelIds = card.labelIds.filter((id) => labelIds.has(id));
      const values: Card['fields'] = {};
      for (const [id, value] of Object.entries(card.fields)) {
        const field = fields.get(id);
        const valid = field && validFieldValue(field, value);
        if (valid !== undefined) values[id] = valid;
      }
      card.fields = values;
    }
  }

  // Cards: non archived cards must be in their list's cardIds exactly once.
  const placed = new Set<string>();
  for (const list of Object.values(data.lists)) {
    list.cardIds = list.cardIds.filter((id) => {
      const card = data.cards[id];
      if (!card || card.listId !== list.id || card.archived || placed.has(id)) return false;
      placed.add(id);
      return true;
    });
  }
  for (const card of Object.values(data.cards)) {
    if (!card.archived && !placed.has(card.id)) data.lists[card.listId].cardIds.push(card.id);
  }

  // Calendar (older files have none: keep the default labels).
  if (Array.isArray(input.eventLabels)) data.eventLabels = input.eventLabels.map(normLabel);
  const eventLabelIds = new Set(data.eventLabels.map((l) => l.id));
  for (const raw of Object.values<Raw>(input.events ?? {})) {
    if (!raw || !idOf(raw.id)) continue;
    const event = normEvent(raw, now);
    if (!event) continue;
    event.labelIds = event.labelIds.filter((id) => eventLabelIds.has(id));
    data.events[event.id] = event;
  }
  data.settings = normSettings(input.settings);

  return data;
}
