import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CheckSquare, Flag } from 'lucide-react';
import type { Card, Priority } from '../../types';
import { useBoard, useBoardCards } from '../../store/hooks';
import { updateCard, useStore } from '../../store/store';
import { openCard } from '../../lib/router';
import { dueStatus, formatDate, formatTimestamp, parseLocal } from '../../lib/dates';
import { checklistsProgress } from '../../lib/checklist';
import { getPriority } from '../../lib/priority';
import { getColor } from '../../lib/colors';
import { fieldSortValue, formatFieldValue } from '../../lib/fields';
import { openContextMenu, wantsNativeMenu } from '../contextmenu/menuStore';
import { cardMenu } from '../contextmenu/menus';
import { LabelChip } from '../common/LabelChip';

type SortKey = 'board' | 'title' | 'list' | 'priority' | 'due' | 'progress' | 'updated' | `f:${string}`;

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function TableView({ boardId }: { boardId: string }) {
  const board = useBoard(boardId);
  const cards = useBoardCards(boardId);
  const lists = useStore((s) => s.data.lists);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'board', dir: 1 });

  const rows = useMemo(() => {
    const real = cards.filter((c) => c.kind === 'card');
    if (sort.key === 'board') return sort.dir === 1 ? real : [...real].reverse();
    const sortField = sort.key.startsWith('f:') ? board?.fields.find((f) => `f:${f.id}` === sort.key) : undefined;
    const value = (c: Card): number | string => {
      if (sortField) return fieldSortValue(sortField, c.fields[sortField.id]);
      switch (sort.key) {
        case 'title':
          return c.title.toLocaleLowerCase('es');
        case 'list':
          return board?.listIds.indexOf(c.listId) ?? 0;
        case 'priority':
          return c.priority ? PRIORITY_RANK[c.priority] : 9;
        case 'due':
          return c.due ? parseLocal(c.due)?.getTime() ?? Infinity : Infinity;
        case 'progress': {
          const p = checklistsProgress(c.checklists);
          return p.total ? p.done / p.total : -1;
        }
        case 'updated':
          return -c.updatedAt;
      }
      return 0;
    };
    return [...real].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string, 'es') : (va as number) - (vb as number);
      return cmp * sort.dir;
    });
  }, [cards, sort, board]);

  if (!board) return null;
  const labelsById = new Map(board.labels.map((l) => [l.id, l]));

  // Render helper (not a nested component, which would remount the headers on every render).
  const th = (k: SortKey, children: React.ReactNode, className?: string) => (
    <th key={k} className={className}>
      <button type="button" className="th-btn" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (-s.dir as 1 | -1) : 1 }))}>
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
      </button>
    </th>
  );

  return (
    <div className="table-view">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {th('title', 'Tarjeta')}
              {th('list', 'Lista')}
              <th>Etiquetas</th>
              {th('priority', 'Prioridad')}
              {th('due', 'Vencimiento')}
              {th('progress', 'Checklist')}
              {board.fields.map((f) => th(`f:${f.id}`, f.name))}
              {th('updated', 'Actualizada', 'hide-sm')}
            </tr>
          </thead>
          <tbody>
            {rows.map((card) => {
              const list = lists[card.listId];
              const status = dueStatus(card.due, card.dueDone);
              const progress = checklistsProgress(card.checklists);
              const priority = getPriority(card.priority);
              const listColor = getColor(list?.color);
              return (
                <tr
                  key={card.id}
                  onClick={() => openCard(card.id, boardId)}
                  onContextMenu={(e) => {
                    if (wantsNativeMenu(e)) return;
                    openContextMenu(e, () => cardMenu(card.id));
                  }}
                >
                  <td className="data-table__title">
                    {card.cover?.color && <span className="cover-dot" style={{ background: getColor(card.cover.color)?.bg }} />}
                    {card.title}
                  </td>
                  <td>
                    <span className="list-pill" style={listColor ? { background: listColor.bg, color: listColor.fg } : undefined}>
                      {list?.title}
                    </span>
                  </td>
                  <td>
                    <div className="data-table__labels">
                      {card.labelIds.map((id) => {
                        const l = labelsById.get(id);
                        return l ? <LabelChip key={id} label={l} /> : null;
                      })}
                    </div>
                  </td>
                  <td>
                    {priority && (
                      <span className="badge badge--priority" style={{ color: priority.color }}>
                        <Flag size={13} fill={priority.color} /> {priority.name}
                      </span>
                    )}
                  </td>
                  <td>
                    {card.due && (
                      <button
                        type="button"
                        className={`badge badge--due ${status ? `is-${status}` : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateCard(card.id, { dueDone: !card.dueDone });
                        }}
                        title="Marcar como completada / pendiente"
                      >
                        {formatDate(card.due)}
                      </button>
                    )}
                  </td>
                  <td>
                    {progress.total > 0 && (
                      <span className="progress-cell">
                        <CheckSquare size={13} /> {progress.done}/{progress.total}
                        <span className="progress-bar progress-bar--mini">
                          <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                        </span>
                      </span>
                    )}
                  </td>
                  {board.fields.map((f) => {
                    const text = formatFieldValue(f, card.fields[f.id]);
                    const color = f.type === 'select' ? getColor(f.options.find((o) => o.id === card.fields[f.id])?.color) : null;
                    return (
                      <td key={f.id} className={f.type === 'number' ? 'data-table__num' : undefined}>
                        {text !== null &&
                          (f.type === 'select' ? (
                            <span className="list-pill" style={color ? { background: color.bg, color: color.fg } : undefined}>
                              {text}
                            </span>
                          ) : f.type === 'checkbox' ? (
                            '✓'
                          ) : (
                            text
                          ))}
                      </td>
                    );
                  })}
                  <td className="muted hide-sm">{formatTimestamp(card.updatedAt)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7 + board.fields.length} className="data-table__empty">
                  No hay tarjetas que mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
