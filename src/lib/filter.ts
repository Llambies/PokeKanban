import type { Card, Priority } from '../types';
import { dueStatus, parseLocal } from './dates';
import { normalize } from './icons';

export type DueFilter = 'overdue' | 'soon' | 'week' | 'none' | 'done';

export interface CardFilter {
  text: string;
  labelIds: string[];
  /** Include cards without labels. */
  noLabel: boolean;
  due: DueFilter[];
  priorities: (Priority | 'none')[];
  /** 'any' = card matches if it satisfies any selected criterion inside each group. 'all' = must have every label. */
  labelMode: 'any' | 'all';
}

export const EMPTY_FILTER: CardFilter = {
  text: '',
  labelIds: [],
  noLabel: false,
  due: [],
  priorities: [],
  labelMode: 'any',
};

export function isFilterActive(f: CardFilter): boolean {
  return (
    f.text.trim() !== '' || f.labelIds.length > 0 || f.noLabel || f.due.length > 0 || f.priorities.length > 0
  );
}

export function activeFilterCount(f: CardFilter): number {
  return (
    (f.text.trim() ? 1 : 0) + f.labelIds.length + (f.noLabel ? 1 : 0) + f.due.length + f.priorities.length
  );
}

function matchesDue(card: Card, filters: DueFilter[], now: Date): boolean {
  const status = dueStatus(card.due, card.dueDone, now);
  return filters.some((f) => {
    switch (f) {
      case 'none':
        return !card.due;
      case 'done':
        return status === 'done';
      case 'overdue':
        return status === 'overdue';
      case 'soon':
        return status === 'soon';
      case 'week': {
        if (!card.due || status === 'done') return false;
        const date = parseLocal(card.due);
        if (!date) return false;
        const diff = date.getTime() - now.getTime();
        return diff >= 0 && diff < 7 * 24 * 3600 * 1000;
      }
    }
    return false;
  });
}

export function cardMatches(card: Card, f: CardFilter, labelNames?: Map<string, string>, now = new Date()): boolean {
  if (card.kind === 'separator') return !isFilterActive(f);
  const text = normalize(f.text);
  if (text) {
    const labelText = labelNames ? card.labelIds.map((id) => labelNames.get(id) ?? '').join(' ') : '';
    const haystack = normalize(`${card.title} ${card.description} ${labelText}`);
    const terms = text.split(/\s+/);
    if (!terms.every((t) => haystack.includes(t))) return false;
  }
  if (f.labelIds.length > 0 || f.noLabel) {
    const noLabelOk = f.noLabel && card.labelIds.length === 0;
    let labelsOk = false;
    if (f.labelIds.length > 0) {
      labelsOk =
        f.labelMode === 'all'
          ? f.labelIds.every((id) => card.labelIds.includes(id))
          : f.labelIds.some((id) => card.labelIds.includes(id));
    }
    if (!noLabelOk && !labelsOk) return false;
  }
  if (f.due.length > 0 && !matchesDue(card, f.due, now)) return false;
  if (f.priorities.length > 0) {
    const p = card.priority ?? 'none';
    if (!f.priorities.includes(p)) return false;
  }
  return true;
}
