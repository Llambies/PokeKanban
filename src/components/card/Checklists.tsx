import { useEffect, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import {
  ArrowDown, ArrowUp, CalendarClock, CheckSquare, ChevronDown, ChevronRight, Eye, EyeOff, GripVertical, ListTree,
  MoreHorizontal, Plus, Square, SquareCheckBig, Trash2, X,
} from 'lucide-react';
import type { Card, Checklist, ChecklistItem } from '../../types';
import * as S from '../../store/store';
import { confirmDialog } from '../../store/ui';
import * as tree from '../../lib/checklist';
import { visibleToFullIndex } from '../../lib/order';
import { combine, dateKeyOf, dueStatus, formatDate, timeOf } from '../../lib/dates';
import { openContextMenu, openMenuAt, wantsNativeMenu } from '../contextmenu/menuStore';
import { checklistItemMenu } from '../contextmenu/menus';
import { AutoTextarea } from '../common/AutoTextarea';
import { Popover } from '../common/Popover';

interface Composer {
  clId: string;
  parentId: string | null;
  afterId: string | null;
}

interface Editing {
  clId: string;
  itemId: string;
}

interface Ctx {
  card: Card;
  editing: Editing | null;
  setEditing: (e: Editing | null) => void;
  composer: Composer | null;
  setComposer: (c: Composer | null) => void;
  /** Composer text survives the composer moving around the tree (Tab / Shift+Tab). */
  draft: React.MutableRefObject<string>;
}

const ROOT = 'root';

function droppableId(clId: string, parentId: string | null): string {
  return `${clId}|${parentId ?? ROOT}`;
}

function parseDroppable(id: string): { clId: string; parentId: string | null } {
  const [clId, parent] = id.split('|');
  return { clId, parentId: parent === ROOT ? null : parent };
}

function visible(items: ChecklistItem[], hideDone: boolean | undefined): ChecklistItem[] {
  return tree.visibleItems(items, !!hideDone);
}

/* -------------------------------------------------------- composer */

function ItemComposer({ ctx, composer, depth, autoFocus = true }: { ctx: Ctx; composer: Composer; depth: number; autoFocus?: boolean }) {
  const [text, setTextState] = useState(ctx.draft.current);
  const ref = useRef<HTMLTextAreaElement>(null);
  const { card } = ctx;
  const setText = (value: string) => {
    ctx.draft.current = value;
    setTextState(value);
  };
  const setComposer = (c: Composer | null) => {
    if (!c) ctx.draft.current = '';
    ctx.setComposer(c);
  };

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus, composer.parentId, composer.afterId]);

  const items = () => S.getData().cards[card.id]?.checklists.find((c) => c.id === composer.clId)?.items ?? [];

  const submit = () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    let afterId = composer.afterId;
    for (const line of lines) {
      afterId = S.addChecklistItem(card.id, composer.clId, line, { parentId: composer.parentId, afterId });
    }
    setText('');
    setComposer({ ...composer, afterId });
  };

  const indent = () => {
    // The previous sibling becomes the parent of the next item.
    if (!composer.afterId) return;
    const loc = tree.locate(items(), composer.afterId);
    if (!loc || loc.depth + 1 >= tree.MAX_LEVELS) return;
    const children = loc.item.children;
    setComposer({ ...composer, parentId: loc.item.id, afterId: children.length ? children[children.length - 1].id : null });
    if (loc.item.collapsed) S.updateChecklistItem(card.id, composer.clId, loc.item.id, { collapsed: false });
  };

  const outdent = () => {
    if (!composer.parentId) return;
    const loc = tree.locate(items(), composer.parentId);
    if (!loc) return;
    setComposer({ ...composer, parentId: loc.parent?.id ?? null, afterId: loc.item.id });
  };

  return (
    <div className="cl-composer" style={{ marginLeft: depth * 26 }}>
      <AutoTextarea
        ref={ref}
        className="cl-composer__input"
        placeholder={composer.parentId ? 'Añadir subtarea… (Mayús+Tab para salir)' : 'Añadir un elemento… (Tab para subtarea)'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setComposer(null);
          } else if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) outdent();
            else indent();
          }
        }}
        onBlur={() => {
          // The composer may just be moving (new item / Tab): only close if focus really left it.
          setTimeout(() => {
            if (document.activeElement?.closest('.cl-composer')) return;
            if (!ctx.draft.current.trim()) setComposer(null);
          }, 0);
        }}
      />
      <div className="composer__actions">
        <button type="button" className="btn btn--primary btn--sm" onMouseDown={(e) => e.preventDefault()} onClick={submit}>
          Añadir
        </button>
        <button type="button" className="icon-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => setComposer(null)} aria-label="Cancelar">
          <X size={16} />
        </button>
        <span className="muted small push-right hide-sm">Tab / Mayús+Tab: nivel</span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------- item editor */

function ItemEditor({ ctx, cl, item }: { ctx: Ctx; cl: Checklist; item: ChecklistItem }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(item.text);
  const handled = useRef(false);
  const cardId = ctx.card.id;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [item.id]);

  const commit = () => {
    const value = text.trim();
    if (!value) S.deleteChecklistItem(cardId, cl.id, item.id);
    else if (value !== item.text) S.updateChecklistItem(cardId, cl.id, item.id, { text: value });
  };

  return (
    <AutoTextarea
      ref={ref}
      className="cl-item__input"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handled.current = true;
          commit();
          ctx.setEditing(null);
          if (text.trim()) {
            const loc = tree.locate(cl.items, item.id);
            ctx.setComposer({ clId: cl.id, parentId: loc?.parent?.id ?? null, afterId: item.id });
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          handled.current = true;
          ctx.setEditing(null);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          // The row re-mounts in its new position and keeps editing.
          handled.current = true;
          commit();
          if (e.shiftKey) S.outdentChecklistItem(cardId, cl.id, item.id);
          else S.indentChecklistItem(cardId, cl.id, item.id);
          // If the item could not move, this editor stays mounted: re-arm blur handling.
          setTimeout(() => {
            handled.current = false;
          }, 0);
        } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          S.moveChecklistItemSibling(cardId, cl.id, item.id, e.key === 'ArrowUp' ? -1 : 1);
        }
      }}
      onBlur={() => {
        if (handled.current) return;
        commit();
        ctx.setEditing(null);
      }}
    />
  );
}

/* ------------------------------------------------------- item date */

function ItemDate({ cardId, clId, item }: { cardId: string; clId: string; item: ChecklistItem }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const status = dueStatus(item.due, item.done);
  const open = (el: HTMLElement) => {
    setDate(item.due ? dateKeyOf(item.due) : '');
    setTime(item.due ? timeOf(item.due) : '');
    setAnchor(el);
  };
  return (
    <>
      <button
        type="button"
        className={item.due ? `badge badge--due badge--sm ${status ? `is-${status}` : ''}` : 'icon-btn icon-btn--xs cl-item__action'}
        onClick={(e) => {
          e.stopPropagation();
          open(e.currentTarget);
        }}
        title={item.due ? 'Cambiar fecha' : 'Añadir fecha'}
        aria-label={item.due ? `Vence ${formatDate(item.due)}` : 'Añadir fecha'}
      >
        <CalendarClock size={13} />
        {item.due && formatDate(item.due)}
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} title="Fecha del elemento" width={260}>
          <form
            className="dates-picker"
            onSubmit={(e) => {
              e.preventDefault();
              S.updateChecklistItem(cardId, clId, item.id, { due: date ? combine(date, time) : null });
              setAnchor(null);
            }}
          >
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Hora (opcional)" />
            <div className="dates-picker__actions">
              <button type="submit" className="btn btn--primary">Guardar</button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  S.updateChecklistItem(cardId, clId, item.id, { due: null });
                  setAnchor(null);
                }}
              >
                Quitar
              </button>
            </div>
          </form>
        </Popover>
      )}
    </>
  );
}

/* -------------------------------------------------------- item row */

interface ItemRowProps {
  ctx: Ctx;
  cl: Checklist;
  item: ChecklistItem;
  index: number;
  depth: number;
}

function ItemRow({ ctx, cl, item, index, depth }: ItemRowProps) {
  const { card, editing, composer } = ctx;
  const isEditing = editing?.itemId === item.id;
  const hasChildren = item.children.length > 0;
  const sub = hasChildren ? tree.progress(item.children) : null;
  const canAddChild = depth + 1 < tree.MAX_LEVELS;

  const addChild = () => {
    const last = item.children[item.children.length - 1];
    if (item.collapsed) S.updateChecklistItem(card.id, cl.id, item.id, { collapsed: false });
    ctx.setComposer({ clId: cl.id, parentId: item.id, afterId: last?.id ?? null });
  };
  const addBelow = () => {
    const loc = tree.locate(cl.items, item.id);
    ctx.setComposer({ clId: cl.id, parentId: loc?.parent?.id ?? null, afterId: item.id });
  };
  const menu = () =>
    checklistItemMenu({
      cardId: card.id,
      clId: cl.id,
      itemId: item.id,
      onEdit: () => ctx.setEditing({ clId: cl.id, itemId: item.id }),
      onAddChild: addChild,
      onAddBelow: addBelow,
    });

  return (
    <Draggable draggableId={`item-${item.id}`} index={index} isDragDisabled={isEditing}>
      {(provided, snapshot) => (
        <div ref={provided.innerRef} {...provided.draggableProps} className={`cl-node ${snapshot.isDragging ? 'is-dragging' : ''}`}>
          <div
            className={`cl-item ${item.done ? 'is-done' : ''} ${isEditing ? 'is-editing' : ''}`}
            style={{ paddingLeft: depth * 26 }}
            onContextMenu={(e) => {
              if (isEditing || wantsNativeMenu(e)) return;
              openContextMenu(e, menu);
            }}
          >
            <span className="cl-item__grip" {...provided.dragHandleProps} aria-label="Arrastrar elemento">
              <GripVertical size={14} />
            </span>
            {hasChildren ? (
              <button
                type="button"
                className="cl-item__toggle"
                onClick={() => S.updateChecklistItem(card.id, cl.id, item.id, { collapsed: !item.collapsed })}
                aria-label={item.collapsed ? 'Mostrar subtareas' : 'Ocultar subtareas'}
                aria-expanded={!item.collapsed}
              >
                {item.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
            ) : (
              <span className="cl-item__toggle-space" />
            )}
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              className="cl-item__check"
              onClick={() => S.toggleChecklistItem(card.id, cl.id, item.id)}
              aria-label={item.done ? 'Marcar como pendiente' : 'Marcar como hecha'}
            >
              {item.done ? <SquareCheckBig size={17} /> : <Square size={17} />}
            </button>
            <div className="cl-item__content">
              {isEditing ? (
                <ItemEditor ctx={ctx} cl={cl} item={item} />
              ) : (
                <span className="cl-item__text" onClick={() => ctx.setEditing({ clId: cl.id, itemId: item.id })}>
                  {item.text}
                </span>
              )}
            </div>
            {!isEditing && (
              <div className="cl-item__meta">
                {sub && (
                  <span className={`cl-item__sub ${sub.done === sub.total ? 'is-complete' : ''}`} title="Subtareas completadas">
                    {sub.done}/{sub.total}
                  </span>
                )}
                <ItemDate cardId={card.id} clId={cl.id} item={item} />
                {canAddChild && (
                  <button type="button" className="icon-btn icon-btn--xs cl-item__action" onClick={addChild} title="Añadir subtarea" aria-label="Añadir subtarea">
                    <ListTree size={14} />
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn icon-btn--xs cl-item__action"
                  onClick={(e) => openMenuAt(e.currentTarget, menu)}
                  title="Más acciones"
                  aria-label="Más acciones"
                >
                  <MoreHorizontal size={14} />
                </button>
              </div>
            )}
          </div>
          {!item.collapsed && (hasChildren || (composer?.clId === cl.id && composer.parentId === item.id)) && (
            <ItemList ctx={ctx} cl={cl} items={item.children} parentId={item.id} depth={depth + 1} />
          )}
          {composer?.clId === cl.id && composer.afterId === item.id && <ItemComposer ctx={ctx} composer={composer} depth={depth} />}
        </div>
      )}
    </Draggable>
  );
}

/* ------------------------------------------------------- item list */

function ItemList({ ctx, cl, items, parentId, depth }: { ctx: Ctx; cl: Checklist; items: ChecklistItem[]; parentId: string | null; depth: number }) {
  const shown = visible(items, cl.hideDone);
  const { composer } = ctx;
  return (
    <Droppable droppableId={droppableId(cl.id, parentId)} type={parentId ? `SUB-${parentId}` : 'ROOT'}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`cl-list ${parentId ? 'cl-list--nested' : ''} ${snapshot.isDraggingOver ? 'is-over' : ''}`}
          style={parentId ? ({ '--guide-left': `${(depth - 1) * 26 + 50}px` } as React.CSSProperties) : undefined}
        >
          {shown.map((item, i) => (
            <ItemRow key={item.id} ctx={ctx} cl={cl} item={item} index={i} depth={depth} />
          ))}
          {provided.placeholder}
          {parentId !== null && composer?.clId === cl.id && composer.parentId === parentId && composer.afterId === null && (
            <ItemComposer ctx={ctx} composer={composer} depth={depth} />
          )}
        </div>
      )}
    </Droppable>
  );
}

/* --------------------------------------------------------- checklist */

function ChecklistBlock({ ctx, cl, index, count }: { ctx: Ctx; cl: Checklist; index: number; count: number }) {
  const { card, composer } = ctx;
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(cl.title);
  const p = tree.progress(cl.items);
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  const bottomComposer = composer?.clId === cl.id && composer.parentId === null && composer.afterId === null;
  const doneCount = p.done;

  const menu = () => [
    {
      label: cl.hideDone ? 'Mostrar completados' : 'Ocultar completados',
      icon: cl.hideDone ? <Eye size={15} /> : <EyeOff size={15} />,
      onSelect: () => S.updateChecklist(card.id, cl.id, { hideDone: !cl.hideDone }),
    },
    { label: 'Marcar todo como hecho', icon: <CheckSquare size={15} />, disabled: p.total === 0, onSelect: () => S.setAllChecklistItems(card.id, cl.id, true) },
    { label: 'Desmarcar todo', icon: <Square size={15} />, disabled: doneCount === 0, onSelect: () => S.setAllChecklistItems(card.id, cl.id, false) },
    { kind: 'separator' as const },
    { label: 'Subir checklist', icon: <ArrowUp size={15} />, disabled: index === 0, onSelect: () => S.moveChecklist(card.id, cl.id, -1) },
    { label: 'Bajar checklist', icon: <ArrowDown size={15} />, disabled: index === count - 1, onSelect: () => S.moveChecklist(card.id, cl.id, 1) },
    { kind: 'separator' as const },
    {
      label: 'Eliminar checklist…',
      icon: <Trash2 size={15} />,
      danger: true,
      onSelect: async () => {
        const ok = await confirmDialog({ title: `¿Eliminar "${cl.title}"?`, message: 'Se eliminarán todos sus elementos.', confirmText: 'Eliminar', danger: true });
        if (ok) S.deleteChecklist(card.id, cl.id);
      },
    },
  ];

  return (
    <section className="checklist" onContextMenu={(e) => {
      if ((e.target as HTMLElement).closest('.cl-item') || wantsNativeMenu(e)) return;
      openContextMenu(e, menu);
    }}>
      <div className="card-section__head">
        <CheckSquare size={18} className="card-section__icon" />
        {editingTitle ? (
          <form
            className="inline-form checklist__title-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim()) S.updateChecklist(card.id, cl.id, { title: title.trim() });
              setEditingTitle(false);
            }}
          >
            <input
              className="input"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (title.trim()) S.updateChecklist(card.id, cl.id, { title: title.trim() });
                setEditingTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setTitle(cl.title);
                  setEditingTitle(false);
                }
              }}
            />
          </form>
        ) : (
          <h3
            className="card-section__title checklist__title"
            onClick={() => {
              setTitle(cl.title);
              setEditingTitle(true);
            }}
          >
            {cl.title}
          </h3>
        )}
        <div className="card-section__tools">
          {cl.hideDone && doneCount > 0 && (
            <button type="button" className="btn btn--sm" onClick={() => S.updateChecklist(card.id, cl.id, { hideDone: false })}>
              Mostrar completados ({doneCount})
            </button>
          )}
          <button type="button" className="btn btn--sm" onClick={(e) => openMenuAt(e.currentTarget, menu)} aria-label="Opciones del checklist">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>
      <div className="checklist__progress">
        <span className="checklist__pct">{pct}%</span>
        <div className={`progress-bar ${p.total > 0 && p.done === p.total ? 'is-complete' : ''}`}>
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ItemList ctx={ctx} cl={cl} items={cl.items} parentId={null} depth={0} />
      {bottomComposer ? (
        <ItemComposer ctx={ctx} composer={composer!} depth={0} />
      ) : (
        <button type="button" className="btn btn--sm checklist__add" onClick={() => ctx.setComposer({ clId: cl.id, parentId: null, afterId: null })}>
          <Plus size={15} /> Añadir elemento
        </button>
      )}
    </section>
  );
}

export function Checklists({ card, focusChecklistId }: { card: Card; focusChecklistId: string | null }) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [composer, setComposer] = useState<Composer | null>(null);
  const draft = useRef('');
  const ctx: Ctx = { card, editing, setEditing, composer, setComposer, draft };

  useEffect(() => {
    if (focusChecklistId) setComposer({ clId: focusChecklistId, parentId: null, afterId: null });
  }, [focusChecklistId]);

  if (card.checklists.length === 0) return null;

  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    const itemId = draggableId.replace(/^item-/, '');
    const from = parseDroppable(source.droppableId);
    const to = parseDroppable(destination.droppableId);
    const srcCl = card.checklists.find((c) => c.id === from.clId);
    const dstCl = card.checklists.find((c) => c.id === to.clId);
    if (!srcCl || !dstCl) return;
    const srcSiblings = tree.childrenOf(srcCl.items, from.parentId) ?? [];
    const fromIndex = srcSiblings.findIndex((i) => i.id === itemId);
    const dstSiblings = (tree.childrenOf(dstCl.items, to.parentId) ?? []).filter((i) => i.id !== itemId);
    const dstVisible = visible(dstSiblings, dstCl.hideDone);
    const toIndex = visibleToFullIndex(dstSiblings.map((i) => i.id), dstVisible.map((i) => i.id), destination.index);
    if (from.clId === to.clId && from.parentId === to.parentId && fromIndex === toIndex) return;
    S.moveChecklistItem(card.id, { ...from, index: fromIndex }, { ...to, index: toIndex });
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="checklists">
        {card.checklists.map((cl, i) => (
          <ChecklistBlock key={cl.id} ctx={ctx} cl={cl} index={i} count={card.checklists.length} />
        ))}
      </div>
    </DragDropContext>
  );
}
