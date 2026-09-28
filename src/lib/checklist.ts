import type { Checklist, ChecklistItem } from '../types';
import { uid } from './id';

/** Maximum nesting levels (top level counts as one). */
export const MAX_LEVELS = 5;

export interface Located {
  item: ChecklistItem;
  siblings: ChecklistItem[];
  index: number;
  parent: ChecklistItem | null;
  depth: number;
}

export function locate(
  items: ChecklistItem[],
  id: string,
  parent: ChecklistItem | null = null,
  depth = 0,
): Located | null {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.id === id) return { item, siblings: items, index: i, parent, depth };
    const found = locate(item.children, id, item, depth + 1);
    if (found) return found;
  }
  return null;
}

export function walk(items: ChecklistItem[], fn: (item: ChecklistItem, depth: number) => void, depth = 0): void {
  for (const item of items) {
    fn(item, depth);
    walk(item.children, fn, depth + 1);
  }
}

/** Number of levels below (and including) the item. */
export function height(item: ChecklistItem): number {
  let max = 0;
  for (const child of item.children) max = Math.max(max, height(child));
  return max + 1;
}

/** Progress counts leaves: a parent is "worth" its sub-items. */
export function progress(items: ChecklistItem[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  walk(items, (item) => {
    if (item.children.length === 0) {
      total++;
      if (item.done) done++;
    }
  });
  return { done, total };
}

export function checklistsProgress(checklists: Checklist[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const cl of checklists) {
    const p = progress(cl.items);
    done += p.done;
    total += p.total;
  }
  return { done, total };
}

export function setDoneDeep(item: ChecklistItem, done: boolean): void {
  item.done = done;
  for (const child of item.children) setDoneDeep(child, done);
}

/** A parent is done exactly when all its children are done. */
export function syncParents(items: ChecklistItem[]): void {
  for (const item of items) {
    if (item.children.length > 0) {
      syncParents(item.children);
      item.done = item.children.every((c) => c.done);
    }
  }
}

export type Visible = (item: ChecklistItem) => boolean;

/** Index of the nearest sibling in `direction` that passes `visible` (all pass by default). */
function neighbour(siblings: ChecklistItem[], index: number, direction: 1 | -1, visible?: Visible): number {
  for (let i = index + direction; i >= 0 && i < siblings.length; i += direction) {
    if (!visible || visible(siblings[i])) return i;
  }
  return -1;
}

export function canIndent(items: ChecklistItem[], id: string, visible?: Visible): boolean {
  const loc = locate(items, id);
  if (!loc || neighbour(loc.siblings, loc.index, -1, visible) < 0) return false;
  return loc.depth + 1 + height(loc.item) <= MAX_LEVELS;
}

/** Moves the item into its previous (visible) sibling, as last child. */
export function indent(items: ChecklistItem[], id: string, visible?: Visible): boolean {
  if (!canIndent(items, id, visible)) return false;
  const loc = locate(items, id)!;
  const target = loc.siblings[neighbour(loc.siblings, loc.index, -1, visible)];
  loc.siblings.splice(loc.index, 1);
  target.children.push(loc.item);
  target.collapsed = false;
  return true;
}

export function canOutdent(items: ChecklistItem[], id: string): boolean {
  const loc = locate(items, id);
  return !!loc && loc.parent !== null;
}

/** Moves the item out of its parent, right after it. Following siblings become its children. */
export function outdent(items: ChecklistItem[], id: string): boolean {
  const loc = locate(items, id);
  if (!loc || !loc.parent) return false;
  const parentLoc = locate(items, loc.parent.id)!;
  const following = loc.siblings.splice(loc.index + 1);
  loc.siblings.splice(loc.index, 1);
  loc.item.children.push(...following);
  parentLoc.siblings.splice(parentLoc.index + 1, 0, loc.item);
  return true;
}

/** Swaps the item with its next (visible) sibling in the given direction. */
export function moveSibling(items: ChecklistItem[], id: string, delta: number, visible?: Visible): boolean {
  const loc = locate(items, id);
  if (!loc) return false;
  const to = neighbour(loc.siblings, loc.index, delta < 0 ? -1 : 1, visible);
  if (to < 0) return false;
  loc.siblings.splice(loc.index, 1);
  loc.siblings.splice(to, 0, loc.item);
  return true;
}

export function removeItem(items: ChecklistItem[], id: string): ChecklistItem | null {
  const loc = locate(items, id);
  if (!loc) return null;
  loc.siblings.splice(loc.index, 1);
  return loc.item;
}

/** Siblings array that holds the children of `parentId` (or the root when null). */
export function childrenOf(items: ChecklistItem[], parentId: string | null): ChecklistItem[] | null {
  if (parentId === null) return items;
  return locate(items, parentId)?.item.children ?? null;
}

export function newItem(text: string, due: string | null = null): ChecklistItem {
  return { id: uid(), text, done: false, due, children: [] };
}

export function cloneItems(items: ChecklistItem[], resetDone = false): ChecklistItem[] {
  return items.map((item) => ({
    ...item,
    id: uid(),
    done: resetDone ? false : item.done,
    children: cloneItems(item.children, resetDone),
  }));
}

export function cloneChecklist(cl: Checklist, resetDone = false): Checklist {
  return { ...cl, id: uid(), items: cloneItems(cl.items, resetDone) };
}

/** Hides done leaves (and parents whose whole subtree is done). */
export function visibleItems(items: ChecklistItem[], hideDone: boolean): ChecklistItem[] {
  if (!hideDone) return items;
  return items.filter((item) => !item.done);
}
