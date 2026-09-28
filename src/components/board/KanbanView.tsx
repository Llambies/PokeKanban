import { useEffect, useRef, useState } from 'react';
import { DragDropContext, Droppable, type DropResult } from '@hello-pangea/dnd';
import { Plus, X } from 'lucide-react';
import { createList, getData, moveCard, moveList } from '../../store/store';
import { useBoard } from '../../store/hooks';
import { useUI } from '../../store/ui';
import { cardMatches, isFilterActive } from '../../lib/filter';
import { visibleToFullIndex } from '../../lib/order';
import { openContextMenu } from '../contextmenu/menuStore';
import { boardCanvasMenu } from '../contextmenu/menus';
import { ListColumn } from './ListColumn';

function visibleIdsOf(listId: string): string[] {
  const data = getData();
  const list = data.lists[listId];
  if (!list) return [];
  const filter = useUI.getState().filter;
  if (!isFilterActive(filter)) return list.cardIds;
  const labelNames = new Map((data.boards[list.boardId]?.labels ?? []).map((l) => [l.id, l.name]));
  const now = new Date();
  return list.cardIds.filter((id) => cardMatches(data.cards[id], filter, labelNames, now));
}

function AddListComposer({ boardId }: { boardId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) {
    return (
      <button type="button" className="add-list" onClick={() => setOpen(true)}>
        <Plus size={16} /> Añadir otra lista
      </button>
    );
  }
  return (
    <form
      className="add-list add-list--open"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        createList(boardId, title);
        setTitle('');
        ref.current?.focus();
        requestAnimationFrame(() => window.scrollTo({ left: document.documentElement.scrollWidth, behavior: 'smooth' }));
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node) && !title.trim()) setOpen(false);
      }}
    >
      <input
        ref={ref}
        className="input"
        placeholder="Título de la lista…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      <div className="composer__actions">
        <button type="submit" className="btn btn--primary btn--sm">
          Añadir lista
        </button>
        <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Cancelar">
          <X size={18} />
        </button>
      </div>
    </form>
  );
}

/** Empty board space: the canvas itself, the lists row or the gap below a list. */
function isCanvasBackground(target: EventTarget | null): boolean {
  const cl = (target as HTMLElement | null)?.classList;
  return !!cl && (cl.contains('board-lists') || cl.contains('list-wrapper'));
}

/** Click & drag on empty board space scrolls horizontally (like Trello). */
function useDragToScroll(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startX = 0;
    let startScroll = 0;
    let dragging = false;
    const isBackground = (t: EventTarget | null) => t === el || isCanvasBackground(t);
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 || !isBackground(e.target)) return;
      dragging = true;
      startX = e.clientX;
      startScroll = window.scrollX;
      el.classList.add('is-panning');
      e.preventDefault();
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      window.scrollTo({ left: startScroll - (e.clientX - startX) });
    };
    const onUp = () => {
      dragging = false;
      el.classList.remove('is-panning');
    };
    const onWheel = (e: WheelEvent) => {
      // Vertical wheel over empty space scrolls the board sideways.
      if (!isBackground(e.target) || e.deltaX !== 0 || e.ctrlKey) return;
      window.scrollBy({ left: e.deltaY });
    };
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [ref]);
}

export function KanbanView({ boardId }: { boardId: string }) {
  const board = useBoard(boardId);
  const canvas = useRef<HTMLDivElement>(null);
  useDragToScroll(canvas);
  if (!board) return null;

  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId, type } = result;
    if (!destination) return;
    if (type === 'LIST') {
      if (source.index !== destination.index) moveList(boardId, source.index, destination.index);
      return;
    }
    const data = getData();
    const target = data.lists[destination.droppableId];
    if (!target) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const full = target.cardIds.filter((id) => id !== draggableId);
    const visible = visibleIdsOf(target.id).filter((id) => id !== draggableId);
    moveCard(draggableId, target.id, visibleToFullIndex(full, visible, destination.index));
  };

  return (
    <div
      ref={canvas}
      className="board-canvas"
      onContextMenu={(e) => {
        if (e.target !== e.currentTarget && !isCanvasBackground(e.target)) return;
        openContextMenu(e, () => boardCanvasMenu(boardId));
      }}
    >
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId={`board-${boardId}`} direction="horizontal" type="LIST">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="board-lists">
              {board.listIds.map((listId, i) => (
                <ListColumn key={listId} listId={listId} index={i} />
              ))}
              {provided.placeholder}
              <AddListComposer boardId={boardId} />
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
