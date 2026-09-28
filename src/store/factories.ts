import type { AppData, AppSettings, Board, CalendarEvent, Card, ChecklistItem, EventKind, Label, List } from '../types';
import { uid } from '../lib/id';
import { addDaysKey } from '../lib/dates';

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function defaultSettings(): AppSettings {
  return { timeZone: deviceTimeZone(), allDayTime: '09:00', cardReminders: [], showCards: true };
}

export function emptyData(): AppData {
  return {
    version: 1, boardOrder: [], boards: {}, lists: {}, cards: {}, events: {}, eventLabels: defaultEventLabels(),
    settings: defaultSettings(),
  };
}

export function defaultEventLabels(): Label[] {
  return [
    { id: uid(), name: 'Personal', color: 'purple', icon: 'lucide:Heart' },
    { id: uid(), name: 'Trabajo', color: 'blue', icon: 'lucide:Briefcase' },
    { id: uid(), name: 'Familia', color: 'green', icon: 'lucide:House' },
    { id: uid(), name: 'Salud', color: 'red', icon: 'lucide:Stethoscope' },
    { id: uid(), name: 'Pagos', color: 'yellow', icon: 'lucide:Wallet' },
  ];
}

/** Defaults per kind: reminders (minutes before) and whether it repeats yearly. */
export const KIND_DEFAULTS: Record<EventKind, { reminders: number[]; yearly: boolean; allDay: boolean }> = {
  event: { reminders: [30], yearly: false, allDay: false },
  birthday: { reminders: [0], yearly: true, allDay: true },
  anniversary: { reminders: [0], yearly: true, allDay: true },
  deadline: { reminders: [1440, 0], yearly: false, allDay: true },
  reminder: { reminders: [0], yearly: false, allDay: false },
};

export function makeEvent(kind: EventKind, start: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  const now = Date.now();
  const defaults = KIND_DEFAULTS[kind];
  return {
    id: uid(),
    kind,
    title: '',
    notes: '',
    location: '',
    color: null,
    icon: null,
    labelIds: [],
    start,
    end: null,
    recurrence: defaults.yearly
      ? { freq: 'yearly', interval: 1, byWeekday: [], monthlyBy: 'day', until: null, count: null }
      : null,
    exdates: [],
    reminders: [...defaults.reminders],
    done: [],
    sinceYear: null,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
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

  const [personal2, work, , health, bills] = data.eventLabels;
  const weekday = ((new Date().getDay() + 6) % 7) + 1;
  const events = [
    makeEvent('event', `${addDaysKey(1)}T18:30`, {
      title: 'Gimnasio', end: `${addDaysKey(1)}T19:30`, icon: 'lucide:Dumbbell', labelIds: [health.id],
      recurrence: { freq: 'weekly', interval: 1, byWeekday: [((weekday) % 7) + 1, ((weekday + 2) % 7) + 1], monthlyBy: 'day', until: null, count: null },
    }),
    makeEvent('birthday', `1990-${addDaysKey(3).slice(5)}`, { title: 'Ana', sinceYear: 1990, labelIds: [personal2.id] }),
    makeEvent('deadline', addDaysKey(2), { title: 'Pagar el seguro del coche', labelIds: [bills.id] }),
    makeEvent('event', `${addDaysKey(4)}T10:00`, { title: 'Reunión de proyecto', end: `${addDaysKey(4)}T11:00`, labelIds: [work.id], location: 'Oficina' }),
  ];
  for (const event of events) data.events[event.id] = event;
  return data;
}
