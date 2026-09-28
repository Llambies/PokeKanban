import { memo } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { AlignLeft, CheckSquare, Clock, Flag, LayoutTemplate, MessageSquare, MoreHorizontal, Paperclip } from 'lucide-react';
import type { Card, CustomField } from '../../types';
import { useCard } from '../../store/hooks';
import { updateCard, useStore } from '../../store/store';
import { usePrefs, useUI } from '../../store/ui';
import { openCard } from '../../lib/router';
import { getColor } from '../../lib/colors';
import { dueStatus, formatDate, DUE_STATUS_TEXT } from '../../lib/dates';
import { checklistsProgress } from '../../lib/checklist';
import { getPriority } from '../../lib/priority';
import { formatFieldValue } from '../../lib/fields';
import { clearHoveredCard, setHoveredCard } from '../../lib/hover';
import { openContextMenu, openMenuAt, wantsNativeMenu } from '../contextmenu/menuStore';
import { cardMenu } from '../contextmenu/menus';
import { LabelChip } from '../common/LabelChip';
import { InlineTitleEditor } from '../common/AutoTextarea';

function CardLabels({ card }: { card: Card }) {
  const labels = useStore((s) => s.data.boards[card.boardId]?.labels);
  const compact = usePrefs((s) => s.compactLabels);
  if (!labels || card.labelIds.length === 0) return null;
  const byId = new Map(labels.map((l) => [l.id, l]));
  return (
    <div className={`card-tile__labels ${compact ? 'is-compact' : ''}`}>
      {card.labelIds.map((id) => {
        const label = byId.get(id);
        if (!label) return null;
        return <LabelChip key={id} label={label} compact={compact} />;
      })}
    </div>
  );
}

const NO_FIELDS: CustomField[] = [];

function FieldBadges({ card }: { card: Card }) {
  const fields = useStore((s) => s.data.boards[card.boardId]?.fields ?? NO_FIELDS);
  return (
    <>
      {fields.map((field) => {
        if (!field.showOnCard) return null;
        const text = formatFieldValue(field, card.fields[field.id]);
        if (!text) return null;
        if (field.type === 'select') {
          const color = getColor(field.options.find((o) => o.id === card.fields[field.id])?.color);
          return (
            <span key={field.id} className="badge badge--field badge--option" style={color ? { background: color.bg, color: color.fg } : undefined} title={field.name}>
              {text}
            </span>
          );
        }
        return (
          <span key={field.id} className="badge badge--field" title={field.name}>
            {field.type === 'checkbox' ? <CheckSquare size={13} /> : <span className="badge__key">{field.name}:</span>} {text}
          </span>
        );
      })}
    </>
  );
}

function CardBadges({ card }: { card: Card }) {
  const status = dueStatus(card.due, card.dueDone);
  const progress = checklistsProgress(card.checklists);
  const priority = getPriority(card.priority);
  const hasAny =
    card.isTemplate || card.due || card.start || priority || card.description.trim() || progress.total > 0 ||
    card.attachments.length > 0 || card.comments.length > 0 || Object.keys(card.fields).length > 0;
  if (!hasAny) return null;
  return (
    <div className="card-tile__badges">
      {card.isTemplate && (
        <span className="badge badge--template" title="Plantilla">
          <LayoutTemplate size={13} /> Plantilla
        </span>
      )}
      {priority && (
        <span className="badge badge--priority" style={{ color: priority.color }} title={`Prioridad ${priority.name.toLowerCase()}`}>
          <Flag size={13} fill={priority.color} /> {priority.name}
        </span>
      )}
      {(card.due || card.start) && (
        <button
          type="button"
          className={`badge badge--due ${status ? `is-${status}` : ''}`}
          title={card.due ? `${DUE_STATUS_TEXT[status ?? 'normal'] || 'Vence'} · clic para marcar como ${card.dueDone ? 'pendiente' : 'completada'}` : 'Fecha de inicio'}
          onClick={(e) => {
            e.stopPropagation();
            if (card.due) updateCard(card.id, { dueDone: !card.dueDone });
          }}
        >
          <Clock size={13} />
          {card.start && card.due ? `${formatDate(card.start)} – ${formatDate(card.due)}` : card.due ? formatDate(card.due) : `Empieza ${formatDate(card.start!)}`}
        </button>
      )}
      {card.description.trim() && (
        <span className="badge" title="Tiene descripción">
          <AlignLeft size={13} />
        </span>
      )}
      {progress.total > 0 && (
        <span className={`badge ${progress.done === progress.total ? 'is-complete' : ''}`} title="Checklist">
          <CheckSquare size={13} /> {progress.done}/{progress.total}
        </span>
      )}
      {card.attachments.length > 0 && (
        <span className="badge" title="Enlaces">
          <Paperclip size={13} /> {card.attachments.length}
        </span>
      )}
      {card.comments.length > 0 && (
        <span className="badge" title="Notas">
          <MessageSquare size={13} /> {card.comments.length}
        </span>
      )}
      <FieldBadges card={card} />
    </div>
  );
}

interface CardTileProps {
  cardId: string;
  index: number;
}

export const CardTile = memo(function CardTile({ cardId, index }: CardTileProps) {
  const card = useCard(cardId);
  const editing = useUI((s) => s.editingCardId === cardId);
  if (!card) return null;

  const cover = card.cover;
  const coverColor = getColor(cover?.color);
  const isFull = cover?.size === 'full' && card.kind === 'card';
  const isSeparator = card.kind === 'separator';

  const title = editing ? (
    <InlineTitleEditor
      className="card-tile__title-input"
      value={card.title}
      onSave={(t) => {
        updateCard(cardId, { title: t });
        useUI.setState({ editingCardId: null });
      }}
      onCancel={() => useUI.setState({ editingCardId: null })}
    />
  ) : (
    <span className="card-tile__title">{card.title}</span>
  );

  return (
    <Draggable draggableId={cardId} index={index} isDragDisabled={editing}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          data-card-id={cardId}
          className={[
            'card-tile',
            isSeparator ? 'card-tile--separator' : '',
            isFull ? 'card-tile--full' : '',
            snapshot.isDragging ? 'is-dragging' : '',
            editing ? 'is-editing' : '',
          ].join(' ')}
          style={{
            ...provided.draggableProps.style,
            ...((isSeparator || isFull) && coverColor
              ? { backgroundColor: coverColor.bg, color: coverColor.fg }
              : {}),
            ...(isFull && cover?.image ? { backgroundImage: `url("${cover.image}")` } : {}),
          }}
          onClick={() => !editing && openCard(cardId, card.boardId)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !editing && e.target === e.currentTarget) {
              e.preventDefault();
              openCard(cardId, card.boardId);
            }
          }}
          onContextMenu={(e) => {
            if (editing || wantsNativeMenu(e)) return;
            openContextMenu(e, () => cardMenu(cardId));
          }}
          onMouseEnter={() => setHoveredCard(cardId)}
          onMouseLeave={() => clearHoveredCard(cardId)}
          aria-label={card.title}
        >
          {isSeparator ? (
            <div className="card-tile__separator">{title}</div>
          ) : (
            <>
              {!isFull && cover && (coverColor || cover.image) && (
                <div
                  className={`card-tile__cover ${cover.image ? 'has-image' : ''}`}
                  style={{
                    backgroundColor: coverColor?.bg,
                    ...(cover.image ? { backgroundImage: `url("${cover.image}")` } : {}),
                  }}
                />
              )}
              <div className="card-tile__body">
                {!isFull && <CardLabels card={card} />}
                {title}
                {!isFull && <CardBadges card={card} />}
              </div>
            </>
          )}
          {!editing && (
            <button
              type="button"
              className="card-tile__menu"
              aria-label="Acciones rápidas"
              title="Acciones rápidas"
              onClick={(e) => {
                e.stopPropagation();
                openMenuAt(e.currentTarget, () => cardMenu(cardId));
              }}
            >
              <MoreHorizontal size={15} />
            </button>
          )}
        </div>
      )}
    </Draggable>
  );
});
