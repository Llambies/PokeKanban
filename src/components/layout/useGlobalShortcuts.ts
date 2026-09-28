import { useEffect } from 'react';
import * as S from '../../store/store';
import { clearFilter, useUI } from '../../store/ui';
import { getRoute, navigate, openCard } from '../../lib/router';
import { getTargetCard } from '../../lib/hover';
import { hasOpenLayers } from '../../lib/layers';
import { useMenu } from '../contextmenu/menuStore';
import { deleteCardWithConfirm, undoToast } from '../contextmenu/menus';
import { SEARCH_INPUT_ID } from './SearchBox';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return !!el.closest('input, textarea, select, [contenteditable="true"]');
}

export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || useMenu.getState().open) return;
      const mod = e.ctrlKey || e.metaKey;
      const typing = isTyping(e.target);

      // Undo / redo work everywhere except while editing text.
      if (mod && !typing && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          S.undo();
          return;
        }
        if ((key === 'z' && e.shiftKey) || key === 'y') {
          e.preventDefault();
          S.redo();
          return;
        }
      }
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById(SEARCH_INPUT_ID)?.focus();
        return;
      }
      if (typing || mod || e.altKey) return;
      if (hasOpenLayers()) return;

      const route = getRoute();
      if (e.key === '/') {
        e.preventDefault();
        document.getElementById(SEARCH_INPUT_ID)?.focus();
        return;
      }
      if (e.key === '?') {
        useUI.setState({ shortcutsOpen: true });
        return;
      }
      if (!route.boardId) return;

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        useUI.setState((s) => ({ filterOpen: !s.filterOpen }));
        return;
      }
      if (e.key === 'x' || e.key === 'X') {
        clearFilter();
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        const data = S.getData();
        const targetCard = getTargetCard();
        const listId = targetCard ? data.cards[targetCard]?.listId : data.boards[route.boardId]?.listIds.find((id) => !data.lists[id].collapsed);
        if (listId) {
          e.preventDefault();
          if (route.view !== 'kanban') navigate({ boardId: route.boardId, view: 'kanban' });
          useUI.setState({ composerListId: listId });
        }
        return;
      }

      const cardId = getTargetCard();
      if (!cardId) return;
      const card = S.getData().cards[cardId];
      if (!card || card.archived) return;

      if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        openCard(cardId, card.boardId);
      } else if (e.key === 'c' || e.key === 'C') {
        S.archiveCard(cardId);
        undoToast('Tarjeta archivada');
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        useUI.setState({ editingCardId: cardId });
      } else if (e.key === 'd' || e.key === 'D') {
        S.copyCard(cardId);
        undoToast('Tarjeta duplicada');
      } else if (e.key === 'Delete') {
        void deleteCardWithConfirm(cardId);
      } else if (/^[1-9]$/.test(e.key)) {
        const label = S.getData().boards[card.boardId]?.labels[Number(e.key) - 1];
        if (label) S.toggleLabel(cardId, label.id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
