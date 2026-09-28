import { useMemo } from 'react';
import type { Board, Card, List } from '../types';
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
  const data = useStore((s) => s.data);
  const filter = useUI((s) => s.filter);
  const labelNames = useLabelNames(boardId);
  return useMemo(() => {
    const board = data.boards[boardId];
    if (!board) return [];
    const now = new Date();
    const result: Card[] = [];
    for (const listId of board.listIds) {
      for (const cardId of data.lists[listId]?.cardIds ?? []) {
        const card = data.cards[cardId];
        if (!card) continue;
        if (applyFilter && isFilterActive(filter) && !cardMatches(card, filter, labelNames, now)) continue;
        result.push(card);
      }
    }
    return result;
  }, [data, boardId, filter, applyFilter, labelNames]);
}
