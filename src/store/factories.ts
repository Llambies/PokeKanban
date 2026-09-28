import type { AppData, Board, Card, ChecklistItem, Label, List } from '../types';
import { uid } from '../lib/id';
import { addDaysKey } from '../lib/dates';

export function emptyData(): AppData {
  return { version: 1, boardOrder: [], boards: {}, lists: {}, cards: {} };
}

export function makeBoard(title: string, background = 'ocean'): Board {
  const now = Date.now();
  return {
    id: uid(),
    title,
    background,
    starred: false,
    listIds: [],
    labels: defaultLabels(),
    fields: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function defaultLabels(): Label[] {
  return [
    { id: uid(), name: 'Urgente', color: 'red', icon: 'lucide:Flame' },
    { id: uid(), name: 'Importante', color: 'orange', icon: 'lucide:Star' },
    { id: uid(), name: 'Idea', color: 'yellow', icon: 'lucide:Lightbulb' },
    { id: uid(), name: 'Mejora', color: 'green', icon: 'lucide:Sparkles' },
    { id: uid(), name: 'Personal', color: 'purple', icon: 'lucide:Heart' },
    { id: uid(), name: 'Bloqueado', color: 'black_bold', icon: 'lucide:Ban' },
  ];
}

export function makeList(boardId: string, title: string): List {
  return {
    id: uid(),
    boardId,
    title,
    cardIds: [],
    color: null,
    colorMode: 'header',
    collapsed: false,
    wipLimit: null,
    archived: false,
    createdAt: Date.now(),
  };
}

export function makeCard(boardId: string, listId: string, title: string, extra: Partial<Card> = {}): Card {
  const now = Date.now();
  return {
    id: uid(),
    boardId,
    listId,
    kind: 'card',
    title,
    description: '',
    labelIds: [],
    cover: null,
    start: null,
    due: null,
    dueDone: false,
    priority: null,
    checklists: [],
    attachments: [],
    comments: [],
    fields: {},
    isTemplate: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

function item(text: string, done = false, children: ChecklistItem[] = []): ChecklistItem {
  return { id: uid(), text, done, due: null, children };
}

/** First-run content: a board that showcases the main features. */
export function sampleData(): AppData {
  const data = emptyData();
  const board = makeBoard('Mi primer tablero', 'ocean');
  board.starred = true;
  const [urgent, important, idea, improvement, personal] = board.labels;
  const [small, medium, large] = [uid(), uid(), uid()];
  const effort = { id: uid(), name: 'Esfuerzo', type: 'select' as const, showOnCard: true, options: [
    { id: small, name: 'Pequeño', color: 'green_subtle' },
    { id: medium, name: 'Medio', color: 'yellow_subtle' },
    { id: large, name: 'Grande', color: 'red_subtle' },
  ] };
  const cost = { id: uid(), name: 'Coste (€)', type: 'number' as const, showOnCard: true, options: [] };
  board.fields = [effort, cost];

  const todo = makeList(board.id, 'Pendiente');
  todo.color = 'blue';
  const doing = makeList(board.id, 'En curso');
  doing.color = 'yellow';
  doing.wipLimit = 3;
  const done = makeList(board.id, 'Hecho');
  done.color = 'green';

  const cards: Card[] = [
    makeCard(board.id, todo.id, 'Esto es un separador', { kind: 'separator', cover: { color: 'purple_bold', image: null, size: 'full' } }),
    makeCard(board.id, todo.id, 'Haz clic derecho (o toca «…») en cualquier tarjeta 👉', {
      labelIds: [idea.id],
      description:
        'El **menú contextual** permite cambiar etiquetas, portada, fechas, prioridad o mover la tarjeta sin abrirla. ' +
        'En el móvil, toca el botón «…» de la tarjeta.\n\n' +
        'También funciona sobre las listas, el fondo del tablero y los elementos de checklist.',
    }),
    makeCard(board.id, todo.id, 'Planificar vacaciones', {
      labelIds: [personal.id, important.id],
      priority: 'high',
      due: addDaysKey(5),
      fields: { [effort.id]: large, [cost.id]: 850 },
      checklists: [
        {
          id: uid(),
          title: 'Preparativos',
          items: [
            item('Reservar vuelos', true),
            item('Alojamiento', false, [item('Comparar precios', true), item('Reservar hotel')]),
            item('Maleta', false, [
              item('Ropa'),
              item('Documentación', false, [item('Pasaporte'), item('Seguro de viaje')]),
            ]),
          ],
        },
      ],
    }),
    makeCard(board.id, doing.id, 'Rediseñar la web personal', {
      labelIds: [improvement.id],
      priority: 'medium',
      fields: { [effort.id]: medium },
      cover: { color: 'sky', image: null, size: 'strip' },
      start: addDaysKey(-2),
      due: addDaysKey(1),
      description: 'Usa `Ctrl+Z` / `Ctrl+Y` para deshacer y rehacer cualquier cambio.',
      attachments: [{ id: uid(), name: 'Inspiración', url: 'https://dribbble.com', createdAt: Date.now() }],
    }),
    makeCard(board.id, doing.id, 'Arreglar la bici', {
      labelIds: [urgent.id],
      priority: 'urgent',
      due: addDaysKey(-1),
      cover: { color: 'red_bold', image: null, size: 'full' },
    }),
    makeCard(board.id, done.id, 'Crear mi tablero Kanban', {
      labelIds: [improvement.id],
      due: addDaysKey(-3),
      dueDone: true,
      comments: [{ id: uid(), text: '¡Adiós a los límites! 🎉', createdAt: Date.now() }],
    }),
  ];

  for (const card of cards) {
    data.cards[card.id] = card;
    const list = [todo, doing, done].find((l) => l.id === card.listId)!;
    list.cardIds.push(card.id);
  }
  for (const list of [todo, doing, done]) {
    data.lists[list.id] = list;
    board.listIds.push(list.id);
  }
  data.boards[board.id] = board;
  data.boardOrder.push(board.id);
  return data;
}
