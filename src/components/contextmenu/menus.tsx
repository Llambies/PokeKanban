import {
  Archive, ArrowDownToLine, ArrowRightLeft, ArrowUpToLine, CalendarDays, CalendarPlus, CheckCheck, ChevronsDownUp,
  ChevronsUpDown, Clock, Columns3, Copy, CornerDownRight, Download, Filter, Flag, FolderInput, Gauge, IndentDecrease,
  IndentIncrease, Kanban, LayoutTemplate, Link, ListPlus, ListTree, PaintBucket, PanelTop, Pencil, Plus, SeparatorHorizontal,
  SlidersHorizontal, SortAsc, SquareArrowOutUpRight, Star, StarOff, Table2, Tag, Tags, Trash2, Undo2, ArrowUp, ArrowDown, CalendarX, Image,
} from 'lucide-react';
import type { Card, Priority } from '../../types';
import * as S from '../../store/store';
import { getData } from '../../store/store';
import { confirmDialog, openPanel, promptDialog, setPrefs, toast, usePrefs, useUI } from '../../store/ui';
import { cardLink, getRoute, navigate, openCard } from '../../lib/router';
import { BOARD_BACKGROUNDS, colorName, getBoardBackground, getColor } from '../../lib/colors';
import { PRIORITIES } from '../../lib/priority';
import { formatFieldValue } from '../../lib/fields';
import { addDaysKey, formatDate, moveToDay, nextWeekdayKey, todayKey } from '../../lib/dates';
import { copyToClipboard } from '../../lib/download';
import { exportBoard } from '../../lib/backup';
import * as tree from '../../lib/checklist';
import { IconGlyph } from '../common/LabelChip';
import { SwatchGrid } from '../common/SwatchGrid';
import type { MenuItem } from './menuStore';

const SEP: MenuItem = { kind: 'separator' };
const ICON = 15;

function ColorDot({ color, icon }: { color: string | null; icon?: string | null }) {
  const c = getColor(color);
  return (
    <span className="color-dot" style={c ? { background: c.bg, color: c.fg } : undefined}>
      {icon && <IconGlyph icon={icon} size={10} />}
    </span>
  );
}

function PriorityFlag({ color }: { color: string }) {
  return <Flag size={ICON} color={color} fill={color} />;
}

export function undoToast(text: string): void {
  toast(text, { actionText: 'Deshacer', action: () => S.undo() });
}

/* ------------------------------------------------------------ submenus */

function labelsSubmenu(card: Card): MenuItem[] {
  const board = getData().boards[card.boardId];
  const items: MenuItem[] = board.labels.map((label, i) => ({
    label: label.name || colorName(label.color),
    icon: <ColorDot color={label.color} icon={label.icon} />,
    checked: card.labelIds.includes(label.id),
    hint: i < 9 ? String(i + 1) : undefined,
    keepOpen: true,
    onSelect: () => S.toggleLabel(card.id, label.id),
  }));
  if (items.length === 0) items.push({ kind: 'header', label: 'Este tablero no tiene etiquetas' });
  items.push(SEP, {
    label: 'Nueva etiqueta…',
    icon: <Plus size={ICON} />,
    onSelect: async () => {
      const name = await promptDialog({ title: 'Nueva etiqueta', label: 'Nombre', value: '', confirmText: 'Crear' });
      if (name === null) return;
      const palette = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink'];
      const color = palette[board.labels.length % palette.length];
      const id = S.createLabel(board.id, { name: name.trim(), color, icon: null });
      S.toggleLabel(card.id, id);
    },
  });
  items.push({ label: 'Gestionar etiquetas…', icon: <Tag size={ICON} />, onSelect: () => openPanel('labels') });
  return items;
}

function coverSubmenu(card: Card): MenuItem[] {
  const size = card.cover?.size ?? 'strip';
  return [
    {
      kind: 'custom',
      key: 'cover-swatches',
      render: () => (
        <div className="ctx-swatches">
          <SwatchGrid
            value={card.cover?.color ?? null}
            rows={[1, 2]}
            size="sm"
            noneLabel="Sin portada"
            onChange={(color) =>
              S.setCover(card.id, color ? { color, image: card.cover?.image ?? null, size } : card.cover?.image ? { ...card.cover, color: null } : null)
            }
          />
        </div>
      ),
    },
    SEP,
    {
      label: 'Franja superior',
      checked: size === 'strip',
      keepOpen: true,
      disabled: !card.cover,
      onSelect: () => card.cover && S.setCover(card.id, { ...card.cover, size: 'strip' }),
    },
    {
      label: 'Tarjeta completa',
      checked: size === 'full',
      keepOpen: true,
      disabled: !card.cover,
      onSelect: () => card.cover && S.setCover(card.id, { ...card.cover, size: 'full' }),
    },
    SEP,
    {
      label: 'Imagen desde URL…',
      icon: <Image size={ICON} />,
      onSelect: async () => {
        const url = await promptDialog({
          title: 'Imagen de portada',
          label: 'URL de la imagen',
          value: card.cover?.image ?? '',
          placeholder: 'https://…',
          inputType: 'url',
        });
        if (url === null) return;
        const image = url.trim() || null;
        S.setCover(card.id, image || card.cover?.color ? { color: card.cover?.color ?? null, image, size } : null);
      },
    },
  ];
}

function datesSubmenu(card: Card): MenuItem[] {
  const setDue = (key: string) => S.updateCard(card.id, { due: moveToDay(card.due, key), dueDone: false });
  const today = todayKey();
  return [
    { label: 'Hoy', icon: <CalendarDays size={ICON} />, hint: formatDate(today), onSelect: () => setDue(today) },
    { label: 'Mañana', icon: <CalendarPlus size={ICON} />, hint: formatDate(addDaysKey(1)), onSelect: () => setDue(addDaysKey(1)) },
    { label: 'Próximo lunes', icon: <CalendarPlus size={ICON} />, hint: formatDate(nextWeekdayKey(1)), onSelect: () => setDue(nextWeekdayKey(1)) },
    { label: 'En una semana', icon: <CalendarPlus size={ICON} />, hint: formatDate(addDaysKey(7)), onSelect: () => setDue(addDaysKey(7)) },
    { label: 'En un mes', icon: <CalendarPlus size={ICON} />, hint: formatDate(addDaysKey(30)), onSelect: () => setDue(addDaysKey(30)) },
    SEP,
    {
      label: 'Completada',
      icon: <CheckCheck size={ICON} />,
      checked: card.dueDone,
      disabled: !card.due,
      keepOpen: true,
      onSelect: () => S.updateCard(card.id, { dueDone: !card.dueDone }),
    },
    {
      label: 'Quitar fechas',
      icon: <CalendarX size={ICON} />,
      disabled: !card.due && !card.start,
      onSelect: () => S.updateCard(card.id, { due: null, start: null, dueDone: false }),
    },
    { label: 'Más opciones…', icon: <Clock size={ICON} />, onSelect: () => openCard(card.id, card.boardId) },
  ];
}

function prioritySubmenu(card: Card): MenuItem[] {
  return [
    ...PRIORITIES.map(
      (p): MenuItem => ({
        label: p.name,
        icon: <PriorityFlag color={p.color} />,
        checked: card.priority === p.key,
        onSelect: () => S.updateCard(card.id, { priority: card.priority === p.key ? null : (p.key as Priority) }),
      }),
    ),
    SEP,
    { label: 'Sin prioridad', checked: card.priority === null, onSelect: () => S.updateCard(card.id, { priority: null }) },
  ];
}

function fieldsSubmenu(card: Card): MenuItem[] {
  const fields = getData().boards[card.boardId]?.fields ?? [];
  const items: MenuItem[] = [];
  for (const field of fields) {
    const value = card.fields[field.id];
    if (field.type === 'checkbox') {
      items.push({
        label: field.name,
        checked: value === true,
        keepOpen: true,
        onSelect: () => S.setCardField(card.id, field.id, value === true ? null : true),
      });
    } else if (field.type === 'select') {
      items.push({
        label: field.name,
        hint: formatFieldValue(field, value) ?? undefined,
        submenu: () => [
          ...field.options.map(
            (o): MenuItem => ({
              label: o.name,
              icon: <ColorDot color={o.color} />,
              checked: getData().cards[card.id]?.fields[field.id] === o.id,
              onSelect: () => S.setCardField(card.id, field.id, o.id),
            }),
          ),
          SEP,
          { label: 'Sin valor', onSelect: () => S.setCardField(card.id, field.id, null) },
        ],
      });
    } else {
      items.push({
        label: field.name,
        hint: formatFieldValue(field, value) ?? '—',
        onSelect: () => openCard(card.id, card.boardId),
      });
    }
  }
  items.push(SEP, { label: 'Gestionar campos…', icon: <SlidersHorizontal size={ICON} />, onSelect: () => openPanel('fields') });
  return items;
}

function listsOfBoard(boardId: string) {
  const data = getData();
  return data.boards[boardId]?.listIds.map((id) => data.lists[id]).filter(Boolean) ?? [];
}

function moveSubmenu(card: Card): MenuItem[] {
  const data = getData();
  const list = data.lists[card.listId];
  const index = list?.cardIds.indexOf(card.id) ?? 0;
  const items: MenuItem[] = [
    { kind: 'header', label: 'Mover a la lista' },
    ...listsOfBoard(card.boardId).map(
      (l): MenuItem => ({
        label: l.title,
        icon: <ColorDot color={l.color} />,
        checked: l.id === card.listId,
        disabled: l.id === card.listId,
        onSelect: () => {
          S.moveCard(card.id, l.id, data.lists[l.id].cardIds.length);
          undoToast(`Movida a "${l.title}"`);
        },
      }),
    ),
    SEP,
    {
      label: 'Subir al principio',
      icon: <ArrowUpToLine size={ICON} />,
      disabled: index === 0,
      onSelect: () => S.moveCard(card.id, card.listId, 0),
    },
    {
      label: 'Bajar al final',
      icon: <ArrowDownToLine size={ICON} />,
      disabled: !list || index === list.cardIds.length - 1,
      onSelect: () => S.moveCard(card.id, card.listId, list.cardIds.length),
    },
  ];
  const otherBoards = data.boardOrder.filter((id) => id !== card.boardId && data.boards[id].listIds.length > 0);
  if (otherBoards.length > 0) {
    items.push(SEP, {
      label: 'Otro tablero',
      icon: <FolderInput size={ICON} />,
      submenu: () =>
        otherBoards.map(
          (bid): MenuItem => ({
            label: data.boards[bid].title,
            submenu: () =>
              listsOfBoard(bid).map(
                (l): MenuItem => ({
                  label: l.title,
                  icon: <ColorDot color={l.color} />,
                  onSelect: () => {
                    S.moveCard(card.id, l.id, getData().lists[l.id].cardIds.length);
                    undoToast(`Movida a "${data.boards[bid].title} › ${l.title}"`);
                  },
                }),
              ),
          }),
        ),
    });
  }
  return items;
}

/* --------------------------------------------------------------- card */

export function cardMenu(cardId: string): MenuItem[] {
  const card = getData().cards[cardId];
  if (!card || card.archived) return [];
  const isSeparator = card.kind === 'separator';
  return [
    { label: 'Abrir tarjeta', icon: <SquareArrowOutUpRight size={ICON} />, hint: 'Enter', onSelect: () => openCard(cardId, card.boardId) },
    { label: 'Editar título', icon: <Pencil size={ICON} />, hint: 'T', onSelect: () => useUI.setState({ editingCardId: cardId }) },
    SEP,
    { label: 'Etiquetas', icon: <Tag size={ICON} />, hint: card.labelIds.length ? String(card.labelIds.length) : undefined, submenu: () => labelsSubmenu(getData().cards[cardId]) },
    { label: isSeparator ? 'Color' : 'Portada', icon: <PanelTop size={ICON} />, submenu: () => coverSubmenu(getData().cards[cardId]) },
    ...(isSeparator
      ? []
      : [
          { label: 'Fechas', icon: <Clock size={ICON} />, hint: card.due ? formatDate(card.due) : undefined, submenu: () => datesSubmenu(getData().cards[cardId]) },
          { label: 'Prioridad', icon: <Flag size={ICON} />, hint: PRIORITIES.find((p) => p.key === card.priority)?.name, submenu: () => prioritySubmenu(getData().cards[cardId]) },
          ...((getData().boards[card.boardId]?.fields.length ?? 0) > 0
            ? [{ label: 'Campos', icon: <SlidersHorizontal size={ICON} />, submenu: () => fieldsSubmenu(getData().cards[cardId]) }]
            : []),
        ]),
    SEP,
    { label: 'Mover', icon: <ArrowRightLeft size={ICON} />, submenu: () => moveSubmenu(getData().cards[cardId]) },
    { label: 'Duplicar', icon: <Copy size={ICON} />, hint: 'D', onSelect: () => S.copyCard(cardId) },
    {
      label: isSeparator ? 'Convertir en tarjeta' : 'Convertir en separador',
      icon: <SeparatorHorizontal size={ICON} />,
      onSelect: () =>
        S.updateCard(cardId, {
          kind: isSeparator ? 'card' : 'separator',
          ...(!isSeparator && !card.cover ? { cover: { color: 'black_bold', image: null, size: 'full' as const } } : {}),
        }),
    },
    ...(isSeparator
      ? []
      : [
          {
            label: card.isTemplate ? 'Quitar de plantillas' : 'Usar como plantilla',
            icon: <LayoutTemplate size={ICON} />,
            onSelect: () => S.updateCard(cardId, { isTemplate: !card.isTemplate }),
          },
        ]),
    {
      label: 'Copiar enlace',
      icon: <Link size={ICON} />,
      onSelect: async () => {
        if (await copyToClipboard(cardLink(card.boardId, cardId))) toast('Enlace copiado');
      },
    },
    SEP,
    {
      label: 'Archivar',
      icon: <Archive size={ICON} />,
      hint: 'C',
      onSelect: () => {
        S.archiveCard(cardId);
        undoToast('Tarjeta archivada');
      },
    },
    {
      label: 'Eliminar…',
      icon: <Trash2 size={ICON} />,
      danger: true,
      onSelect: () => deleteCardWithConfirm(cardId),
    },
  ];
}

export async function deleteCardWithConfirm(cardId: string): Promise<boolean> {
  const card = getData().cards[cardId];
  if (!card) return false;
  const ok = await confirmDialog({
    title: '¿Eliminar tarjeta?',
    message: `"${card.title}" se eliminará definitivamente. Puedes deshacerlo con Ctrl+Z.`,
    confirmText: 'Eliminar',
    danger: true,
  });
  if (ok) {
    S.deleteCard(cardId);
    undoToast('Tarjeta eliminada');
  }
  return ok;
}

/* --------------------------------------------------------------- list */

export async function renameList(listId: string): Promise<void> {
  const list = getData().lists[listId];
  if (!list) return;
  const title = await promptDialog({ title: 'Renombrar lista', value: list.title });
  if (title?.trim()) S.updateList(listId, { title: title.trim() });
}

export function listMenu(listId: string): MenuItem[] {
  const data = getData();
  const list = data.lists[listId];
  if (!list) return [];
  const others = listsOfBoard(list.boardId).filter((l) => l.id !== listId);
  const otherBoards = data.boardOrder.filter((id) => id !== list.boardId);
  return [
    {
      label: 'Añadir tarjeta',
      icon: <Plus size={ICON} />,
      disabled: list.collapsed,
      onSelect: () => useUI.setState({ composerListId: listId }),
    },
    { label: 'Renombrar', icon: <Pencil size={ICON} />, onSelect: () => renameList(listId) },
    {
      label: 'Color de cabecera',
      icon: <PaintBucket size={ICON} />,
      hint: list.color ? colorName(list.color) : undefined,
      submenu: () => {
        const l = getData().lists[listId];
        return [
          {
            kind: 'custom',
            key: 'list-color',
            render: () => (
              <div className="ctx-swatches">
                <SwatchGrid value={l.color} onChange={(color) => S.updateList(listId, { color })} size="sm" />
              </div>
            ),
          },
          SEP,
          { label: 'Solo cabecera', checked: l.colorMode === 'header', keepOpen: true, onSelect: () => S.updateList(listId, { colorMode: 'header' }) },
          { label: 'Toda la columna', checked: l.colorMode === 'full', keepOpen: true, onSelect: () => S.updateList(listId, { colorMode: 'full' }) },
        ];
      },
    },
    {
      label: 'Límite WIP',
      icon: <Gauge size={ICON} />,
      hint: list.wipLimit ? String(list.wipLimit) : undefined,
      submenu: () => [
        { label: 'Sin límite', checked: list.wipLimit === null, onSelect: () => S.updateList(listId, { wipLimit: null }) },
        ...[1, 2, 3, 5, 8, 10].map(
          (n): MenuItem => ({ label: String(n), checked: list.wipLimit === n, onSelect: () => S.updateList(listId, { wipLimit: n }) }),
        ),
        SEP,
        {
          label: 'Personalizado…',
          onSelect: async () => {
            const v = await promptDialog({ title: 'Límite de tarjetas (WIP)', value: String(list.wipLimit ?? ''), inputType: 'number' });
            if (v === null) return;
            const n = Math.floor(Number(v));
            S.updateList(listId, { wipLimit: n > 0 ? n : null });
          },
        },
      ],
    },
    {
      label: list.collapsed ? 'Expandir lista' : 'Contraer lista',
      icon: list.collapsed ? <ChevronsUpDown size={ICON} /> : <ChevronsDownUp size={ICON} />,
      onSelect: () => S.updateList(listId, { collapsed: !list.collapsed }),
    },
    {
      label: 'Ordenar tarjetas',
      icon: <SortAsc size={ICON} />,
      disabled: list.cardIds.length < 2,
      submenu: () => [
        { label: 'Por fecha de vencimiento', onSelect: () => S.sortList(listId, 'due') },
        { label: 'Por prioridad', onSelect: () => S.sortList(listId, 'priority') },
        { label: 'Por nombre (A-Z)', onSelect: () => S.sortList(listId, 'title') },
        { label: 'Más recientes primero', onSelect: () => S.sortList(listId, 'created') },
        { label: 'Más antiguas primero', onSelect: () => S.sortList(listId, 'createdOld') },
      ],
    },
    SEP,
    {
      label: 'Mover todas las tarjetas a',
      icon: <CornerDownRight size={ICON} />,
      disabled: others.length === 0 || list.cardIds.length === 0,
      submenu: () =>
        others.map(
          (l): MenuItem => ({
            label: l.title,
            icon: <ColorDot color={l.color} />,
            onSelect: () => {
              S.moveAllCards(listId, l.id);
              undoToast(`Tarjetas movidas a "${l.title}"`);
            },
          }),
        ),
    },
    {
      label: 'Archivar todas las tarjetas',
      icon: <Archive size={ICON} />,
      disabled: list.cardIds.length === 0,
      onSelect: async () => {
        const ok = await confirmDialog({
          title: '¿Archivar todas las tarjetas?',
          message: `Se archivarán ${list.cardIds.length} tarjeta(s) de "${list.title}".`,
          confirmText: 'Archivar',
        });
        if (ok) {
          S.archiveAllCards(listId);
          undoToast('Tarjetas archivadas');
        }
      },
    },
    { label: 'Copiar lista', icon: <Copy size={ICON} />, onSelect: () => S.copyList(listId) },
    {
      label: 'Mover lista a otro tablero',
      icon: <FolderInput size={ICON} />,
      disabled: otherBoards.length === 0,
      submenu: () =>
        otherBoards.map(
          (bid): MenuItem => ({
            label: data.boards[bid].title,
            onSelect: () => {
              S.moveListToBoard(listId, bid);
              undoToast(`Lista movida a "${data.boards[bid].title}"`);
            },
          }),
        ),
    },
    SEP,
    {
      label: 'Archivar lista',
      icon: <Archive size={ICON} />,
      onSelect: () => {
        S.archiveList(listId);
        undoToast('Lista archivada');
      },
    },
    {
      label: 'Eliminar lista…',
      icon: <Trash2 size={ICON} />,
      danger: true,
      onSelect: async () => {
        const ok = await confirmDialog({
          title: '¿Eliminar lista?',
          message: `"${list.title}" y sus ${list.cardIds.length} tarjeta(s) se eliminarán definitivamente.`,
          confirmText: 'Eliminar',
          danger: true,
        });
        if (ok) {
          S.deleteList(listId);
          undoToast('Lista eliminada');
        }
      },
    },
  ];
}

/* -------------------------------------------------------------- board */

function backgroundSubmenu(boardId: string): MenuItem[] {
  return [
    {
      kind: 'custom',
      key: 'bg-grid',
      render: () => {
        const current = getData().boards[boardId]?.background;
        return (
          <div className="bg-grid bg-grid--menu">
            {BOARD_BACKGROUNDS.map((bg) => (
              <button
                key={bg.key}
                type="button"
                className={`bg-swatch ${current === bg.key ? 'is-selected' : ''}`}
                style={{ background: bg.css }}
                title={bg.name}
                aria-label={bg.name}
                onClick={() => S.updateBoard(boardId, { background: bg.key })}
              />
            ))}
          </div>
        );
      },
    },
  ];
}

export async function addListPrompt(boardId: string): Promise<void> {
  const title = await promptDialog({ title: 'Nueva lista', label: 'Título', value: '', confirmText: 'Añadir' });
  if (title?.trim()) S.createList(boardId, title.trim());
}

export function boardCanvasMenu(boardId: string): MenuItem[] {
  const data = getData();
  const board = data.boards[boardId];
  if (!board) return [];
  const route = getRoute();
  const lists = listsOfBoard(boardId);
  const anyExpanded = lists.some((l) => !l.collapsed);
  return [
    { label: 'Añadir lista', icon: <ListPlus size={ICON} />, onSelect: () => addListPrompt(boardId) },
    { label: 'Fondo del tablero', icon: <PaintBucket size={ICON} />, hint: getBoardBackground(board.background).name, submenu: () => backgroundSubmenu(boardId) },
    { label: 'Etiquetas…', icon: <Tag size={ICON} />, onSelect: () => openPanel('labels') },
    { label: 'Campos personalizados…', icon: <SlidersHorizontal size={ICON} />, onSelect: () => openPanel('fields') },
    { label: 'Filtrar tarjetas…', icon: <Filter size={ICON} />, hint: 'F', onSelect: () => useUI.setState({ filterOpen: true }) },
    { label: 'Elementos archivados…', icon: <Archive size={ICON} />, onSelect: () => openPanel('archive') },
    {
      label: 'Vista',
      icon: <Columns3 size={ICON} />,
      submenu: () => [
        { label: 'Tablero', icon: <Kanban size={ICON} />, checked: route.view === 'kanban', onSelect: () => navigate({ boardId, view: 'kanban' }) },
        { label: 'Tabla', icon: <Table2 size={ICON} />, checked: route.view === 'table', onSelect: () => navigate({ boardId, view: 'table' }) },
        { label: 'Calendario', icon: <CalendarDays size={ICON} />, checked: route.view === 'calendar', onSelect: () => navigate({ boardId, view: 'calendar' }) },
      ],
    },
    SEP,
    {
      label: anyExpanded ? 'Contraer todas las listas' : 'Expandir todas las listas',
      icon: anyExpanded ? <ChevronsDownUp size={ICON} /> : <ChevronsUpDown size={ICON} />,
      disabled: lists.length === 0,
      onSelect: () => lists.forEach((l) => S.updateList(l.id, { collapsed: anyExpanded })),
    },
    {
      label: 'Etiquetas compactas',
      icon: <Tags size={ICON} />,
      checked: usePrefs.getState().compactLabels,
      keepOpen: true,
      onSelect: () => setPrefs({ compactLabels: !usePrefs.getState().compactLabels }),
    },
    {
      label: board.starred ? 'Quitar de favoritos' : 'Marcar como favorito',
      icon: board.starred ? <StarOff size={ICON} /> : <Star size={ICON} />,
      onSelect: () => S.updateBoard(boardId, { starred: !board.starred }),
    },
    { label: 'Exportar tablero (JSON)', icon: <Download size={ICON} />, onSelect: () => exportBoard(boardId) },
    { label: 'Deshacer', icon: <Undo2 size={ICON} />, hint: 'Ctrl+Z', disabled: S.useStore.getState().past.length === 0, onSelect: () => S.undo() },
  ];
}

export function boardTileMenu(boardId: string): MenuItem[] {
  const board = getData().boards[boardId];
  if (!board) return [];
  return [
    { label: 'Abrir', icon: <SquareArrowOutUpRight size={ICON} />, onSelect: () => navigate({ boardId }) },
    {
      label: 'Renombrar',
      icon: <Pencil size={ICON} />,
      onSelect: async () => {
        const title = await promptDialog({ title: 'Renombrar tablero', value: board.title });
        if (title?.trim()) S.updateBoard(boardId, { title: title.trim() });
      },
    },
    {
      label: board.starred ? 'Quitar de favoritos' : 'Marcar como favorito',
      icon: board.starred ? <StarOff size={ICON} /> : <Star size={ICON} />,
      onSelect: () => S.updateBoard(boardId, { starred: !board.starred }),
    },
    { label: 'Fondo', icon: <PaintBucket size={ICON} />, submenu: () => backgroundSubmenu(boardId) },
    { label: 'Duplicar', icon: <Copy size={ICON} />, onSelect: () => S.duplicateBoard(boardId) },
    { label: 'Exportar (JSON)', icon: <Download size={ICON} />, onSelect: () => exportBoard(boardId) },
    SEP,
    {
      label: 'Eliminar tablero…',
      icon: <Trash2 size={ICON} />,
      danger: true,
      onSelect: async () => {
        const ok = await confirmDialog({
          title: '¿Eliminar tablero?',
          message: `"${board.title}" y todo su contenido se eliminarán. Puedes deshacerlo con Ctrl+Z.`,
          confirmText: 'Eliminar',
          danger: true,
        });
        if (ok) {
          S.deleteBoard(boardId);
          if (getRoute().boardId === boardId) navigate({});
          undoToast('Tablero eliminado');
        }
      },
    },
  ];
}

/* ------------------------------------------------------ checklist item */

export interface ChecklistItemMenuCtx {
  cardId: string;
  clId: string;
  itemId: string;
  onEdit: () => void;
  onAddChild: () => void;
  onAddBelow: () => void;
}

export function checklistItemMenu(ctx: ChecklistItemMenuCtx): MenuItem[] {
  const { cardId, clId, itemId } = ctx;
  const card = getData().cards[cardId];
  const cl = card?.checklists.find((c) => c.id === clId);
  const loc = cl && tree.locate(cl.items, itemId);
  if (!card || !cl || !loc) return [];
  const setDue = (due: string | null) => S.updateChecklistItem(cardId, clId, itemId, { due });
  const otherChecklists = card.checklists.filter((c) => c.id !== clId);
  return [
    { label: loc.item.done ? 'Marcar como pendiente' : 'Marcar como hecha', icon: <CheckCheck size={ICON} />, onSelect: () => S.toggleChecklistItem(cardId, clId, itemId) },
    { label: 'Editar', icon: <Pencil size={ICON} />, onSelect: ctx.onEdit },
    SEP,
    { label: 'Añadir subtarea', icon: <ListTree size={ICON} />, disabled: loc.depth + 1 >= tree.MAX_LEVELS, onSelect: ctx.onAddChild },
    { label: 'Añadir tarea debajo', icon: <Plus size={ICON} />, onSelect: ctx.onAddBelow },
    SEP,
    { label: 'Aumentar sangría', icon: <IndentIncrease size={ICON} />, hint: 'Tab', disabled: !tree.canIndent(cl.items, itemId), onSelect: () => S.indentChecklistItem(cardId, clId, itemId) },
    { label: 'Reducir sangría', icon: <IndentDecrease size={ICON} />, hint: 'Mayús+Tab', disabled: !tree.canOutdent(cl.items, itemId), onSelect: () => S.outdentChecklistItem(cardId, clId, itemId) },
    { label: 'Subir', icon: <ArrowUp size={ICON} />, hint: 'Alt+↑', disabled: loc.index === 0, onSelect: () => S.moveChecklistItemSibling(cardId, clId, itemId, -1) },
    { label: 'Bajar', icon: <ArrowDown size={ICON} />, hint: 'Alt+↓', disabled: loc.index === loc.siblings.length - 1, onSelect: () => S.moveChecklistItemSibling(cardId, clId, itemId, 1) },
    ...(otherChecklists.length > 0
      ? [
          {
            label: 'Mover a checklist',
            icon: <ArrowRightLeft size={ICON} />,
            submenu: () =>
              otherChecklists.map(
                (c): MenuItem => ({
                  label: c.title,
                  onSelect: () =>
                    S.moveChecklistItem(
                      cardId,
                      { clId, parentId: loc.parent?.id ?? null, index: loc.index },
                      { clId: c.id, parentId: null, index: c.items.length },
                    ),
                }),
              ),
          },
        ]
      : []),
    SEP,
    {
      label: 'Fecha',
      icon: <Clock size={ICON} />,
      hint: loc.item.due ? formatDate(loc.item.due) : undefined,
      submenu: () => [
        { label: 'Hoy', onSelect: () => setDue(todayKey()) },
        { label: 'Mañana', onSelect: () => setDue(addDaysKey(1)) },
        { label: 'Próximo lunes', onSelect: () => setDue(nextWeekdayKey(1)) },
        { label: 'En una semana', onSelect: () => setDue(addDaysKey(7)) },
        SEP,
        { label: 'Quitar fecha', disabled: !loc.item.due, onSelect: () => setDue(null) },
      ],
    },
    {
      label: 'Convertir en tarjeta',
      icon: <SquareArrowOutUpRight size={ICON} />,
      onSelect: () => {
        S.convertItemToCard(cardId, clId, itemId);
        undoToast('Elemento convertido en tarjeta');
      },
    },
    SEP,
    {
      label: loc.item.children.length ? 'Eliminar (con subtareas)' : 'Eliminar',
      icon: <Trash2 size={ICON} />,
      danger: true,
      onSelect: () => S.deleteChecklistItem(cardId, clId, itemId),
    },
  ];
}
