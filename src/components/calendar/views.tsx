import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { AppData } from '../../types';
import { useStore } from '../../store/store';
import { usePrefs } from '../../store/ui';
import { editOccurrence } from '../../store/calendar';
import { getData, updateCard } from '../../store/store';
import { monthMatrix, toDateKey, todayKey, WEEKDAYS_SHORT } from '../../lib/dates';
import { calendarItems, dayMonthText, itemTitle, KIND_INFO, KIND_ORDER, type CalItem } from '../../lib/calendar';
import { dayToKey, keyToDay, weekdayOf, WEEKDAY_NAMES } from '../../../shared/calendar.js';
import { IconGlyph } from '../common/LabelChip';
import { openContextMenu, wantsNativeMenu } from '../contextmenu/menuStore';
import { askScope, dayMenu, moveItemToDay, newEvent, newEventMenu, openItem } from './actions';
import { AgendaRow, drag, DRAG_TYPE, ItemChip, itemMenu, itemStyle } from './items';

const pad = (n: number) => String(n).padStart(2, '0');

/** Re-renders every minute so "overdue" and the current time line stay fresh. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function useCalendarItems(fromKey: string, toKey: string, data?: AppData): Map<string, CalItem[]> {
  const storeData = useStore((s) => s.data);
  const filter = usePrefs((s) => s.calFilter);
  const now = useNow();
  const source = data ?? storeData;
  return useMemo(() => calendarItems(source, fromKey, toKey, filter, now), [source, fromKey, toKey, filter, now]);
}

export function dayTitle(key: string, today = todayKey()): string {
  const diff = keyToDay(key) - keyToDay(today);
  const name = `${WEEKDAY_NAMES[weekdayOf(keyToDay(key)) - 1]}, ${dayMonthText(key, key.slice(0, 4) !== today.slice(0, 4))}`;
  if (diff === 0) return `Hoy · ${name}`;
  if (diff === 1) return `Mañana · ${name}`;
  if (diff === -1) return `Ayer · ${name}`;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Drop target props for a day (moves the dragged item there, keeping its time). */
function useDayDrop(day: string, setOver: (d: string | null) => void) {
  return {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      setOver(day);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(null);
      const item = drag.item;
      drag.item = null;
      if (item) void moveItemToDay(item, item.day, day);
    },
  };
}

function AddButtons({ day }: { day: string }) {
  return (
    <div className="day-panel__add">
      {KIND_ORDER.map((kind) => (
        <button key={kind} type="button" className="btn btn--sm" onClick={() => newEvent(kind, day)} title={`Nuevo: ${KIND_INFO[kind].label}`}>
          <IconGlyph icon={KIND_INFO[kind].icon} size={14} /> {KIND_INFO[kind].label}
        </button>
      ))}
    </div>
  );
}

export function DayPanel({ day, items }: { day: string; items: CalItem[] }) {
  return (
    <aside className="day-panel">
      <h3 className="day-panel__title">{dayTitle(day)}</h3>
      <div className="day-panel__list">
        {items.length === 0 ? <p className="muted small">Nada este día.</p> : items.map((it) => <AgendaRow key={it.key} item={it} />)}
      </div>
      <AddButtons day={day} />
    </aside>
  );
}

/* ------------------------------------------------------------------ month */

const MONTH_CHIPS = 3;

export function MonthView({ anchor, onSelect, onWeek }: { anchor: string; onSelect: (day: string) => void; onWeek: (day: string) => void }) {
  const y = Number(anchor.slice(0, 4));
  const m = Number(anchor.slice(5, 7)) - 1;
  const weeks = useMemo(() => monthMatrix(y, m), [y, m]);
  const from = toDateKey(weeks[0][0]);
  const to = toDateKey(weeks[5][6]);
  const items = useCalendarItems(from, to);
  const [over, setOver] = useState<string | null>(null);
  const today = todayKey();

  return (
    <div className="cal-month">
      <div className="cal-month__grid" role="grid" aria-label="Mes">
        {WEEKDAYS_SHORT.map((d) => (
          <div key={d} className="cal-month__weekday" role="columnheader">
            {d}
          </div>
        ))}
        {weeks.flat().map((date) => {
          const key = toDateKey(date);
          const list = items.get(key) ?? [];
          const more = list.length - MONTH_CHIPS;
          return (
            <MonthDay
              key={key}
              day={key}
              num={date.getDate()}
              items={list.slice(0, more > 0 ? MONTH_CHIPS - 1 : MONTH_CHIPS)}
              more={more > 0 ? more + 1 : 0}
              outside={date.getMonth() !== m}
              today={key === today}
              selected={key === anchor}
              over={over === key}
              setOver={setOver}
              onSelect={onSelect}
              onWeek={onWeek}
            />
          );
        })}
      </div>
      <DayPanel day={anchor} items={items.get(anchor) ?? []} />
    </div>
  );
}

function MonthDay(props: {
  day: string; num: number; items: CalItem[]; more: number; outside: boolean; today: boolean; selected: boolean; over: boolean;
  setOver: (d: string | null) => void; onSelect: (day: string) => void; onWeek: (day: string) => void;
}) {
  const { day, num, items, more, outside, today, selected, over, setOver, onSelect, onWeek } = props;
  const drop = useDayDrop(day, setOver);
  return (
    <div
      role="gridcell"
      tabIndex={-1}
      aria-selected={selected}
      className={`cal-day ${outside ? 'is-outside' : ''} ${today ? 'is-today' : ''} ${selected ? 'is-selected' : ''} ${over ? 'is-drop' : ''}`}
      onClick={() => onSelect(day)}
      onDoubleClick={() => newEvent('event', day)}
      onContextMenu={(e) => {
        if (wantsNativeMenu(e)) return;
        onSelect(day);
        openContextMenu(e, () => dayMenu(day, () => onWeek(day)));
      }}
      {...drop}
    >
      <div className="cal-day__head">
        <span className="cal-day__num">{num}</span>
        <button
          type="button"
          className="cal-day__add"
          onClick={(e) => {
            e.stopPropagation();
            newEvent('event', day);
          }}
          aria-label="Nuevo evento este día"
          title="Nuevo evento"
        >
          <Plus size={13} />
        </button>
      </div>
      <div className="cal-day__items">
        {items.map((it) => (
          <ItemChip key={it.key} item={it} />
        ))}
        {more > 0 && (
          <button
            type="button"
            className="cal-day__more"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(day);
            }}
          >
            +{more} más
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- week */

const HOUR_PX = 48;
const SNAP = 15;

interface Placed {
  item: CalItem;
  top: number;
  height: number;
  col: number;
  cols: number;
}

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

function layoutDay(items: CalItem[]): Placed[] {
  const blocks = items
    .map((item) => {
      const start = toMinutes(item.time);
      const end = item.endTime && item.end?.slice(0, 10) === item.day ? toMinutes(item.endTime) : item.type === 'event' && item.event?.kind === 'event' ? start + 60 : start + 30;
      return { item, start, end: Math.max(end, start + 20) };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: Placed[] = [];
  let cluster: { block: (typeof blocks)[number]; col: number }[] = [];
  let clusterEnd = -1;
  let columnsEnd: number[] = [];
  const flush = () => {
    const cols = columnsEnd.length;
    for (const { block, col } of cluster) {
      placed.push({ item: block.item, top: (block.start / 60) * HOUR_PX, height: ((block.end - block.start) / 60) * HOUR_PX, col, cols });
    }
    cluster = [];
    columnsEnd = [];
  };
  for (const block of blocks) {
    if (block.start >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    let col = columnsEnd.findIndex((end) => end <= block.start);
    if (col === -1) {
      col = columnsEnd.length;
      columnsEnd.push(block.end);
    } else {
      columnsEnd[col] = block.end;
    }
    cluster.push({ block, col });
    clusterEnd = Math.max(clusterEnd, block.end);
  }
  flush();
  return placed;
}

async function dropAtTime(item: CalItem, day: string, minutes: number): Promise<void> {
  const time = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  if (item.allDay) return moveItemToDay(item, item.day, day);
  if (item.type === 'card' && item.card) {
    updateCard(item.card.id, { due: `${day}T${time}` });
    return;
  }
  const event = item.event && getData().events[item.event.id];
  if (!event) return;
  const duration = item.end ? (keyToDay(item.end) - keyToDay(item.start)) * 1440 + toMinutes(item.end.slice(11, 16)) - toMinutes(item.time) : 0;
  const startTotal = minutes;
  const endTotal = startTotal + duration;
  const endDay = dayToKey(keyToDay(day) + Math.floor(endTotal / 1440));
  const endTime = `${pad(Math.floor((endTotal % 1440) / 60))}:${pad(endTotal % 60)}`;
  const start = `${day}T${time}`;
  if (start === item.start) return;
  const scope = await askScope(event, 'move');
  if (!scope) return;
  editOccurrence(event.id, item.occ, { start, end: item.end ? `${endDay}T${endTime}` : null }, scope);
}

export function WeekView({ anchor, onSelect }: { anchor: string; onSelect: (day: string) => void }) {
  const monday = keyToDay(anchor) - (weekdayOf(keyToDay(anchor)) - 1);
  const days = Array.from({ length: 7 }, (_, i) => dayToKey(monday + i));
  const items = useCalendarItems(days[0], days[6]);
  const [over, setOver] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const now = useNow();
  const today = todayKey();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const hour = days.includes(today) ? Math.max(0, now.getHours() - 1) : 7;
    el.scrollTop = hour * HOUR_PX;
    // Only when the week changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]]);

  return (
    <div className="cal-week">
      <div className="cal-week__head">
        <div className="cal-week__gutter" />
        {days.map((day, i) => (
          <button
            key={day}
            type="button"
            className={`cal-week__day ${day === today ? 'is-today' : ''} ${day === anchor ? 'is-selected' : ''}`}
            onClick={() => onSelect(day)}
          >
            <span className="cal-week__wd">{WEEKDAYS_SHORT[i]}</span>
            <span className="cal-week__num">{Number(day.slice(8, 10))}</span>
          </button>
        ))}
      </div>
      <div className="cal-week__allday">
        <div className="cal-week__gutter small muted">todo el día</div>
        {days.map((day) => (
          <WeekAllDay key={day} day={day} items={(items.get(day) ?? []).filter((it) => it.allDay || it.multiDay)} over={over === `all:${day}`} setOver={setOver} />
        ))}
      </div>
      <div className="cal-week__scroll" ref={scroller}>
        <div className="cal-week__grid" style={{ height: 24 * HOUR_PX }}>
          <div className="cal-week__gutter cal-week__hours">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{ top: h * HOUR_PX }}>
                {h === 0 ? '' : `${pad(h)}:00`}
              </span>
            ))}
          </div>
          {days.map((day) => (
            <WeekColumn
              key={day}
              day={day}
              items={(items.get(day) ?? []).filter((it) => !it.allDay && !it.multiDay)}
              nowMinutes={day === today ? nowMinutes : null}
              over={over === day}
              setOver={setOver}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekAllDay({ day, items, over, setOver }: { day: string; items: CalItem[]; over: boolean; setOver: (d: string | null) => void }) {
  const drop = useDayDrop(day, (d) => setOver(d ? `all:${d}` : null));
  return (
    <div
      className={`cal-week__allday-cell ${over ? 'is-drop' : ''}`}
      onDoubleClick={() => newEvent('event', day)}
      onContextMenu={(e) => !wantsNativeMenu(e) && openContextMenu(e, () => dayMenu(day))}
      {...drop}
    >
      {items.map((it) => (
        <ItemChip key={it.key} item={it} showTime={false} />
      ))}
    </div>
  );
}

function minutesAt(e: React.MouseEvent | React.DragEvent, el: HTMLElement): number {
  const y = e.clientY - el.getBoundingClientRect().top;
  const minutes = Math.round(((y / HOUR_PX) * 60) / SNAP) * SNAP;
  return Math.max(0, Math.min(24 * 60 - SNAP, minutes));
}

function WeekColumn({ day, items, nowMinutes, over, setOver }: {
  day: string; items: CalItem[]; nowMinutes: number | null; over: boolean; setOver: (d: string | null) => void;
}) {
  const placed = useMemo(() => layoutDay(items), [items]);
  const timeAt = (e: React.MouseEvent) => {
    const minutes = Math.floor(minutesAt(e, e.currentTarget as HTMLElement) / 30) * 30;
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  };
  return (
    <div
      className={`cal-week__col ${over ? 'is-drop' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) newEvent('event', day, timeAt(e));
      }}
      onContextMenu={(e) => {
        if (wantsNativeMenu(e) || e.target !== e.currentTarget) return;
        const time = timeAt(e);
        openContextMenu(e, () => [{ kind: 'header', label: `${dayTitle(day)} · ${time}` }, ...newEventMenu(day, time)]);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        setOver(day);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(null);
        const item = drag.item;
        drag.item = null;
        if (item) void dropAtTime(item, day, minutesAt(e, e.currentTarget));
      }}
    >
      {placed.map(({ item, top, height, col, cols }) => (
        <div
          key={item.key}
          role="button"
          tabIndex={0}
          draggable
          className={`cal-block ${item.type === 'card' ? 'cal-block--card' : ''} ${item.done ? 'is-done' : ''} ${item.overdue ? 'is-overdue' : ''}`}
          style={{ ...itemStyle(item), top, height, left: `calc(${(col / cols) * 100}% + 1px)`, width: `calc(${100 / cols}% - 3px)` }}
          onDragStart={(e) => {
            drag.item = item;
            e.dataTransfer.setData(DRAG_TYPE, item.key);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => {
            drag.item = null;
          }}
          onClick={() => openItem(item)}
          onKeyDown={(e) => e.key === 'Enter' && openItem(item)}
          onContextMenu={(e) => itemMenu(e, item)}
          title={`${item.time}${item.endTime ? `–${item.endTime}` : ''} ${itemTitle(item)}`}
        >
          <span className="cal-block__title">
            {item.icon && <IconGlyph icon={item.icon} size={12} />} {itemTitle(item)}
          </span>
          <span className="cal-block__time">
            {item.time}
            {item.endTime ? `–${item.endTime}` : ''}
          </span>
        </div>
      ))}
      {nowMinutes !== null && <div className="cal-week__now" style={{ top: (nowMinutes / 60) * HOUR_PX }} />}
    </div>
  );
}

/* ----------------------------------------------------------------- agenda */

export function AgendaView({ anchor }: { anchor: string }) {
  const [days, setDays] = useState(45);
  const from = keyToDay(anchor);
  const past = useCalendarItems(dayToKey(from - 30), dayToKey(from - 1));
  const upcoming = useCalendarItems(anchor, dayToKey(from + days - 1));
  const today = todayKey();

  const overdue = useMemo(
    () => [...past.values()].flat().filter((it) => it.overdue && it.first).sort((a, b) => a.day.localeCompare(b.day)),
    [past],
  );
  const groups = useMemo(() => {
    const out: [string, CalItem[]][] = [];
    for (let d = from; d < from + days; d++) {
      const key = dayToKey(d);
      // Multi-day items only on their first day (or the first day shown).
      const list = (upcoming.get(key) ?? []).filter((it) => it.first || d === from);
      if (list.length) out.push([key, list]);
    }
    return out;
  }, [upcoming, from, days]);

  return (
    <div className="cal-agenda">
      {overdue.length > 0 && (
        <section className="cal-agenda__group cal-agenda__group--late">
          <h3 className="cal-agenda__day">Pendiente de días anteriores</h3>
          {overdue.map((it) => (
            <AgendaRow key={it.key} item={it} showDate={dayMonthText(it.day)} />
          ))}
        </section>
      )}
      {groups.map(([day, list]) => (
        <section key={day} className={`cal-agenda__group ${day === today ? 'is-today' : ''}`}>
          <h3
            className="cal-agenda__day"
            onContextMenu={(e) => !wantsNativeMenu(e) && openContextMenu(e, () => dayMenu(day))}
          >
            {dayTitle(day, today)}
          </h3>
          {list.map((it) => (
            <AgendaRow key={it.key} item={it} />
          ))}
        </section>
      ))}
      {groups.length === 0 && overdue.length === 0 && (
        <div className="cal-agenda__empty">
          <p>No hay nada en los próximos {days} días.</p>
          <AddButtons day={anchor} />
        </div>
      )}
      <button type="button" className="btn btn--block cal-agenda__more" onClick={() => setDays((d) => d + 60)}>
        Mostrar los 60 días siguientes
      </button>
    </div>
  );
}
