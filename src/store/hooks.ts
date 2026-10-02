import { useMemo } from 'react';
import type { AppData, Board, Card, List } from '../types';
import { useStore } from './store';
import { useUI } from './ui';
import { cardMatches, isFilterActive } from '../lib/filter';

export const useBoard = (id: string | null | undefined): Board | undefined =>
  useStore((s) => (id ? s.data.boards[id] : undefined));

export const useList = (id: string): List | undefined => useStore((s) => s.data.lists[id]);

export const useCard = (id: string | null | undefined): Card | undefined =>
  useStore((s) => (id ? s.data.cards[id] : undefined));

/** Map of label id -> name for a board (used by text search). */
export function useLabelNames(boardId: string): Map<string, string> {
  const labels = useStore((s) => s.data.boards[boardId]?.labels);
  return useMemo(() => new Map((labels ?? []).map((l) => [l.id, l.name])), [labels]);
}

/** Card ids of a list that pass the current filter. */
export function useVisibleCardIds(list: List | undefined): string[] {
  const filter = useUI((s) => s.filter);
  const active = isFilterActive(filter);
  // Only subscribe to every card while filtering, so lists don't re-render on unrelated edits.
  const cards = useStore((s) => (active ? s.data.cards : null));
  const labelNames = useLabelNames(list?.boardId ?? '');
  return useMemo(() => {
    if (!list) return [];
    if (!cards) return list.cardIds;
    const now = new Date();
    return list.cardIds.filter((id) => cards[id] && cardMatches(cards[id], filter, labelNames, now));
  }, [list, filter, cards, labelNames]);
}

/** All non archived cards of a board (in board order), optionally filtered. */
export function useBoardCards(boardId: string, applyFilter = true): Card[] {
  // Narrowed from the whole `s.data` so edits elsewhere (calendar events, other boards' own fields…)
  // don't re-render every board's card list.
  const board = useStore((s) => s.data.boards[boardId]);
  const cards = useStore((s) => s.data.cards);
  const lists = useStore((s) => s.data.lists);
  const filter = useUI((s) => s.filter);
  const labelNames = useLabelNames(boardId);
  return useMemo(() => {
    if (!board) return [];
    const now = new Date();
    const result: Card[] = [];
    for (const listId of board.listIds) {
      for (const cardId of lists[listId]?.cardIds ?? []) {
        const card = cards[cardId];
        if (!card) continue;
        if (applyFilter && isFilterActive(filter) && !cardMatches(card, filter, labelNames, now)) continue;
        result.push(card);
      }
    }
    return result;
  }, [board, cards, lists, boardId, filter, applyFilter, labelNames]);
}

/** Whether a board has any (non archived) template card, cached per board so several lists of the
 * same board (each rendering its own "new from template" button) share one scan of all cards instead
 * of each re-scanning on every store change. */
let templatesCache: { cards: AppData['cards']; boardId: string; value: boolean } | null = null;

export function useHasTemplates(boardId: string): boolean {
  const cards = useStore((s) => s.data.cards);
  return useMemo(() => {
    if (templatesCache && templatesCache.cards === cards && templatesCache.boardId === boardId) {
      return templatesCache.value;
    }
    const value = Object.values(cards).some((c) => c.boardId === boardId && c.isTemplate && !c.archived);
    templatesCache = { cards, boardId, value };
    return value;
  }, [cards, boardId]);
}
