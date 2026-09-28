import { memo, useState, type CSSProperties } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { ChevronsLeftRight, ChevronsRightLeft, MoreHorizontal, Plus } from 'lucide-react';
import { useList, useVisibleCardIds } from '../../store/hooks';
import { updateList, useStore } from '../../store/store';
import { useUI } from '../../store/ui';
import { getColor } from '../../lib/colors';
import { isFilterActive } from '../../lib/filter';
import { openContextMenu, openMenuAt, wantsNativeMenu } from '../contextmenu/menuStore';
import { listMenu } from '../contextmenu/menus';
import { InlineTitleEditor } from '../common/AutoTextarea';
import { CardTile } from './CardTile';
import { CardComposer, TemplatePicker } from './CardComposer';

interface ListColumnProps {
  listId: string;
  index: number;
}

export const ListColumn = memo(function ListColumn({ listId, index }: ListColumnProps) {
  const list = useList(listId);
  const visible = useVisibleCardIds(list);
  const composerOpen = useUI((s) => s.composerListId === listId);
  const filtering = useUI((s) => isFilterActive(s.filter));
  const hasTemplates = useStore((s) =>
    list ? Object.values(s.data.cards).some((c) => c.boardId === list.boardId && c.isTemplate && !c.archived) : false,
  );
  const cardCount = useStore((s) =>
    list ? list.cardIds.reduce((n, id) => n + (s.data.cards[id]?.kind === 'separator' ? 0 : 1), 0) : 0,
  );
  const [editingTitle, setEditingTitle] = useState(false);
  if (!list) return null;

  const color = getColor(list.color);
  const overWip = list.wipLimit !== null && cardCount > list.wipLimit;
  const atWip = list.wipLimit !== null && cardCount === list.wipLimit;
  const headerStyle: CSSProperties = color ? { background: color.bg, color: color.fg } : {};
  const listStyle = (color && list.colorMode === 'full' ? { '--list-tint': color.bg } : {}) as CSSProperties;
  const countText = list.wipLimit ? `${cardCount}/${list.wipLimit}` : String(cardCount);
  const onMenu = (e: React.MouseEvent) => {
    if (wantsNativeMenu(e)) return;
    openContextMenu(e, () => listMenu(listId));
  };

  return (
    <Draggable draggableId={listId} index={index} isDragDisabled={editingTitle}>
      {(provided, snapshot) => (
        <div ref={provided.innerRef} {...provided.draggableProps} className="list-wrapper" data-list-id={listId}>
          {list.collapsed ? (
            <section
              className={`list list--collapsed ${snapshot.isDragging ? 'is-dragging' : ''} ${overWip ? 'is-over-wip' : ''}`}
              style={headerStyle}
              {...provided.dragHandleProps}
              onClick={() => updateList(listId, { collapsed: false })}
              onContextMenu={onMenu}
              title="Expandir lista"
            >
              <ChevronsLeftRight size={16} />
              <span className="list--collapsed__title">{list.title}</span>
              <span className="list__count">{countText}</span>
            </section>
          ) : (
            <section
              className={[
                'list',
                snapshot.isDragging ? 'is-dragging' : '',
                overWip ? 'is-over-wip' : '',
                color && list.colorMode === 'full' ? 'list--tinted' : '',
                color ? 'has-color' : '',
              ].join(' ')}
              style={listStyle}
              onContextMenu={onMenu}
            >
              <header className="list__header" style={headerStyle} {...provided.dragHandleProps}>
                {editingTitle ? (
                  <InlineTitleEditor
                    className="list__title-input"
                    value={list.title}
                    onSave={(title) => {
                      updateList(listId, { title });
                      setEditingTitle(false);
                    }}
                    onCancel={() => setEditingTitle(false)}
                  />
                ) : (
                  <h3 className="list__title" onClick={() => setEditingTitle(true)} title="Clic para renombrar">
                    {list.title}
                  </h3>
                )}
                <span
                  className={`list__count ${overWip ? 'is-over' : atWip ? 'is-at' : ''}`}
                  title={list.wipLimit ? `Límite WIP: ${list.wipLimit}` : `${cardCount} tarjetas`}
                >
                  {filtering && visible.length !== list.cardIds.length ? `${visible.length} de ${countText}` : countText}
                </span>
                <button
                  type="button"
                  className="icon-btn icon-btn--sm list__header-btn"
                  onClick={() => updateList(listId, { collapsed: true })}
                  title="Contraer lista"
                  aria-label="Contraer lista"
                >
                  <ChevronsRightLeft size={15} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--sm list__header-btn"
                  onClick={(e) => openMenuAt(e.currentTarget, () => listMenu(listId))}
                  title="Acciones de la lista"
                  aria-label="Acciones de la lista"
                >
                  <MoreHorizontal size={16} />
                </button>
              </header>
              <Droppable droppableId={listId} type="CARD">
                {(dropProvided, dropSnapshot) => (
                  <div
                    ref={dropProvided.innerRef}
                    {...dropProvided.droppableProps}
                    className={`list__cards ${dropSnapshot.isDraggingOver ? 'is-over' : ''}`}
                  >
                    {visible.map((cardId, i) => (
                      <CardTile key={cardId} cardId={cardId} index={i} />
                    ))}
                    {dropProvided.placeholder}
                    {composerOpen && <CardComposer listId={listId} />}
                  </div>
                )}
              </Droppable>
              {!composerOpen && (
                <footer className="list__footer">
                  <button type="button" className="list__add-btn" onClick={() => useUI.setState({ composerListId: listId })}>
                    <Plus size={16} /> Añadir tarjeta
                  </button>
                  {hasTemplates && <TemplatePicker listId={listId} boardId={list.boardId} />}
                </footer>
              )}
            </section>
          )}
        </div>
      )}
    </Draggable>
  );
});
