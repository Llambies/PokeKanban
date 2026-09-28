import { beforeEach, describe, expect, it } from 'vitest';
import * as S from '../../src/store/store';
import { emptyData } from '../../src/store/factories';

function board() {
  const boardId = S.createBoard('Test', 'ocean', true);
  const data = S.getData();
  const [todo, doing, done] = data.boards[boardId].listIds;
  return { boardId, todo, doing, done };
}

describe('store', () => {
  beforeEach(() => S.loadData(emptyData()));

  it('creates boards with default lists and labels', () => {
    const { boardId } = board();
    const b = S.getData().boards[boardId];
    expect(b.listIds).toHaveLength(3);
    expect(b.labels.length).toBeGreaterThan(0);
  });

  it('moves cards between lists and supports undo/redo', () => {
    const { todo, doing } = board();
    const a = S.createCard(todo, 'A');
    const b = S.createCard(todo, 'B');
    S.moveCard(a, doing, 0);
    let data = S.getData();
    expect(data.lists[todo].cardIds).toEqual([b]);
    expect(data.lists[doing].cardIds).toEqual([a]);
    expect(data.cards[a].listId).toBe(doing);

    S.undo();
    data = S.getData();
    expect(data.lists[todo].cardIds).toEqual([a, b]);
    S.redo();
    expect(S.getData().lists[doing].cardIds).toEqual([a]);
  });

  it('reorders within a list', () => {
    const { todo } = board();
    const a = S.createCard(todo, 'A');
    const b = S.createCard(todo, 'B');
    const c = S.createCard(todo, 'C');
    S.moveCard(a, todo, 2);
    expect(S.getData().lists[todo].cardIds).toEqual([b, c, a]);
  });

  it('archives and restores cards', () => {
    const { todo } = board();
    const a = S.createCard(todo, 'A');
    S.archiveCard(a);
    expect(S.getData().lists[todo].cardIds).toEqual([]);
    expect(S.getData().cards[a].archived).toBe(true);
    S.restoreCard(a);
    expect(S.getData().lists[todo].cardIds).toEqual([a]);
  });

  it('remaps labels when moving a card to another board', () => {
    const one = board();
    const two = board();
    const label = S.getData().boards[one.boardId].labels[0];
    const card = S.createCard(one.todo, 'Viajera');
    S.toggleLabel(card, label.id);
    S.moveCard(card, two.todo, 0);
    const moved = S.getData().cards[card];
    const target = S.getData().boards[two.boardId].labels.find((l) => l.id === moved.labelIds[0]);
    expect(moved.boardId).toBe(two.boardId);
    expect(target?.name).toBe(label.name);
    expect(target?.color).toBe(label.color);
  });

  it('builds nested checklists and converts an item into a card', () => {
    const { todo } = board();
    const card = S.createCard(todo, 'Con checklist');
    const cl = S.addChecklist(card, 'Pasos');
    const parent = S.addChecklistItem(card, cl, 'Padre');
    const child = S.addChecklistItem(card, cl, 'Hijo', { parentId: parent });
    S.addChecklistItem(card, cl, 'Nieto', { parentId: child });

    S.toggleChecklistItem(card, cl, parent);
    let items = S.getData().cards[card].checklists[0].items;
    expect(items[0].done).toBe(true);
    expect(items[0].children[0].children[0].done).toBe(true);

    const newId = S.convertItemToCard(card, cl, child);
    items = S.getData().cards[card].checklists[0].items;
    expect(items[0].children).toHaveLength(0);
    const created = S.getData().cards[newId];
    expect(created.title).toBe('Hijo');
    expect(created.checklists[0].items[0].text).toBe('Nieto');
    expect(S.getData().lists[todo].cardIds).toEqual([card, newId]);
  });

  it('moves checklist items across checklists', () => {
    const { todo } = board();
    const card = S.createCard(todo, 'X');
    const cl1 = S.addChecklist(card, 'Uno');
    const cl2 = S.addChecklist(card, 'Dos');
    const a = S.addChecklistItem(card, cl1, 'a');
    S.moveChecklistItem(card, { clId: cl1, parentId: null, index: 0 }, { clId: cl2, parentId: null, index: 0 });
    const [c1, c2] = S.getData().cards[card].checklists;
    expect(c1.items).toHaveLength(0);
    expect(c2.items[0].id).toBe(a);
  });

  it('refuses to drop a checklist item inside itself', () => {
    const { todo } = board();
    const card = S.createCard(todo, 'X');
    const cl = S.addChecklist(card, 'Uno');
    const a = S.addChecklistItem(card, cl, 'a');
    S.addChecklistItem(card, cl, 'b', { parentId: a });
    const before = S.getData().cards[card].checklists[0];
    S.moveChecklistItem(card, { clId: cl, parentId: null, index: 0 }, { clId: cl, parentId: a, index: 0 });
    expect(S.getData().cards[card].checklists[0].items).toEqual(before.items);
  });

  it('sorts lists by priority and due date', () => {
    const { todo } = board();
    const low = S.createCard(todo, 'low', undefined, { priority: 'low', due: '2030-01-03' });
    const urgent = S.createCard(todo, 'urgent', undefined, { priority: 'urgent', due: '2030-01-05' });
    const none = S.createCard(todo, 'none');
    S.sortList(todo, 'priority');
    expect(S.getData().lists[todo].cardIds).toEqual([urgent, low, none]);
    S.sortList(todo, 'due');
    expect(S.getData().lists[todo].cardIds).toEqual([low, urgent, none]);
  });

  it('duplicates boards with fresh ids and mapped labels', () => {
    const { boardId, todo } = board();
    const card = S.createCard(todo, 'A');
    S.toggleLabel(card, S.getData().boards[boardId].labels[0].id);
    const copyId = S.duplicateBoard(boardId)!;
    const data = S.getData();
    const copy = data.boards[copyId];
    const copiedCard = data.cards[data.lists[copy.listIds[0]].cardIds[0]];
    expect(copiedCard.id).not.toBe(card);
    expect(copy.labels.map((l) => l.id)).toContain(copiedCard.labelIds[0]);
  });

  it('deleting a label removes it from cards', () => {
    const { boardId, todo } = board();
    const label = S.getData().boards[boardId].labels[0];
    const card = S.createCard(todo, 'A');
    S.toggleLabel(card, label.id);
    S.deleteLabel(boardId, label.id);
    expect(S.getData().cards[card].labelIds).toEqual([]);
  });

  it('custom fields: set, validate, remap across boards and clean up', () => {
    const one = board();
    const two = board();
    const size = S.createField(one.boardId, {
      name: 'Talla', type: 'select', showOnCard: true,
      options: [{ id: 'o1', name: 'S', color: null }, { id: 'o2', name: 'L', color: 'red' }],
    });
    const cost = S.createField(one.boardId, { name: 'Coste', type: 'number', showOnCard: true, options: [] });
    const card = S.createCard(one.todo, 'Con campos');
    S.setCardField(card, size, 'o2');
    S.setCardField(card, cost, 12.5);
    S.setCardField(card, cost, 'no es un número' as unknown as number);
    expect(S.getData().cards[card].fields).toEqual({ [size]: 'o2' });
    S.setCardField(card, cost, 12.5);

    S.moveCard(card, two.todo, 0);
    const moved = S.getData().cards[card];
    const target = S.getData().boards[two.boardId].fields;
    const tSize = target.find((f) => f.name === 'Talla')!;
    const tCost = target.find((f) => f.name === 'Coste')!;
    expect(moved.fields[tCost.id]).toBe(12.5);
    expect(tSize.options.find((o) => o.id === moved.fields[tSize.id])?.name).toBe('L');

    // Removing an option clears values that pointed to it.
    S.updateField(two.boardId, tSize.id, { options: tSize.options.filter((o) => o.name !== 'L') });
    expect(S.getData().cards[card].fields[tSize.id]).toBeUndefined();
    S.deleteField(two.boardId, tCost.id);
    expect(S.getData().cards[card].fields).toEqual({});
  });

  it('duplicating a board keeps custom field values on new ids', () => {
    const { boardId, todo } = board();
    const f = S.createField(boardId, { name: 'Hecho por', type: 'text', showOnCard: true, options: [] });
    const card = S.createCard(todo, 'A');
    S.setCardField(card, f, 'yo');
    const copyId = S.duplicateBoard(boardId)!;
    const data = S.getData();
    const copyField = data.boards[copyId].fields[0];
    expect(copyField.id).not.toBe(f);
    const copied = data.cards[data.lists[data.boards[copyId].listIds[0]].cardIds[0]];
    expect(copied.fields[copyField.id]).toBe('yo');
  });
});
