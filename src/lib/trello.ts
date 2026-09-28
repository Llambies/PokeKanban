import type { Board, Card, Checklist, ChecklistItem, Label, List } from '../types';
import { toDateKey } from './dates';
import { uid } from './id';

/**
 * Converts a Trello board export ("Menú → Imprimir, exportar y compartir → Exportar como JSON")
 * into PokeKanban entities.
 */

type Raw = any;

export interface BoardPayload {
  board: Board;
  lists: List[];
  cards: Card[];
}

export function isTrelloExport(json: Raw): boolean {
  return !!json && typeof json === 'object' && typeof json.name === 'string' && Array.isArray(json.lists) && Array.isArray(json.cards);
}

const TRELLO_COLORS = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'black'];

function mapColor(color: unknown): string | null {
  if (typeof color !== 'string') return null;
  const [hue, shade] = color.split('_');
  if (!TRELLO_COLORS.includes(hue)) return null;
  if (shade === 'dark') return `${hue}_bold`;
  if (shade === 'light') return `${hue}_subtle`;
  return hue;
}

const BG_MAP: Record<string, string> = {
  blue: 'blue', orange: 'orange', green: 'green', red: 'red', purple: 'purple', pink: 'pink', lime: 'lime', sky: 'sky', grey: 'grey',
};

function mapDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const byPos = (a: Raw, b: Raw) => (Number(a.pos) || 0) - (Number(b.pos) || 0);

export function convertTrello(json: Raw): BoardPayload {
  const now = Date.now();
  const boardId = uid();

  const labelMap = new Map<string, string>();
  const labels: Label[] = (json.labels ?? []).map((l: Raw) => {
    const id = uid();
    labelMap.set(l.id, id);
    return { id, name: String(l.name ?? ''), color: mapColor(l.color), icon: null };
  });

  const background = BG_MAP[json.prefs?.background] ?? (json.prefs?.backgroundColor ? `custom:${json.prefs.backgroundColor}` : 'ocean');

  const board: Board = {
    id: boardId,
    title: String(json.name || 'Tablero de Trello'),
    background,
    starred: !!json.starred,
    listIds: [],
    labels,
    createdAt: now,
    updatedAt: now,
  };

  const listMap = new Map<string, List>();
  const lists: List[] = [...(json.lists ?? [])].sort(byPos).map((l: Raw) => {
    const list: List = {
      id: uid(),
      boardId,
      title: String(l.name ?? ''),
      cardIds: [],
      color: null,
      colorMode: 'header',
      collapsed: false,
      wipLimit: typeof l.softLimit === 'number' && l.softLimit > 0 ? l.softLimit : null,
      archived: !!l.closed,
      createdAt: now,
    };
    listMap.set(l.id, list);
    if (!list.archived) board.listIds.push(list.id);
    return list;
  });

  const checklistsByCard = new Map<string, Raw[]>();
  for (const cl of json.checklists ?? []) {
    const arr = checklistsByCard.get(cl.idCard) ?? [];
    arr.push(cl);
    checklistsByCard.set(cl.idCard, arr);
  }

  const commentsByCard = new Map<string, Raw[]>();
  for (const action of json.actions ?? []) {
    if (action.type !== 'commentCard') continue;
    const cardId = action.data?.card?.id;
    if (!cardId) continue;
    const arr = commentsByCard.get(cardId) ?? [];
    arr.push(action);
    commentsByCard.set(cardId, arr);
  }

  const cards: Card[] = [];
  for (const c of [...(json.cards ?? [])].sort(byPos)) {
    const list = listMap.get(c.idList);
    if (!list) continue;
    const checklists: Checklist[] = (checklistsByCard.get(c.id) ?? []).sort(byPos).map((cl: Raw) => ({
      id: uid(),
      title: String(cl.name ?? 'Checklist'),
      items: [...(cl.checkItems ?? [])].sort(byPos).map(
        (it: Raw): ChecklistItem => ({
          id: uid(),
          text: String(it.name ?? ''),
          done: it.state === 'complete',
          due: mapDate(it.due),
          children: [],
        }),
      ),
    }));
    const coverColor = mapColor(c.cover?.color);
    const card: Card = {
      id: uid(),
      boardId,
      listId: list.id,
      kind: 'card',
      title: String(c.name ?? ''),
      description: String(c.desc ?? ''),
      labelIds: (c.idLabels ?? []).map((id: string) => labelMap.get(id)).filter(Boolean),
      cover: coverColor ? { color: coverColor, image: null, size: c.cover?.size === 'full' ? 'full' : 'strip' } : null,
      start: mapDate(c.start),
      due: mapDate(c.due),
      dueDone: !!c.dueComplete,
      priority: null,
      checklists,
      attachments: (c.attachments ?? [])
        .filter((a: Raw) => typeof a.url === 'string')
        .map((a: Raw) => ({ id: uid(), name: String(a.name ?? a.url), url: a.url, createdAt: Date.parse(a.date) || now })),
      comments: (commentsByCard.get(c.id) ?? []).map((a: Raw) => ({
        id: uid(),
        text: String(a.data?.text ?? ''),
        createdAt: Date.parse(a.date) || now,
      })),
      isTemplate: !!c.isTemplate,
      archived: !!c.closed,
      createdAt: Date.parse(c.dateLastActivity) || now,
      updatedAt: Date.parse(c.dateLastActivity) || now,
    };
    cards.push(card);
    if (!card.archived) list.cardIds.push(card.id);
  }

  return { board, lists, cards };
}
