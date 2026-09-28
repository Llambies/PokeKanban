import { current, original, type Draft } from 'immer';
import type { AppData, AppSettings, CalendarEvent, Label } from '../types';
import { uid } from '../lib/id';
import { moveInArray } from '../lib/order';
import { dayToKey, keyToDay, occurrenceIndex, occurrenceRange } from '../../shared/calendar.js';
import { getData, mutate } from './store';

export type EventPatch = Partial<Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>>;

/** Which occurrences of a repeating event a change applies to. */
export type OccurrenceScope = 'one' | 'following' | 'all';

type D = Draft<AppData>;

function withEvent(d: D, id: string, fn: (event: Draft<CalendarEvent>) => void): void {
  const event = d.events[id];
  if (!event) return;
  fn(event);
  if (current(event) !== original(event)) event.updatedAt = Date.now();
}

const shiftKey = (key: string, days: number) => dayToKey(keyToDay(key) + days);
const shiftValue = (value: string, days: number) => shiftKey(value.slice(0, 10), days) + value.slice(10);
const dayBefore = (key: string) => shiftKey(key, -1);

export function createEvent(event: CalendarEvent): string {
  mutate((d) => {
    d.events[event.id] = event;
  });
  return event.id;
}

export function updateEvent(id: string, patch: EventPatch): void {
  mutate((d) => withEvent(d, id, (event) => Object.assign(event, patch)));
}

export function deleteEvent(id: string): void {
  mutate((d) => {
    delete d.events[id];
  });
}

export function duplicateEvent(id: string): string | null {
  const src = getData().events[id];
  if (!src) return null;
  const now = Date.now();
  const copy: CalendarEvent = structuredClone({ ...src, id: uid(), title: `${src.title} (copia)`, createdAt: now, updatedAt: now });
  copy.done = [];
  return createEvent(copy);
}

export function setOccurrenceDone(id: string, occKey: string, done: boolean): void {
  mutate((d) =>
    withEvent(d, id, (event) => {
      const has = event.done.includes(occKey);
      if (done && !has) event.done.push(occKey);
      if (!done && has) event.done = event.done.filter((k) => k !== occKey);
    }),
  );
}

export function toggleOccurrenceDone(id: string, occKey: string): void {
  const event = getData().events[id];
  if (event) setOccurrenceDone(id, occKey, !event.done.includes(occKey));
}

/** Removes one occurrence, it and the following ones, or the whole event. */
export function deleteOccurrence(id: string, occKey: string, scope: OccurrenceScope): void {
  const event = getData().events[id];
  if (!event) return;
  if (!event.recurrence || scope === 'all' || (scope === 'following' && occurrenceIndex(event, occKey) <= 0)) {
    deleteEvent(id);
    return;
  }
  mutate((d) =>
    withEvent(d, id, (ev) => {
      if (scope === 'one') {
        if (!ev.exdates.includes(occKey)) ev.exdates.push(occKey);
        ev.done = ev.done.filter((k) => k !== occKey);
        return;
      }
      ev.recurrence!.until = dayBefore(occKey);
      ev.exdates = ev.exdates.filter((k) => k < occKey);
      ev.done = ev.done.filter((k) => k < occKey);
    }),
  );
}

/**
 * Applies an edit made on one occurrence (`patch.start` / `patch.end` are that occurrence's new
 * dates). Returns the id of the event that holds the edited occurrence afterwards.
 */
export function editOccurrence(id: string, occKey: string, patch: EventPatch, scope: OccurrenceScope): string {
  const event = getData().events[id];
  if (!event) return id;
  const occ = occurrenceRange(event, occKey);
  const newStart = patch.start ?? occ.start;
  const newEnd = patch.end !== undefined ? patch.end : occ.end;
  const delta = keyToDay(newStart) - keyToDay(occKey);
  const index = event.recurrence ? occurrenceIndex(event, occKey) : 0;

  if (!event.recurrence || scope === 'all' || (scope === 'following' && index <= 0)) {
    mutate((d) =>
      withEvent(d, id, (ev) => {
        Object.assign(ev, patch);
        if (!event.recurrence) return;
        if (!ev.recurrence) {
          // It no longer repeats: it stays on the occurrence that was being edited.
          ev.start = newStart;
          ev.end = newEnd;
          ev.exdates = [];
          ev.done = event.done.includes(occKey) ? [newStart.slice(0, 10)] : [];
          return;
        }
        // Dates were edited on one occurrence: move the whole series by the same amount.
        ev.start = shiftKey(event.start, delta) + newStart.slice(10);
        ev.end = newEnd ? shiftKey(ev.start, keyToDay(newEnd) - keyToDay(newStart)) + newEnd.slice(10) : null;
        if (delta !== 0) {
          ev.exdates = ev.exdates.map((k) => shiftKey(k, delta));
          ev.done = ev.done.map((k) => shiftKey(k, delta));
          if (ev.recurrence?.until) ev.recurrence.until = shiftKey(ev.recurrence.until, delta);
        }
      }),
    );
    return id;
  }

  const now = Date.now();
  if (scope === 'one') {
    const single: CalendarEvent = {
      ...structuredClone(event),
      ...patch,
      id: uid(),
      start: newStart,
      end: newEnd,
      recurrence: null,
      exdates: [],
      done: event.done.includes(occKey) ? [newStart.slice(0, 10)] : [],
      createdAt: now,
      updatedAt: now,
    };
    mutate((d) => {
      d.events[single.id] = single;
      withEvent(d, id, (ev) => {
        if (!ev.exdates.includes(occKey)) ev.exdates.push(occKey);
        ev.done = ev.done.filter((k) => k !== occKey);
      });
    });
    return single.id;
  }

  // "This and the following": end the series the day before and start a new one here.
  const rule = patch.recurrence !== undefined ? patch.recurrence : event.recurrence;
  const next: CalendarEvent = {
    ...structuredClone(event),
    ...patch,
    id: uid(),
    start: newStart,
    end: newEnd,
    recurrence: rule && event.recurrence.count && patch.recurrence === undefined
      ? { ...rule, count: Math.max(1, event.recurrence.count - index) }
      : rule,
    exdates: event.exdates.filter((k) => k >= occKey).map((k) => shiftKey(k, delta)),
    done: event.done.filter((k) => k >= occKey).map((k) => shiftKey(k, delta)),
    createdAt: now,
    updatedAt: now,
  };
  mutate((d) => {
    d.events[next.id] = next;
    withEvent(d, id, (ev) => {
      ev.recurrence!.until = dayBefore(occKey);
      ev.exdates = ev.exdates.filter((k) => k < occKey);
      ev.done = ev.done.filter((k) => k < occKey);
    });
  });
  return next.id;
}

/** Moves one occurrence (or its series) to another day, keeping times and duration. */
export function moveOccurrence(id: string, occKey: string, toKey: string, scope: OccurrenceScope): void {
  const event = getData().events[id];
  if (!event || toKey === occKey) return;
  const delta = keyToDay(toKey) - keyToDay(occKey);
  const occ = occurrenceRange(event, occKey);
  editOccurrence(id, occKey, { start: shiftValue(occ.start, delta), end: occ.end ? shiftValue(occ.end, delta) : null }, scope);
}

/* ----------------------------------------------------------------- labels */

export function createEventLabel(label: Omit<Label, 'id'>): string {
  const id = uid();
  mutate((d) => {
    d.eventLabels.push({ ...label, id });
  });
  return id;
}

export function updateEventLabel(labelId: string, patch: Partial<Omit<Label, 'id'>>): void {
  mutate((d) => {
    const label = d.eventLabels.find((l) => l.id === labelId);
    if (label) Object.assign(label, patch);
  });
}

export function deleteEventLabel(labelId: string): void {
  mutate((d) => {
    d.eventLabels = d.eventLabels.filter((l) => l.id !== labelId);
    for (const event of Object.values(d.events)) {
      if (event.labelIds.includes(labelId)) event.labelIds = event.labelIds.filter((id) => id !== labelId);
    }
  });
}

export function moveEventLabel(from: number, to: number): void {
  mutate((d) => moveInArray(d.eventLabels, from, to));
}

export function toggleEventLabel(eventId: string, labelId: string): void {
  mutate((d) =>
    withEvent(d, eventId, (event) => {
      if (event.labelIds.includes(labelId)) event.labelIds = event.labelIds.filter((id) => id !== labelId);
      else {
        const order = d.eventLabels.map((l) => l.id);
        event.labelIds = [...event.labelIds, labelId].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      }
    }),
  );
}

/* --------------------------------------------------------------- settings */

export function updateSettings(patch: Partial<AppSettings>): void {
  mutate((d) => {
    Object.assign(d.settings, patch);
  });
}
