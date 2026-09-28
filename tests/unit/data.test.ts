import { describe, expect, it } from 'vitest';
import { normalizeData } from '../../src/store/normalize';
import { sampleData } from '../../src/store/factories';
import { convertTrello, isTrelloExport } from '../../src/lib/trello';
import { cardMatches, EMPTY_FILTER } from '../../src/lib/filter';
import { visibleToFullIndex } from '../../src/lib/order';
import { dueStatus, formatDate, monthMatrix, nextWeekdayKey } from '../../src/lib/dates';
import { makeCard } from '../../src/store/factories';

describe('normalizeData', () => {
  it('keeps valid sample data intact', () => {
    const data = sampleData();
    const normalized = normalizeData(JSON.parse(JSON.stringify(data)));
    expect(normalized.boardOrder).toEqual(data.boardOrder);
    expect(Object.keys(normalized.cards)).toHaveLength(Object.keys(data.cards).length);
  });

  it('repairs broken references', () => {
    const data = sampleData();
    const raw = JSON.parse(JSON.stringify(data));
    const boardId = raw.boardOrder[0];
    const listId = raw.boards[boardId].listIds[0];
    raw.lists[listId].cardIds.push('ghost');
    raw.boards[boardId].listIds.push('missing');
    const someCard = raw.lists[listId].cardIds[0];
    raw.cards[someCard].labelIds.push('nope');
    delete raw.cards[someCard].checklists;
    const fixed = normalizeData(raw);
    expect(fixed.lists[listId].cardIds).not.toContain('ghost');
    expect(fixed.boards[boardId].listIds).not.toContain('missing');
    expect(fixed.cards[someCard].labelIds).not.toContain('nope');
    expect(fixed.cards[someCard].checklists).toEqual([]);
  });

  it('returns empty data for garbage', () => {
    expect(normalizeData(null).boardOrder).toEqual([]);
    expect(normalizeData('x').boardOrder).toEqual([]);
  });
});

describe('Trello import', () => {
  const trello = {
    id: 'b1',
    name: 'Mi Trello',
    prefs: { background: 'green' },
    labels: [
      { id: 'l1', name: 'Bug', color: 'red_dark' },
      { id: 'l2', name: '', color: 'sky' },
    ],
    lists: [
      { id: 'L2', name: 'Doing', pos: 2, closed: false },
      { id: 'L1', name: 'Todo', pos: 1, closed: false },
      { id: 'L3', name: 'Old', pos: 3, closed: true },
    ],
    cards: [
      { id: 'c2', name: 'Second', idList: 'L1', pos: 2, idLabels: ['l1'], desc: 'hola', closed: false, cover: { color: 'purple', size: 'full' },
        customFieldItems: [{ idCustomField: 'cf1', value: { number: '3' } }, { idCustomField: 'cf2', idValue: 'op1' }] },
      { id: 'c1', name: 'First', idList: 'L1', pos: 1, idLabels: [], closed: false, due: '2030-05-01T10:00:00.000Z', dueComplete: true },
      { id: 'c3', name: 'Archived', idList: 'L2', pos: 1, idLabels: [], closed: true },
    ],
    checklists: [
      { id: 'k1', idCard: 'c1', name: 'Pasos', pos: 1, checkItems: [
        { id: 'i2', name: 'dos', pos: 2, state: 'incomplete' },
        { id: 'i1', name: 'uno', pos: 1, state: 'complete' },
      ] },
    ],
    customFields: [
      { id: 'cf1', name: 'Puntos', type: 'number' },
      { id: 'cf2', name: 'Estado', type: 'list', options: [{ id: 'op1', value: { text: 'Rojo' }, color: 'red', pos: 1 }] },
    ],
    actions: [{ type: 'commentCard', date: '2030-01-01T00:00:00.000Z', data: { text: 'Un comentario', card: { id: 'c2' } } }],
  };

  it('detects Trello exports', () => {
    expect(isTrelloExport(trello)).toBe(true);
    expect(isTrelloExport({ boards: {} })).toBe(false);
  });

  it('converts lists, cards, labels, checklists and comments', () => {
    const { board, lists, cards } = convertTrello(trello);
    expect(board.title).toBe('Mi Trello');
    expect(board.background).toBe('green');
    expect(board.labels.map((l) => l.color)).toEqual(['red_bold', 'sky']);
    const titles = board.listIds.map((id) => lists.find((l) => l.id === id)!.title);
    expect(titles).toEqual(['Todo', 'Doing']);
    const todo = lists.find((l) => l.title === 'Todo')!;
    const ordered = todo.cardIds.map((id) => cards.find((c) => c.id === id)!.title);
    expect(ordered).toEqual(['First', 'Second']);
    const first = cards.find((c) => c.title === 'First')!;
    expect(first.dueDone).toBe(true);
    expect(first.due).toMatch(/^2030-05-01T\d\d:\d\d$/);
    expect(first.checklists[0].items.map((i) => [i.text, i.done])).toEqual([['uno', true], ['dos', false]]);
    const second = cards.find((c) => c.title === 'Second')!;
    expect(second.cover).toEqual({ color: 'purple', image: null, size: 'full' });
    expect(second.comments[0].text).toBe('Un comentario');
    expect(second.labelIds).toEqual([board.labels[0].id]);
    const [points, state] = board.fields;
    expect(points.type).toBe('number');
    expect(state.type).toBe('select');
    expect(second.fields[points.id]).toBe(3);
    expect(second.fields[state.id]).toBe(state.options[0].id);
    const archived = cards.find((c) => c.title === 'Archived')!;
    expect(archived.archived).toBe(true);
    expect(lists.find((l) => l.title === 'Doing')!.cardIds).not.toContain(archived.id);
  });
});

describe('filters', () => {
  const card = makeCard('b', 'l', 'Comprar pan', { labelIds: ['x'], priority: 'high', description: 'Panadería' });
  const names = new Map([['x', 'Casa']]);

  it('matches text in title, description and label names (accent-insensitive)', () => {
    expect(cardMatches(card, { ...EMPTY_FILTER, text: 'panaderia' }, names)).toBe(true);
    expect(cardMatches(card, { ...EMPTY_FILTER, text: 'casa' }, names)).toBe(true);
    expect(cardMatches(card, { ...EMPTY_FILTER, text: 'leche' }, names)).toBe(false);
  });

  it('matches labels any/all and priorities', () => {
    expect(cardMatches(card, { ...EMPTY_FILTER, labelIds: ['x', 'y'], labelMode: 'any' })).toBe(true);
    expect(cardMatches(card, { ...EMPTY_FILTER, labelIds: ['x', 'y'], labelMode: 'all' })).toBe(false);
    expect(cardMatches(card, { ...EMPTY_FILTER, priorities: ['high'] })).toBe(true);
    expect(cardMatches(card, { ...EMPTY_FILTER, priorities: ['none'] })).toBe(false);
  });

  it('filters by custom field values', () => {
    const withValue = makeCard('b', 'l', 'x', { fields: { f1: 'opt-a', f2: true } });
    const empty = makeCard('b', 'l', 'y');
    const byOption = { ...EMPTY_FILTER, fields: { f1: ['opt-a'] } };
    expect(cardMatches(withValue, byOption)).toBe(true);
    expect(cardMatches(empty, byOption)).toBe(false);
    const noValue = { ...EMPTY_FILTER, fields: { f1: ['none'] } };
    expect(cardMatches(empty, noValue)).toBe(true);
    expect(cardMatches(withValue, { ...EMPTY_FILTER, fields: { f2: ['true'] } })).toBe(true);
  });

  it('filters by due status', () => {
    const now = new Date(2030, 0, 10, 12);
    const overdue = makeCard('b', 'l', 'x', { due: '2030-01-09' });
    const soon = makeCard('b', 'l', 'x', { due: '2030-01-11T08:00' });
    expect(cardMatches(overdue, { ...EMPTY_FILTER, due: ['overdue'] }, undefined, now)).toBe(true);
    expect(cardMatches(soon, { ...EMPTY_FILTER, due: ['soon'] }, undefined, now)).toBe(true);
    expect(cardMatches(soon, { ...EMPTY_FILTER, due: ['none'] }, undefined, now)).toBe(false);
  });
});

describe('order helpers', () => {
  it('maps visible positions to full positions', () => {
    const full = ['a', 'b', 'c', 'd'];
    const visible = ['a', 'c'];
    expect(visibleToFullIndex(full, visible, 0)).toBe(0);
    expect(visibleToFullIndex(full, visible, 1)).toBe(2);
    expect(visibleToFullIndex(full, visible, 2)).toBe(3);
    expect(visibleToFullIndex(full, [], 0)).toBe(4);
  });
});

describe('dates', () => {
  it('computes due status', () => {
    const now = new Date(2030, 0, 10, 12);
    expect(dueStatus('2030-01-10', false, now)).toBe('soon');
    expect(dueStatus('2030-01-09', false, now)).toBe('overdue');
    expect(dueStatus('2030-01-20', false, now)).toBe('normal');
    expect(dueStatus('2030-01-09', true, now)).toBe('done');
    expect(dueStatus(null, false, now)).toBeNull();
  });

  it('formats dates in Spanish', () => {
    expect(formatDate('2030-03-05', { withYear: true })).toBe('5 mar 2030');
    expect(formatDate('2030-03-05T09:30', { withYear: true })).toBe('5 mar 2030, 09:30');
  });

  it('builds a Monday-first month grid', () => {
    const weeks = monthMatrix(2030, 0);
    expect(weeks).toHaveLength(6);
    expect(weeks[0][0].getDay()).toBe(1);
  });

  it('finds the next weekday', () => {
    const friday = new Date(2030, 0, 11);
    expect(nextWeekdayKey(1, friday)).toBe('2030-01-14');
    const monday = new Date(2030, 0, 14);
    expect(nextWeekdayKey(1, monday)).toBe('2030-01-21');
  });
});
