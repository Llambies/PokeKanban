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
  /** Custom field filters: field id -> accepted value keys (see fieldValueKey). */
  fields: Record<string, string[]>;
}

/** Key used by field filters: option id for selects, "true" for checked boxes, "none" when empty. */
export function fieldValueKey(value: unknown): string {
  return value === undefined || value === null || value === '' ? 'none' : String(value);
}

export const EMPTY_FILTER: CardFilter = {
  text: '',
  labelIds: [],
  noLabel: false,
  due: [],
  priorities: [],
  labelMode: 'any',
  fields: {},
};

function fieldFilterCount(f: CardFilter): number {
  return Object.values(f.fields).reduce((n, values) => n + values.length, 0);
}

export function isFilterActive(f: CardFilter): boolean {
  return (
    f.text.trim() !== '' || f.labelIds.length > 0 || f.noLabel || f.due.length > 0 || f.priorities.length > 0 ||
    fieldFilterCount(f) > 0
  );
}

export function activeFilterCount(f: CardFilter): number {
  return (
    (f.text.trim() ? 1 : 0) + f.labelIds.length + (f.noLabel ? 1 : 0) + f.due.length + f.priorities.length +
    fieldFilterCount(f)
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

/** Normalized search text and terms of a filter, computed once per filter object (not per card). */
const queryCache = new WeakMap<CardFilter, { text: string; terms: string[] }>();

function filterQuery(f: CardFilter): { text: string; terms: string[] } {
  let cached = queryCache.get(f);
  if (!cached) {
    const text = normalize(f.text);
    cached = { text, terms: text ? text.split(/\s+/) : [] };
    queryCache.set(f, cached);
  }
  return cached;
}

/** Normalized searchable text of a card, cached per card (and per label-names map, so a label rename
 * invalidates it) so filtering a list doesn't re-normalize the same card's title/description on every
 * keystroke of the search box. */
const haystackCache = new WeakMap<Card, { labelNames?: Map<string, string>; text: string }>();

function cardHaystack(card: Card, labelNames?: Map<string, string>): string {
  const cached = haystackCache.get(card);
  if (cached && cached.labelNames === labelNames) return cached.text;
  const labelText = labelNames ? card.labelIds.map((id) => labelNames.get(id) ?? '').join(' ') : '';
  const text = normalize(`${card.title} ${card.description} ${labelText}`);
  haystackCache.set(card, { labelNames, text });
  return text;
}

export function cardMatches(card: Card, f: CardFilter, labelNames?: Map<string, string>, now = new Date()): boolean {
  if (card.kind === 'separator') return !isFilterActive(f);
  const { text, terms } = filterQuery(f);
  if (text) {
    const haystack = cardHaystack(card, labelNames);
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
  for (const [fieldId, accepted] of Object.entries(f.fields)) {
    if (accepted.length > 0 && !accepted.includes(fieldValueKey(card.fields[fieldId]))) return false;
  }
  return true;
}
