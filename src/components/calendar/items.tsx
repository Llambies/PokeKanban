import type { CSSProperties } from 'react';
import { Check, MapPin, Repeat } from 'lucide-react';
import { getColor } from '../../lib/colors';
import { itemTitle, type CalItem } from '../../lib/calendar';
import { recurrenceSummary } from '../../lib/calendar';
import { useStore } from '../../store/store';
import { IconGlyph } from '../common/LabelChip';
import { openContextMenu, wantsNativeMenu } from '../contextmenu/menuStore';
import { cardMenu } from '../contextmenu/menus';
import { eventMenu, openItem, toggleItemDone } from './actions';

/**
 * Item being dragged (dataTransfer can't be read during dragover) and, for week blocks, the minutes between
 * the top of the block and the point where it was grabbed.
 */
export const drag: { item: CalItem | null; offset: number } = { item: null, offset: 0 };
export const DRAG_TYPE = 'application/x-pokekanban-calitem';

export function itemMenu(e: React.MouseEvent, item: CalItem): void {
  if (wantsNativeMenu(e)) return;
  if (item.type === 'card' && item.card) openContextMenu(e, () => cardMenu(item.card!.id));
  else if (item.event) openContextMenu(e, () => eventMenu(item.event!.id, item.occ));
}

function dragProps(item: CalItem) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      drag.item = item;
      drag.offset = 0;
      e.dataTransfer.setData(DRAG_TYPE, item.key);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragEnd: () => {
      drag.item = null;
    },
  };
}

export function itemStyle(item: CalItem): CSSProperties | undefined {
  const color = getColor(item.colorKey);
  if (!color) return undefined;
  return { '--item-bg': color.bg, '--item-fg': color.fg } as CSSProperties;
}

/** Compact chip for month cells and all-day rows. */
export function ItemChip({ item, showTime = true }: { item: CalItem; showTime?: boolean }) {
  // Only all-day items are drawn as bars; timed ones (even over several days) look like the rest.
  const filled = item.allDay;
  const className = [
    'cal-chip',
    filled ? 'cal-chip--filled' : 'cal-chip--timed',
    item.type === 'card' ? 'cal-chip--card' : '',
    item.done ? 'is-done' : '',
    item.overdue ? 'is-overdue' : '',
    filled && !item.first ? 'is-cont-start' : '',
    filled && !item.last ? 'is-cont-end' : '',
  ].join(' ');
  return (
    <div
      role="button"
      tabIndex={0}
      className={className}
      style={itemStyle(item)}
      {...dragProps(item)}
      onClick={(e) => {
        e.stopPropagation();
        openItem(item);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.stopPropagation();
          openItem(item);
        }
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => itemMenu(e, item)}
      title={`${item.time ? `${item.time} ` : ''}${itemTitle(item)}`}
    >
      {!filled && <span className="cal-chip__dot" />}
      {item.icon && <IconGlyph icon={item.icon} size={12} />}
      {showTime && item.time && item.first && <span className="cal-chip__time">{item.time}</span>}
      <span className="cal-chip__title">{itemTitle(item)}</span>
    </div>
  );
}

/** Row used by the agenda, the day panel and the home page. */
export function AgendaRow({ item, showDate }: { item: CalItem; showDate?: string }) {
  const boardTitle = useStore((s) => (item.card ? s.data.boards[item.card.boardId]?.title : undefined));
  const detail: string[] = [];
  if (item.card && boardTitle) detail.push(boardTitle);
  if (item.event?.location) detail.push(item.event.location);
  const color = getColor(item.colorKey);
  return (
    <div
      role="button"
      tabIndex={0}
      className={`agenda-row ${item.done ? 'is-done' : ''} ${item.overdue ? 'is-overdue' : ''}`}
      style={itemStyle(item)}
      {...dragProps(item)}
      onClick={() => openItem(item)}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && openItem(item)}
      onContextMenu={(e) => itemMenu(e, item)}
    >
      <span className="agenda-row__when">
        {showDate && <span className="agenda-row__date">{showDate}</span>}
        {item.allDay || !item.first ? (
          <span className="muted">{item.multiDay ? (item.first ? 'Empieza' : item.last ? 'Termina' : 'Todo el día') : 'Todo el día'}</span>
        ) : (
          <>
            <strong>{item.time}</strong>
            {item.endTime && item.last && <span className="muted">{item.endTime}</span>}
          </>
        )}
      </span>
      <span className="agenda-row__bar" style={color ? { background: color.bg } : undefined} />
      <span className="agenda-row__icon">{item.icon && <IconGlyph icon={item.icon} size={16} />}</span>
      <span className="agenda-row__main">
        <span className="agenda-row__title">{itemTitle(item)}</span>
        {(detail.length > 0 || item.event?.recurrence || item.overdue) && (
          <span className="agenda-row__detail">
            {item.overdue && <span className="agenda-row__late">{item.type === 'card' ? 'Vencida' : 'Pendiente'}</span>}
            {item.event?.location && <MapPin size={11} />}
            {detail.join(' · ')}
            {item.event?.recurrence && item.event.kind !== 'birthday' && item.event.kind !== 'anniversary' && (
              <span title={recurrenceSummary(item.event.recurrence, item.event.start.slice(0, 10))}>
                <Repeat size={11} />
              </span>
            )}
          </span>
        )}
      </span>
      {item.checkable && (
        <button
          type="button"
          className={`agenda-row__check ${item.done ? 'is-on' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleItemDone(item);
          }}
          aria-pressed={item.done}
          aria-label={item.done ? 'Marcar como pendiente' : 'Marcar como hecho'}
          title={item.done ? 'Marcar como pendiente' : 'Marcar como hecho'}
        >
          <Check size={14} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}
