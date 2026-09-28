import type { AppData, Card, List } from '../types';
import { getData, importBoard } from '../store/store';
import { normalizeData } from '../store/normalize';
import { replaceAllData } from '../store/persistence';
import { confirmDialog, toast } from '../store/ui';
import { downloadJson, pickFile, slugify } from './download';
import { todayKey } from './dates';
import { convertTrello, isTrelloExport, type BoardPayload } from './trello';

const BOARD_FORMAT = 'pokekanban-board';

export function exportAll(): void {
  downloadJson(`pokekanban-${todayKey()}.json`, getData());
}

export function boardPayload(boardId: string, data: AppData = getData()): BoardPayload | null {
  const board = data.boards[boardId];
  if (!board) return null;
  const lists: List[] = Object.values(data.lists).filter((l) => l.boardId === boardId);
  const cards: Card[] = Object.values(data.cards).filter((c) => c.boardId === boardId);
  return { board, lists, cards };
}

export function exportBoard(boardId: string): void {
  const payload = boardPayload(boardId);
  if (!payload) return;
  downloadJson(`${slugify(payload.board.title)}-${todayKey()}.json`, { format: BOARD_FORMAT, version: 1, ...payload });
}

/**
 * Imports a file chosen by the user. Supported formats:
 *  - full PokeKanban backup (replaces everything after confirmation)
 *  - single PokeKanban board export (added as a new board)
 *  - Trello board JSON export (added as a new board)
 * Returns the id of the imported board (if a single board was imported).
 */
export async function importFromFile(): Promise<string | null> {
  const file = await pickFile();
  if (!file) return null;
  let json: any;
  try {
    json = JSON.parse(await file.text());
  } catch {
    toast('El archivo no es un JSON válido.');
    return null;
  }

  if (json?.format === BOARD_FORMAT && json.board) {
    const normalized = normalizeData({
      boards: { [json.board.id]: json.board },
      boardOrder: [json.board.id],
      lists: Object.fromEntries((json.lists ?? []).map((l: List) => [l.id, l])),
      cards: Object.fromEntries((json.cards ?? []).map((c: Card) => [c.id, c])),
    });
    const payload = boardPayload(json.board.id, normalized);
    if (!payload) {
      toast('No se pudo leer el tablero.');
      return null;
    }
    const id = importBoard(payload);
    toast(`Tablero "${payload.board.title}" importado.`);
    return id;
  }

  if (json && typeof json === 'object' && json.boards && json.lists && json.cards) {
    const data = normalizeData(json);
    const count = data.boardOrder.length;
    const ok = await confirmDialog({
      title: 'Restaurar copia de seguridad',
      message: `Se reemplazarán todos tus tableros actuales por los ${count} tablero(s) de la copia. Podrás deshacerlo con Ctrl+Z.`,
      confirmText: 'Restaurar',
      danger: true,
    });
    if (!ok) return null;
    replaceAllData(data);
    toast('Copia de seguridad restaurada.');
    return null;
  }

  if (isTrelloExport(json)) {
    const payload = convertTrello(json);
    const id = importBoard(payload);
    toast(`Tablero de Trello "${payload.board.title}" importado (${payload.cards.length} tarjetas).`);
    return id;
  }

  toast('Formato no reconocido. Usa una copia de PokeKanban o un JSON exportado de Trello.');
  return null;
}
