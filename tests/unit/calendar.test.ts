import { beforeEach, describe, expect, it } from 'vitest';
import {
  agenda, collectReminders, dayKeyAt, occurrenceIndex, occurrenceRange, occurrences, wallToUtc, whenText, yearsAt,
} from '../../shared/calendar.js';
import type { AppData, CalendarEvent, Recurrence } from '../../src/types';
import * as S from '../../src/store/store';
import * as C from '../../src/store/calendar';
import { emptyData, makeCard, makeEvent, sampleData } from '../../src/store/factories';
import { normalizeData } from '../../src/store/normalize';

const rule = (r: Partial<Recurrence> & Pick<Recurrence, 'freq'>): Recurrence => ({
  interval: 1, byWeekday: [], monthlyBy: 'day', until: null, count: null, ...r,
});

const ev = (start: string, recurrence: Recurrence | null = null, extra: Partial<CalendarEvent> = {}) =>
  makeEvent('event', start, { recurrence, reminders: [], ...extra });

describe('recurrence', () => {
  it('uses the last day of shorter months for monthly events on the 31st', () => {
    expect(occurrences(ev('2026-01-31', rule({ freq: 'monthly' })), '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    ]);
  });

  it('repeats on the nth and last weekday of the month', () => {
    expect(occurrences(ev('2026-09-08', rule({ freq: 'monthly', monthlyBy: 'weekday' })), '2026-09-01', '2026-11-30')).toEqual([
      '2026-09-08', '2026-10-13', '2026-11-10',
    ]);
    expect(occurrences(ev('2026-09-25', rule({ freq: 'monthly', monthlyBy: 'last-weekday' })), '2026-09-01', '2026-11-30')).toEqual([
      '2026-09-25', '2026-10-30', '2026-11-27',
    ]);
  });

  it('handles 29 February birthdays and computes ages', () => {
    const birthday = makeEvent('birthday', '2000-02-29', { sinceYear: 2000 });
    expect(occurrences(birthday, '2026-01-01', '2028-12-31')).toEqual(['2026-02-28', '2027-02-28', '2028-02-29']);
    expect(yearsAt(birthday, '2026-02-28')).toBe(26);
  });

  it('supports weekly rules with several days, intervals and a count', () => {
    const series = ev('2026-09-28', rule({ freq: 'weekly', byWeekday: [1, 3, 5], interval: 2, count: 5 }));
    expect(occurrences(series, '2026-01-01', '2027-12-31')).toEqual([
      '2026-09-28', '2026-09-30', '2026-10-02', '2026-10-12', '2026-10-14',
    ]);
    expect(occurrenceIndex(series, '2026-10-12')).toBe(3);
  });

  it('skips removed occurrences, respects until and finds old series quickly', () => {
    const daily = ev('2000-01-01', rule({ freq: 'daily', until: '2026-09-29' }), { exdates: ['2026-09-28'] });
    expect(occurrences(daily, '2026-09-26', '2026-10-05')).toEqual(['2026-09-26', '2026-09-27', '2026-09-29']);
  });

  it('includes multi-day occurrences that started before the range', () => {
    const trip = ev('2026-09-27T10:00', null, { end: '2026-09-30T12:00' });
    expect(occurrences(trip, '2026-09-29', '2026-10-05')).toEqual(['2026-09-27']);
    expect(occurrenceRange(ev('2026-09-01T10:00', rule({ freq: 'weekly' }), { end: '2026-09-02T09:00' }), '2026-09-15')).toEqual({
      start: '2026-09-15T10:00',
      end: '2026-09-16T09:00',
    });
  });
});

describe('time zones and texts', () => {
  it('converts wall-clock times across DST changes', () => {
    expect(new Date(wallToUtc('2026-10-24', '09:00', 'Europe/Madrid')).toISOString()).toBe('2026-10-24T07:00:00.000Z');
    expect(new Date(wallToUtc('2026-10-25', '09:00', 'Europe/Madrid')).toISOString()).toBe('2026-10-25T08:00:00.000Z');
    expect(dayKeyAt(Date.UTC(2026, 8, 28, 23, 30), 'Europe/Madrid')).toBe('2026-09-29');
  });

  it('describes when something happens in Spanish', () => {
    expect(whenText('2026-09-28', '10:00', '2026-09-28')).toBe('Hoy a las 10:00');
    expect(whenText('2026-09-29', '01:30', '2026-09-28')).toBe('Mañana a la 1:30');
    expect(whenText('2026-10-02', '', '2026-09-28')).toBe('El viernes');
    expect(whenText('2026-12-02', '', '2026-09-28')).toBe('El 2 de diciembre');
  });
});

function dataWith(events: CalendarEvent[], extra: Partial<AppData> = {}): AppData {
  const data = { ...emptyData(), ...extra };
  data.settings = { ...data.settings, timeZone: 'Europe/Madrid', allDayTime: '09:00' };
  for (const e of events) data.events[e.id] = e;
  return data;
}

describe('reminders', () => {
  it('collects event reminders in the window, skipping completed occurrences', () => {
    const meeting = ev('2026-09-28T10:00', rule({ freq: 'daily' }), { title: 'Reunión', reminders: [15] });
    const bill = makeEvent('deadline', '2026-09-29', { title: 'Pagar', reminders: [0], done: ['2026-09-29'] });
    const data = dataWith([meeting, bill]);
    const from = Date.UTC(2026, 8, 28, 0, 0);
    const to = Date.UTC(2026, 8, 30, 0, 0);
    const found = collectReminders(data, from, to);
    expect(found.map((r) => r.id)).toEqual([`ev:${meeting.id}:2026-09-28:15`, `ev:${meeting.id}:2026-09-29:15`]);
    expect(new Date(found[0].at).toISOString()).toBe('2026-09-28T07:45:00.000Z');
    expect(found[0].body).toBe('Hoy a las 10:00');
    expect(found[0].url).toBe(`#/calendar?e=${meeting.id}&o=2026-09-28`);
  });

  it('announces birthdays with the age and cards when enabled', () => {
    const birthday = makeEvent('birthday', '1990-09-29', { title: 'Ana', sinceYear: 1990, reminders: [1440] });
    const base = sampleData();
    const data = dataWith([birthday], { boards: base.boards, lists: base.lists, cards: base.cards, boardOrder: base.boardOrder });
    const card = Object.values(data.cards).find((c) => c.kind === 'card')!;
    data.cards[card.id] = { ...card, due: '2026-09-28T18:00', dueDone: false };
    data.settings.cardReminders = [60];
    const found = collectReminders(data, Date.UTC(2026, 8, 28, 0, 0), Date.UTC(2026, 8, 28, 23, 0));
    const texts = found.map((r) => `${r.title} | ${r.body}`);
    expect(texts).toContain('🎂 Ana | Mañana: cumple 36 años');
    expect(texts.some((t) => t.startsWith('📋') && t.includes('Vence: hoy a las 18:00'))).toBe(true);
  });
});

describe('agenda', () => {
  it('lists overdue deadlines first, then upcoming items by day and time', () => {
    const late = makeEvent('deadline', '2026-09-20', { title: 'Informe' });
    const doneLate = makeEvent('deadline', '2026-09-21', { title: 'Hecho', done: ['2026-09-21'] });
    const lunch = ev('2026-09-29T14:00', null, { title: 'Comida' });
    const allDay = ev('2026-09-29', null, { title: 'Vacaciones', color: 'green' });
    const data = dataWith([late, doneLate, lunch, allDay]);
    const items = agenda(data, '2026-09-28', 7, { now: Date.UTC(2026, 8, 28, 10) });
    expect(items.map((i) => i.title)).toEqual(['Informe', 'Vacaciones', 'Comida']);
    expect(items[0].overdue).toBe(true);
    expect(items[1].color).toBe('#4BCE97');
    // The widget draws the app's icons: the item's own or its kind's.
    expect(items.map((i) => i.icon)).toEqual(['lucide:Flag', 'lucide:Calendar', 'lucide:Calendar']);
  });
});

describe('calendar store', () => {
  beforeEach(() => S.loadData(emptyData()));

  const weekly = () =>
    C.createEvent(makeEvent('event', '2026-09-07T10:00', { title: 'Yoga', end: '2026-09-07T11:00', recurrence: rule({ freq: 'weekly' }) }));
  const days = (id: string, from = '2026-09-01', to = '2026-10-31') => occurrences(S.getData().events[id], from, to);

  it('edits a single occurrence as a separate event', () => {
    const id = weekly();
    const single = C.editOccurrence(id, '2026-09-14', { title: 'Yoga especial', start: '2026-09-15T18:00', end: '2026-09-15T19:00' }, 'one');
    const data = S.getData();
    expect(days(id)).not.toContain('2026-09-14');
    expect(data.events[single]).toMatchObject({ title: 'Yoga especial', start: '2026-09-15T18:00', recurrence: null });
    expect(data.events[id].title).toBe('Yoga');
    S.undo();
    expect(S.getData().events[single]).toBeUndefined();
    expect(days(id)).toContain('2026-09-14');
  });

  it('splits the series for "this and the following"', () => {
    const id = weekly();
    const next = C.editOccurrence(id, '2026-09-21', { title: 'Pilates' }, 'following');
    expect(days(id)).toEqual(['2026-09-07', '2026-09-14']);
    expect(days(next).slice(0, 2)).toEqual(['2026-09-21', '2026-09-28']);
    expect(S.getData().events[next].title).toBe('Pilates');
  });

  it('moves the whole series when dates change for "all"', () => {
    const id = weekly();
    C.moveOccurrence(id, '2026-09-14', '2026-09-16', 'all');
    const event = S.getData().events[id];
    expect(event.start).toBe('2026-09-09T10:00');
    expect(event.end).toBe('2026-09-09T11:00');
    expect(days(id).slice(0, 2)).toEqual(['2026-09-09', '2026-09-16']);
  });

  it('deletes one, the following or all occurrences', () => {
    const id = weekly();
    C.deleteOccurrence(id, '2026-09-14', 'one');
    expect(days(id).slice(0, 3)).toEqual(['2026-09-07', '2026-09-21', '2026-09-28']);
    C.deleteOccurrence(id, '2026-09-28', 'following');
    expect(days(id)).toEqual(['2026-09-07', '2026-09-21']);
    C.deleteOccurrence(id, '2026-09-21', 'all');
    expect(S.getData().events[id]).toBeUndefined();
  });

  it('marks deadline occurrences as done and cleans labels on delete', () => {
    const labelId = C.createEventLabel({ name: 'Casa', color: 'green', icon: null });
    const id = C.createEvent(makeEvent('deadline', '2026-09-30', { labelIds: [labelId] }));
    C.toggleOccurrenceDone(id, '2026-09-30');
    expect(S.getData().events[id].done).toEqual(['2026-09-30']);
    C.deleteEventLabel(labelId);
    expect(S.getData().events[id].labelIds).toEqual([]);
  });
});

describe('normalize (calendar)', () => {
  it('keeps events and settings, repairing invalid values', () => {
    const data = normalizeData({
      boards: {}, lists: {}, cards: {},
      eventLabels: [{ id: 'l1', name: 'Casa', color: 'green', icon: null }],
      events: {
        a: { id: 'a', kind: 'birthday', title: 'Ana', start: '1990-05-12', labelIds: ['l1', 'x'], reminders: [0, -5, 0, 60],
          recurrence: { freq: 'yearly', interval: 0 }, sinceYear: 1990 },
        b: { id: 'b', start: 'mañana' },
        c: { id: 'c', start: '2026-09-28T10:00', end: '2026-09-27T09:00', kind: 'nope' },
      },
      settings: { timeZone: 'Europe/Madrid', allDayTime: 'x', cardReminders: [30] },
    });
    expect(Object.keys(data.events)).toEqual(['a', 'c']);
    expect(data.events.a).toMatchObject({ labelIds: ['l1'], reminders: [0, 60], recurrence: { freq: 'yearly', interval: 1 } });
    expect(data.events.c).toMatchObject({ kind: 'event', end: null });
    expect(data.settings).toEqual({ timeZone: 'Europe/Madrid', allDayTime: '09:00', cardReminders: [30], showCards: true });
  });

  it('gives old files default calendar labels', () => {
    const data = normalizeData({ boards: {}, lists: {}, cards: {} });
    expect(data.eventLabels.length).toBeGreaterThan(0);
    expect(data.events).toEqual({});
  });

  it('ignores cards in archived lists for reminders', () => {
    const data = sampleData();
    const listId = Object.keys(data.lists)[0];
    const card = makeCard(data.lists[listId].boardId, listId, 'X', { due: '2026-09-28T12:00' });
    data.cards[card.id] = card;
    data.lists[listId].archived = true;
    data.settings = { ...data.settings, timeZone: 'UTC', cardReminders: [0] };
    expect(collectReminders(data, Date.UTC(2026, 8, 28), Date.UTC(2026, 8, 29)).some((r) => r.id.includes(card.id))).toBe(false);
  });
});
