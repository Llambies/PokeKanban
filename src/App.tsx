import { lazy, Suspense, useEffect } from 'react';
import { useStore } from './store/store';
import { usePersist } from './store/persistence';
import { usePrefs, clearFilter, useUI } from './store/ui';
import { useRoute, navigate } from './lib/router';
import { getBoardBackground } from './lib/colors';
import { syncSystemBars } from './lib/native';
import { Header } from './components/layout/Header';
import { ConflictBanner } from './components/layout/ConflictBanner';
import { ShortcutsHelp } from './components/layout/ShortcutsHelp';
import { ApiKeysDialog } from './components/layout/ApiKeysDialog';
import { LoginScreen } from './components/layout/LoginScreen';
import { useGlobalShortcuts } from './components/layout/useGlobalShortcuts';
import { HomePage } from './components/home/HomePage';
import { BoardPage } from './components/board/BoardPage';
import { ContextMenuHost } from './components/contextmenu/ContextMenu';
import { DialogHost } from './components/common/Dialogs';

// Code-split: the calendar, the card modal and the event editor are only needed once the user
// actually opens one of them, so they don't belong in the main chunk everyone downloads.
const CalendarPage = lazy(() => import('./components/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const CardModal = lazy(() => import('./components/card/CardModal').then((m) => ({ default: m.CardModal })));
const EventEditorHost = lazy(() => import('./components/calendar/EventEditor').then((m) => ({ default: m.EventEditorHost })));

function useTheme() {
  const theme = usePrefs((s) => s.theme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

export function App() {
  const ready = useStore((s) => s.ready);
  const fatal = usePersist((s) => s.fatal);
  const fatalCode = usePersist((s) => s.fatalCode);
  const needsLogin = usePersist((s) => s.needsLogin);
  const route = useRoute();
  const board = useStore((s) => (route.page === 'board' && route.boardId ? s.data.boards[route.boardId] : undefined));
  // Whether the (lazily loaded) event editor is needed, checked without importing its chunk.
  const eventDraftOpen = useUI((s) => s.eventDraft !== null);
  useTheme();
  useGlobalShortcuts();

  // Filters and panels belong to the board being viewed.
  useEffect(() => {
    clearFilter();
    useUI.setState({ panel: null, filterOpen: false, composerListId: null, editingCardId: null });
  }, [route.boardId]);

  useEffect(() => {
    document.title = board ? `${board.title} · PokeKanban` : route.page === 'calendar' ? 'Calendario · PokeKanban' : 'PokeKanban';
  }, [board, route.page]);

  useEffect(() => {
    document.documentElement.classList.toggle('is-kanban', !!board && route.view === 'kanban');
  }, [board, route.view]);

  const theme = usePrefs((s) => s.theme);
  useEffect(() => {
    // Boards have a dark top bar; elsewhere it follows the theme.
    syncSystemBars(!!board || document.documentElement.dataset.theme === 'dark');
  }, [board, theme]);

  if (fatalCode === 'no-password') {
    return (
      <div className="splash splash--error" role="alert">
        <h1>Falta la contraseña</h1>
        <p>
          Para que nadie más pueda ver tus tableros, el servidor necesita una contraseña antes de guardar nada.
        </p>
        <p className="muted">
          En Cloudflare: <strong>Workers &amp; Pages → pokekanban → Ajustes → Variables y secretos → Añadir</strong>, de tipo
          secreto, con el nombre <code>POKEKANBAN_PASSWORD</code> y tu contraseña como valor. Después recarga esta página.
        </p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Ya lo he configurado
        </button>
      </div>
    );
  }

  if (needsLogin) return <LoginScreen />;

  if (fatal) {
    return (
      <div className="splash splash--error" role="alert">
        <h1>No se pudieron cargar los datos</h1>
        <p>
          El servidor respondió: <code>{fatal}</code>
        </p>
        <p className="muted">
          No se ha cargado nada para no sobrescribir tus datos. Revisa <code>data/pokekanban.json</code> en el servidor
          (hay copias en <code>data/backups/</code>) y vuelve a intentarlo.
        </p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="splash">
        <div className="splash__logo" />
        <p>Cargando tableros…</p>
      </div>
    );
  }

  const bg = board ? getBoardBackground(board.background) : null;

  return (
    <div
      className={`app ${board ? 'app--board' : route.page === 'calendar' ? 'app--calendar' : 'app--home'}`}
      style={
        bg
          ? ({ '--board-base': bg.base, ...(bg.scrim ? { '--board-scrim': bg.scrim } : {}) } as React.CSSProperties)
          : undefined
      }
    >
      {bg && <div className="app__bg" style={{ background: bg.css }} />}
      <Header />
      <ConflictBanner />
      <main className="app__main">
        {route.page === 'calendar' ? (
          <Suspense fallback={null}>
            <CalendarPage />
          </Suspense>
        ) : route.page === 'board' ? (
          board ? (
            <BoardPage boardId={board.id} view={route.view} />
          ) : (
            <div className="empty-state">
              <h2>Tablero no encontrado</h2>
              <p>Puede que se haya eliminado.</p>
              <button type="button" className="btn btn--primary" onClick={() => navigate({})}>
                Ir a mis tableros
              </button>
            </div>
          )
        ) : (
          <HomePage />
        )}
      </main>
      {route.cardId && (
        <Suspense fallback={null}>
          <CardModal key={route.cardId} cardId={route.cardId} />
        </Suspense>
      )}
      {((route.page === 'calendar' && route.eventId) || eventDraftOpen) && (
        <Suspense fallback={null}>
          <EventEditorHost eventId={route.page === 'calendar' ? route.eventId : null} occ={route.occ} />
        </Suspense>
      )}
      <ContextMenuHost />
      <DialogHost />
      <ShortcutsHelp />
      <ApiKeysDialog />
    </div>
  );
}
