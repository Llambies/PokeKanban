import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive, ChevronLeft, Copy, Download, Image, RotateCcw, SlidersHorizontal, Tag, Trash2, X,
} from 'lucide-react';
import * as S from '../../store/store';
import { useBoard } from '../../store/hooks';
import { confirmDialog, openPanel, useUI, type BoardPanel as PanelKind } from '../../store/ui';
import { useLayer } from '../../lib/layers';
import { captureFocus } from '../../lib/focus';
import { getBoardBackground } from '../../lib/backgrounds';
import { exportBoard } from '../../lib/backup';
import { navigate } from '../../lib/router';
import { normalize } from '../../lib/icons';
import { formatTimestamp } from '../../lib/dates';
import { LabelsManager } from '../common/LabelsManager';
import { BackgroundPicker } from '../common/BackgroundPicker';
import { undoToast } from '../contextmenu/menus';
import { FieldsManager } from './FieldsManager';

const TITLES: Record<Exclude<PanelKind, null>, string> = {
  menu: 'Menú del tablero',
  labels: 'Etiquetas',
  fields: 'Campos personalizados',
  archive: 'Elementos archivados',
  background: 'Fondo del tablero',
};

function BoardLabels({ boardId }: { boardId: string }) {
  const board = useBoard(boardId);
  const usage = S.useStore((s) => {
    const counts: Record<string, number> = {};
    for (const c of Object.values(s.data.cards)) {
      if (c.boardId !== boardId || c.archived) continue;
      for (const id of c.labelIds) counts[id] = (counts[id] ?? 0) + 1;
    }
    return JSON.stringify(counts);
  });
  if (!board) return null;
  return (
    <LabelsManager
      labels={board.labels}
      counts={JSON.parse(usage)}
      itemNoun="tarjeta(s)"
      countTitle="Tarjetas con esta etiqueta"
      showIndex
      hint={
        <>
          Arrastra para reordenar. Las 9 primeras se pueden poner con las teclas <kbd>1</kbd>…<kbd>9</kbd> sobre una tarjeta.
        </>
      }
      onCreate={(value) => S.createLabel(boardId, value)}
      onUpdate={(id, value) => S.updateLabel(boardId, id, value)}
      onDelete={(id) => S.deleteLabel(boardId, id)}
      onMove={(from, to) => S.moveLabel(boardId, from, to)}
    />
  );
}

function ArchivePanel({ boardId }: { boardId: string }) {
  const [tab, setTab] = useState<'cards' | 'lists'>('cards');
  const [query, setQuery] = useState('');
  const data = S.useStore((s) => s.data);
  const q = normalize(query);
  const cards = useMemo(
    () =>
      Object.values(data.cards)
        .filter((c) => c.boardId === boardId && c.archived && (!q || normalize(c.title).includes(q)))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [data.cards, boardId, q],
  );
  const lists = useMemo(
    () => Object.values(data.lists).filter((l) => l.boardId === boardId && l.archived && (!q || normalize(l.title).includes(q))),
    [data.lists, boardId, q],
  );

  return (
    <div className="archive-panel">
      <div className="segmented segmented--block">
        <button type="button" className={tab === 'cards' ? 'is-active' : ''} onClick={() => setTab('cards')}>
          Tarjetas ({cards.length})
        </button>
        <button type="button" className={tab === 'lists' ? 'is-active' : ''} onClick={() => setTab('lists')}>
          Listas ({lists.length})
        </button>
      </div>
      <input className="input" placeholder="Buscar en archivados" aria-label="Buscar en archivados" value={query} onChange={(e) => setQuery(e.target.value)} />
      {tab === 'cards' ? (
        cards.length === 0 ? (
          <p className="muted small">No hay tarjetas archivadas.</p>
        ) : (
          cards.map((c) => (
            <div key={c.id} className="archive-item">
              <div className="archive-item__main">
                <span className="archive-item__title">{c.title}</span>
                <span className="muted small">
                  {data.lists[c.listId]?.title ?? 'Lista eliminada'} · {formatTimestamp(c.updatedAt)}
                </span>
              </div>
              <button type="button" className="btn btn--sm" onClick={() => S.restoreCard(c.id)} title="Restaurar">
                <RotateCcw size={14} /> Restaurar
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--sm icon-btn--danger"
                title="Eliminar definitivamente"
                aria-label="Eliminar definitivamente"
                onClick={() => {
                  S.deleteCard(c.id);
                  undoToast('Tarjeta eliminada');
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )
      ) : lists.length === 0 ? (
        <p className="muted small">No hay listas archivadas.</p>
      ) : (
        lists.map((l) => (
          <div key={l.id} className="archive-item">
            <div className="archive-item__main">
              <span className="archive-item__title">{l.title}</span>
              <span className="muted small">{l.cardIds.length} tarjeta(s)</span>
            </div>
            <button type="button" className="btn btn--sm" onClick={() => S.restoreList(l.id)}>
              <RotateCcw size={14} /> Restaurar
            </button>
            <button
              type="button"
              className="icon-btn icon-btn--sm icon-btn--danger"
              title="Eliminar definitivamente"
              aria-label="Eliminar definitivamente"
              onClick={() => {
                S.deleteList(l.id);
                undoToast('Lista eliminada');
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function MainMenu({ boardId }: { boardId: string }) {
  const board = useBoard(boardId);
  const cardCount = S.useStore((s) => Object.values(s.data.cards).filter((c) => c.boardId === boardId && !c.archived).length);
  if (!board) return null;
  return (
    <div className="menu-list">
      <button type="button" className="menu-list__item" onClick={() => openPanel('background')}>
        <span className="menu-list__thumb" style={{ background: getBoardBackground(board.background).css }} /> Cambiar fondo
      </button>
      <button type="button" className="menu-list__item" onClick={() => openPanel('labels')}>
        <Tag size={16} /> Etiquetas
      </button>
      <button type="button" className="menu-list__item" onClick={() => openPanel('fields')}>
        <SlidersHorizontal size={16} /> Campos personalizados
      </button>
      <button type="button" className="menu-list__item" onClick={() => openPanel('archive')}>
        <Archive size={16} /> Elementos archivados
      </button>
      <div className="menu-list__sep" />
      <button type="button" className="menu-list__item" onClick={() => exportBoard(boardId)}>
        <Download size={16} /> Exportar tablero (JSON)
      </button>
      <button
        type="button"
        className="menu-list__item"
        onClick={() => {
          const id = S.duplicateBoard(boardId);
          if (id) navigate({ boardId: id });
        }}
      >
        <Copy size={16} /> Duplicar tablero
      </button>
      <button
        type="button"
        className="menu-list__item is-danger"
        onClick={async () => {
          const ok = await confirmDialog({
            title: '¿Eliminar tablero?',
            message: `"${board.title}" y todo su contenido se eliminarán. Puedes deshacerlo con Ctrl+Z.`,
            confirmText: 'Eliminar',
            danger: true,
          });
          if (ok) {
            navigate({});
            S.deleteBoard(boardId);
            undoToast('Tablero eliminado');
          }
        }}
      >
        <Trash2 size={16} /> Eliminar tablero
      </button>
      <div className="menu-list__sep" />
      <p className="muted small">
        {cardCount} tarjeta(s) activas · creado {formatTimestamp(board.createdAt)}
      </p>
    </div>
  );
}

export function BoardPanel({ boardId }: { boardId: string }) {
  const panel = useUI((s) => s.panel);
  const board = useBoard(boardId);
  const panelRef = useRef<HTMLElement>(null);
  useLayer(() => openPanel(null), !!panel, { container: panelRef, blocking: true });

  useEffect(() => {
    if (!panel) return;
    const restore = captureFocus();
    panelRef.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    return restore;
  }, [panel]);

  if (!panel || !board) return null;
  return createPortal(
    <aside ref={panelRef} className="side-panel" aria-label={TITLES[panel]}>
      <div className="side-panel__header">
        {panel !== 'menu' ? (
          <button type="button" className="icon-btn icon-btn--sm" onClick={() => openPanel('menu')} aria-label="Volver">
            <ChevronLeft size={18} />
          </button>
        ) : (
          <span className="popover__spacer" />
        )}
        <h2 tabIndex={-1}>{TITLES[panel]}</h2>
        <button type="button" className="icon-btn icon-btn--sm" onClick={() => openPanel(null)} aria-label="Cerrar">
          <X size={18} />
        </button>
      </div>
      <div className="side-panel__body">
        {panel === 'menu' && <MainMenu boardId={boardId} />}
        {panel === 'labels' && <BoardLabels boardId={boardId} />}
        {panel === 'fields' && <FieldsManager boardId={boardId} />}
        {panel === 'archive' && <ArchivePanel boardId={boardId} />}
        {panel === 'background' && (
          <>
            <div className="bg-preview" style={{ background: getBoardBackground(board.background).css }}>
              <Image size={18} />
            </div>
            <BackgroundPicker value={board.background} onChange={(background) => S.updateBoard(boardId, { background })} allowImage />
          </>
        )}
      </div>
    </aside>,
    document.body,
  );
}
