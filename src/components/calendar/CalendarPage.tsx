import { useEffect, useState, type ReactNode } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Filter, List, Pencil, Plus, Rows3, Settings2, Trash2 } from 'lucide-react';
import type { CalendarView } from '../../types';
import * as C from '../../store/calendar';
import { useStore } from '../../store/store';
import { deviceTimeZone } from '../../store/factories';
import { confirmDialog, setPrefs, usePrefs } from '../../store/ui';
import { navigate, useRoute } from '../../lib/router';
import { MONTHS, todayKey } from '../../lib/dates';
import { colorName } from '../../lib/colors';
import { hasOpenLayers } from '../../lib/layers';
import {
  CARD_KIND_INFO, EMPTY_CAL_FILTER, isCalFilterActive, KIND_INFO, KIND_ORDER, reminderText, shortDate,
} from '../../lib/calendar';
import { dayToKey, keyToDay, weekdayOf } from '../../../shared/calendar.js';
import { Popover } from '../common/Popover';
import { IconGlyph, LabelChip } from '../common/LabelChip';
import { LabelEditor } from '../common/LabelEditor';
import { openMenuAt } from '../contextmenu/menuStore';
import { newEvent, newEventMenu } from './actions';
import { AgendaView, MonthView, WeekView } from './views';
import { NotificationSettings } from './NotificationSettings';

const VIEWS: { key: CalendarView; label: string; icon: ReactNode }[] = [
  { key: 'month', label: 'Mes', icon: <CalendarDays size={15} /> },
  { key: 'week', label: 'Semana', icon: <Rows3 size={15} /> },
  { key: 'agenda', label: 'Agenda', icon: <List size={15} /> },
];

function shiftAnchor(anchor: string, view: CalendarView, dir: number): string {
  if (view === 'month') {
    const y = Number(anchor.slice(0, 4));
    const m = Number(anchor.slice(5, 7)) - 1 + dir;
    const date = new Date(Date.UTC(y, m, 1));
    const dim = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    const day = Math.min(Number(anchor.slice(8, 10)), dim);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return dayToKey(keyToDay(anchor) + dir * 7);
}

function viewTitle(anchor: string, view: CalendarView): string {
  if (view === 'month') return `${MONTHS[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}`;
  if (view === 'week') {
    const monday = keyToDay(anchor) - (weekdayOf(keyToDay(anchor)) - 1);
    return `${shortDate(dayToKey(monday)).replace(/ \d{4}$/, '')} – ${shortDate(dayToKey(monday + 6))}`;
  }
  return anchor === todayKey() ? 'Próximos días' : `Desde el ${shortDate(anchor)}`;
}

/* ----------------------------------------------------------------- filter */

function FilterPanel() {
  const filter = usePrefs((s) => s.calFilter);
  const labels = useStore((s) => s.data.eventLabels);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const set = (patch: Partial<typeof filter>) => setPrefs({ calFilter: { ...filter, ...patch } });
  const toggleKind = (kind: string) =>
    set({ hiddenKinds: filter.hiddenKinds.includes(kind) ? filter.hiddenKinds.filter((k) => k !== kind) : [...filter.hiddenKinds, kind] });

  if (editing) {
    const label = labels.find((l) => l.id === editing);
    return (
      <LabelEditor
        key={editing}
        initial={label}
        onCancel={() => setEditing(null)}
        onSave={(value) => {
          if (label) C.updateEventLabel(label.id, value);
          else C.createEventLabel(value);
          setEditing(null);
        }}
        onDelete={
          label
            ? async () => {
                const ok = await confirmDialog({
                  title: '¿Eliminar etiqueta?',
                  message: 'Se quitará de todos los eventos.',
                  confirmText: 'Eliminar',
                  danger: true,
                });
                if (!ok) return;
                C.deleteEventLabel(label.id);
                set({ labelIds: filter.labelIds.filter((id) => id !== label.id) });
                setEditing(null);
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="cal-filter">
      <input
        className="input"
        placeholder="Buscar en el calendario…"
        value={filter.text}
        onChange={(e) => set({ text: e.target.value })}
        aria-label="Buscar"
      />
      <div className="field-label">Mostrar</div>
      <div className="cal-filter__kinds">
        {[...KIND_ORDER, 'card' as const].map((kind) => {
          const info = kind === 'card' ? CARD_KIND_INFO : KIND_INFO[kind];
          return (
            <label key={kind} className="checkbox-row">
              <input type="checkbox" checked={!filter.hiddenKinds.includes(kind)} onChange={() => toggleKind(kind)} />
              <IconGlyph icon={info.icon} size={14} /> {kind === 'card' ? 'Tarjetas con fecha' : info.label}
            </label>
          );
        })}
      </div>
      <div className="field-label">Etiquetas (muestra solo las marcadas)</div>
      <div className="label-picker__list">
        {labels.map((label) => (
          <div key={label.id} className="label-picker__row">
            <label className="label-picker__check">
              <input
                type="checkbox"
                checked={filter.labelIds.includes(label.id)}
                onChange={() =>
                  set({
                    labelIds: filter.labelIds.includes(label.id) ? filter.labelIds.filter((id) => id !== label.id) : [...filter.labelIds, label.id],
                  })
                }
              />
              <LabelChip label={label} size="md" title={label.name || colorName(label.color)} />
            </label>
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => setEditing(label.id)} aria-label="Editar etiqueta">
              <Pencil size={14} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn--block" onClick={() => setEditing('new')}>
        <Plus size={15} /> Crear etiqueta
      </button>
      {isCalFilterActive(filter) && (
        <button type="button" className="btn btn--block btn--subtle" onClick={() => setPrefs({ calFilter: EMPTY_CAL_FILTER })}>
          <Trash2 size={15} /> Quitar filtros
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- settings */

const CARD_REMINDER_CHOICES = [
  { value: '', label: 'No avisar' },
  { value: '0', label: 'Al vencer (las de todo el día, a la hora de abajo)' },
  { value: '60', label: '1 h antes' },
  { value: '1440', label: '1 día antes' },
  { value: '1440,0', label: '1 día antes y al vencer' },
];

function SettingsPanel() {
  const settings = useStore((s) => s.data.settings);
  const device = deviceTimeZone();
  const cardValue = settings.cardReminders.join(',');
  return (
    <div className="cal-settings">
      <label className="checkbox-row">
        <input type="checkbox" checked={settings.showCards} onChange={(e) => C.updateSettings({ showCards: e.target.checked })} />
        Mostrar las tarjetas de los tableros que tienen fecha
      </label>
      <label className="field-label" htmlFor="cal-card-reminders">
        Avisos de tarjetas con fecha de vencimiento
      </label>
      <select
        id="cal-card-reminders"
        className="input"
        value={CARD_REMINDER_CHOICES.some((c) => c.value === cardValue) ? cardValue : 'custom'}
        onChange={(e) => C.updateSettings({ cardReminders: e.target.value ? e.target.value.split(',').map(Number) : [] })}
      >
        {CARD_REMINDER_CHOICES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
        {!CARD_REMINDER_CHOICES.some((c) => c.value === cardValue) && (
          <option value="custom" disabled>
            {settings.cardReminders.map((m) => reminderText(m, false)).join(', ')}
          </option>
        )}
      </select>
      <label className="field-label" htmlFor="cal-allday-time">
        Hora de los avisos de eventos «todo el día»
      </label>
      <input
        id="cal-allday-time"
        className="input"
        type="time"
        value={settings.allDayTime}
        onChange={(e) => e.target.value && C.updateSettings({ allDayTime: e.target.value })}
      />
      <div className="field-label">Zona horaria de los avisos</div>
      <p className="small">
        <strong>{settings.timeZone}</strong>
        {device !== settings.timeZone && (
          <>
            {' '}
            <button type="button" className="btn btn--sm" onClick={() => C.updateSettings({ timeZone: device })}>
              Usar la de este dispositivo ({device})
            </button>
          </>
        )}
      </p>
      <NotificationSettings />
    </div>
  );
}

/* ------------------------------------------------------------------- page */

type Pop = 'filter' | 'settings' | null;

export function CalendarPage() {
  const route = useRoute();
  const prefView = usePrefs((s) => s.calView);
  const filter = usePrefs((s) => s.calFilter);
  const view = route.calView ?? prefView;
  const [anchor, setAnchor] = useState(() => route.date ?? route.occ ?? todayKey());
  const [pop, setPop] = useState<{ key: Pop; el: HTMLElement | null }>({ key: null, el: null });

  // Links (notifications, widget, home page) can point to a day or an occurrence.
  useEffect(() => {
    if (route.date) setAnchor(route.date);
  }, [route.date]);

  const setView = (v: CalendarView) => {
    setPrefs({ calView: v });
    if (route.calView) navigate({ ...route, calView: null }, true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || hasOpenLayers()) return;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const actions: Record<string, () => void> = {
        n: () => newEvent('event', anchor),
        t: () => setAnchor(todayKey()),
        m: () => setView('month'),
        s: () => setView('week'),
        a: () => setView('agenda'),
        ArrowLeft: () => setAnchor((a) => shiftAnchor(a, view, -1)),
        ArrowRight: () => setAnchor((a) => shiftAnchor(a, view, 1)),
      };
      const action = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const openPop = (key: Pop) => (e: React.MouseEvent<HTMLElement>) => setPop(pop.key === key ? { key: null, el: null } : { key, el: e.currentTarget });

  return (
    <div className={`cal-page cal-page--${view}`}>
      <div className="cal-toolbar">
        <div className="cal-toolbar__nav">
          <button type="button" className="btn btn--sm" onClick={() => setAnchor(todayKey())} title="Hoy (T)">
            Hoy
          </button>
          <button type="button" className="icon-btn" onClick={() => setAnchor((a) => shiftAnchor(a, view, -1))} aria-label="Anterior" title="Anterior (←)">
            <ChevronLeft size={18} />
          </button>
          <button type="button" className="icon-btn" onClick={() => setAnchor((a) => shiftAnchor(a, view, 1))} aria-label="Siguiente" title="Siguiente (→)">
            <ChevronRight size={18} />
          </button>
          <h1 className="cal-toolbar__title">{viewTitle(anchor, view)}</h1>
        </div>
        <div className="segmented cal-toolbar__views" role="tablist" aria-label="Vista">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" role="tab" aria-selected={view === v.key} className={view === v.key ? 'is-active' : ''} onClick={() => setView(v.key)}>
              {v.icon} <span className="cal-toolbar__view-label">{v.label}</span>
            </button>
          ))}
        </div>
        <div className="cal-toolbar__actions">
          <button type="button" className={`btn btn--sm ${isCalFilterActive(filter) ? 'btn--active' : ''}`} onClick={openPop('filter')} aria-expanded={pop.key === 'filter'}>
            <Filter size={15} /> <span className="cal-toolbar__label">Filtrar</span>
          </button>
          <button type="button" className="icon-btn" onClick={openPop('settings')} aria-label="Ajustes del calendario" title="Ajustes del calendario">
            <Settings2 size={18} />
          </button>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={(e) => openMenuAt(e.currentTarget, () => newEventMenu(anchor))}
            title="Nuevo (N)"
          >
            <Plus size={15} /> Nuevo
          </button>
        </div>
      </div>

      <div className="cal-body">
        {view === 'month' && <MonthView anchor={anchor} onSelect={setAnchor} onWeek={(day) => { setAnchor(day); setView('week'); }} />}
        {view === 'week' && <WeekView anchor={anchor} onSelect={setAnchor} />}
        {view === 'agenda' && <AgendaView anchor={anchor} />}
      </div>

      <button type="button" className="cal-fab" onClick={() => newEvent('event', anchor)} aria-label="Nuevo evento">
        <Plus size={24} />
      </button>

      {pop.key && pop.el && (
        <Popover
          anchor={pop.el}
          onClose={() => setPop({ key: null, el: null })}
          title={pop.key === 'filter' ? 'Filtrar el calendario' : 'Ajustes del calendario'}
          width={340}
        >
          {pop.key === 'filter' ? <FilterPanel /> : <SettingsPanel />}
        </Popover>
      )}
    </div>
  );
}

