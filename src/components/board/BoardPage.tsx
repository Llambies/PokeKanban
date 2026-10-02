import { useRef, useState } from 'react';
import { CalendarDays, Filter, Kanban, MoreHorizontal, Star, Table2, X } from 'lucide-react';
import type { BoardView } from '../../types';
import { updateBoard } from '../../store/store';
import { useBoard } from '../../store/hooks';
import { clearFilter, openPanel, useUI } from '../../store/ui';
import { navigate } from '../../lib/router';
import { activeFilterCount } from '../../lib/filter';
import { InlineTitleEditor } from '../common/AutoTextarea';
import { Popover } from '../common/Popover';
import { openContextMenu, wantsNativeMenu } from '../contextmenu/menuStore';
import { boardCanvasMenu } from '../contextmenu/menus';
import { KanbanView } from './KanbanView';
import { TableView } from './TableView';
import { CalendarView } from './CalendarView';
import { FilterPanel } from './FilterPopover';
import { BoardPanel } from './BoardPanel';

const VIEWS: { key: BoardView; label: string; Icon: typeof Kanban }[] = [
  { key: 'kanban', label: 'Tablero', Icon: Kanban },
  { key: 'table', label: 'Tabla', Icon: Table2 },
  { key: 'calendar', label: 'Calendario', Icon: CalendarDays },
];

function BoardHeader({ boardId, view }: { boardId: string; view: BoardView }) {
  const board = useBoard(boardId);
  const [editing, setEditing] = useState(false);
  const filterOpen = useUI((s) => s.filterOpen);
  const filterCount = useUI((s) => activeFilterCount(s.filter));
  const filterBtn = useRef<HTMLButtonElement>(null);
  if (!board) return null;
  return (
    <div
      className="board-header"
      onContextMenu={(e) => {
        if (wantsNativeMenu(e) || (e.target as HTMLElement).closest('button')) return;
        openContextMenu(e, () => boardCanvasMenu(boardId));
      }}
    >
      {editing ? (
        <InlineTitleEditor
          className="board-header__title-input"
          value={board.title}
          onSave={(title) => {
            updateBoard(boardId, { title });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <h1 className="board-header__title" title="Clic para renombrar">
          <button type="button" className="heading-edit-btn" onClick={() => setEditing(true)}>
            {board.title}
          </button>
        </h1>
      )}
      <button
        type="button"
        className={`board-header__btn board-header__star ${board.starred ? 'is-on' : ''}`}
        onClick={() => updateBoard(boardId, { starred: !board.starred })}
        title={board.starred ? 'Quitar de favoritos' : 'Marcar como favorito'}
        aria-label={board.starred ? 'Quitar de favoritos' : 'Marcar como favorito'}
      >
        <Star size={16} />
      </button>
      <div className="board-header__views" role="tablist" aria-label="Vista">
        {VIEWS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            className={`board-header__btn ${view === key ? 'is-active' : ''}`}
            onClick={() => navigate({ boardId, view: key })}
            aria-label={label}
          >
            <Icon size={16} /> <span className="hide-sm">{label}</span>
          </button>
        ))}
      </div>
      <div className="board-header__spacer" />
      <button
        ref={filterBtn}
        type="button"
        className={`board-header__btn ${filterCount ? 'is-active' : ''}`}
        onClick={() => useUI.setState({ filterOpen: !filterOpen })}
        title="Filtrar (F)"
        aria-label="Filtros"
      >
        <Filter size={16} /> <span className="hide-sm">Filtros</span>
        {filterCount > 0 && <span className="pill">{filterCount}</span>}
      </button>
      {filterCount > 0 && (
        <button type="button" className="board-header__btn" onClick={clearFilter} title="Quitar filtros (X)" aria-label="Quitar filtros">
          <X size={16} />
        </button>
      )}
      <button type="button" className="board-header__btn" onClick={() => openPanel('menu')} title="Menú del tablero" aria-label="Menú del tablero">
        <MoreHorizontal size={18} />
      </button>
      {filterOpen && (
        <Popover anchor={filterBtn.current} onClose={() => useUI.setState({ filterOpen: false })} title="Filtrar tarjetas" width={320}>
          <FilterPanel boardId={boardId} />
        </Popover>
      )}
    </div>
  );
}

export function BoardPage({ boardId, view }: { boardId: string; view: BoardView }) {
  return (
    <div className={`board-page board-page--${view}`}>
      <BoardHeader boardId={boardId} view={view} />
      {view === 'kanban' && <KanbanView boardId={boardId} />}
      {view === 'table' && <TableView boardId={boardId} />}
      {view === 'calendar' && <CalendarView boardId={boardId} />}
      <BoardPanel boardId={boardId} />
    </div>
  );
}
