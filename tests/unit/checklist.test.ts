import { describe, expect, it } from 'vitest';
import type { ChecklistItem } from '../../src/types';
import * as tree from '../../src/lib/checklist';

function item(id: string, children: ChecklistItem[] = [], done = false): ChecklistItem {
  return { id, text: id, done, due: null, children };
}

const ids = (items: ChecklistItem[]): unknown =>
  items.map((i) => (i.children.length ? { [i.id]: ids(i.children) } : i.id));

describe('checklist tree', () => {
  it('locates nested items with depth and parent', () => {
    const items = [item('a', [item('b', [item('c')])])];
    const loc = tree.locate(items, 'c');
    expect(loc?.depth).toBe(2);
    expect(loc?.parent?.id).toBe('b');
  });

  it('counts progress on leaves only', () => {
    const items = [item('a', [item('b', [], true), item('c')]), item('d', [], true)];
    expect(tree.progress(items)).toEqual({ done: 2, total: 3 });
  });

  it('indents into the previous sibling', () => {
    const items = [item('a'), item('b'), item('c')];
    expect(tree.indent(items, 'b')).toBe(true);
    expect(ids(items)).toEqual([{ a: ['b'] }, 'c']);
    expect(tree.indent(items, 'a')).toBe(false);
  });

  it('outdents after the parent, adopting following siblings', () => {
    const items = [item('a', [item('b'), item('c'), item('d')])];
    expect(tree.outdent(items, 'c')).toBe(true);
    expect(ids(items)).toEqual([{ a: ['b'] }, { c: ['d'] }]);
  });

  it('respects the maximum nesting depth', () => {
    let deepest = item('x4');
    for (let i = 3; i >= 1; i--) deepest = item(`x${i}`, [deepest]);
    const items = [item('x0', [deepest, item('y')])];
    // y is at depth 1, indenting would place it at depth 2 inside x1 (fine).
    expect(tree.canIndent(items, 'y')).toBe(true);
    const chain = [item('p', [item('q', [item('r', [item('s', [item('t')])])])]), item('u', [item('v')])];
    // u has height 2; moving it under p (depth 1) gives 1 + 2 = 3 levels -> allowed.
    expect(tree.canIndent(chain, 'u')).toBe(true);
    // t is already at depth 4 (5th level): it has no previous sibling anyway.
    expect(tree.canIndent(chain, 't')).toBe(false);
  });

  it('syncs parent done state with children', () => {
    const items = [item('a', [item('b', [], true), item('c', [], true)])];
    tree.syncParents(items);
    expect(items[0].done).toBe(true);
    items[0].children[1].done = false;
    tree.syncParents(items);
    expect(items[0].done).toBe(false);
  });

  it('setDoneDeep cascades to descendants', () => {
    const items = [item('a', [item('b', [item('c')])])];
    tree.setDoneDeep(items[0], true);
    expect(items[0].children[0].children[0].done).toBe(true);
  });

  it('moves siblings within bounds', () => {
    const items = [item('a'), item('b')];
    expect(tree.moveSibling(items, 'a', 1)).toBe(true);
    expect(ids(items)).toEqual(['b', 'a']);
    expect(tree.moveSibling(items, 'a', 1)).toBe(false);
  });

  it('clones with fresh ids and optional reset', () => {
    const items = [item('a', [item('b', [], true)], true)];
    const copy = tree.cloneItems(items, true);
    expect(copy[0].id).not.toBe('a');
    expect(copy[0].children[0].done).toBe(false);
    expect(items[0].children[0].done).toBe(true);
  });
});
