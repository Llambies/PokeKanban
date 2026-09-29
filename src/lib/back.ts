import { useUI } from '../store/ui';
import { closeTopLayer } from './layers';
import { closeCard, closeEvent, getRoute, navigate } from './router';

/**
 * Android back button / gesture, from the innermost thing to the outermost: an open menu,
 * popover, dialog or editor; the card or event on screen; the board or calendar (back to home).
 * Returns false when there is nothing left to close (the app then goes to the background).
 */
export function handleBack(): boolean {
  if (closeTopLayer()) return true;

  const ui = useUI.getState();
  if (ui.composerListId || ui.editingCardId) {
    useUI.setState({ composerListId: null, editingCardId: null });
    return true;
  }
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && focused.closest('.search')) {
    focused.blur();
    return true;
  }

  const route = getRoute();
  if (route.cardId) {
    closeCard();
    return true;
  }
  if (route.eventId) {
    closeEvent();
    return true;
  }
  if (route.page === 'board' && route.view !== 'kanban') {
    navigate({ boardId: route.boardId, view: 'kanban' }, true);
    return true;
  }
  if (route.page !== 'home') {
    navigate({}, true);
    return true;
  }
  return false;
}

declare global {
  interface Window {
    /** Called by the Android app (MainActivity) on back. */
    pokekanbanBack?: () => boolean;
  }
}

export function installBackHandler(): void {
  window.pokekanbanBack = handleBack;
}
