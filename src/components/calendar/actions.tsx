import {
  Bell, BellOff, CalendarDays, CalendarPlus, Check, Copy, Link, Palette, Pencil, Smile, SquareArrowOutUpRight, Tag,
  Trash2, Undo2,
} from 'lucide-react';
import type { CalendarEvent, EventKind } from '../../types';
import * as C from '../../store/calendar';
import { getData, updateCard } from '../../store/store';
import { makeEvent } from '../../store/factories';
import { choiceDialog, promptDialog, toast, useUI, type ChoiceOption } from '../../store/ui';
import { getRoute, navigate, openCard, openEvent } from '../../lib/router';
import { addDaysKey, formatDate, moveToDay, todayKey } from '../../lib/dates';
import { colorName, getColor } from '../../lib/colors';
import { copyToClipboard } from '../../lib/download';
import { eventUrl, isCheckable, keyToDay, dayToKey } from '../../../shared/calendar.js';
import {
  ALL_DAY_REMINDERS, eventColorKey, KIND_INFO, KIND_ORDER, recurrenceSummary, reminderText, TIMED_REMINDERS, type CalItem,
} from '../../lib/calendar';
import { IconGlyph } from '../common/LabelChip';
import { SwatchGrid } from '../common/SwatchGrid';
import { IconPicker } from '../common/IconPicker';
import { undoToast } from '../contextmenu/menus';
import type { MenuItem } from '../contextmenu/menuStore';

const SEP: MenuItem = { kind: 'separator' };
const ICON = 15;

const pad = (n: number) => String(n).padStart(2, '0');

export function ColorDot({ color, icon }: { color: string | null; icon?: string | null }) {
  const c = getColor(color);
  return (
    <span className="color-dot" style={c ? { background: c.bg, color: c.fg } : undefined}>
      {icon && <IconGlyph icon={icon} size={10} />}
    </span>
  );
}

/** Opens the editor for a new event on a day (and optionally at a time). */
export function newEvent(kind: EventKind, dayKey = todayKey(), time?: string): void {
  let start = dayKey;
  let end: string | null = null;
  if (kind === 'event' || kind === 'reminder') {
    let t = time;
    if (!t) {
      const now = new Date();
      t = dayKey === todayKey() && now.getHours() < 23 ? `${pad(now.getHours() + 1)}:00` : kind === 'event' ? '10:00' : '09:00';
    }
    start = `${dayKey}T${t}`;
    if (kind === 'event') {
      const [h, m] = t.split(':').map(Number);
      const endMinutes = Math.min(h * 60 + m + 60, 23 * 60 + 59);
      end = `${dayKey}T${pad(Math.floor(endMinutes / 60))}:${pad(endMinutes % 60)}`;
    }
  }
  useUI.setState({ eventDraft: makeEvent(kind, start, { end }) });
}

export function newEventMenu(dayKey: string, time?: string): MenuItem[] {
  return KIND_ORDER.map((kind) => ({
    label: KIND_INFO[kind].label,
    icon: <IconGlyph icon={KIND_INFO[kind].icon} size={ICON} />,
    onSelect: () => newEvent(kind, dayKey, time),
  }));
}

export function dayMenu(dayKey: string, onShowWeek?: () => void): MenuItem[] {
  return [
    { kind: 'header', label: formatDate(dayKey, { withYear: true }) },
    ...newEventMenu(dayKey),
    ...(onShowWeek ? [SEP, { label: 'Ver la semana', icon: <CalendarDays size={ICON} />, onSelect: onShowWeek }] : []),
  ];
}

/** Asks which occurrences a change applies to (only for repeating events). */
export async function askScope(event: CalendarEvent, verb: 'edit' | 'move' | 'delete', allowOne = true): Promise<C.OccurrenceScope | null> {
  if (!event.recurrence) return 'all';
  const titles = { edit: 'Editar evento periódico', move: 'Mover evento periódico', delete: 'Eliminar evento periódico' };
  const options: ChoiceOption<C.OccurrenceScope>[] = [
    { value: 'one', label: 'Solo este', disabled: !allowOne, description: allowOne ? undefined : 'No disponible al cambiar la repetición' },
    { value: 'following', label: 'Este y los siguientes' },
    { value: 'all', label: 'Todos los eventos de la serie', danger: verb === 'delete' },
  ];
  return choiceDialog({ title: titles[verb], message: recurrenceSummary(event.recurrence, event.start.slice(0, 10)), options });
}

export async function deleteOccurrenceWithScope(eventId: string, occ: string): Promise<boolean> {
  const event = getData().events[eventId];
  if (!event) return false;
  const scope = await askScope(event, 'delete');
  if (!scope) return false;
  C.deleteOccurrence(eventId, occ, scope);
  undoToast(scope === 'one' && event.recurrence ? 'Se ha eliminado este día' : 'Evento eliminado');
  return true;
}

/** Moves an item dropped on another day (asks for the scope of repeating events). */
export async function moveItemToDay(item: Pick<CalItem, 'type' | 'event' | 'card' | 'occ'>, fromDay: string, toDay: string): Promise<void> {
  if (fromDay === toDay) return;
  if (item.type === 'card' && item.card) {
    updateCard(item.card.id, { due: moveToDay(item.card.due, toDay) });
    return;
  }
  const event = item.event && getData().events[item.event.id];
  if (!event) return;
  const scope = await askScope(event, 'move');
  if (!scope) return;
  const target = dayToKey(keyToDay(item.occ) + keyToDay(toDay) - keyToDay(fromDay));
  C.moveOccurrence(event.id, item.occ, target, scope);
}

export function openItem(item: Pick<CalItem, 'type' | 'event' | 'card' | 'occ'>): void {
  if (item.type === 'card' && item.card) openCard(item.card.id, item.card.boardId);
  else if (item.event) openEvent(item.event.id, item.occ);
}

export function toggleItemDone(item: Pick<CalItem, 'type' | 'event' | 'card' | 'occ' | 'done'>): void {
  if (item.type === 'card' && item.card) updateCard(item.card.id, { dueDone: !item.done });
  else if (item.event) C.toggleOccurrenceDone(item.event.id, item.occ);
}

/* ------------------------------------------------------------ event menu */

function colorSubmenu(eventId: string): MenuItem[] {
  const event = getData().events[eventId];
  return [
    {
      kind: 'custom',
      key: 'event-colors',
      render: () => (
        <div className="ctx-swatches">
          <SwatchGrid
            value={event.color}
            rows={[1, 2]}
            size="sm"
            noneLabel={`Automático (${colorName(eventColorKey({ ...event, color: null }, getData().eventLabels))})`}
            onChange={(color) => C.updateEvent(eventId, { color })}
          />
        </div>
      ),
    },
  ];
}

function iconSubmenu(eventId: string): MenuItem[] {
  return [
    {
      kind: 'custom',
      key: 'event-icon',
      render: (close) => (
        <div className="ctx-icon-picker">
          <IconPicker
            value={getData().events[eventId]?.icon ?? null}
            onChange={(icon) => {
              C.updateEvent(eventId, { icon });
              close();
            }}
          />
        </div>
      ),
    },
  ];
}

function labelsSubmenu(eventId: string): MenuItem[] {
  const { eventLabels, events } = getData();
  const event = events[eventId];
  const items: MenuItem[] = eventLabels.map((label) => ({
    label: label.name || colorName(label.color),
    icon: <ColorDot color={label.color} icon={label.icon} />,
    checked: event.labelIds.includes(label.id),
    keepOpen: true,
    onSelect: () => C.toggleEventLabel(eventId, label.id),
  }));
  items.push(SEP, {
    label: 'Nueva etiqueta…',
    icon: <Tag size={ICON} />,
    onSelect: async () => {
      const name = await promptDialog({ title: 'Nueva etiqueta', label: 'Nombre', value: '', confirmText: 'Crear' });
      if (!name?.trim()) return;
      const palette = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink'];
      const id = C.createEventLabel({ name: name.trim(), color: palette[eventLabels.length % palette.length], icon: null });
      C.toggleEventLabel(eventId, id);
    },
  });
  return items;
}

function remindersSubmenu(eventId: string): MenuItem[] {
  const event = getData().events[eventId];
  const allDay = !event.start.includes('T');
  const { allDayTime } = getData().settings;
  const presets = allDay ? ALL_DAY_REMINDERS : TIMED_REMINDERS;
  const values = [...new Set([...presets, ...event.reminders])].sort((a, b) => a - b);
  return [
    ...values.map((m) => ({
      label: reminderText(m, allDay, allDayTime),
      checked: event.reminders.includes(m),
      keepOpen: true,
      onSelect: () => {
        const current = getData().events[eventId].reminders;
        C.updateEvent(eventId, {
          reminders: current.includes(m) ? current.filter((x) => x !== m) : [...current, m].sort((a, b) => a - b),
        });
      },
    })),
    SEP,
    { label: 'Sin avisos', icon: <BellOff size={ICON} />, disabled: event.reminders.length === 0, onSelect: () => C.updateEvent(eventId, { reminders: [] }) },
  ];
}

function moveSubmenu(eventId: string, occ: string): MenuItem[] {
  const event = getData().events[eventId];
  const move = (key: string) => {
    void moveItemToDay({ type: 'event', event, occ }, occ, key);
  };
  const options: [string, string][] = [
    ['Hoy', todayKey()],
    ['Mañana', addDaysKey(1)],
    ['Dentro de una semana', dayToKey(keyToDay(occ) + 7)],
    ['Un día después', dayToKey(keyToDay(occ) + 1)],
    ['Un día antes', dayToKey(keyToDay(occ) - 1)],
  ];
  return options
    .filter(([, key]) => key !== occ)
    .map(([label, key]) => ({ label, hint: formatDate(key), icon: <CalendarPlus size={ICON} />, onSelect: () => move(key) }));
}

export function eventMenu(eventId: string, occ: string): MenuItem[] {
  const event = getData().events[eventId];
  if (!event) return [];
  const done = event.done.includes(occ);
  return [
    { kind: 'header', label: `${KIND_INFO[event.kind].label} · ${formatDate(occ, { withYear: true })}` },
    { label: 'Abrir', icon: <SquareArrowOutUpRight size={ICON} />, onSelect: () => openEvent(eventId, occ) },
    ...(isCheckable(event)
      ? [{ label: done ? 'Marcar como pendiente' : 'Marcar como hecho', icon: done ? <Undo2 size={ICON} /> : <Check size={ICON} />, onSelect: () => C.toggleOccurrenceDone(eventId, occ) }]
      : []),
    SEP,
    { label: 'Color', icon: <Palette size={ICON} />, submenu: () => colorSubmenu(eventId) },
    { label: 'Icono', icon: <Smile size={ICON} />, submenu: () => iconSubmenu(eventId) },
    { label: 'Etiquetas', icon: <Tag size={ICON} />, hint: event.labelIds.length ? String(event.labelIds.length) : undefined, submenu: () => labelsSubmenu(eventId) },
    { label: 'Avisos', icon: <Bell size={ICON} />, hint: event.reminders.length ? String(event.reminders.length) : undefined, submenu: () => remindersSubmenu(eventId) },
    { label: 'Mover a', icon: <CalendarDays size={ICON} />, submenu: () => moveSubmenu(eventId, occ) },
    SEP,
    {
      label: 'Renombrar',
      icon: <Pencil size={ICON} />,
      onSelect: async () => {
        const title = await promptDialog({ title: 'Renombrar', value: event.title });
        if (title?.trim()) C.updateEvent(eventId, { title: title.trim() });
      },
    },
    {
      label: 'Duplicar',
      icon: <Copy size={ICON} />,
      onSelect: () => {
        const id = C.duplicateEvent(eventId);
        if (id) undoToast('Evento duplicado');
      },
    },
    {
      label: 'Copiar enlace',
      icon: <Link size={ICON} />,
      onSelect: async () => {
        const ok = await copyToClipboard(window.location.href.split('#')[0] + eventUrl(eventId, occ));
        toast(ok ? 'Enlace copiado' : 'No se pudo copiar el enlace');
      },
    },
    SEP,
    event.recurrence
      ? {
          label: 'Eliminar',
          icon: <Trash2 size={ICON} />,
          danger: true,
          submenu: () => [
            { label: 'Solo este día', onSelect: () => { C.deleteOccurrence(eventId, occ, 'one'); undoToast('Se ha eliminado este día'); } },
            { label: 'Este y los siguientes', onSelect: () => { C.deleteOccurrence(eventId, occ, 'following'); undoToast('Eventos eliminados'); } },
            { label: 'Toda la serie', danger: true, onSelect: () => { C.deleteOccurrence(eventId, occ, 'all'); undoToast('Evento eliminado'); } },
          ],
        }
      : {
          label: 'Eliminar',
          icon: <Trash2 size={ICON} />,
          danger: true,
          onSelect: () => {
            C.deleteEvent(eventId);
            undoToast('Evento eliminado');
          },
        },
  ];
}

/** Shows the calendar page (optionally on a date). */
export function goToCalendar(date?: string): void {
  const route = getRoute();
  navigate({ page: 'calendar', calView: route.page === 'calendar' ? route.calView : null, date: date ?? null });
}
