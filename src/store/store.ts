import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type {
  AppData, Board, Card, CardCover, Checklist, ChecklistItem, Label, List, Priority,
} from '../types';
import { uid } from '../lib/id';
import { moveInArray } from '../lib/order';
import { parseLocal } from '../lib/dates';
import * as tree from '../lib/checklist';
import { emptyData, makeBoard, makeCard, makeList } from './factories';

const HISTORY_LIMIT = 100;

interface StoreState {
  data: AppData;
  past: AppData[];
  future: AppData[];
  ready: boolean;
}

export const useStore = create<StoreState>(() => ({
  data: emptyData(),
  past: [],
  future: [],
  ready: false,
}));

type D = Draft<AppData>;

/** Applies a change to the data, recording it in the undo history. */
function mutate(recipe: (d: D) => void): void {
  const state = useStore.getState();
  const next = produce(state.data, recipe);
  if (next === state.data) return;
  useStore.setState({
    data: next,
    past: [...state.past.slice(-(HISTORY_LIMIT - 1)), state.data],
    future: [],
  });
}

export function getData(): AppData {
  return useStore.getState().data;
}

/** Replaces all data (load, import, remote update). Clears undo history. */
export function loadData(data: AppData): void {
  useStore.setState({ data, past: [], future: [], ready: true });
}

export function undo(): boolean {
  const { past, data, future } = useStore.getState();
  if (past.length === 0) return false;
  useStore.setState({ data: past[past.length - 1], past: past.slice(0, -1), future: [data, ...future] });
  return true;
}

export function redo(): boolean {
  const { past, data, future } = useStore.getState();
  if (future.length === 0) return false;
  useStore.setState({ data: future[0], past: [...past, data], future: future.slice(1) });
  return true;
}

/* ------------------------------------------------------------------ helpers */

function touch(card: Draft<Card>): void {
  card.updatedAt = Date.now();
}

function withCard(d: D, cardId: string, fn: (card: Draft<Card>) => void): void {
  const card = d.cards[cardId];
  if (!card) return;
  fn(card);
  touch(card);
}

function withChecklist(d: D, cardId: string, clId: string, fn: (cl: Draft<Checklist>, card: Draft<Card>) => void): void {
  withCard(d, cardId, (card) => {
    const cl = card.checklists.find((c) => c.id === clId);
    if (cl) fn(cl, card);
  });
}

/** Maps label ids of one board onto another board, creating missing labels. */
function remapLabels(d: D, fromBoardId: string, toBoardId: string, labelIds: string[]): string[] {
  if (fromBoardId === toBoardId) return [...labelIds];
  const src = d.boards[fromBoardId]?.labels ?? [];
  const dst = d.boards[toBoardId]?.labels;
  if (!dst) return [];
  const result: string[] = [];
  for (const id of labelIds) {
    const label = src.find((l) => l.id === id);
    if (!label) continue;
    let target = dst.find((l) => l.name === label.name && l.color === label.color);
    if (!target) {
      target = { ...label, id: uid() };
      dst.push(target);
    }
    result.push(target.id);
  }
  return result;
}

function removeFromList(d: D, card: Draft<Card>): void {
  const list = d.lists[card.listId];
  if (list) list.cardIds = list.cardIds.filter((id) => id !== card.id);
}

function cloneCardData(card: Card, opts: CopyCardOptions): Partial<Card> {
  return {
    kind: card.kind,
    title: opts.title ?? card.title,
    description: card.description,
    labelIds: opts.keepLabels === false ? [] : [...card.labelIds],
    cover: card.cover ? { ...card.cover } : null,
    start: opts.keepDates === false ? null : card.start,
    due: opts.keepDates === false ? null : card.due,
    dueDone: opts.keepDates === false ? false : card.dueDone,
    priority: card.priority,
    checklists: opts.keepChecklists === false ? [] : card.checklists.map((cl) => tree.cloneChecklist(cl, opts.resetChecklists)),
    attachments: opts.keepAttachments === false ? [] : card.attachments.map((a) => ({ ...a, id: uid() })),
    comments: opts.keepComments ? card.comments.map((c) => ({ ...c, id: uid() })) : [],
  };
}

/* ------------------------------------------------------------------- boards */

export function createBoard(title: string, background = 'ocean', withLists = true): string {
  const board = makeBoard(title.trim() || 'Nuevo tablero', background);
  mutate((d) => {
    d.boards[board.id] = board;
    d.boardOrder.push(board.id);
    if (withLists) {
      for (const t of ['Pendiente', 'En curso', 'Hecho']) {
        const list = makeList(board.id, t);
        d.lists[list.id] = list;
        d.boards[board.id].listIds.push(list.id);
      }
    }
  });
  return board.id;
}

export function updateBoard(boardId: string, patch: Partial<Pick<Board, 'title' | 'background' | 'starred'>>): void {
  mutate((d) => {
    const board = d.boards[boardId];
    if (!board) return;
    Object.assign(board, patch);
    board.updatedAt = Date.now();
  });
}

export function deleteBoard(boardId: string): void {
  mutate((d) => {
    for (const list of Object.values(d.lists)) if (list.boardId === boardId) delete d.lists[list.id];
    for (const card of Object.values(d.cards)) if (card.boardId === boardId) delete d.cards[card.id];
    delete d.boards[boardId];
    d.boardOrder = d.boardOrder.filter((id) => id !== boardId);
  });
}

export function moveBoard(from: number, to: number): void {
  mutate((d) => moveInArray(d.boardOrder, from, to));
}

export function duplicateBoard(boardId: string): string | null {
  const src = getData().boards[boardId];
  if (!src) return null;
  const newId = uid();
  mutate((d) => {
    const labelMap = new Map<string, string>();
    const labels = src.labels.map((l) => {
      const id = uid();
      labelMap.set(l.id, id);
      return { ...l, id };
    });
    const now = Date.now();
    const board: Board = {
      ...src, id: newId, title: `${src.title} (copia)`, starred: false, listIds: [], labels, createdAt: now, updatedAt: now,
    };
    d.boards[newId] = board;
    const idx = d.boardOrder.indexOf(boardId);
    d.boardOrder.splice(idx + 1, 0, newId);
    for (const listId of src.listIds) {
      const list = d.lists[listId];
      const newList: List = { ...list, id: uid(), boardId: newId, cardIds: [] };
      for (const cardId of list.cardIds) {
        const card = d.cards[cardId];
        const copy = makeCard(newId, newList.id, card.title, {
          ...cloneCardData(card, { keepComments: true }),
          isTemplate: card.isTemplate,
          labelIds: card.labelIds.map((id) => labelMap.get(id)!).filter(Boolean),
        });
        d.cards[copy.id] = copy;
        newList.cardIds.push(copy.id);
      }
      d.lists[newList.id] = newList;
      board.listIds.push(newList.id);
    }
  });
  return newId;
}

/** Adds a board (with its lists and cards) coming from an import. Ids are regenerated. */
export function importBoard(payload: { board: Board; lists: List[]; cards: Card[] }): string {
  const boardId = uid();
  mutate((d) => {
    const labelMap = new Map<string, string>();
    const listMap = new Map<string, string>();
    const board: Board = {
      ...payload.board,
      id: boardId,
      listIds: [],
      labels: payload.board.labels.map((l) => {
        const id = uid();
        labelMap.set(l.id, id);
        return { ...l, id };
      }),
    };
    for (const list of payload.lists) {
      const id = uid();
      listMap.set(list.id, id);
      d.lists[id] = { ...list, id, boardId, cardIds: [] };
    }
    for (const listId of payload.board.listIds) {
      const id = listMap.get(listId);
      if (id) board.listIds.push(id);
    }
    const cardMap = new Map<string, string>();
    for (const card of payload.cards) {
      const listId = listMap.get(card.listId);
      if (!listId) continue;
      const id = uid();
      cardMap.set(card.id, id);
      d.cards[id] = {
        ...card,
        id,
        boardId,
        listId,
        labelIds: card.labelIds.map((l) => labelMap.get(l)!).filter(Boolean),
      };
    }
    for (const list of payload.lists) {
      const newList = d.lists[listMap.get(list.id)!];
      newList.cardIds = list.cardIds.map((c) => cardMap.get(c)!).filter((id) => id && !d.cards[id].archived);
    }
    d.boards[boardId] = board;
    d.boardOrder.push(boardId);
  });
  return boardId;
}

/* ------------------------------------------------------------------- labels */

export function createLabel(boardId: string, label: Omit<Label, 'id'>): string {
  const id = uid();
  mutate((d) => {
    d.boards[boardId]?.labels.push({ ...label, id });
  });
  return id;
}

export function updateLabel(boardId: string, labelId: string, patch: Partial<Omit<Label, 'id'>>): void {
  mutate((d) => {
    const label = d.boards[boardId]?.labels.find((l) => l.id === labelId);
    if (label) Object.assign(label, patch);
  });
}

export function deleteLabel(boardId: string, labelId: string): void {
  mutate((d) => {
    const board = d.boards[boardId];
    if (!board) return;
    board.labels = board.labels.filter((l) => l.id !== labelId);
    for (const card of Object.values(d.cards)) {
      if (card.boardId === boardId && card.labelIds.includes(labelId)) {
        card.labelIds = card.labelIds.filter((id) => id !== labelId);
      }
    }
  });
}

export function moveLabel(boardId: string, from: number, to: number): void {
  mutate((d) => {
    const board = d.boards[boardId];
    if (board) moveInArray(board.labels, from, to);
  });
}

/* -------------------------------------------------------------------- lists */

export function createList(boardId: string, title: string, index?: number): string {
  const list = makeList(boardId, title.trim() || 'Nueva lista');
  mutate((d) => {
    const board = d.boards[boardId];
    if (!board) return;
    d.lists[list.id] = list;
    board.listIds.splice(index ?? board.listIds.length, 0, list.id);
  });
  return list.id;
}

export function updateList(
  listId: string,
  patch: Partial<Pick<List, 'title' | 'color' | 'colorMode' | 'collapsed' | 'wipLimit'>>,
): void {
  mutate((d) => {
    const list = d.lists[listId];
    if (list) Object.assign(list, patch);
  });
}

export function moveList(boardId: string, from: number, to: number): void {
  mutate((d) => {
    const board = d.boards[boardId];
    if (board) moveInArray(board.listIds, from, to);
  });
}

export function archiveList(listId: string): void {
  mutate((d) => {
    const list = d.lists[listId];
    if (!list) return;
    list.archived = true;
    const board = d.boards[list.boardId];
    board.listIds = board.listIds.filter((id) => id !== listId);
  });
}

export function restoreList(listId: string): void {
  mutate((d) => {
    const list = d.lists[listId];
    if (!list || !list.archived) return;
    list.archived = false;
    d.boards[list.boardId].listIds.push(listId);
  });
}

export function deleteList(listId: string): void {
  mutate((d) => {
    const list = d.lists[listId];
    if (!list) return;
    for (const card of Object.values(d.cards)) if (card.listId === listId) delete d.cards[card.id];
    const board = d.boards[list.boardId];
    board.listIds = board.listIds.filter((id) => id !== listId);
    delete d.lists[listId];
  });
}

export function copyList(listId: string, title?: string): string | null {
  const src = getData().lists[listId];
  if (!src) return null;
  const newId = uid();
  mutate((d) => {
    const board = d.boards[src.boardId];
    const list: List = { ...src, id: newId, title: title ?? `${src.title} (copia)`, cardIds: [], collapsed: false };
    for (const cardId of src.cardIds) {
      const card = d.cards[cardId];
      const copy = makeCard(src.boardId, newId, card.title, {
        ...cloneCardData(card, { keepComments: true }),
        isTemplate: card.isTemplate,
      });
      d.cards[copy.id] = copy;
      list.cardIds.push(copy.id);
    }
    d.lists[newId] = list;
    board.listIds.splice(board.listIds.indexOf(listId) + 1, 0, newId);
  });
  return newId;
}

export type ListSort = 'due' | 'created' | 'createdOld' | 'title' | 'priority';

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function sortList(listId: string, by: ListSort): void {
  mutate((d) => {
    const list = d.lists[listId];
    if (!list) return;
    const cards = list.cardIds.map((id) => d.cards[id]);
    const dueTime = (c: Card) => (c.due ? parseLocal(c.due)?.getTime() ?? Infinity : Infinity);
    const cmp: Record<ListSort, (a: Card, b: Card) => number> = {
      due: (a, b) => dueTime(a) - dueTime(b),
      created: (a, b) => b.createdAt - a.createdAt,
      createdOld: (a, b) => a.createdAt - b.createdAt,
      title: (a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base', numeric: true }),
      priority: (a, b) => (a.priority ? PRIORITY_RANK[a.priority] : 9) - (b.priority ? PRIORITY_RANK[b.priority] : 9),
    };
    list.cardIds = [...cards].sort(cmp[by]).map((c) => c.id);
  });
}

export function moveAllCards(fromListId: string, toListId: string): void {
  if (fromListId === toListId) return;
  mutate((d) => {
    const from = d.lists[fromListId];
    const to = d.lists[toListId];
    if (!from || !to) return;
    for (const id of from.cardIds) {
      const card = d.cards[id];
      if (to.boardId !== from.boardId) {
        card.labelIds = remapLabels(d, from.boardId, to.boardId, card.labelIds);
        card.boardId = to.boardId;
      }
      card.listId = toListId;
      to.cardIds.push(id);
    }
    from.cardIds = [];
  });
}

export function archiveAllCards(listId: string): void {
  mutate((d) => {
    const list = d.lists[listId];
    if (!list) return;
    for (const id of list.cardIds) d.cards[id].archived = true;
    list.cardIds = [];
  });
}

export function moveListToBoard(listId: string, boardId: string): void {
  mutate((d) => {
    const list = d.lists[listId];
    const target = d.boards[boardId];
    if (!list || !target || list.boardId === boardId) return;
    const source = d.boards[list.boardId];
    source.listIds = source.listIds.filter((id) => id !== listId);
    for (const card of Object.values(d.cards)) {
      if (card.listId !== listId) continue;
      card.labelIds = remapLabels(d, list.boardId, boardId, card.labelIds);
      card.boardId = boardId;
    }
    list.boardId = boardId;
    if (!list.archived) target.listIds.push(listId);
  });
}

/* -------------------------------------------------------------------- cards */

export function createCard(listId: string, title: string, index?: number, extra: Partial<Card> = {}): string {
  const list = getData().lists[listId];
  if (!list) return '';
  const card = makeCard(list.boardId, listId, title.trim(), extra);
  mutate((d) => {
    d.cards[card.id] = card;
    const l = d.lists[listId];
    l.cardIds.splice(index ?? l.cardIds.length, 0, card.id);
  });
  return card.id;
}

export type CardPatch = Partial<
  Pick<Card, 'title' | 'description' | 'kind' | 'start' | 'due' | 'dueDone' | 'priority' | 'cover' | 'labelIds' | 'isTemplate'>
>;

export function updateCard(cardId: string, patch: CardPatch): void {
  mutate((d) => withCard(d, cardId, (card) => Object.assign(card, patch)));
}

export function updateCards(cardIds: string[], patch: CardPatch): void {
  mutate((d) => {
    for (const id of cardIds) withCard(d, id, (card) => Object.assign(card, patch));
  });
}

export function toggleLabel(cardId: string, labelId: string): void {
  mutate((d) =>
    withCard(d, cardId, (card) => {
      if (card.labelIds.includes(labelId)) card.labelIds = card.labelIds.filter((id) => id !== labelId);
      else {
        // Keep labels in board order.
        const order = d.boards[card.boardId]?.labels.map((l) => l.id) ?? [];
        card.labelIds = [...card.labelIds, labelId].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      }
    }),
  );
}

export function setCover(cardId: string, cover: CardCover | null): void {
  mutate((d) => withCard(d, cardId, (card) => void (card.cover = cover)));
}

/** Moves a card to `toIndex` of the target list (index computed without the card). */
export function moveCard(cardId: string, toListId: string, toIndex: number): void {
  mutate((d) => {
    const card = d.cards[cardId];
    const target = d.lists[toListId];
    if (!card || !target) return;
    removeFromList(d, card);
    if (card.boardId !== target.boardId) {
      card.labelIds = remapLabels(d, card.boardId, target.boardId, card.labelIds);
      card.boardId = target.boardId;
    }
    card.listId = toListId;
    target.cardIds.splice(Math.max(0, Math.min(toIndex, target.cardIds.length)), 0, cardId);
    touch(card);
  });
}

export function archiveCard(cardId: string): void {
  mutate((d) =>
    withCard(d, cardId, (card) => {
      removeFromList(d, card);
      card.archived = true;
    }),
  );
}

export function restoreCard(cardId: string): void {
  mutate((d) =>
    withCard(d, cardId, (card) => {
      if (!card.archived) return;
      card.archived = false;
      let list = d.lists[card.listId];
      if (!list || list.archived) {
        const board = d.boards[card.boardId];
        list = d.lists[board.listIds[0]];
        if (!list) {
          const created = makeList(board.id, 'Restauradas');
          d.lists[created.id] = created;
          board.listIds.push(created.id);
          list = d.lists[created.id];
        }
        card.listId = list.id;
      }
      list.cardIds.push(card.id);
    }),
  );
}

export function deleteCard(cardId: string): void {
  mutate((d) => {
    const card = d.cards[cardId];
    if (!card) return;
    removeFromList(d, card);
    delete d.cards[cardId];
  });
}

export interface CopyCardOptions {
  title?: string;
  keepLabels?: boolean;
  keepChecklists?: boolean;
  keepAttachments?: boolean;
  keepComments?: boolean;
  keepDates?: boolean;
  resetChecklists?: boolean;
}

export function copyCard(cardId: string, toListId?: string, toIndex?: number, opts: CopyCardOptions = {}): string {
  const src = getData().cards[cardId];
  if (!src) return '';
  const listId = toListId ?? src.listId;
  const list = getData().lists[listId];
  if (!list) return '';
  const copy = makeCard(list.boardId, listId, src.title, cloneCardData(src, opts));
  mutate((d) => {
    copy.labelIds = remapLabels(d, src.boardId, list.boardId, copy.labelIds);
    d.cards[copy.id] = copy;
    const target = d.lists[listId];
    const index = toIndex ?? (listId === src.listId ? target.cardIds.indexOf(cardId) + 1 : target.cardIds.length);
    target.cardIds.splice(index, 0, copy.id);
  });
  return copy.id;
}

export function createFromTemplate(templateId: string, listId: string, index?: number): string {
  // Copies are never templates themselves (makeCard defaults isTemplate to false).
  return copyCard(templateId, listId, index, { resetChecklists: true });
}

/* --------------------------------------------------------------- checklists */

export function addChecklist(cardId: string, title: string, copyFrom?: Checklist): string {
  const id = uid();
  mutate((d) =>
    withCard(d, cardId, (card) => {
      card.checklists.push({
        id,
        title: title.trim() || 'Checklist',
        items: copyFrom ? tree.cloneItems(copyFrom.items, true) : [],
      });
    }),
  );
  return id;
}

export function updateChecklist(cardId: string, clId: string, patch: Partial<Pick<Checklist, 'title' | 'hideDone'>>): void {
  mutate((d) => withChecklist(d, cardId, clId, (cl) => Object.assign(cl, patch)));
}

export function deleteChecklist(cardId: string, clId: string): void {
  mutate((d) => withCard(d, cardId, (card) => void (card.checklists = card.checklists.filter((c) => c.id !== clId))));
}

export function moveChecklist(cardId: string, clId: string, delta: number): void {
  mutate((d) =>
    withCard(d, cardId, (card) => {
      const from = card.checklists.findIndex((c) => c.id === clId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= card.checklists.length) return;
      moveInArray(card.checklists, from, to);
    }),
  );
}

export interface AddItemOptions {
  /** Parent item id; null for top level. */
  parentId?: string | null;
  /** Insert after this sibling (defaults to the end). */
  afterId?: string | null;
  due?: string | null;
}

export function addChecklistItem(cardId: string, clId: string, text: string, opts: AddItemOptions = {}): string {
  const item = tree.newItem(text.trim(), opts.due ?? null);
  mutate((d) =>
    withChecklist(d, cardId, clId, (cl) => {
      const siblings = tree.childrenOf(cl.items, opts.parentId ?? null);
      if (!siblings) return;
      const after = opts.afterId ? siblings.findIndex((i) => i.id === opts.afterId) : -1;
      siblings.splice(after >= 0 ? after + 1 : siblings.length, 0, item);
      if (opts.parentId) {
        const parent = tree.locate(cl.items, opts.parentId);
        if (parent) parent.item.collapsed = false;
      }
      tree.syncParents(cl.items);
    }),
  );
  return item.id;
}

export function updateChecklistItem(
  cardId: string,
  clId: string,
  itemId: string,
  patch: Partial<Pick<ChecklistItem, 'text' | 'due' | 'collapsed'>>,
): void {
  mutate((d) =>
    withChecklist(d, cardId, clId, (cl) => {
      const loc = tree.locate(cl.items, itemId);
      if (loc) Object.assign(loc.item, patch);
    }),
  );
}

export function toggleChecklistItem(cardId: string, clId: string, itemId: string, done?: boolean): void {
  mutate((d) =>
    withChecklist(d, cardId, clId, (cl) => {
      const loc = tree.locate(cl.items, itemId);
      if (!loc) return;
      tree.setDoneDeep(loc.item, done ?? !loc.item.done);
      tree.syncParents(cl.items);
    }),
  );
}

export function setAllChecklistItems(cardId: string, clId: string, done: boolean): void {
  mutate((d) => withChecklist(d, cardId, clId, (cl) => cl.items.forEach((i) => tree.setDoneDeep(i, done))));
}

export function deleteChecklistItem(cardId: string, clId: string, itemId: string): void {
  mutate((d) =>
    withChecklist(d, cardId, clId, (cl) => {
      tree.removeItem(cl.items, itemId);
      tree.syncParents(cl.items);
    }),
  );
}

export function indentChecklistItem(cardId: string, clId: string, itemId: string): void {
  mutate((d) =>
    withChecklist(d, cardId, clId, (cl) => {
      if (tree.indent(cl.items, itemId)) tree.syncParents(cl.items);
    }),
  );
}

export function outdentChecklistItem(cardId: string, clId: string, itemId: string): void {
  mutate((d) =>
    withChecklist(d, cardId, clId, (cl) => {
      if (tree.outdent(cl.items, itemId)) tree.syncParents(cl.items);
    }),
  );
}

export function moveChecklistItemSibling(cardId: string, clId: string, itemId: string, delta: number): void {
  mutate((d) => withChecklist(d, cardId, clId, (cl) => void tree.moveSibling(cl.items, itemId, delta)));
}

export interface ItemSlot {
  clId: string;
  parentId: string | null;
  index: number;
}

/** Drag & drop move of a checklist item (possibly across checklists of the same card). */
export function moveChecklistItem(cardId: string, from: ItemSlot, to: ItemSlot): void {
  mutate((d) =>
    withCard(d, cardId, (card) => {
      const src = card.checklists.find((c) => c.id === from.clId);
      const dst = card.checklists.find((c) => c.id === to.clId);
      if (!src || !dst) return;
      const srcSiblings = tree.childrenOf(src.items, from.parentId);
      const moving = srcSiblings?.[from.index];
      if (!srcSiblings || !moving) return;
      // Never drop an item inside itself.
      if (to.parentId && (to.parentId === moving.id || tree.locate(moving.children, to.parentId))) return;
      srcSiblings.splice(from.index, 1);
      const dstSiblings = tree.childrenOf(dst.items, to.parentId);
      if (!dstSiblings) {
        srcSiblings.splice(from.index, 0, moving);
        return;
      }
      dstSiblings.splice(Math.min(to.index, dstSiblings.length), 0, moving);
      tree.syncParents(src.items);
      if (dst !== src) tree.syncParents(dst.items);
    }),
  );
}

/** Turns a checklist item into a new card placed right below the current one. */
export function convertItemToCard(cardId: string, clId: string, itemId: string): string {
  const card = getData().cards[cardId];
  const cl = card?.checklists.find((c) => c.id === clId);
  const loc = cl && tree.locate(cl.items, itemId);
  if (!card || !loc) return '';
  const extra: Partial<Card> = { due: loc.item.due };
  if (loc.item.children.length > 0) {
    extra.checklists = [{ id: uid(), title: 'Checklist', items: tree.cloneItems(loc.item.children) }];
  }
  const newCard = makeCard(card.boardId, card.listId, loc.item.text || 'Sin título', extra);
  mutate((d) => {
    d.cards[newCard.id] = newCard;
    const list = d.lists[card.listId];
    const idx = list.cardIds.indexOf(cardId);
    list.cardIds.splice(idx < 0 ? list.cardIds.length : idx + 1, 0, newCard.id);
    withChecklist(d, cardId, clId, (c) => {
      tree.removeItem(c.items, itemId);
      tree.syncParents(c.items);
    });
  });
  return newCard.id;
}

/* ------------------------------------------------------ attachments / notes */

export function addAttachment(cardId: string, name: string, url: string): void {
  mutate((d) =>
    withCard(d, cardId, (card) => {
      card.attachments.push({ id: uid(), name: name.trim(), url: url.trim(), createdAt: Date.now() });
    }),
  );
}

export function updateAttachment(cardId: string, attId: string, patch: { name?: string; url?: string }): void {
  mutate((d) =>
    withCard(d, cardId, (card) => {
      const att = card.attachments.find((a) => a.id === attId);
      if (att) Object.assign(att, patch);
    }),
  );
}

export function deleteAttachment(cardId: string, attId: string): void {
  mutate((d) => withCard(d, cardId, (card) => void (card.attachments = card.attachments.filter((a) => a.id !== attId))));
}

export function addComment(cardId: string, text: string): void {
  mutate((d) =>
    withCard(d, cardId, (card) => {
      card.comments.unshift({ id: uid(), text: text.trim(), createdAt: Date.now() });
    }),
  );
}

export function updateComment(cardId: string, commentId: string, text: string): void {
  mutate((d) =>
    withCard(d, cardId, (card) => {
      const c = card.comments.find((x) => x.id === commentId);
      if (c) {
        c.text = text;
        c.editedAt = Date.now();
      }
    }),
  );
}

export function deleteComment(cardId: string, commentId: string): void {
  mutate((d) => withCard(d, cardId, (card) => void (card.comments = card.comments.filter((c) => c.id !== commentId))));
}
