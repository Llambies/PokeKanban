import type { AppData, Attachment, Board, Card, Checklist, ChecklistItem, Comment, Label, List, Priority } from '../types';
import { uid } from '../lib/id';
import { emptyData } from './factories';

type Raw = any;

const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low'];

const str = (v: Raw, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: Raw): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: Raw, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const arr = (v: Raw): Raw[] => (Array.isArray(v) ? v : []);
const bool = (v: Raw): boolean => v === true;

function normItem(raw: Raw): ChecklistItem {
  return {
    id: str(raw?.id) || uid(),
    text: str(raw?.text),
    done: bool(raw?.done),
    due: strOrNull(raw?.due),
    collapsed: bool(raw?.collapsed) || undefined,
    children: arr(raw?.children).map(normItem),
  };
}

function normChecklist(raw: Raw): Checklist {
  return {
    id: str(raw?.id) || uid(),
    title: str(raw?.title, 'Checklist'),
    items: arr(raw?.items).map(normItem),
    hideDone: bool(raw?.hideDone) || undefined,
  };
}

function normLabel(raw: Raw): Label {
  return { id: str(raw?.id) || uid(), name: str(raw?.name), color: strOrNull(raw?.color), icon: strOrNull(raw?.icon) };
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
    id: str(raw.id),
    boardId: str(raw.boardId),
    listId: str(raw.listId),
    kind: raw.kind === 'separator' ? 'separator' : 'card',
    title: str(raw.title),
    description: str(raw.description),
    labelIds: arr(raw.labelIds).filter((x) => typeof x === 'string'),
    cover: cover && (cover.color || cover.image) ? cover : null,
    start: strOrNull(raw.start),
    due: strOrNull(raw.due),
    dueDone: bool(raw.dueDone),
    priority: PRIORITIES.includes(raw.priority) ? raw.priority : null,
    checklists: arr(raw.checklists).map(normChecklist),
    attachments: arr(raw.attachments).map(
      (a): Attachment => ({ id: str(a?.id) || uid(), name: str(a?.name), url: str(a?.url), createdAt: num(a?.createdAt, now) }),
    ),
    comments: arr(raw.comments).map(
      (c): Comment => ({
        id: str(c?.id) || uid(),
        text: str(c?.text),
        createdAt: num(c?.createdAt, now),
        ...(typeof c?.editedAt === 'number' ? { editedAt: c.editedAt } : {}),
      }),
    ),
    isTemplate: bool(raw.isTemplate),
    archived: bool(raw.archived),
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
  };
}

function normList(raw: Raw, now: number): List {
  const wip = num(raw.wipLimit, 0);
  return {
    id: str(raw.id),
    boardId: str(raw.boardId),
    title: str(raw.title),
    cardIds: arr(raw.cardIds).filter((x) => typeof x === 'string'),
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
    id: str(raw.id),
    title: str(raw.title, 'Tablero'),
    background: str(raw.background, 'ocean'),
    starred: bool(raw.starred),
    listIds: arr(raw.listIds).filter((x) => typeof x === 'string'),
    labels: arr(raw.labels).map(normLabel),
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
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
    if (!raw?.id) continue;
    data.boards[raw.id] = normBoard(raw, now);
  }
  for (const raw of Object.values<Raw>(input.lists ?? {})) {
    if (!raw?.id || !data.boards[raw.boardId]) continue;
    data.lists[raw.id] = normList(raw, now);
  }
  for (const raw of Object.values<Raw>(input.cards ?? {})) {
    if (!raw?.id || !data.lists[raw.listId]) continue;
    const card = normCard(raw, now);
    card.boardId = data.lists[card.listId].boardId;
    data.cards[card.id] = card;
  }

  // Board order: keep known ids, append missing boards.
  const order = arr(input.boardOrder).filter((id) => typeof id === 'string' && data.boards[id]);
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
    for (const card of Object.values(data.cards)) {
      if (card.boardId === board.id) card.labelIds = card.labelIds.filter((id) => labelIds.has(id));
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

  return data;
}
