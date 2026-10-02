import { describe, expect, it, vi } from 'vitest';
import type { DragStart, DragUpdate, DropResult } from '@hello-pangea/dnd';
import { announceDragEnd, announceDragStart, announceDragUpdate, type DndAnnounceLabels } from '../../src/lib/dndA11y';

const labels: DndAnnounceLabels = {
  item: (id, type) => (type === 'LIST' ? `la lista «${id}»` : `la tarjeta «${id}»`),
  droppable: (id, type) => (type === 'LIST' ? 'el tablero' : `la lista «${id}»`),
};

describe('dndA11y announcements (card drags)', () => {
  it('announces the lift with the source list and position', () => {
    const announce = vi.fn();
    const start: DragStart = { draggableId: 'card-1', type: 'CARD', mode: 'FLUID', source: { droppableId: 'list-a', index: 0 } };
    announceDragStart(start, labels, announce);
    expect(announce).toHaveBeenCalledWith('Has levantado la tarjeta «card-1» de la lista «list-a», en la posición 1.');
  });

  it('announces a move within the same list differently from a move to another list', () => {
    const announce = vi.fn();
    const sameList: DragUpdate = {
      draggableId: 'card-1', type: 'CARD', mode: 'FLUID', combine: null,
      source: { droppableId: 'list-a', index: 0 },
      destination: { droppableId: 'list-a', index: 2 },
    };
    announceDragUpdate(sameList, labels, announce);
    expect(announce).toHaveBeenLastCalledWith('la tarjeta «card-1» se moverá a la posición 3 de la lista «list-a».');

    const otherList: DragUpdate = { ...sameList, destination: { droppableId: 'list-b', index: 1 } };
    announceDragUpdate(otherList, labels, announce);
    expect(announce).toHaveBeenLastCalledWith('la tarjeta «card-1» se moverá a la lista «list-b», en la posición 2.');
  });

  it('announces no drop target while dragging', () => {
    const announce = vi.fn();
    const outside: DragUpdate = {
      draggableId: 'card-1', type: 'CARD', mode: 'FLUID', combine: null,
      source: { droppableId: 'list-a', index: 0 }, destination: null,
    };
    announceDragUpdate(outside, labels, announce);
    expect(announce).toHaveBeenCalledWith('la tarjeta «card-1» está fuera de una zona donde se pueda soltar.');
  });

  it('announces a cancelled drop as returning to its original position', () => {
    const announce = vi.fn();
    const cancelled: DropResult = {
      draggableId: 'card-1', type: 'CARD', mode: 'FLUID', reason: 'CANCEL', combine: null,
      source: { droppableId: 'list-a', index: 0 }, destination: null,
    };
    announceDragEnd(cancelled, labels, announce);
    expect(announce).toHaveBeenCalledWith('Se ha cancelado el movimiento. la tarjeta «card-1» ha vuelto a la posición 1.');
  });

  it('announces a successful drop into its destination list', () => {
    const announce = vi.fn();
    const dropped: DropResult = {
      draggableId: 'card-1', type: 'CARD', mode: 'FLUID', reason: 'DROP', combine: null,
      source: { droppableId: 'list-a', index: 0 }, destination: { droppableId: 'list-b', index: 3 },
    };
    announceDragEnd(dropped, labels, announce);
    expect(announce).toHaveBeenCalledWith('la tarjeta «card-1» se ha soltado en la lista «list-b», en la posición 4.');
  });
});

describe('dndA11y announcements (list drags)', () => {
  it('uses "el tablero" instead of a list name for LIST-type drags', () => {
    const announce = vi.fn();
    const dropped: DropResult = {
      draggableId: 'list-a', type: 'LIST', mode: 'FLUID', reason: 'DROP', combine: null,
      source: { droppableId: 'board-1', index: 0 }, destination: { droppableId: 'board-1', index: 2 },
    };
    announceDragEnd(dropped, labels, announce);
    expect(announce).toHaveBeenCalledWith('la lista «list-a» se ha soltado en la posición 3.');
  });
});
