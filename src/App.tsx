import { useEffect } from 'react';
import { useStore } from './store/store';
import { usePersist } from './store/persistence';
import { usePrefs, clearFilter, useUI } from './store/ui';
import { useRoute, navigate } from './lib/router';
import { getBoardBackground } from './lib/colors';
import { Header } from './components/layout/Header';
import { ConflictBanner } from './components/layout/ConflictBanner';
import { ShortcutsHelp } from './components/layout/ShortcutsHelp';
import { useGlobalShortcuts } from './components/layout/useGlobalShortcuts';
import { HomePage } from './components/home/HomePage';
import { BoardPage } from './components/board/BoardPage';
import { CardModal } from './components/card/CardModal';
import { ContextMenuHost } from './components/contextmenu/ContextMenu';
import { DialogHost } from './components/common/Dialogs';

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
  const route = useRoute();
  const board = useStore((s) => (route.boardId ? s.data.boards[route.boardId] : undefined));
  useTheme();
  useGlobalShortcuts();

  // Filters and panels belong to the board being viewed.
  useEffect(() => {
    clearFilter();
    useUI.setState({ panel: null, filterOpen: false, composerListId: null, editingCardId: null });
  }, [route.boardId]);

  useEffect(() => {
    document.title = board ? `${board.title} · PokeKanban` : 'PokeKanban';
  }, [board]);

  useEffect(() => {
    document.documentElement.classList.toggle('is-kanban', !!board && route.view === 'kanban');
  }, [board, route.view]);

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
    <div className={`app ${board ? 'app--board' : 'app--home'}`} style={bg ? ({ '--board-base': bg.base } as React.CSSProperties) : undefined}>
      {bg && <div className="app__bg" style={{ background: bg.css }} />}
      <Header />
      <ConflictBanner />
      <main className="app__main">
        {route.boardId ? (
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
      {route.cardId && <CardModal key={route.cardId} cardId={route.cardId} />}
      <ContextMenuHost />
      <DialogHost />
      <ShortcutsHelp />
    </div>
  );
}
