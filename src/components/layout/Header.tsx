import { useRef, useState } from 'react';
import {
  CalendarDays, ChevronDown, Cloud, LayoutDashboard, CloudOff, CloudUpload, Download, HardDrive, Keyboard, Monitor, Moon, Plus, Redo2, Settings,
  LogOut, Star, Sun, TriangleAlert, Undo2, Upload, Tags,
} from 'lucide-react';
import { redo, undo, useStore } from '../../store/store';
import { logout, usePersist } from '../../store/persistence';
import { setPrefs, usePrefs, useUI } from '../../store/ui';
import { navigate, useRoute } from '../../lib/router';
import { getBoardBackground } from '../../lib/colors';
import { exportAll, importFromFile } from '../../lib/backup';
import { openMenuAt, type MenuItem } from '../contextmenu/menuStore';
import { Popover } from '../common/Popover';
import { CreateBoardForm } from '../home/CreateBoardForm';
import { SearchBox } from './SearchBox';

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 100 100" width="26" height="26" aria-hidden>
      <rect width="100" height="100" rx="22" fill="#1d2125" />
      {/* Three lanes; the first card of each one is red, like the top of a pokéball. */}
      <g transform="translate(50 50) scale(1.15) translate(-50 -50)">
        <rect x="20.5" y="24.5" width="18" height="39" rx="3.5" fill="#3b434c" />
        <rect x="23.5" y="27.5" width="12" height="9" rx="2" fill="#ef4444" />
        <rect x="23.5" y="39.5" width="12" height="9" rx="2" fill="#fff" />
        <rect x="23.5" y="51.5" width="12" height="9" rx="2" fill="#fff" />
        <rect x="41" y="24.5" width="18" height="27" rx="3.5" fill="#3b434c" />
        <rect x="44" y="27.5" width="12" height="9" rx="2" fill="#ef4444" />
        <rect x="44" y="39.5" width="12" height="9" rx="2" fill="#fff" />
        <rect x="61.5" y="24.5" width="18" height="51" rx="3.5" fill="#3b434c" />
        <rect x="64.5" y="27.5" width="12" height="9" rx="2" fill="#ef4444" />
        <rect x="64.5" y="39.5" width="12" height="9" rx="2" fill="#fff" />
        <rect x="64.5" y="51.5" width="12" height="9" rx="2" fill="#fff" />
        <rect x="64.5" y="63.5" width="12" height="9" rx="2" fill="#fff" />
      </g>
    </svg>
  );
}

function SaveStatus() {
  const { mode, status, error, lastSavedAt } = usePersist();
  let icon = <Cloud size={17} />;
  let text = 'Guardado en el servidor';
  if (mode === 'local') {
    icon = <HardDrive size={17} />;
    text = 'Guardado en este navegador';
  }
  if (status === 'pending' || status === 'saving') {
    icon = mode === 'server' ? <CloudUpload size={17} /> : <HardDrive size={17} />;
    text = 'Guardando…';
  } else if (status === 'error') {
    icon = <CloudOff size={17} />;
    text = error ?? 'Error al guardar';
  } else if (status === 'conflict') {
    icon = <TriangleAlert size={17} />;
    text = error ?? 'Conflicto';
  }
  const when = lastSavedAt && status === 'saved' ? ` · ${new Date(lastSavedAt).toLocaleTimeString('es-ES')}` : '';
  return (
    <span className={`save-status save-status--${status}`} title={text + when} aria-label={text}>
      {icon}
    </span>
  );
}

function BoardsSwitcher() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [creating, setCreating] = useState(false);
  const boards = useStore((s) => s.data.boards);
  const order = useStore((s) => s.data.boardOrder);
  const route = useRoute();
  const close = () => {
    setAnchor(null);
    setCreating(false);
  };
  const sorted = [...order].sort((a, b) => Number(boards[b].starred) - Number(boards[a].starred));
  return (
    <>
      <button type="button" className="header-btn" onClick={(e) => setAnchor(anchor ? null : e.currentTarget)} aria-expanded={!!anchor}>
        <LayoutDashboard size={16} className="show-sm" />
        <span className="header-btn__label">Tableros</span> <ChevronDown size={15} />
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={close} title={creating ? 'Crear tablero' : 'Tus tableros'} onBack={creating ? () => setCreating(false) : undefined}>
          {creating ? (
            <CreateBoardForm
              onCreated={(id) => {
                close();
                navigate({ boardId: id });
              }}
            />
          ) : (
            <div className="board-switcher">
              {sorted.map((id) => {
                const b = boards[id];
                return (
                  <button
                    type="button"
                    key={id}
                    className={`board-switcher__item ${route.boardId === id ? 'is-current' : ''}`}
                    onClick={() => {
                      close();
                      navigate({ boardId: id });
                    }}
                  >
                    <span className="board-switcher__thumb" style={{ background: getBoardBackground(b.background).css }} />
                    <span className="board-switcher__title">{b.title}</span>
                    {b.starred && <Star size={14} className="star-on" />}
                  </button>
                );
              })}
              <button type="button" className="btn btn--subtle btn--block" onClick={() => setCreating(true)}>
                <Plus size={15} /> Crear tablero
              </button>
            </div>
          )}
        </Popover>
      )}
    </>
  );
}

function CalendarButton() {
  const route = useRoute();
  const active = route.page === 'calendar';
  return (
    <button
      type="button"
      className={`header-btn ${active ? 'is-active' : ''}`}
      onClick={() => navigate({ page: 'calendar' })}
      aria-current={active ? 'page' : undefined}
      title="Calendario"
    >
      <CalendarDays size={16} /> <span className="header-btn__label">Calendario</span>
    </button>
  );
}

export function Header() {
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const settingsRef = useRef<HTMLButtonElement>(null);

  const openSettings = () => {
    if (!settingsRef.current) return;
    openMenuAt(settingsRef.current, () => settingsMenu());
  };

  const settingsMenu = (): MenuItem[] => {
    const { theme, compactLabels: compact } = usePrefs.getState();
    return [
      { kind: 'header', label: 'Tema' },
      { label: 'Automático', icon: <Monitor size={15} />, checked: theme === 'system', onSelect: () => setPrefs({ theme: 'system' }) },
      { label: 'Claro', icon: <Sun size={15} />, checked: theme === 'light', onSelect: () => setPrefs({ theme: 'light' }) },
      { label: 'Oscuro', icon: <Moon size={15} />, checked: theme === 'dark', onSelect: () => setPrefs({ theme: 'dark' }) },
      { kind: 'separator' },
      { label: 'Etiquetas compactas', icon: <Tags size={15} />, checked: compact, onSelect: () => setPrefs({ compactLabels: !compact }) },
      { label: 'Atajos de teclado', icon: <Keyboard size={15} />, hint: '?', onSelect: () => useUI.setState({ shortcutsOpen: true }) },
      { kind: 'separator' },
      { label: 'Exportar copia de seguridad', icon: <Download size={15} />, onSelect: exportAll },
      {
        label: 'Importar (copia o Trello)…',
        icon: <Upload size={15} />,
        onSelect: async () => {
          const id = await importFromFile();
          if (id) navigate({ boardId: id });
        },
      },
      ...(usePersist.getState().authEnabled
        ? [
            { kind: 'separator' as const },
            { label: 'Cerrar sesión', icon: <LogOut size={15} />, onSelect: () => void logout() },
          ]
        : []),
    ];
  };

  return (
    <header className="topbar">
      <button type="button" className="topbar__brand" onClick={() => navigate({})} title="Inicio">
        <Logo />
        <span>PokeKanban</span>
      </button>
      <BoardsSwitcher />
      <CalendarButton />
      <div className="topbar__spacer" />
      <SearchBox />
      <div className="topbar__actions">
        <button type="button" className="header-icon-btn" onClick={() => undo()} disabled={!canUndo} title="Deshacer (Ctrl+Z)" aria-label="Deshacer">
          <Undo2 size={18} />
        </button>
        <button type="button" className="header-icon-btn" onClick={() => redo()} disabled={!canRedo} title="Rehacer (Ctrl+Y)" aria-label="Rehacer">
          <Redo2 size={18} />
        </button>
        <SaveStatus />
        <button ref={settingsRef} type="button" className="header-icon-btn" onClick={openSettings} title="Ajustes" aria-label="Ajustes">
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}
