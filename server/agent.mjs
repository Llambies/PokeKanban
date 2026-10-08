// Herramientas para agentes (Claude Code, Codex…): CRUD de tableros, listas, tarjetas, etiquetas y eventos.
// Cada herramienta trabaja sobre el documento `AppData` (ver src/types.ts). Se publican como servidor MCP
// (POST /api/mcp) y como API JSON (POST /api/agent/<herramienta>); ver server/core.mjs.

import { colorHex } from '../shared/palette.js';
import { dayKeyAt, isCheckable, occurrences } from '../shared/calendar.js';

export class ToolError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const fail = (message, status) => {
  throw new ToolError(message, status);
};

/* ------------------------------------------------------------------ helpers */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function uid() {
  let rand = '';
  for (const b of crypto.getRandomValues(new Uint8Array(8))) rand += ALPHABET[b % 36];
  return Date.now().toString(36) + rand;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const PRIORITIES = ['urgent', 'high', 'medium', 'low'];
const EVENT_KINDS = ['event', 'birthday', 'anniversary', 'deadline', 'reminder'];
const FREQS = ['daily', 'weekly', 'monthly', 'yearly'];

// Igual que KIND_DEFAULTS en src/store/factories.ts (hay un test que comprueba que coinciden).
export const KIND_DEFAULTS = {
  event: { reminders: [30], yearly: false },
  birthday: { reminders: [0], yearly: true },
  anniversary: { reminders: [0], yearly: true },
  deadline: { reminders: [1440, 0], yearly: false },
  reminder: { reminders: [0], yearly: false },
};

function text(value, field, { max = 20000, required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) fail(`Falta "${field}"`);
    return '';
  }
  if (typeof value !== 'string') fail(`"${field}" debe ser texto`);
  const out = value.trim();
  if (required && !out) fail(`"${field}" no puede estar vacío`);
  if (out.length > max) fail(`"${field}" es demasiado largo (máximo ${max} caracteres)`);
  return out;
}

function date(value, field, { time = true } = {}) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !(DATE.test(value) || (time && DATETIME.test(value)))) {
    fail(`"${field}" debe ser ${time ? '"AAAA-MM-DD" o "AAAA-MM-DDTHH:mm"' : '"AAAA-MM-DD"'}`);
  }
  if (Number.isNaN(Date.parse(`${value.slice(0, 10)}T00:00:00Z`))) fail(`"${field}" no es una fecha válida`);
  return value;
}

function color(value, field) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !colorHex(value)) fail(`"${field}" no es un color válido (p. ej. "green", "red_bold", "#1f845a")`);
  return value;
}

const iconValue = (value) => (value === null || value === undefined || value === '' ? null : text(value, 'icon', { max: 80 }));

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) fail(`"${field}" debe ser uno de: ${allowed.join(', ')}`);
  return value;
}

function bool(value, field) {
  if (typeof value !== 'boolean') fail(`"${field}" debe ser true o false`);
  return value;
}

function int(value, field, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`"${field}" debe ser un entero entre ${min} y ${max}`);
  return value;
}

function has(args, key) {
  return Object.prototype.hasOwnProperty.call(args, key);
}

function ensure(data) {
  data.boardOrder ??= [];
  data.boards ??= {};
  data.lists ??= {};
  data.cards ??= {};
  data.events ??= {};
  data.eventLabels ??= [];
  return data;
}

function boardOf(data, id) {
  const board = data.boards[text(id, 'boardId', { required: true })];
  if (!board) fail(`No existe el tablero "${id}"`, 404);
  return board;
}

function listOf(data, id) {
  const list = data.lists[text(id, 'listId', { required: true })];
  if (!list) fail(`No existe la lista "${id}"`, 404);
  return list;
}

function cardOf(data, id) {
  const card = data.cards[text(id, 'cardId', { required: true })];
  if (!card) fail(`No existe la tarjeta "${id}"`, 404);
  return card;
}

function eventOf(data, id) {
  const event = data.events[text(id, 'eventId', { required: true })];
  if (!event) fail(`No existe el evento "${id}"`, 404);
  return event;
}

/** Inserta `id` en `array` según `position` ('top', 'bottom' o índice desde 0). */
function place(array, id, position) {
  const without = array.filter((x) => x !== id);
  let index = without.length;
  if (position === 'top') index = 0;
  else if (Number.isInteger(position)) index = Math.max(0, Math.min(position, without.length));
  else if (position !== undefined && position !== null && position !== 'bottom') fail('"position" debe ser "top", "bottom" o un número');
  without.splice(index, 0, id);
  array.splice(0, array.length, ...without);
}

function matchLabel(labels, ref) {
  const wanted = String(ref).trim().toLowerCase();
  return labels.find((l) => l.id === ref) ?? labels.find((l) => l.name.trim().toLowerCase() === wanted);
}

/** Convierte nombres (o ids) de etiqueta en ids, conservando el orden de las etiquetas del tablero. */
function resolveLabels(labels, refs) {
  if (!Array.isArray(refs)) fail('"labels" debe ser una lista de nombres de etiqueta');
  const ids = new Set();
  for (const ref of refs) {
    const label = matchLabel(labels, ref);
    if (!label) fail(`No existe la etiqueta "${ref}". Disponibles: ${labels.map((l) => l.name).join(', ') || '(ninguna)'}`);
    ids.add(label.id);
  }
  return labels.filter((l) => ids.has(l.id)).map((l) => l.id);
}

function defaultLabels() {
  return [
    { id: uid(), name: 'Urgente', color: 'red', icon: 'lucide:Flame' },
    { id: uid(), name: 'Importante', color: 'orange', icon: 'lucide:Star' },
    { id: uid(), name: 'Idea', color: 'yellow', icon: 'lucide:Lightbulb' },
    { id: uid(), name: 'Mejora', color: 'green', icon: 'lucide:Sparkles' },
    { id: uid(), name: 'Personal', color: 'purple', icon: 'lucide:Heart' },
    { id: uid(), name: 'Bloqueado', color: 'black_bold', icon: 'lucide:Ban' },
  ];
}

/* ------------------------------------------------------------------- shapes */

function labelNames(labels, ids) {
  return (ids ?? []).map((id) => labels.find((l) => l.id === id)?.name).filter(Boolean);
}

function progress(checklists) {
  let done = 0;
  let total = 0;
  const walk = (items) => {
    for (const item of items ?? []) {
      if (item.children?.length) walk(item.children);
      else {
        total++;
        if (item.done) done++;
      }
    }
  };
  for (const cl of checklists ?? []) walk(cl.items);
  return { done, total };
}

function cardSummary(data, card) {
  const board = data.boards[card.boardId];
  return {
    id: card.id,
    title: card.title,
    kind: card.kind,
    boardId: card.boardId,
    boardTitle: board?.title ?? null,
    listId: card.listId,
    listTitle: data.lists[card.listId]?.title ?? null,
    labels: labelNames(board?.labels ?? [], card.labelIds),
    priority: card.priority ?? null,
    start: card.start ?? null,
    due: card.due ?? null,
    dueDone: !!card.dueDone,
    archived: !!card.archived,
    isTemplate: !!card.isTemplate,
    checklist: progress(card.checklists),
    comments: (card.comments ?? []).length,
  };
}

function fieldValues(board, card) {
  const out = {};
  for (const [id, value] of Object.entries(card.fields ?? {})) {
    const field = board?.fields?.find((f) => f.id === id);
    if (!field) continue;
    out[field.name] = field.type === 'select' ? (field.options.find((o) => o.id === value)?.name ?? value) : value;
  }
  return out;
}

function cardFull(data, card) {
  const board = data.boards[card.boardId];
  return {
    ...cardSummary(data, card),
    description: card.description ?? '',
    fields: fieldValues(board, card),
    checklists: card.checklists ?? [],
    attachments: (card.attachments ?? []).map((a) => ({ id: a.id, name: a.name, url: a.url })),
    commentList: card.comments ?? [],
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

function eventShape(data, event) {
  return { ...event, labelNames: labelNames(data.eventLabels, event.labelIds) };
}

/* ------------------------------------------------------------------- inputs */

function checklistItems(value, depth = 1) {
  if (!Array.isArray(value)) fail('"items" debe ser una lista');
  if (depth > 5) fail('Las subtareas admiten como máximo 5 niveles');
  return value.map((raw) => {
    const item = typeof raw === 'string' ? { text: raw } : raw;
    if (!item || typeof item !== 'object') fail('Cada elemento del checklist debe ser texto u objeto');
    return {
      id: typeof item.id === 'string' && item.id ? item.id : uid(),
      text: text(item.text, 'text', { max: 1000, required: true }),
      done: item.done === undefined ? false : bool(item.done, 'done'),
      due: date(item.due, 'due'),
      children: item.children === undefined ? [] : checklistItems(item.children, depth + 1),
    };
  });
}

function checklistsFrom(value) {
  if (!Array.isArray(value)) fail('"checklists" debe ser una lista');
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object') fail('Cada checklist debe ser un objeto { title, items }');
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
      title: text(raw.title, 'title', { max: 300, required: true }),
      items: raw.items === undefined ? [] : checklistItems(raw.items),
    };
  });
}

/** Valores de campos personalizados por nombre de campo; null borra el valor. */
function fieldsFrom(board, value, current) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('"fields" debe ser un objeto { nombreDelCampo: valor }');
  const out = { ...current };
  for (const [name, raw] of Object.entries(value)) {
    const field = (board.fields ?? []).find((f) => f.id === name || f.name.toLowerCase() === name.toLowerCase());
    if (!field) fail(`No existe el campo "${name}". Disponibles: ${(board.fields ?? []).map((f) => f.name).join(', ') || '(ninguno)'}`);
    if (raw === null || raw === false) {
      delete out[field.id];
      continue;
    }
    if (field.type === 'text') out[field.id] = text(raw, name, { max: 2000 });
    else if (field.type === 'number') {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) fail(`"${name}" debe ser un número`);
      out[field.id] = raw;
    } else if (field.type === 'checkbox') out[field.id] = bool(raw, name);
    else if (field.type === 'date') out[field.id] = date(raw, name, { time: false });
    else {
      const option = field.options.find((o) => o.id === raw || o.name.toLowerCase() === String(raw).toLowerCase());
      if (!option) fail(`"${name}": opciones válidas: ${field.options.map((o) => o.name).join(', ')}`);
      out[field.id] = option.id;
    }
  }
  return out;
}

function checkDates(start, due) {
  if (start && due && start.slice(0, 10) > due.slice(0, 10)) fail('"start" no puede ser posterior a "due"');
}

/** Aplica los campos presentes en `args` a la tarjeta (sin tocar su lista). */
function applyCard(data, card, args) {
  const board = data.boards[card.boardId];
  if (has(args, 'title')) card.title = text(args.title, 'title', { max: 500, required: true });
  if (has(args, 'description')) card.description = text(args.description, 'description', { max: 100_000 });
  if (has(args, 'kind')) card.kind = oneOf(args.kind, ['card', 'separator'], 'kind');
  if (has(args, 'labels')) card.labelIds = resolveLabels(board.labels ?? [], args.labels);
  if (has(args, 'start')) card.start = date(args.start, 'start');
  if (has(args, 'due')) {
    card.due = date(args.due, 'due');
    if (!card.due) card.dueDone = false;
  }
  checkDates(card.start, card.due);
  if (has(args, 'dueDone')) card.dueDone = bool(args.dueDone, 'dueDone');
  if (has(args, 'priority')) card.priority = args.priority === null ? null : oneOf(args.priority, PRIORITIES, 'priority');
  if (has(args, 'isTemplate')) card.isTemplate = bool(args.isTemplate, 'isTemplate');
  if (has(args, 'checklists')) card.checklists = checklistsFrom(args.checklists);
  if (has(args, 'fields')) card.fields = fieldsFrom(board, args.fields, card.fields ?? {});
}

function removeFromList(data, card) {
  const list = data.lists[card.listId];
  if (list) list.cardIds = list.cardIds.filter((id) => id !== card.id);
}

/** Etiquetas de otro tablero por nombre (se crean si faltan); los campos personalizados no se trasladan. */
function rehome(data, card, toBoard) {
  const from = data.boards[card.boardId];
  card.labelIds = (card.labelIds ?? []).map((id) => {
    const src = from?.labels.find((l) => l.id === id);
    if (!src) return null;
    let label = toBoard.labels.find((l) => l.name.toLowerCase() === src.name.toLowerCase());
    if (!label) {
      label = { ...src, id: uid() };
      toBoard.labels.push(label);
    }
    return label.id;
  }).filter(Boolean);
  card.fields = {};
  card.boardId = toBoard.id;
}

function moveCardTo(data, card, list, position) {
  removeFromList(data, card);
  if (card.boardId !== list.boardId) rehome(data, card, data.boards[list.boardId]);
  card.listId = list.id;
  card.archived = false;
  place(list.cardIds, card.id, position);
}

function recurrenceFrom(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object') fail('"recurrence" debe ser null o { freq, interval?, byWeekday?, monthlyBy?, until?, count? }');
  return {
    freq: oneOf(value.freq, FREQS, 'recurrence.freq'),
    interval: value.interval === undefined ? 1 : int(value.interval, 'recurrence.interval', 1, 1000),
    byWeekday: value.byWeekday === undefined ? [] : [...new Set(value.byWeekday.map((d) => int(d, 'recurrence.byWeekday', 1, 7)))].sort(),
    monthlyBy: value.monthlyBy === undefined ? 'day' : oneOf(value.monthlyBy, ['day', 'weekday', 'last-weekday'], 'recurrence.monthlyBy'),
    until: date(value.until, 'recurrence.until', { time: false }),
    count: value.count === undefined || value.count === null ? null : int(value.count, 'recurrence.count', 1, 10_000),
  };
}

function applyEvent(data, event, args) {
  if (has(args, 'title')) event.title = text(args.title, 'title', { max: 500, required: true });
  if (has(args, 'notes')) event.notes = text(args.notes, 'notes', { max: 100_000 });
  if (has(args, 'location')) event.location = text(args.location, 'location', { max: 500 });
  if (has(args, 'color')) event.color = color(args.color, 'color');
  if (has(args, 'icon')) event.icon = iconValue(args.icon);
  if (has(args, 'labels')) event.labelIds = resolveLabels(data.eventLabels, args.labels);
  if (has(args, 'start')) event.start = date(args.start, 'start') ?? fail('"start" no puede estar vacío');
  if (has(args, 'end')) event.end = date(args.end, 'end');
  if (event.end) {
    if (event.end.includes('T') !== event.start.includes('T')) fail('"start" y "end" deben tener el mismo formato (con hora o sin ella)');
    if (event.end < event.start) fail('"end" no puede ser anterior a "start"');
  }
  if (has(args, 'recurrence')) event.recurrence = recurrenceFrom(args.recurrence);
  if (has(args, 'exdates')) {
    if (!Array.isArray(args.exdates)) fail('"exdates" debe ser una lista de fechas');
    event.exdates = args.exdates.map((d) => date(d, 'exdates', { time: false }));
  }
  if (has(args, 'reminders')) {
    if (!Array.isArray(args.reminders)) fail('"reminders" debe ser una lista de minutos antes del inicio');
    event.reminders = [...new Set(args.reminders.map((m) => int(m, 'reminders', 0, 525_600)))].sort((a, b) => b - a);
  }
  if (has(args, 'sinceYear')) event.sinceYear = args.sinceYear === null ? null : int(args.sinceYear, 'sinceYear', 1, 9999);
}

/* -------------------------------------------------------------------- tools */

export const TOOLS = [];

function tool(name, description, properties, required, write, run) {
  TOOLS.push({ name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false }, write, run });
}

const S = (description) => ({ type: 'string', description });
const strings = (description) => ({ type: 'array', items: { type: 'string' }, description });
const DATE_HELP = '"AAAA-MM-DD" o "AAAA-MM-DDTHH:mm" (hora local)';
const POSITION = { description: '"top", "bottom" (por defecto) o un índice desde 0', anyOf: [{ type: 'string', enum: ['top', 'bottom'] }, { type: 'integer', minimum: 0 }] };
const CHECKLISTS = {
  type: 'array',
  description: 'Reemplaza todos los checklists. Cada elemento puede ser texto o { text, done?, due?, children? } (hasta 5 niveles). Conserva los "id" para no perder el estado.',
  items: {
    type: 'object',
    properties: { id: { type: 'string' }, title: { type: 'string' }, items: { type: 'array', items: {} } },
    required: ['title'],
  },
};
const CARD_PROPS = {
  title: S('Título de la tarjeta'),
  description: S('Descripción en Markdown'),
  labels: strings('Nombres de etiquetas del tablero (ver get_overview). Reemplaza las actuales.'),
  start: S(`Fecha de inicio, ${DATE_HELP}, o null`),
  due: S(`Fecha de vencimiento, ${DATE_HELP}, o null`),
  dueDone: { type: 'boolean', description: 'Marca la fecha de vencimiento como cumplida' },
  priority: { type: ['string', 'null'], enum: [...PRIORITIES, null], description: 'Prioridad' },
  kind: { type: 'string', enum: ['card', 'separator'] },
  isTemplate: { type: 'boolean', description: 'Usar como plantilla' },
  checklists: CHECKLISTS,
  fields: { type: 'object', description: 'Campos personalizados del tablero: { "Nombre del campo": valor }. Los desplegables se indican por el nombre de la opción; null borra el valor.' },
};

tool('get_overview', 'Resumen para orientarse: fecha de hoy, zona horaria, tableros con sus listas, etiquetas y campos personalizados, y etiquetas de eventos. Empieza siempre por aquí para conocer los ids.', {}, [], false, ({ data, today, timeZone }) => ({
  today,
  timeZone,
  boards: data.boardOrder.filter((id) => data.boards[id]).map((id) => {
    const board = data.boards[id];
    return {
      id,
      title: board.title,
      starred: !!board.starred,
      lists: board.listIds.filter((l) => data.lists[l]).map((l) => ({ id: l, title: data.lists[l].title, cards: data.lists[l].cardIds.length })),
      labels: board.labels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
      fields: (board.fields ?? []).map((f) => ({ id: f.id, name: f.name, type: f.type, ...(f.type === 'select' ? { options: f.options.map((o) => o.name) } : {}) })),
    };
  }),
  eventLabels: data.eventLabels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
  eventKinds: EVENT_KINDS,
}));

/* --- tableros */

tool('create_board', 'Crea un tablero (con las etiquetas por defecto y sin listas).', {
  title: S('Título'), background: S('Fondo: clave (p. ej. "ocean", "sunset") o "custom:#rrggbb"'), starred: { type: 'boolean' },
}, ['title'], true, ({ data }, a) => {
  const now = Date.now();
  const board = {
    id: uid(), title: text(a.title, 'title', { max: 300, required: true }), background: a.background ? text(a.background, 'background', { max: 120 }) : 'ocean',
    starred: a.starred === undefined ? false : bool(a.starred, 'starred'), listIds: [], labels: defaultLabels(), fields: [], createdAt: now, updatedAt: now,
  };
  data.boards[board.id] = board;
  data.boardOrder.push(board.id);
  return board;
});

tool('update_board', 'Cambia el título, el fondo o el favorito de un tablero.', {
  boardId: S('Id del tablero'), title: S('Título'), background: S('Fondo'), starred: { type: 'boolean' },
}, ['boardId'], true, ({ data }, a) => {
  const board = boardOf(data, a.boardId);
  if (has(a, 'title')) board.title = text(a.title, 'title', { max: 300, required: true });
  if (has(a, 'background')) board.background = text(a.background, 'background', { max: 120, required: true });
  if (has(a, 'starred')) board.starred = bool(a.starred, 'starred');
  board.updatedAt = Date.now();
  return board;
});

tool('delete_board', 'Elimina un tablero con todas sus listas y tarjetas. No se puede deshacer (hay copias horarias en el servidor).', { boardId: S('Id del tablero') }, ['boardId'], true, ({ data }, a) => {
  const board = boardOf(data, a.boardId);
  for (const list of Object.values(data.lists)) if (list.boardId === board.id) delete data.lists[list.id];
  let cards = 0;
  for (const card of Object.values(data.cards)) {
    if (card.boardId === board.id) {
      delete data.cards[card.id];
      cards++;
    }
  }
  delete data.boards[board.id];
  data.boardOrder = data.boardOrder.filter((id) => id !== board.id);
  return { deleted: board.id, cards };
});

/* --- listas */

tool('create_list', 'Crea una lista (columna) en un tablero.', {
  boardId: S('Id del tablero'), title: S('Título'), position: POSITION, color: S('Color de la cabecera, p. ej. "blue"'), wipLimit: { type: ['integer', 'null'], description: 'Límite de tarjetas en curso' },
}, ['boardId', 'title'], true, ({ data }, a) => {
  const board = boardOf(data, a.boardId);
  const list = {
    id: uid(), boardId: board.id, title: text(a.title, 'title', { max: 300, required: true }), cardIds: [], color: has(a, 'color') ? color(a.color, 'color') : null,
    colorMode: 'header', collapsed: false, wipLimit: has(a, 'wipLimit') && a.wipLimit !== null ? int(a.wipLimit, 'wipLimit', 1, 1000) : null, archived: false, createdAt: Date.now(),
  };
  data.lists[list.id] = list;
  place(board.listIds, list.id, a.position);
  board.updatedAt = Date.now();
  return list;
});

tool('update_list', 'Cambia el título, color, límite WIP o posición de una lista.', {
  listId: S('Id de la lista'), title: S('Título'), color: S('Color de la cabecera o null'), wipLimit: { type: ['integer', 'null'] }, position: POSITION,
}, ['listId'], true, ({ data }, a) => {
  const list = listOf(data, a.listId);
  if (has(a, 'title')) list.title = text(a.title, 'title', { max: 300, required: true });
  if (has(a, 'color')) list.color = color(a.color, 'color');
  if (has(a, 'wipLimit')) list.wipLimit = a.wipLimit === null ? null : int(a.wipLimit, 'wipLimit', 1, 1000);
  if (has(a, 'position')) place(data.boards[list.boardId].listIds, list.id, a.position);
  return list;
});

tool('delete_list', 'Elimina una lista y todas sus tarjetas.', { listId: S('Id de la lista') }, ['listId'], true, ({ data }, a) => {
  const list = listOf(data, a.listId);
  let cards = 0;
  for (const card of Object.values(data.cards)) {
    if (card.listId === list.id) {
      delete data.cards[card.id];
      cards++;
    }
  }
  const board = data.boards[list.boardId];
  if (board) board.listIds = board.listIds.filter((id) => id !== list.id);
  delete data.lists[list.id];
  return { deleted: list.id, cards };
});

/* --- etiquetas */

function labelOwner(data, boardId) {
  return boardId ? boardOf(data, boardId).labels : data.eventLabels;
}

tool('create_label', 'Crea una etiqueta de un tablero (con boardId) o del calendario (sin boardId).', {
  boardId: S('Id del tablero; omítelo para una etiqueta del calendario'), name: S('Nombre'), color: S('Color, p. ej. "green" o "red_bold"'), icon: S('Emoji o "lucide:Nombre"'),
}, ['name'], true, ({ data }, a) => {
  const labels = labelOwner(data, a.boardId);
  const label = { id: uid(), name: text(a.name, 'name', { max: 100, required: true }), color: color(a.color, 'color'), icon: iconValue(a.icon) };
  labels.push(label);
  return label;
});

tool('update_label', 'Cambia nombre, color o icono de una etiqueta.', {
  boardId: S('Id del tablero; omítelo para una etiqueta del calendario'), label: S('Nombre o id de la etiqueta'), name: S('Nuevo nombre'), color: S('Color o null'), icon: S('Icono o null'),
}, ['label'], true, ({ data }, a) => {
  const label = matchLabel(labelOwner(data, a.boardId), text(a.label, 'label', { required: true })) ?? fail(`No existe la etiqueta "${a.label}"`, 404);
  if (has(a, 'name')) label.name = text(a.name, 'name', { max: 100, required: true });
  if (has(a, 'color')) label.color = color(a.color, 'color');
  if (has(a, 'icon')) label.icon = iconValue(a.icon);
  return label;
});

tool('delete_label', 'Elimina una etiqueta y la quita de las tarjetas o eventos que la usan.', {
  boardId: S('Id del tablero; omítelo para una etiqueta del calendario'), label: S('Nombre o id de la etiqueta'),
}, ['label'], true, ({ data }, a) => {
  const labels = labelOwner(data, a.boardId);
  const label = matchLabel(labels, text(a.label, 'label', { required: true })) ?? fail(`No existe la etiqueta "${a.label}"`, 404);
  labels.splice(labels.indexOf(label), 1);
  const users = a.boardId ? Object.values(data.cards).filter((c) => c.boardId === a.boardId) : Object.values(data.events);
  for (const item of users) item.labelIds = (item.labelIds ?? []).filter((id) => id !== label.id);
  return { deleted: label.id };
});

/* --- tarjetas */

tool('list_cards', 'Busca tarjetas (resumen). Sin filtros devuelve las no archivadas, en el orden del tablero.', {
  boardId: S('Solo de este tablero'), listId: S('Solo de esta lista'), query: S('Texto contenido en el título o la descripción'), label: S('Nombre de etiqueta'),
  priority: { type: 'string', enum: PRIORITIES }, dueBefore: S('Vence el AAAA-MM-DD o antes'), dueAfter: S('Vence el AAAA-MM-DD o después'),
  includeArchived: { type: 'boolean' }, limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Máximo de resultados (100 por defecto)' },
}, [], false, ({ data }, a) => {
  const query = a.query ? text(a.query, 'query').toLowerCase() : '';
  const dueBefore = date(a.dueBefore, 'dueBefore', { time: false });
  const dueAfter = date(a.dueAfter, 'dueAfter', { time: false });
  const limit = a.limit === undefined ? 100 : int(a.limit, 'limit', 1, 500);
  const boards = a.boardId ? [boardOf(data, a.boardId).id] : data.boardOrder;
  const found = [];
  const visit = (card) => {
    if (!card || (card.archived && !a.includeArchived) || (a.listId && card.listId !== a.listId)) return;
    if (a.priority && card.priority !== a.priority) return;
    if (a.label && !labelNames(data.boards[card.boardId]?.labels ?? [], card.labelIds).some((n) => n.toLowerCase() === String(a.label).toLowerCase())) return;
    if (query && !`${card.title}\n${card.description ?? ''}`.toLowerCase().includes(query)) return;
    const due = card.due?.slice(0, 10);
    if ((dueBefore || dueAfter) && !due) return;
    if (dueBefore && due > dueBefore) return;
    if (dueAfter && due < dueAfter) return;
    found.push(card);
  };
  const seen = new Set();
  for (const boardId of boards) {
    for (const listId of data.boards[boardId]?.listIds ?? []) {
      for (const cardId of data.lists[listId]?.cardIds ?? []) {
        seen.add(cardId);
        visit(data.cards[cardId]);
      }
    }
  }
  if (a.includeArchived) {
    for (const card of Object.values(data.cards)) if (!seen.has(card.id) && boards.includes(card.boardId)) visit(card);
  }
  return { total: found.length, cards: found.slice(0, limit).map((c) => cardSummary(data, c)) };
});

tool('get_card', 'Devuelve una tarjeta completa: descripción, checklists, comentarios, campos y adjuntos.', { cardId: S('Id de la tarjeta') }, ['cardId'], false, ({ data }, a) => cardFull(data, cardOf(data, a.cardId)));

tool('create_card', 'Crea una tarjeta en una lista.', { listId: S('Id de la lista'), ...CARD_PROPS, position: POSITION }, ['listId', 'title'], true, ({ data }, a) => {
  const list = listOf(data, a.listId);
  text(a.title, 'title', { required: true });
  const now = Date.now();
  const card = {
    id: uid(), boardId: list.boardId, listId: list.id, kind: 'card', title: '', description: '', labelIds: [], cover: null, start: null, due: null, dueDone: false,
    priority: null, checklists: [], attachments: [], comments: [], fields: {}, isTemplate: false, archived: false, createdAt: now, updatedAt: now,
  };
  applyCard(data, card, a);
  data.cards[card.id] = card;
  place(list.cardIds, card.id, a.position);
  return cardFull(data, card);
});

tool('update_card', 'Modifica una tarjeta. Solo cambian los campos indicados. Con listId (y position) la mueve a otra lista, también de otro tablero (sus etiquetas se trasladan por nombre y los campos personalizados se vacían). Con archived la archiva o restaura.', {
  cardId: S('Id de la tarjeta'), ...CARD_PROPS, listId: S('Lista de destino'), position: POSITION, archived: { type: 'boolean' },
}, ['cardId'], true, ({ data }, a) => {
  const card = cardOf(data, a.cardId);
  if (has(a, 'listId') || (has(a, 'position') && !card.archived)) {
    moveCardTo(data, card, listOf(data, a.listId ?? card.listId), a.position);
  }
  applyCard(data, card, a);
  if (has(a, 'archived')) {
    if (bool(a.archived, 'archived') && !card.archived) {
      removeFromList(data, card);
      card.archived = true;
    } else if (!a.archived && card.archived) {
      const list = data.lists[card.listId] ?? listOf(data, a.listId);
      card.archived = false;
      place(list.cardIds, card.id, a.position);
    }
  }
  card.updatedAt = Date.now();
  return cardFull(data, card);
});

tool('delete_card', 'Elimina una tarjeta definitivamente. Para conservarla, usa update_card con archived=true.', { cardId: S('Id de la tarjeta') }, ['cardId'], true, ({ data }, a) => {
  const card = cardOf(data, a.cardId);
  removeFromList(data, card);
  delete data.cards[card.id];
  return { deleted: card.id };
});

tool('add_comment', 'Añade un comentario a una tarjeta.', { cardId: S('Id de la tarjeta'), text: S('Texto (Markdown)') }, ['cardId', 'text'], true, ({ data }, a) => {
  const card = cardOf(data, a.cardId);
  const comment = { id: uid(), text: text(a.text, 'text', { max: 20000, required: true }), createdAt: Date.now() };
  (card.comments ??= []).push(comment);
  card.updatedAt = comment.createdAt;
  return comment;
});

tool('update_comment', 'Edita el texto de un comentario.', { cardId: S('Id de la tarjeta'), commentId: S('Id del comentario'), text: S('Nuevo texto') }, ['cardId', 'commentId', 'text'], true, ({ data }, a) => {
  const card = cardOf(data, a.cardId);
  const comment = (card.comments ?? []).find((c) => c.id === a.commentId) ?? fail(`No existe el comentario "${a.commentId}"`, 404);
  comment.text = text(a.text, 'text', { max: 20000, required: true });
  comment.editedAt = card.updatedAt = Date.now();
  return comment;
});

tool('delete_comment', 'Elimina un comentario.', { cardId: S('Id de la tarjeta'), commentId: S('Id del comentario') }, ['cardId', 'commentId'], true, ({ data }, a) => {
  const card = cardOf(data, a.cardId);
  if (!(card.comments ?? []).some((c) => c.id === a.commentId)) fail(`No existe el comentario "${a.commentId}"`, 404);
  card.comments = card.comments.filter((c) => c.id !== a.commentId);
  card.updatedAt = Date.now();
  return { deleted: a.commentId };
});

/* --- eventos */

const EVENT_PROPS = {
  title: S('Título'),
  kind: { type: 'string', enum: EVENT_KINDS, description: 'event, birthday/anniversary (anuales), deadline/reminder (se marcan como hechos)' },
  start: S(`Primera ocurrencia: "AAAA-MM-DD" (todo el día) o "AAAA-MM-DDTHH:mm"`),
  end: S('Fin, con el mismo formato que start (en eventos de todo el día es inclusivo), o null'),
  notes: S('Notas'),
  location: S('Ubicación'),
  labels: strings('Nombres de etiquetas del calendario (ver get_overview)'),
  color: S('Color o null'),
  icon: S('Emoji, "lucide:Nombre" o "poke:<número>" o null'),
  recurrence: {
    type: ['object', 'null'],
    description: 'Repetición, o null. freq: daily|weekly|monthly|yearly; interval (cada N); byWeekday (1=lunes…7=domingo, semanal); monthlyBy: day|weekday|last-weekday; until (AAAA-MM-DD); count',
    properties: { freq: { type: 'string', enum: FREQS }, interval: { type: 'integer' }, byWeekday: { type: 'array', items: { type: 'integer' } }, monthlyBy: { type: 'string' }, until: { type: ['string', 'null'] }, count: { type: ['integer', 'null'] } },
    required: ['freq'],
  },
  exdates: strings('Ocurrencias eliminadas de la serie (AAAA-MM-DD)'),
  reminders: { type: 'array', items: { type: 'integer' }, description: 'Minutos de antelación de los avisos (0 = a la hora)' },
  sinceYear: { type: ['integer', 'null'], description: 'Cumpleaños/aniversarios: año de origen, para mostrar la edad' },
};

tool('list_events', 'Lista eventos del calendario. Con from y to devuelve solo los que ocurren en ese rango, con sus fechas de ocurrencia.', {
  from: S('AAAA-MM-DD'), to: S('AAAA-MM-DD (por defecto, 31 días después de from)'), kind: { type: 'string', enum: EVENT_KINDS }, query: S('Texto en título, notas o ubicación'), limit: { type: 'integer', minimum: 1, maximum: 500 },
}, [], false, ({ data }, a) => {
  const from = date(a.from, 'from', { time: false });
  let to = date(a.to, 'to', { time: false });
  if (from && !to) to = new Date(Date.parse(`${from}T00:00:00Z`) + 31 * 86400e3).toISOString().slice(0, 10);
  if (!from && to) fail('"to" necesita "from"');
  const query = a.query ? text(a.query, 'query').toLowerCase() : '';
  const limit = a.limit === undefined ? 200 : int(a.limit, 'limit', 1, 500);
  const out = [];
  for (const event of Object.values(data.events).sort((x, y) => x.start.localeCompare(y.start))) {
    if (a.kind && event.kind !== a.kind) continue;
    if (query && !`${event.title}\n${event.notes ?? ''}\n${event.location ?? ''}`.toLowerCase().includes(query)) continue;
    const shape = eventShape(data, event);
    if (from) {
      const days = occurrences(event, from, to);
      if (!days.length) continue;
      shape.occurrences = days;
    }
    out.push(shape);
  }
  return { total: out.length, events: out.slice(0, limit) };
});

tool('get_event', 'Devuelve un evento completo.', { eventId: S('Id del evento') }, ['eventId'], false, ({ data }, a) => eventShape(data, eventOf(data, a.eventId)));

tool('create_event', 'Crea un evento, cumpleaños, aniversario, fecha límite o recordatorio. Cada tipo trae avisos (y repetición anual en cumpleaños y aniversarios) por defecto.', EVENT_PROPS, ['title', 'start'], true, ({ data }, a) => {
  const kind = a.kind === undefined ? 'event' : oneOf(a.kind, EVENT_KINDS, 'kind');
  text(a.title, 'title', { required: true });
  if (!a.start) fail('Falta "start"');
  const defaults = KIND_DEFAULTS[kind];
  const now = Date.now();
  const event = {
    id: uid(), kind, title: '', notes: '', location: '', color: null, icon: null, labelIds: [], start: '', end: null,
    recurrence: defaults.yearly ? { freq: 'yearly', interval: 1, byWeekday: [], monthlyBy: 'day', until: null, count: null } : null,
    exdates: [], reminders: [...defaults.reminders], done: [], sinceYear: null, createdAt: now, updatedAt: now,
  };
  applyEvent(data, event, a);
  data.events[event.id] = event;
  return eventShape(data, event);
});

tool('update_event', 'Modifica un evento. Solo cambian los campos indicados.', { eventId: S('Id del evento'), ...EVENT_PROPS }, ['eventId'], true, ({ data }, a) => {
  const event = eventOf(data, a.eventId);
  if (has(a, 'kind')) event.kind = oneOf(a.kind, EVENT_KINDS, 'kind');
  applyEvent(data, event, a);
  event.updatedAt = Date.now();
  return eventShape(data, event);
});

tool('delete_event', 'Elimina un evento (toda la serie si se repite). Para quitar solo una ocurrencia, añade su fecha a exdates con update_event.', { eventId: S('Id del evento') }, ['eventId'], true, ({ data }, a) => {
  const event = eventOf(data, a.eventId);
  delete data.events[event.id];
  return { deleted: event.id };
});

tool('set_event_done', 'Marca o desmarca como hecha una ocurrencia de una fecha límite o un recordatorio.', {
  eventId: S('Id del evento'), date: S('Fecha de la ocurrencia, AAAA-MM-DD'), done: { type: 'boolean', description: 'true por defecto' },
}, ['eventId', 'date'], true, ({ data }, a) => {
  const event = eventOf(data, a.eventId);
  if (!isCheckable(event)) fail('Solo las fechas límite y los recordatorios se pueden marcar como hechos');
  const day = date(a.date, 'date', { time: false }) ?? fail('Falta "date"');
  const done = a.done === undefined ? true : bool(a.done, 'done');
  const rest = (event.done ?? []).filter((d) => d !== day);
  event.done = done ? [...rest, day].sort() : rest;
  event.updatedAt = Date.now();
  return eventShape(data, event);
});

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function findTool(name) {
  return BY_NAME.get(name) ?? null;
}

export function toolContext(data, now = Date.now()) {
  ensure(data);
  const timeZone = data.settings?.timeZone || 'UTC';
  return { data, timeZone, today: dayKeyAt(now, timeZone) };
}

/* ---------------------------------------------------------------------- MCP */

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

function describeTool(t) {
  return {
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { readOnlyHint: !t.write, destructiveHint: t.name.startsWith('delete_') },
  };
}

export const toolList = () => TOOLS.map((t) => ({ ...describeTool(t), write: t.write }));

/**
 * Responde a un mensaje JSON-RPC del protocolo MCP (transporte HTTP sin estado).
 * `call(name, args)` ejecuta una herramienta; devuelve null para las notificaciones.
 */
export async function mcpMessage(message, call) {
  const reply = (result) => ({ jsonrpc: '2.0', id: message.id, result });
  const error = (code, text) => ({ jsonrpc: '2.0', id: message.id ?? null, error: { code, message: text } });
  if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return error(-32600, 'Solicitud no válida');
  if (message.id === undefined) return null;
  switch (message.method) {
    case 'initialize': {
      const asked = message.params?.protocolVersion;
      return reply({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'pokekanban', version: '1.0.0' },
        instructions: 'Tableros Kanban y calendario personales. Llama primero a get_overview para conocer tableros, listas y etiquetas.',
      });
    }
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS.map(describeTool) });
    case 'tools/call': {
      const name = message.params?.name;
      if (!findTool(name)) return error(-32602, `Herramienta desconocida: ${name}`);
      try {
        const result = await call(name, message.params?.arguments ?? {});
        return reply({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } catch (err) {
        if (!(err instanceof ToolError)) throw err;
        return reply({ content: [{ type: 'text', text: err.message }], isError: true });
      }
    }
    default:
      return error(-32601, `Método no admitido: ${message.method}`);
  }
}
