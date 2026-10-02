import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, ZoomIn, ZoomOut } from 'lucide-react';
import type { AppData } from '../../types';
import { useStore } from '../../store/store';
import { setPrefs, usePrefs, useUI } from '../../store/ui';
import { editOccurrence } from '../../store/calendar';
import { getData, updateCard } from '../../store/store';
import { monthMatrix, toDateKey, todayKey, WEEKDAYS_SHORT } from '../../lib/dates';
import {
  calendarItems, clampHourPx, dayMonthText, droppedRange, fitHourPx, fromTotal, hourLabelStep, itemTitle, KIND_INFO, KIND_ORDER,
  MAX_HOUR_PX, resizedRange, selectedRange, timeRangeText, toTotal, type CalItem,
} from '../../lib/calendar';
import { dayToKey, keyToDay, weekdayOf, WEEKDAY_NAMES } from '../../../shared/calendar.js';
import { IconGlyph } from '../common/LabelChip';
import { openContextMenu, wantsNativeMenu } from '../contextmenu/menuStore';
import { askScope, dayMenu, moveItemToDay, newEvent, newEventBetween, newEventMenu, openItem } from './actions';
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

/** Full accessible date, e.g. "viernes, 2 de octubre" (for day-cell aria-labels). */
export function fullDateLabel(key: string): string {
  return `${WEEKDAY_NAMES[weekdayOf(keyToDay(key)) - 1]}, ${dayMonthText(key)}`;
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
        <div className="cal-month__row" role="row">
          {WEEKDAYS_SHORT.map((d) => (
            <div key={d} className="cal-month__weekday" role="columnheader">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div className="cal-month__row" role="row" key={wi}>
            {week.map((date) => {
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
        ))}
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
        <button
          type="button"
          className="cal-day__num"
          aria-label={fullDateLabel(day)}
          aria-current={today ? 'date' : undefined}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(day);
          }}
        >
          {num}
        </button>
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

const SNAP = 15;
/** Shortest block, in minutes and in px (zoomed out), so short items can still be clicked. */
const MIN_BLOCK = 20;
const MIN_BLOCK_PX = 14;
/** Blocks shorter than this (45 min) only get the bottom resize edge. */
const RESIZE_TOP_MIN_PX = 36;

/** Week blocks are dragged without the browser's copy under the pointer: the ghost block shows where they land. */
const EMPTY_DRAG_IMAGE =
  typeof Image === 'undefined' ? null : Object.assign(new Image(), { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' });

interface Placed {
  item: CalItem;
  top: number;
  height: number;
  col: number;
  cols: number;
}

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
/** Minutes drawn for an item without an end time. */
const defaultLength = (item: CalItem) => (item.type === 'event' && item.event?.kind === 'event' ? 60 : 30);

/** Minutes of the day covered by an item's block: multi-day pieces run from or to midnight. */
function blockRange(item: CalItem, minBlock = MIN_BLOCK): { start: number; end: number } {
  const start = item.first ? toMinutes(item.time) : 0;
  let end: number;
  if (!item.last || (item.end && item.end.slice(0, 10) !== item.day)) end = 24 * 60;
  else if (item.endTime) end = toMinutes(item.endTime);
  else end = start + defaultLength(item);
  return { start, end: Math.max(end, start + minBlock) };
}

function layoutDay(items: CalItem[], hourPx: number): Placed[] {
  const minBlock = Math.max(MIN_BLOCK, (MIN_BLOCK_PX / hourPx) * 60);
  const blocks = items
    .map((item) => ({ item, ...blockRange(item, minBlock) }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: Placed[] = [];
  let cluster: { block: (typeof blocks)[number]; col: number }[] = [];
  let clusterEnd = -1;
  let columnsEnd: number[] = [];
  const flush = () => {
    const cols = columnsEnd.length;
    for (const { block, col } of cluster) {
      placed.push({ item: block.item, top: (block.start / 60) * hourPx, height: ((block.end - block.start) / 60) * hourPx, col, cols });
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

/** Saves a new start and end for a timed item (repeating events ask which occurrences). */
async function saveRange(item: CalItem, start: string, end: string | null, verb: 'move' | 'edit'): Promise<void> {
  if (start === item.start && end === item.end) return;
  if (item.type === 'card' && item.card) {
    updateCard(item.card.id, { due: start });
    return;
  }
  const event = item.event && getData().events[item.event.id];
  if (!event) return;
  const scope = await askScope(event, verb);
  if (!scope) return;
  editOccurrence(event.id, item.occ, { start, end }, scope);
}

async function dropAtTime(item: CalItem, day: string, minutes: number): Promise<void> {
  if (item.allDay) return moveItemToDay(item, item.day, day);
  // The dragged piece's top lands on the drop point.
  const { start, end } = droppedRange(item, day, minutes);
  return saveRange(item, start, end, 'move');
}

/** Only events of the "event" kind have an end, so only they can be resized. */
const canResize = (item: CalItem) => item.type === 'event' && item.event?.kind === 'event';

/** Block drawn over the week grid while moving, resizing or creating: where it goes and its new time. */
interface Ghost {
  /** Item being changed (null while creating an event). */
  item: CalItem | null;
  day: string;
  /** Minutes of `day` covered by the block. */
  top: number;
  bottom: number;
  /** New start and end, shown on the block. */
  start: string;
  end: string | null;
  /** Released: waiting for "which occurrences" (repeating events) or for the editor (new events). */
  pending?: boolean;
}

function moveGhost(item: CalItem, day: string, minutes: number): Ghost {
  const { start, end } = droppedRange(item, day, minutes);
  const endTotal = end ? toTotal(end) : toTotal(start) + defaultLength(item);
  return { item, day, start, end, top: minutes, bottom: Math.min(24 * 60, Math.max(endTotal - keyToDay(day) * 1440, minutes + MIN_BLOCK)) };
}

function rangeGhost(item: CalItem | null, day: string, { start, end }: { start: string; end: string }): Ghost {
  const dayStart = keyToDay(day) * 1440;
  const top = Math.max(0, toTotal(start) - dayStart);
  return { item, day, start, end, top, bottom: Math.min(24 * 60, Math.max(toTotal(end) - dayStart, top + MIN_BLOCK)) };
}

/** Minutes of the day at `clientY` over a week column (the column is 24 hours tall, whatever the zoom). */
function minutesAtY(column: HTMLElement, clientY: number): number {
  const { top, height } = column.getBoundingClientRect();
  return ((clientY - top) / height) * 1440;
}

/** A resize handle is being dragged: the block must not start a move. */
let resizing = false;

/** Stops the click that follows a pointer gesture (it would open the item or a new event). */
function swallowNextClick(): void {
  const stop = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener('click', stop, { capture: true }));
}

/**
 * Follows a mouse or pen gesture that starts on a week column: `move` gets the minutes of the day under the
 * pointer once it has moved a few pixels, the grid scrolls near its edges, and `end` says whether to save
 * (released after moving) or not (a plain click, Esc or a cancelled pointer).
 */
function trackPointer(e: React.PointerEvent<HTMLElement>, column: HTMLElement, on: { move(minutes: number): void; end(save: boolean): void }): void {
  const scroller = column.closest<HTMLElement>('.cal-week__scroll');
  const { pointerId, clientX: x0, clientY: y0 } = e;
  let y = y0;
  let state: 'pressed' | 'dragging' | 'cancelled' = 'pressed';
  let frame = 0;
  const report = () => on.move(minutesAtY(column, y));
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId || state === 'cancelled') return;
    y = ev.clientY;
    if (state === 'pressed' && Math.abs(ev.clientX - x0) < 4 && Math.abs(y - y0) < 4) return;
    state = 'dragging';
    report();
  };
  const autoScroll = () => {
    if (state === 'dragging' && scroller) {
      const { top, bottom } = scroller.getBoundingClientRect();
      const edge = 40;
      const by = y < top + edge ? y - top - edge : y > bottom - edge ? y - bottom + edge : 0;
      if (by) {
        scroller.scrollTop += Math.sign(by) * Math.min(20, Math.ceil(Math.abs(by) / 3));
        report();
      }
    }
    frame = requestAnimationFrame(autoScroll);
  };
  const key = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopPropagation();
    if (state === 'cancelled') return;
    state = 'cancelled';
    on.end(false);
  };
  const finish = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    window.removeEventListener('keydown', key, true);
    cancelAnimationFrame(frame);
    if (state !== 'pressed') swallowNextClick();
    if (state !== 'cancelled') on.end(state === 'dragging' && ev.type === 'pointerup');
  };
  try {
    e.currentTarget.setPointerCapture(pointerId);
  } catch {
    // The window listeners follow the pointer anyway.
  }
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
  window.addEventListener('keydown', key, true);
  frame = requestAnimationFrame(autoScroll);
}

/** Drag state of the week view: the highlighted cell, the ghost block and the block being changed. */
function useWeekDrag() {
  const [over, setOver] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const actions = useMemo(() => {
    const clearGhost = () => setGhost((g) => (g?.pending ? g : null));
    return {
      setOver,
      /** A block starts being moved (HTML drag and drop, so it also reaches the all-day row). */
      start(item: CalItem) {
        // Not during dragstart itself: changing the dragged element then can cancel the drag.
        window.setTimeout(() => drag.item === item && setDragKey(item.key));
      },
      end() {
        setOver(null);
        setDragKey(null);
        clearGhost();
      },
      /** Pointer over a day column; `minutes` is where a timed item would start (null for all-day items). */
      hover(day: string, minutes: number | null) {
        setOver(day);
        const item = drag.item;
        if (!item || minutes === null) return clearGhost();
        setGhost((g) => (g?.pending || (g?.item === item && g.day === day && g.top === minutes) ? g : moveGhost(item, day, minutes)));
      },
      leave() {
        setOver(null);
        clearGhost();
      },
      drop(item: CalItem, day: string, minutes: number) {
        setOver(null);
        setDragKey(null);
        // The ghost stays until the move is done (or cancelled in the dialog).
        if (!item.allDay) setGhost({ ...moveGhost(item, day, minutes), pending: true });
        void dropAtTime(item, day, minutes).finally(() => setGhost(null));
      },
      /** Drags the top or bottom edge of an event to change when it starts or ends. */
      resize(e: React.PointerEvent<HTMLElement>, item: CalItem, edge: 'start' | 'end') {
        const column = e.currentTarget.closest<HTMLElement>('.cal-week__col');
        if (e.button !== 0 || e.pointerType === 'touch' || !column) return;
        const original = { start: item.start, end: item.end ?? fromTotal(toTotal(item.start) + defaultLength(item)) };
        let range: { start: string; end: string } | null = null;
        resizing = true;
        trackPointer(e, column, {
          move(minutes) {
            range = resizedRange(original, item.day, edge, minutes, SNAP);
            document.documentElement.classList.add('is-cal-resizing');
            setDragKey(item.key);
            setGhost(rangeGhost(item, item.day, range));
          },
          end(save) {
            resizing = false;
            document.documentElement.classList.remove('is-cal-resizing');
            setDragKey(null);
            if (!save || !range) return setGhost(null);
            setGhost((g) => g && { ...g, pending: true });
            void saveRange(item, range.start, range.end, 'edit').finally(() => setGhost(null));
          },
        });
      },
      /** Drags on an empty part of a column to choose when a new event starts and ends. */
      create(e: React.PointerEvent<HTMLElement>, day: string) {
        if (e.button !== 0 || e.pointerType === 'touch' || e.target !== e.currentTarget) return;
        const from = minutesAtY(e.currentTarget, e.clientY);
        let range: { start: string; end: string } | null = null;
        trackPointer(e, e.currentTarget, {
          move(minutes) {
            range = selectedRange(day, from, minutes, SNAP);
            setGhost(rangeGhost(null, day, range));
          },
          end(save) {
            if (!save || !range) return setGhost(null);
            // The ghost stays while the editor is open.
            setGhost((g) => g && { ...g, pending: true });
            newEventBetween(range.start, range.end);
          },
        });
      },
      /** The editor of a new event was closed. */
      closeNew() {
        setGhost((g) => (g?.pending && !g.item ? null : g));
      },
    };
  }, []);
  return { over, ghost, dragKey, actions };
}

type WeekDrag = ReturnType<typeof useWeekDrag>['actions'];

/** Each zoom button (or − / + key) makes hours this many times shorter or taller. */
const ZOOM_STEP = 1.5;

/** Zoom buttons of the week view on screen, so the − / + keys of the calendar page can use them. */
let zoomButtons: ((dir: -1 | 1) => void) | null = null;

/** Zooms the week view out (`-1`, more hours on screen) or in (`1`, taller hours). */
export function zoomWeek(dir: -1 | 1): void {
  zoomButtons?.(dir);
}

/**
 * Smooth zoom of the week grid: Ctrl + wheel (and pinching a touchpad) on a computer, pinching on a touch
 * screen, and animated steps with the buttons. Hours go from "the whole day on screen" (measured on the
 * scrolling grid) to MAX_HOUR_PX, and the time under the pointer, the fingers or the middle of the grid
 * stays in place.
 */
function useWeekZoom(week: React.RefObject<HTMLDivElement | null>, scroller: React.RefObject<HTMLDivElement | null>) {
  const saved = usePrefs((s) => s.calHourPx);
  const [available, setAvailable] = useState(0);
  // Local to this mount, not the zustand store: during a zoom gesture this changes on every wheel or
  // touchmove event (and every animation frame for the button zoom), so writing it straight to prefs
  // would mean a JSON.stringify + localStorage.setItem that often, plus re-rendering anything else
  // subscribed to the store. It's persisted debounced instead, see `schedulePersist` below.
  const [live, setLive] = useState(saved);
  const hourPx = clampHourPx(live, available);
  /** What the grid shows now: its hour height and scroll position (kept up to date on scroll). */
  const seen = useRef({ hourPx, top: 0 });
  const limits = useRef({ available, hourPx });
  limits.current = { available, hourPx };
  /** Time (minutes of the day) to keep `y` px below the top of the grid after the next zoom change. */
  const focus = useRef<{ minutes: number; y: number } | null>(null);
  const persistTimer = useRef<number | undefined>(undefined);

  // Flush a pending zoom change immediately if the view unmounts mid-gesture (switching calendar views).
  useEffect(
    () => () => {
      if (persistTimer.current !== undefined) {
        window.clearTimeout(persistTimer.current);
        setPrefs({ calHourPx: limits.current.hourPx });
      }
    },
    [],
  );

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setAvailable(el.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [scroller]);

  useLayoutEffect(() => {
    const el = scroller.current;
    const prev = seen.current;
    if (!el || (prev.hourPx === hourPx && !focus.current)) return;
    const y = focus.current?.y ?? el.clientHeight / 2;
    const minutes = focus.current?.minutes ?? ((prev.top + y) / prev.hourPx) * 60;
    focus.current = null;
    el.scrollTop = (minutes / 60) * hourPx - y;
    seen.current = { hourPx, top: el.scrollTop };
  }, [scroller, hourPx]);

  useEffect(() => {
    const root = week.current;
    const el = scroller.current;
    if (!root || !el) return;
    /** Time at `y` px below the top of the grid, with what is on screen now (or about to be, mid-gesture). */
    const minutesAt = (y: number) => focus.current?.minutes ?? ((el.scrollTop + y) / seen.current.hourPx) * 60;
    /** Hours `to` px tall, keeping `minutes` of the day `y` px below the top of the grid. */
    const zoomTo = (to: number, minutes: number, y: number) => {
      const next = Math.round(clampHourPx(to, limits.current.available) * 100) / 100;
      focus.current = { minutes, y };
      if (next === limits.current.hourPx) {
        // Already at the limit: only the position follows (moving two fingers still scrolls).
        el.scrollTop = (minutes / 60) * next - y;
        focus.current = null;
        return;
      }
      // Several wheel or touch events can arrive before the next render: they build on each other.
      limits.current.hourPx = next;
      setLive(next);
      // Persist 300ms after the last change in the gesture, not on every single step.
      if (persistTimer.current !== undefined) window.clearTimeout(persistTimer.current);
      persistTimer.current = window.setTimeout(() => {
        persistTimer.current = undefined;
        setPrefs({ calHourPx: next });
      }, 300);
    };
    const gridY = (clientY: number) => Math.max(0, Math.min(el.clientHeight, clientY - el.getBoundingClientRect().top));

    // Ctrl + wheel anywhere on the week zooms the grid, never the page.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // A mouse wheel notch (~100) is about 22 % in or out; a touchpad pinch sends many small steps.
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const y = gridY(e.clientY);
      zoomTo(limits.current.hourPx * Math.exp(-delta * 0.0025), minutesAt(y), y);
    };

    // Pinch with two fingers: hours follow the distance between them, the time between them follows them.
    let pinch: { distance: number; hourPx: number; minutes: number } | null = null;
    const fingers = (e: TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]];
      return { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), y: gridY((a.clientY + b.clientY) / 2) };
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const { distance, y } = fingers(e);
      pinch = { distance: Math.max(1, distance), hourPx: limits.current.hourPx, minutes: minutesAt(y) };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      const { distance, y } = fingers(e);
      zoomTo(pinch.hourPx * (distance / pinch.distance), pinch.minutes, y);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    // Safari's own pinch gesture.
    const onGesture = (e: Event) => e.preventDefault();

    // Buttons and keys: a short animation towards the next step, around the middle of the grid.
    let frame = 0;
    zoomButtons = (dir) => {
      cancelAnimationFrame(frame);
      const from = limits.current.hourPx;
      const to = clampHourPx(dir > 0 ? from * ZOOM_STEP : from / ZOOM_STEP, limits.current.available);
      const y = el.clientHeight / 2;
      const minutes = minutesAt(y);
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 180);
        zoomTo(from + (to - from) * (1 - (1 - t) ** 3), minutes, y);
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    root.addEventListener('gesturestart', onGesture);
    root.addEventListener('gesturechange', onGesture);
    return () => {
      cancelAnimationFrame(frame);
      zoomButtons = null;
      root.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      root.removeEventListener('gesturestart', onGesture);
      root.removeEventListener('gesturechange', onGesture);
    };
  }, [week, scroller]);

  /** Call on scroll and after moving the grid, so a zoom change knows what was on screen. */
  const remember = () => {
    if (scroller.current) seen.current = { hourPx, top: scroller.current.scrollTop };
  };
  return { hourPx, atMin: hourPx <= fitHourPx(available), atMax: hourPx >= MAX_HOUR_PX, remember };
}

/** Empty, stable array reused so a day with nothing never forces its column to re-render. */
const NO_ITEMS: CalItem[] = [];

export function WeekView({ anchor, onSelect }: { anchor: string; onSelect: (day: string) => void }) {
  const monday = keyToDay(anchor) - (weekdayOf(keyToDay(anchor)) - 1);
  // Memoized so it's the same array reference across renders that don't change the week (`days[0]` is
  // used as a dependency below, and `days` itself feeds the per-day split memo further down).
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dayToKey(monday + i)), [monday]);
  const items = useCalendarItems(days[0], days[6]);
  // All-day and timed items of each day, split once per `items`/`days` change instead of on every
  // render (each WeekColumn used to get a freshly filtered array every render, which defeated memo).
  const byDay = useMemo(() => {
    const map = new Map<string, { allDay: CalItem[]; timed: CalItem[] }>();
    for (const day of days) {
      const allDay: CalItem[] = [];
      const timed: CalItem[] = [];
      for (const it of items.get(day) ?? []) (it.allDay ? allDay : timed).push(it);
      map.set(day, { allDay, timed });
    }
    return map;
  }, [items, days]);
  const { over, ghost, dragKey, actions: dnd } = useWeekDrag();
  const moving = dragKey ?? (ghost?.pending && ghost.item ? ghost.item.key : null);
  const drafting = useUI((s) => s.eventDraft !== null);
  useEffect(() => {
    if (!drafting) dnd.closeNew();
  }, [drafting, dnd]);
  const week = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { hourPx, atMin, atMax, remember } = useWeekZoom(week, scroller);
  const labelStep = hourLabelStep(hourPx);
  const now = useNow();
  const today = todayKey();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const hour = days.includes(today) ? Math.max(0, now.getHours() - 1) : 7;
    el.scrollTop = hour * hourPx;
    remember();
    // Only when the week changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]]);

  return (
    <div ref={week} className={`cal-week ${hourPx >= 64 ? 'is-tall' : ''}`} style={{ '--hour': `${hourPx}px` } as React.CSSProperties}>
      <div className="cal-week__head">
        <div className="cal-week__gutter cal-week__zoom">
          <button
            type="button"
            className="icon-btn icon-btn--xs"
            onClick={() => zoomWeek(-1)}
            disabled={atMin}
            aria-label="Alejar: ver más horas"
            title="Alejar (−, Ctrl + rueda o pellizcar)"
          >
            <ZoomOut size={15} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--xs"
            onClick={() => zoomWeek(1)}
            disabled={atMax}
            aria-label="Acercar: horas más altas"
            title="Acercar (+, Ctrl + rueda o pellizcar)"
          >
            <ZoomIn size={15} />
          </button>
        </div>
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
          <WeekAllDay key={day} day={day} items={byDay.get(day)?.allDay ?? NO_ITEMS} over={over === `all:${day}`} setOver={dnd.setOver} />
        ))}
      </div>
      <div className="cal-week__scroll" ref={scroller} onScroll={remember}>
        <div className="cal-week__grid" style={{ height: 24 * hourPx }}>
          <div className="cal-week__gutter cal-week__hours">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{ top: h * hourPx }}>
                {h === 0 || h % labelStep ? '' : `${pad(h)}:00`}
              </span>
            ))}
          </div>
          {days.map((day) => (
            <WeekColumn
              key={day}
              day={day}
              items={byDay.get(day)?.timed ?? NO_ITEMS}
              hourPx={hourPx}
              nowMinutes={day === today ? nowMinutes : null}
              over={over === day}
              ghost={ghost?.day === day ? ghost : null}
              moving={moving}
              dnd={dnd}
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

/** Minutes of the day at the pointer (minus `offset`), snapped to the grid. */
function minutesAt(e: React.MouseEvent | React.DragEvent, el: HTMLElement, offset = 0): number {
  const minutes = Math.round((minutesAtY(el, e.clientY) - offset) / SNAP) * SNAP;
  return Math.max(0, Math.min(24 * 60 - SNAP, minutes));
}

/** Top or bottom edge of a block, dragged to change when the event starts or ends. */
function ResizeHandle({ edge, onPointerDown }: { edge: 'start' | 'end'; onPointerDown: (e: React.PointerEvent<HTMLElement>) => void }) {
  return (
    <span
      className={`cal-block__resize cal-block__resize--${edge === 'start' ? 'top' : 'bottom'}`}
      onPointerDown={onPointerDown}
      // Otherwise the block would start moving (HTML drag and drop) instead.
      onMouseDown={(e) => e.preventDefault()}
      title={edge === 'start' ? 'Arrastra para cambiar el inicio' : 'Arrastra para cambiar el final'}
    />
  );
}

/** Ghost of the item being moved, resized or created, with its new time. */
function GhostBlock({ ghost: { item, day, top, bottom, start, end }, hourPx }: { ghost: Ghost; hourPx: number }) {
  const dayStart = keyToDay(day) * 1440;
  const className = [
    'cal-block cal-block--preview',
    item?.type === 'card' ? 'cal-block--card' : '',
    start.slice(0, 10) < day ? 'is-cont-start' : '',
    end && toTotal(end) > dayStart + 24 * 60 ? 'is-cont-end' : '',
  ].join(' ');
  return (
    <div
      className={className}
      // A new event gets the default color of events.
      style={{ ...itemStyle(item ?? { colorKey: KIND_INFO.event.color }), top: (top / 60) * hourPx, height: ((bottom - top) / 60) * hourPx }}
      aria-hidden="true"
    >
      <span className="cal-block__time">{timeRangeText(start, end)}</span>
      <span className="cal-block__title">
        {item?.icon && <IconGlyph icon={item.icon} size={12} />} {item ? itemTitle(item) : 'Nuevo evento'}
      </span>
    </div>
  );
}

// Memoized: `dnd` is stable (see useWeekDrag's useMemo) and `items` is now a stable per-day array
// (see `byDay` in WeekView), so a day whose own props didn't change skips re-rendering when another
// day's items, drag state or ghost changes.
const WeekColumn = memo(function WeekColumn({ day, items, hourPx, nowMinutes, over, ghost, moving, dnd }: {
  day: string; items: CalItem[]; hourPx: number; nowMinutes: number | null; over: boolean; ghost: Ghost | null; moving: string | null; dnd: WeekDrag;
}) {
  const placed = useMemo(() => layoutDay(items, hourPx), [items, hourPx]);
  const timeAt = (e: React.MouseEvent) => {
    const minutes = Math.floor(minutesAt(e, e.currentTarget as HTMLElement) / 30) * 30;
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  };
  /** Where the dragged item's block would start if dropped here (it keeps the point where it was grabbed). */
  const dropMinutes = (e: React.DragEvent, item: CalItem) => {
    const minutes = minutesAt(e, e.currentTarget as HTMLElement, drag.offset);
    // Back over its own slot: keep the exact time, even if it's off the 15-minute grid.
    const own = blockRange(item).start;
    return day === item.day && minutes === Math.round(own / SNAP) * SNAP ? own : minutes;
  };
  return (
    <div
      className={`cal-week__col ${over ? 'is-drop' : ''}`}
      onPointerDown={(e) => dnd.create(e, day)}
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
        e.dataTransfer.dropEffect = 'move';
        const item = drag.item;
        dnd.hover(day, item && !item.allDay ? dropMinutes(e, item) : null);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) dnd.leave();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const item = drag.item;
        drag.item = null;
        if (item) dnd.drop(item, day, item.allDay ? 0 : dropMinutes(e, item));
      }}
    >
      {placed.map(({ item, top, height, col, cols }) => (
        <div
          key={item.key}
          role="button"
          tabIndex={0}
          draggable
          className={`cal-block ${height < 24 ? 'is-short' : ''} ${item.type === 'card' ? 'cal-block--card' : ''} ${item.done ? 'is-done' : ''} ${item.overdue ? 'is-overdue' : ''} ${item.first ? '' : 'is-cont-start'} ${item.last ? '' : 'is-cont-end'} ${moving === item.key ? 'is-dragging' : ''}`}
          style={{ ...itemStyle(item), top, height, left: `calc(${(col / cols) * 100}% + 1px)`, width: `calc(${100 / cols}% - 3px)` }}
          onDragStart={(e) => {
            if (resizing) {
              e.preventDefault();
              return;
            }
            drag.item = item;
            const column = e.currentTarget.parentElement!;
            drag.offset = minutesAtY(column, e.clientY) - minutesAtY(column, e.currentTarget.getBoundingClientRect().top);
            e.dataTransfer.setData(DRAG_TYPE, item.key);
            e.dataTransfer.effectAllowed = 'move';
            if (EMPTY_DRAG_IMAGE) e.dataTransfer.setDragImage(EMPTY_DRAG_IMAGE, 0, 0);
            dnd.start(item);
          }}
          onDragEnd={() => {
            drag.item = null;
            dnd.end();
          }}
          onClick={() => openItem(item)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openItem(item);
            }
          }}
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
          {canResize(item) && (
            <>
              {/* No top edge on short blocks: there'd be nowhere left to grab them to move them. */}
              {item.first && height >= RESIZE_TOP_MIN_PX && <ResizeHandle edge="start" onPointerDown={(e) => dnd.resize(e, item, 'start')} />}
              {item.last && <ResizeHandle edge="end" onPointerDown={(e) => dnd.resize(e, item, 'end')} />}
            </>
          )}
        </div>
      ))}
      {ghost && <GhostBlock ghost={ghost} hourPx={hourPx} />}
      {nowMinutes !== null && <div className="cal-week__now" style={{ top: (nowMinutes / 60) * hourPx }} />}
    </div>
  );
});

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
