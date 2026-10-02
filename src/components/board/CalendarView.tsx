import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ListChecks, Plus } from 'lucide-react';
import type { Card } from '../../types';
import { useBoard, useBoardCards } from '../../store/hooks';
import { createCard, updateCard } from '../../store/store';
import { promptDialog } from '../../store/ui';
import { openCard } from '../../lib/router';
import { dateKeyOf, dueStatus, monthMatrix, MONTHS, moveToDay, timeOf, toDateKey, WEEKDAYS_SHORT } from '../../lib/dates';
import { getColor } from '../../lib/colors';
import { walk } from '../../lib/checklist';
import { openContextMenu, wantsNativeMenu } from '../contextmenu/menuStore';
import { cardMenu } from '../contextmenu/menus';

interface ItemEntry {
  card: Card;
  text: string;
  done: boolean;
  time: string;
}

const DRAG_TYPE = 'application/x-pokekanban-card';

function CalendarCard({ card, compact }: { card: Card; compact?: boolean }) {
  const status = dueStatus(card.due, card.dueDone);
  const cover = getColor(card.cover?.color);
  return (
    // A div (not a button): Firefox can't drag buttons.
    <div
      role="button"
      tabIndex={0}
      draggable
      className={`cal-card ${status ? `is-${status}` : ''} ${compact ? 'cal-card--compact' : ''}`}
      style={cover ? { borderLeftColor: cover.bg } : undefined}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, card.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => openCard(card.id, card.boardId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openCard(card.id, card.boardId);
        }
      }}
      onContextMenu={(e) => {
        if (wantsNativeMenu(e)) return;
        openContextMenu(e, () => cardMenu(card.id));
      }}
      title={card.title}
    >
      {card.due && timeOf(card.due) && <span className="cal-card__time">{timeOf(card.due)}</span>}
      <span className="cal-card__title">{card.title}</span>
    </div>
  );
}

export function CalendarView({ boardId }: { boardId: string }) {
  const board = useBoard(boardId);
  const cards = useBoardCards(boardId);
  const today = new Date();
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [dragOver, setDragOver] = useState<string | null>(null);
  const weeks = useMemo(() => monthMatrix(month.y, month.m), [month]);

  const { byDay, itemsByDay, undated } = useMemo(() => {
    const byDay = new Map<string, Card[]>();
    const itemsByDay = new Map<string, ItemEntry[]>();
    const undated: Card[] = [];
    for (const card of cards) {
      if (card.kind !== 'card') continue;
      if (card.due) {
        const key = dateKeyOf(card.due);
        byDay.set(key, [...(byDay.get(key) ?? []), card]);
      } else {
        undated.push(card);
      }
      for (const cl of card.checklists) {
        walk(cl.items, (item) => {
          if (!item.due) return;
          const key = dateKeyOf(item.due);
          itemsByDay.set(key, [...(itemsByDay.get(key) ?? []), { card, text: item.text, done: item.done, time: timeOf(item.due) }]);
        });
      }
    }
    for (const list of byDay.values()) list.sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
    return { byDay, itemsByDay, undated };
  }, [cards]);

  if (!board) return null;
  const todayKey = toDateKey(today);
  const shift = (delta: number) =>
    setMonth(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const onDrop = (e: React.DragEvent, dayKey: string | null) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData(DRAG_TYPE);
    if (!id) return;
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    updateCard(id, dayKey ? { due: moveToDay(card.due, dayKey) } : { due: null, dueDone: false });
  };

  const addOnDay = async (dayKey: string) => {
    const listId = board.listIds[0];
    if (!listId) return;
    const title = await promptDialog({ title: 'Nueva tarjeta', label: `Vence el ${dayKey.split('-').reverse().join('/')}`, value: '', confirmText: 'Añadir' });
    if (title?.trim()) createCard(listId, title, undefined, { due: dayKey });
  };

  return (
    <div className="calendar-view">
      <div className="calendar">
        <div className="calendar__toolbar">
          <button type="button" className="board-header__btn" onClick={() => shift(-1)} aria-label="Mes anterior">
            <ChevronLeft size={18} />
          </button>
          <button type="button" className="board-header__btn" onClick={() => setMonth({ y: today.getFullYear(), m: today.getMonth() })}>
            Hoy
          </button>
          <button type="button" className="board-header__btn" onClick={() => shift(1)} aria-label="Mes siguiente">
            <ChevronRight size={18} />
          </button>
          <h2 className="calendar__title">
            {MONTHS[month.m]} {month.y}
          </h2>
        </div>
        <div className="calendar__grid">
          {WEEKDAYS_SHORT.map((d) => (
            <div key={d} className="calendar__weekday">
              {d}
            </div>
          ))}
          {weeks.flat().map((day) => {
            const key = toDateKey(day);
            const dayCards = byDay.get(key) ?? [];
            const dayItems = itemsByDay.get(key) ?? [];
            const outside = day.getMonth() !== month.m;
            return (
              <div
                key={key}
                className={`calendar__day ${outside ? 'is-outside' : ''} ${key === todayKey ? 'is-today' : ''} ${dragOver === key ? 'is-drop' : ''}`}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                  e.preventDefault();
                  setDragOver(key);
                }}
                onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
                onDrop={(e) => onDrop(e, key)}
              >
                <div className="calendar__day-head">
                  <span className="calendar__day-num">{day.getDate()}</span>
                  <button type="button" className="calendar__add" onClick={() => addOnDay(key)} aria-label="Añadir tarjeta este día" title="Añadir tarjeta">
                    <Plus size={13} />
                  </button>
                </div>
                <div className="calendar__day-body">
                  {dayCards.map((card) => (
                    <CalendarCard key={card.id} card={card} />
                  ))}
                  {dayItems.map((it, i) => (
                    <button
                      type="button"
                      key={`${it.card.id}-${i}`}
                      className={`cal-item ${it.done ? 'is-done' : ''}`}
                      onClick={() => openCard(it.card.id, it.card.boardId)}
                      title={`${it.text} · ${it.card.title}`}
                    >
                      <ListChecks size={11} /> {it.time && <span className="cal-card__time">{it.time}</span>} {it.text}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <aside
        className={`calendar__undated ${dragOver === 'none' ? 'is-drop' : ''}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          setDragOver('none');
        }}
        onDragLeave={() => setDragOver((k) => (k === 'none' ? null : k))}
        onDrop={(e) => onDrop(e, null)}
      >
        <h3>Sin fecha ({undated.length})</h3>
        <p className="muted small">Arrastra una tarjeta a un día para ponerle fecha.</p>
        {undated.map((card) => (
          <CalendarCard key={card.id} card={card} compact />
        ))}
      </aside>
    </div>
  );
}
