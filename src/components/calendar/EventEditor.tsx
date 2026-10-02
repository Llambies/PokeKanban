import { useEffect, useMemo, useState } from 'react';
import { Bell, Copy, MapPin, Palette, Plus, Repeat, StickyNote, Tag, Trash2, X } from 'lucide-react';
import type { CalendarEvent, EventKind, Recurrence } from '../../types';
import * as C from '../../store/calendar';
import { getData, useStore } from '../../store/store';
import { KIND_DEFAULTS } from '../../store/factories';
import { useUI } from '../../store/ui';
import { closeEvent, openEvent } from '../../lib/router';
import { getColor } from '../../lib/colors';
import { dayToKey, isCheckable, isLastWeekdayOfMonth, keyToDay, occurrenceRange, weekdayOf } from '../../../shared/calendar.js';
import {
  ALL_DAY_REMINDERS, eventColorKey, eventIcon, KIND_INFO, KIND_ORDER, matchPreset, monthlyText, recurrenceSummary,
  reminderText, repeatPresets, TIMED_REMINDERS, WEEKDAY_LETTERS,
} from '../../lib/calendar';
import { Modal } from '../common/Modal';
import { Popover } from '../common/Popover';
import { IconGlyph, LabelChip } from '../common/LabelChip';
import { LabelEditor } from '../common/LabelEditor';
import { SwatchGrid } from '../common/SwatchGrid';
import { IconPicker } from '../common/IconPicker';
import { AutoTextarea } from '../common/AutoTextarea';
import { enablePush, refreshPush, usePush } from '../../lib/push';
import { isNativeApp } from '../../lib/native';
import { askScope, deleteOccurrenceWithScope } from './actions';
import { undoToast } from '../contextmenu/menus';

const pad = (n: number) => String(n).padStart(2, '0');

function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const days = Math.floor(total / 1440);
  const rest = ((total % 1440) + 1440) % 1440;
  return { date: dayToKey(keyToDay(date) + days), time: `${pad(Math.floor(rest / 60))}:${pad(rest % 60)}` };
}

function minutesBetween(d1: string, t1: string, d2: string, t2: string): number {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return (keyToDay(d2) - keyToDay(d1)) * 1440 + toMin(t2) - toMin(t1);
}

interface Draft {
  kind: EventKind;
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  recurrence: Recurrence | null;
  reminders: number[];
  color: string | null;
  icon: string | null;
  labelIds: string[];
  location: string;
  notes: string;
  knowYear: boolean;
  done: boolean;
}

function toDraft(event: CalendarEvent, occ: string | null): Draft {
  const range = occ ? occurrenceRange(event, occ) : { start: event.start, end: event.end };
  const allDay = !range.start.includes('T');
  const startDate = range.start.slice(0, 10);
  const startTime = allDay ? '09:00' : range.start.slice(11, 16);
  let endDate = range.end ? range.end.slice(0, 10) : startDate;
  let endTime = range.end && !allDay ? range.end.slice(11, 16) : '';
  if (!endTime) {
    const next = addMinutes(startDate, startTime, 60);
    if (!range.end) endDate = next.date;
    endTime = next.time;
  }
  if (allDay && !range.end) endDate = startDate;
  return {
    kind: event.kind,
    title: event.title,
    allDay,
    startDate,
    startTime,
    endDate,
    endTime,
    recurrence: event.recurrence,
    reminders: event.reminders,
    color: event.color,
    icon: event.icon,
    labelIds: event.labelIds,
    location: event.location,
    notes: event.notes,
    knowYear: event.sinceYear !== null,
    done: occ ? event.done.includes(occ) : event.done.length > 0,
  };
}

/** Fields of the event (the occurrence's dates) that the draft describes. */
function toPatch(d: Draft): C.EventPatch {
  const yearly = d.kind === 'birthday' || d.kind === 'anniversary';
  const hasEnd = d.kind === 'event';
  const start = d.allDay ? d.startDate : `${d.startDate}T${d.startTime}`;
  let end: string | null = null;
  if (hasEnd) {
    if (d.allDay) end = d.endDate > d.startDate ? d.endDate : null;
    else {
      const candidate = `${d.endDate}T${d.endTime}`;
      end = candidate > start ? candidate : null;
    }
  }
  return {
    kind: d.kind,
    title: d.title.trim(),
    start,
    end,
    recurrence: yearly ? { freq: 'yearly', interval: d.recurrence?.freq === 'yearly' ? d.recurrence.interval : 1, byWeekday: [], monthlyBy: 'day', until: null, count: null } : d.recurrence,
    reminders: [...d.reminders].sort((a, b) => a - b),
    color: d.color,
    icon: d.icon,
    labelIds: d.labelIds,
    location: d.kind === 'event' || d.kind === 'reminder' ? d.location.trim() : '',
    notes: d.notes,
    sinceYear: yearly && d.knowYear ? Number(d.startDate.slice(0, 4)) : null,
  };
}

const samePatch = (a: C.EventPatch, event: CalendarEvent, occStart: string, occEnd: string | null) =>
  JSON.stringify({ ...a, start: a.start, end: a.end }) ===
  JSON.stringify({
    kind: event.kind, title: event.title, start: occStart, end: occEnd, recurrence: event.recurrence, reminders: event.reminders,
    color: event.color, icon: event.icon, labelIds: event.labelIds, location: event.location, notes: event.notes, sinceYear: event.sinceYear,
  });

/* ------------------------------------------------------------ repetition */

function RepeatEditor({ draft, setRecurrence }: { draft: Draft; setRecurrence: (r: Recurrence | null) => void }) {
  const presets = useMemo(() => repeatPresets(draft.startDate), [draft.startDate]);
  const presetKey = matchPreset(draft.recurrence, draft.startDate);
  const [custom, setCustom] = useState(presetKey === null);
  const rule = draft.recurrence;
  const showCustom = custom && rule;
  const endMode = rule?.until ? 'until' : rule?.count ? 'count' : 'never';
  const update = (patch: Partial<Recurrence>) => rule && setRecurrence({ ...rule, ...patch });

  return (
    <div className="ev-repeat">
      <select
        className="input"
        value={custom || presetKey === null ? 'custom' : presetKey}
        onChange={(e) => {
          if (e.target.value === 'custom') {
            setCustom(true);
            if (!rule) setRecurrence(presets.find((p) => p.key === 'weekly')!.rule);
            return;
          }
          setCustom(false);
          setRecurrence(presets.find((p) => p.key === e.target.value)?.rule ?? null);
        }}
        aria-label="Repetir"
      >
        {presets.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
        <option value="custom">Personalizado…</option>
      </select>
      {showCustom && (
        <div className="ev-repeat__custom">
          <div className="ev-row">
            <span>Cada</span>
            <input
              className="input input--sm ev-num"
              type="number"
              min={1}
              max={999}
              value={rule.interval}
              onChange={(e) => update({ interval: Math.max(1, Math.min(999, Number(e.target.value) || 1)) })}
              aria-label="Intervalo"
            />
            <select className="input input--sm" value={rule.freq} onChange={(e) => update({ freq: e.target.value as Recurrence['freq'] })} aria-label="Unidad">
              <option value="daily">{rule.interval === 1 ? 'día' : 'días'}</option>
              <option value="weekly">{rule.interval === 1 ? 'semana' : 'semanas'}</option>
              <option value="monthly">{rule.interval === 1 ? 'mes' : 'meses'}</option>
              <option value="yearly">{rule.interval === 1 ? 'año' : 'años'}</option>
            </select>
          </div>
          {rule.freq === 'weekly' && (
            <div className="ev-weekdays" role="group" aria-label="Días de la semana">
              {WEEKDAY_LETTERS.map((letter, i) => {
                const day = i + 1;
                const days = rule.byWeekday.length ? rule.byWeekday : [weekdayOf(keyToDay(draft.startDate))];
                const on = days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className={`ev-weekday ${on ? 'is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      const next = on ? days.filter((d) => d !== day) : [...days, day];
                      update({ byWeekday: next.length ? next.sort() : days });
                    }}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          )}
          {rule.freq === 'monthly' && (
            <select className="input input--sm" value={rule.monthlyBy} onChange={(e) => update({ monthlyBy: e.target.value as Recurrence['monthlyBy'] })} aria-label="Día del mes">
              <option value="day">{monthlyText('day', draft.startDate)}</option>
              <option value="weekday">{monthlyText('weekday', draft.startDate)}</option>
              {(isLastWeekdayOfMonth(draft.startDate) || rule.monthlyBy === 'last-weekday') && (
                <option value="last-weekday">{monthlyText('last-weekday', draft.startDate)}</option>
              )}
            </select>
          )}
          <div className="ev-row">
            <span>Termina</span>
            <select
              className="input input--sm"
              value={endMode}
              onChange={(e) => {
                const mode = e.target.value;
                if (mode === 'never') update({ until: null, count: null });
                if (mode === 'until') update({ until: dayToKey(keyToDay(draft.startDate) + 90), count: null });
                if (mode === 'count') update({ until: null, count: 10 });
              }}
              aria-label="Termina"
            >
              <option value="never">Nunca</option>
              <option value="until">El día…</option>
              <option value="count">Tras varias veces</option>
            </select>
            {endMode === 'until' && (
              <input
                className="input input--sm"
                type="date"
                value={rule.until ?? ''}
                min={draft.startDate}
                onChange={(e) => e.target.value && update({ until: e.target.value })}
                aria-label="Fecha de fin"
              />
            )}
            {endMode === 'count' && (
              <>
                <input
                  className="input input--sm ev-num"
                  type="number"
                  min={1}
                  value={rule.count ?? 1}
                  onChange={(e) => update({ count: Math.max(1, Number(e.target.value) || 1) })}
                  aria-label="Número de veces"
                />
                <span>veces</span>
              </>
            )}
          </div>
          <p className="muted small">{recurrenceSummary(rule, draft.startDate)}</p>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- reminders */

function RemindersEditor({ draft, onChange }: { draft: Draft; onChange: (reminders: number[]) => void }) {
  const allDayTime = useStore((s) => s.data.settings.allDayTime);
  const allDay = draft.allDay || draft.kind === 'birthday' || draft.kind === 'anniversary';
  const presets = (allDay ? ALL_DAY_REMINDERS : TIMED_REMINDERS).filter((m) => !draft.reminders.includes(m));
  const [custom, setCustom] = useState<{ value: number; unit: number } | null>(null);
  return (
    <div className="ev-reminders">
      {draft.reminders.length === 0 && <span className="muted small">Sin avisos</span>}
      {draft.reminders.map((m) => (
        <span key={m} className="chip chip--static">
          {reminderText(m, allDay, allDayTime)}
          <button type="button" className="chip__x" onClick={() => onChange(draft.reminders.filter((x) => x !== m))} aria-label="Quitar aviso">
            <X size={12} />
          </button>
        </span>
      ))}
      {custom ? (
        <span className="ev-row">
          <input
            className="input input--sm ev-num"
            type="number"
            min={0}
            value={custom.value}
            autoFocus
            onChange={(e) => setCustom({ ...custom, value: Math.max(0, Number(e.target.value) || 0) })}
            aria-label="Cantidad"
          />
          <select className="input input--sm" value={custom.unit} onChange={(e) => setCustom({ ...custom, unit: Number(e.target.value) })} aria-label="Unidad">
            <option value={1}>minutos</option>
            <option value={60}>horas</option>
            <option value={1440}>días</option>
            <option value={10080}>semanas</option>
          </select>
          <span>antes</span>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={() => {
              const minutes = custom.value * custom.unit;
              if (!draft.reminders.includes(minutes)) onChange([...draft.reminders, minutes].sort((a, b) => a - b));
              setCustom(null);
            }}
          >
            Añadir
          </button>
          <button type="button" className="btn btn--sm" onClick={() => setCustom(null)}>
            Cancelar
          </button>
        </span>
      ) : (
        <select
          className="input input--sm ev-add-reminder"
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'custom') setCustom({ value: 1, unit: allDay ? 1440 : 60 });
            else if (v) onChange([...draft.reminders, Number(v)].sort((a, b) => a - b));
          }}
          aria-label="Añadir aviso"
        >
          <option value="">+ Añadir aviso</option>
          {presets.map((m) => (
            <option key={m} value={m}>
              {reminderText(m, allDay, allDayTime)}
            </option>
          ))}
          <option value="custom">Personalizado…</option>
        </select>
      )}
    </div>
  );
}

function PushHint() {
  const status = usePush((s) => s.status);
  if (status !== 'off' || isNativeApp()) return null;
  return (
    <p className="small muted ev-push-hint">
      Las notificaciones no están activadas en este dispositivo.{' '}
      <button type="button" className="link-btn" onClick={() => void enablePush()}>
        Activarlas
      </button>
    </p>
  );
}

/* ----------------------------------------------------------------- editor */

type Pop = 'icon' | 'color' | 'label' | null;

export function EventEditor({ event, occ, isNew, onClose }: { event: CalendarEvent; occ: string | null; isNew: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(event, occ));
  useEffect(() => {
    void refreshPush();
  }, []);
  const labels = useStore((s) => s.data.eventLabels);
  const [pop, setPop] = useState<{ key: Pop; anchor: HTMLElement | null }>({ key: null, anchor: null });
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const info = KIND_INFO[draft.kind];
  const colorKey = eventColorKey({ color: draft.color, labelIds: draft.labelIds, kind: draft.kind }, labels);
  const color = getColor(colorKey);
  const icon = eventIcon({ icon: draft.icon, kind: draft.kind });
  const checkable = isCheckable({ kind: draft.kind });
  const yearly = draft.kind === 'birthday' || draft.kind === 'anniversary';
  const openPop = (key: Pop) => (e: React.MouseEvent<HTMLElement>) => setPop({ key, anchor: e.currentTarget });

  const changeKind = (kind: EventKind) => {
    if (kind === draft.kind) return;
    const defaults = KIND_DEFAULTS[kind];
    const wasYearly = draft.kind === 'birthday' || draft.kind === 'anniversary';
    set({
      kind,
      allDay: defaults.allDay,
      // Keep a rule the user chose; yearly kinds force a yearly one (and leaving them drops it).
      recurrence: defaults.yearly ? repeatPresets(draft.startDate).find((p) => p.key === 'yearly')!.rule : wasYearly ? null : draft.recurrence,
      reminders: [...defaults.reminders],
    });
  };

  const changeStart = (startDate: string, startTime = draft.startTime) => {
    if (!startDate) return;
    // Keep the duration, and presets following the new day ("every Monday" -> "every Tuesday").
    const duration = minutesBetween(draft.startDate, draft.startTime, draft.endDate, draft.endTime);
    const allDaySpan = keyToDay(draft.endDate) - keyToDay(draft.startDate);
    const end = draft.allDay
      ? { date: dayToKey(keyToDay(startDate) + Math.max(0, allDaySpan)), time: draft.endTime }
      : addMinutes(startDate, startTime, Math.max(duration, 0));
    const presetKey = matchPreset(draft.recurrence, draft.startDate);
    const recurrence = presetKey && presetKey !== 'none'
      ? repeatPresets(startDate).find((p) => p.key === presetKey)?.rule ?? draft.recurrence
      : draft.recurrence;
    set({ startDate, startTime, endDate: end.date, endTime: end.time, recurrence });
  };

  const save = async () => {
    const patch = toPatch(draft);
    if (!patch.title) patch.title = info.label;
    if (isNew) {
      const created: CalendarEvent = { ...event, ...patch, done: checkable && draft.done ? [draft.startDate] : [] } as CalendarEvent;
      C.createEvent(created);
      undoToast('Añadido al calendario');
      onClose();
      return;
    }
    const current = getData().events[event.id];
    if (!current || !occ) {
      onClose();
      return;
    }
    const range = occurrenceRange(current, occ);
    if (samePatch(patch, current, range.start, range.end)) {
      onClose();
      return;
    }
    const ruleChanged = JSON.stringify(patch.recurrence) !== JSON.stringify(current.recurrence);
    const scope = await askScope(current, 'edit', !ruleChanged);
    if (!scope) return;
    const id = C.editOccurrence(current.id, occ, patch, scope);
    onClose();
    if (id !== current.id && patch.start) openEvent(id, patch.start.slice(0, 10));
  };

  const remove = async () => {
    if (isNew || !occ) {
      onClose();
      return;
    }
    if (await deleteOccurrenceWithScope(event.id, occ)) onClose();
  };

  return (
    <Modal onClose={onClose} className="event-modal" labelledBy="event-title">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="event-modal__head" style={color ? ({ '--ev-color': color.bg, '--ev-fg': color.fg } as React.CSSProperties) : undefined}>
          <div className="ev-kinds" role="radiogroup" aria-label="Tipo">
            {KIND_ORDER.map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={draft.kind === kind}
                className={`ev-kind ${draft.kind === kind ? 'is-active' : ''}`}
                onClick={() => changeKind(kind)}
              >
                <IconGlyph icon={KIND_INFO[kind].icon} size={14} /> {KIND_INFO[kind].label}
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn event-modal__close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="event-modal__body">
          <div className="ev-title-row">
            <button type="button" className="ev-icon-btn" onClick={openPop('icon')} title="Icono" aria-label="Cambiar icono" style={color ? { background: color.bg, color: color.fg } : undefined}>
              <IconGlyph icon={icon} size={20} />
            </button>
            <label className="sr-only" htmlFor="event-title">Título del evento</label>
            <input
              id="event-title"
              className="input ev-title"
              value={draft.title}
              placeholder={info.placeholder}
              autoFocus={isNew}
              onChange={(e) => set({ title: e.target.value })}
            />
          </div>

          {checkable && (
            <label className="checkbox-row ev-done">
              <input
                type="checkbox"
                checked={draft.done}
                onChange={(e) => {
                  set({ done: e.target.checked });
                  if (!isNew && occ) C.setOccurrenceDone(event.id, occ, e.target.checked);
                }}
              />
              {draft.kind === 'deadline' ? 'Hecho (entregado / pagado…)' : 'Hecho'}
            </label>
          )}

          <section className="ev-section">
            {draft.kind === 'event' && (
              <label className="checkbox-row">
                <input type="checkbox" checked={draft.allDay} onChange={(e) => set({ allDay: e.target.checked })} /> Todo el día
              </label>
            )}
            {draft.kind === 'deadline' && (
              <label className="checkbox-row">
                <input type="checkbox" checked={!draft.allDay} onChange={(e) => set({ allDay: !e.target.checked })} /> Con hora límite
              </label>
            )}
            {draft.kind === 'reminder' && (
              <label className="checkbox-row">
                <input type="checkbox" checked={draft.allDay} onChange={(e) => set({ allDay: e.target.checked })} /> Sin hora concreta
              </label>
            )}
            <div className="ev-dates">
              <span className="ev-dates__label">
                {draft.kind === 'event' ? 'Empieza' : draft.kind === 'deadline' ? 'Vence' : yearly ? 'Fecha' : 'Cuándo'}
              </span>
              <input className="input" type="date" value={draft.startDate} onChange={(e) => changeStart(e.target.value)} aria-label="Fecha" required />
              {!draft.allDay && !yearly && (
                <input className="input" type="time" value={draft.startTime} onChange={(e) => e.target.value && changeStart(draft.startDate, e.target.value)} aria-label="Hora" />
              )}
            </div>
            {draft.kind === 'event' && (
              <div className="ev-dates">
                <span className="ev-dates__label">Termina</span>
                <input
                  className="input"
                  type="date"
                  value={draft.endDate}
                  min={draft.startDate}
                  onChange={(e) => e.target.value && set({ endDate: e.target.value < draft.startDate ? draft.startDate : e.target.value })}
                  aria-label="Fecha de fin"
                />
                {!draft.allDay && (
                  <input className="input" type="time" value={draft.endTime} onChange={(e) => e.target.value && set({ endTime: e.target.value })} aria-label="Hora de fin" />
                )}
              </div>
            )}
            {yearly && (
              <label className="checkbox-row">
                <input type="checkbox" checked={draft.knowYear} onChange={(e) => set({ knowYear: e.target.checked })} />
                {draft.kind === 'birthday' ? 'Sé el año de nacimiento (mostrar la edad)' : 'Sé el año (contar los años)'}
                {draft.knowYear && <strong>&nbsp;{draft.startDate.slice(0, 4)}</strong>}
              </label>
            )}
          </section>

          <section className="ev-section">
            <h3 className="ev-section__title">
              <Repeat size={15} /> Repetir
            </h3>
            {yearly ? (
              <p className="muted small">Se repite cada año el mismo día.</p>
            ) : (
              <RepeatEditor draft={draft} setRecurrence={(recurrence) => set({ recurrence })} />
            )}
          </section>

          <section className="ev-section">
            <h3 className="ev-section__title">
              <Bell size={15} /> Avisos
            </h3>
            <RemindersEditor draft={draft} onChange={(reminders) => set({ reminders })} />
            {draft.reminders.length > 0 && <PushHint />}
          </section>

          <section className="ev-section">
            <h3 className="ev-section__title">
              <Tag size={15} /> Etiquetas y color
            </h3>
            <div className="ev-labels">
              {labels.map((label) => {
                const on = draft.labelIds.includes(label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    className={`ev-label ${on ? 'is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => set({ labelIds: on ? draft.labelIds.filter((id) => id !== label.id) : labels.filter((l) => l.id === label.id || draft.labelIds.includes(l.id)).map((l) => l.id) })}
                  >
                    <LabelChip label={label} size="md" />
                  </button>
                );
              })}
              <button type="button" className="btn btn--sm btn--subtle" onClick={openPop('label')}>
                <Plus size={14} /> Etiqueta
              </button>
              <button type="button" className="btn btn--sm btn--subtle" onClick={openPop('color')}>
                <Palette size={14} /> Color
                <span className="color-dot" style={color ? { background: color.bg } : undefined} />
              </button>
            </div>
          </section>

          {(draft.kind === 'event' || draft.kind === 'reminder') && (
            <section className="ev-section ev-inline">
              <MapPin size={16} className="muted" />
              <input className="input" value={draft.location} placeholder="Ubicación (opcional)" onChange={(e) => set({ location: e.target.value })} aria-label="Ubicación" />
            </section>
          )}

          <section className="ev-section ev-inline ev-inline--top">
            <StickyNote size={16} className="muted" />
            <AutoTextarea className="input ev-notes" value={draft.notes} placeholder="Notas" onChange={(e) => set({ notes: e.target.value })} aria-label="Notas" />
          </section>
        </div>

        <div className="event-modal__foot">
          {!isNew && (
            <>
              <button type="button" className="btn btn--subtle btn--danger-text" onClick={() => void remove()}>
                <Trash2 size={15} /> Eliminar
              </button>
              <button
                type="button"
                className="btn btn--subtle"
                onClick={() => {
                  const id = C.duplicateEvent(event.id);
                  if (id) {
                    undoToast('Evento duplicado');
                    onClose();
                  }
                }}
              >
                <Copy size={15} /> Duplicar
              </button>
            </>
          )}
          <span className="push-right" />
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary">
            {isNew ? 'Crear' : 'Guardar'}
          </button>
        </div>
      </form>

      {pop.key && pop.anchor && (
        <Popover
          anchor={pop.anchor}
          onClose={() => setPop({ key: null, anchor: null })}
          title={pop.key === 'icon' ? 'Icono' : pop.key === 'color' ? 'Color' : 'Nueva etiqueta'}
        >
          {pop.key === 'icon' && (
            <IconPicker
              value={draft.icon}
              onChange={(value) => {
                set({ icon: value });
                setPop({ key: null, anchor: null });
              }}
            />
          )}
          {pop.key === 'color' && (
            <SwatchGrid
              value={draft.color}
              rows={[1, 2]}
              size="sm"
              noneLabel="Automático (etiqueta o tipo)"
              onChange={(value) => {
                set({ color: value });
                setPop({ key: null, anchor: null });
              }}
            />
          )}
          {pop.key === 'label' && (
            <LabelEditor
              onCancel={() => setPop({ key: null, anchor: null })}
              onSave={(value) => {
                const id = C.createEventLabel(value);
                set({ labelIds: [...draft.labelIds, id] });
                setPop({ key: null, anchor: null });
              }}
            />
          )}
        </Popover>
      )}
    </Modal>
  );
}

/** Hosts the editor: new drafts (UI state) and existing events opened through the route. */
export function EventEditorHost({ eventId, occ }: { eventId: string | null; occ: string | null }) {
  const draft = useUI((s) => s.eventDraft);
  const event = useStore((s) => (eventId ? s.data.events[eventId] : undefined));
  if (draft) {
    return <EventEditor key={draft.id} event={draft} occ={null} isNew onClose={() => useUI.setState({ eventDraft: null })} />;
  }
  if (!eventId) return null;
  if (!event) {
    return (
      <Modal onClose={closeEvent} className="modal--small">
        <div className="modal__header">
          <h2>Evento no encontrado</h2>
          <button type="button" className="icon-btn" onClick={closeEvent} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <p className="muted">Puede que se haya eliminado. Si fue un error, pulsa Ctrl+Z.</p>
      </Modal>
    );
  }
  const occurrence = occ ?? event.start.slice(0, 10);
  return <EventEditor key={`${event.id}:${occurrence}`} event={event} occ={occurrence} isNew={false} onClose={closeEvent} />;
}
