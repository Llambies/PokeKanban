/**
 * Spanish strings and announcements for @hello-pangea/dnd (whose built-in screen-reader text is
 * English only). Pass `DRAG_HANDLE_INSTRUCTIONS` as `dragHandleUsageInstructions` on every
 * `DragDropContext`, and use the `announce*` helpers from the responder's `announce` callback.
 */
import type { DragStart, DragUpdate, DropResult } from '@hello-pangea/dnd';

export const DRAG_HANDLE_INSTRUCTIONS =
  'Pulsa la barra espaciadora para levantar. Usa las flechas para mover. Pulsa espacio para soltar o Escape para cancelar.';

export interface DndAnnounceLabels {
  /** Human label for the dragged item ("la tarjeta «Comprar pan»", "la lista «Hecho»"…). */
  item: (draggableId: string, type: string) => string;
  /** Human label for a droppable ("la lista «Hecho»"…). */
  droppable: (droppableId: string, type: string) => string;
}

const position = (index: number) => `la posición ${index + 1}`;

export function announceDragStart({ draggableId, source, type }: DragStart, labels: DndAnnounceLabels, announce: (message: string) => void): void {
  const item = labels.item(draggableId, type);
  if (type === 'LIST') {
    announce(`Has levantado ${item}, en ${position(source.index)}.`);
    return;
  }
  const from = labels.droppable(source.droppableId, type);
  announce(`Has levantado ${item} de ${from}, en ${position(source.index)}.`);
}

export function announceDragUpdate({ draggableId, source, destination, type }: DragUpdate, labels: DndAnnounceLabels, announce: (message: string) => void): void {
  const item = labels.item(draggableId, type);
  if (!destination) {
    announce(`${item} está fuera de una zona donde se pueda soltar.`);
    return;
  }
  if (type === 'LIST') {
    announce(`${item} se moverá a ${position(destination.index)}.`);
    return;
  }
  const to = labels.droppable(destination.droppableId, type);
  if (destination.droppableId === source.droppableId) {
    announce(`${item} se moverá a ${position(destination.index)} de ${to}.`);
  } else {
    announce(`${item} se moverá a ${to}, en ${position(destination.index)}.`);
  }
}

export function announceDragEnd({ draggableId, source, destination, reason, type }: DropResult, labels: DndAnnounceLabels, announce: (message: string) => void): void {
  const item = labels.item(draggableId, type);
  if (reason === 'CANCEL' || !destination) {
    announce(`Se ha cancelado el movimiento. ${item} ha vuelto a ${position(source.index)}.`);
    return;
  }
  if (type === 'LIST') {
    announce(`${item} se ha soltado en ${position(destination.index)}.`);
    return;
  }
  const to = labels.droppable(destination.droppableId, type);
  announce(`${item} se ha soltado en ${to}, en ${position(destination.index)}.`);
}
