import { useState } from 'react';
import { Check, Flag, Pencil, Plus } from 'lucide-react';
import type { Card, Priority } from '../../types';
import * as S from '../../store/store';
import { useBoard } from '../../store/hooks';
import { getData, useStore } from '../../store/store';
import { confirmDialog, toast } from '../../store/ui';
import { normalize } from '../../lib/icons';
import { PRIORITIES } from '../../lib/priority';
import { addDaysKey, combine, dateKeyOf, nextWeekdayKey, timeOf, todayKey } from '../../lib/dates';
import { LabelChip } from '../common/LabelChip';
import { LabelEditor } from '../common/LabelEditor';
import { SwatchGrid } from '../common/SwatchGrid';
import { getRoute, navigate, openCard } from '../../lib/router';

/* ------------------------------------------------------------- labels */

export function LabelPicker({ card, onTitle }: { card: Card; onTitle: (title: string, back?: () => void) => void }) {
  const board = useBoard(card.boardId);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  if (!board) return null;

  if (editing) {
    const label = board.labels.find((l) => l.id === editing);
    return (
      <LabelEditor
        key={editing}
        initial={label ?? { name: query }}
        onCancel={() => {
          setEditing(null);
          onTitle('Etiquetas');
        }}
        onSave={(value) => {
          if (label) S.updateLabel(board.id, label.id, value);
          else {
            const id = S.createLabel(board.id, value);
            S.toggleLabel(card.id, id);
          }
          setEditing(null);
          onTitle('Etiquetas');
        }}
        onDelete={
          label
            ? async () => {
                const ok = await confirmDialog({
                  title: '¿Eliminar etiqueta?',
                  message: 'Se quitará de todas las tarjetas del tablero.',
                  confirmText: 'Eliminar',
                  danger: true,
                });
                if (ok) {
                  S.deleteLabel(board.id, label.id);
                  setEditing(null);
                  onTitle('Etiquetas');
                }
              }
            : undefined
        }
      />
    );
  }

  const q = normalize(query);
  const labels = board.labels.filter((l) => !q || normalize(l.name).includes(q));
  const startEdit = (id: string | 'new') => {
    setEditing(id);
    onTitle(id === 'new' ? 'Crear etiqueta' : 'Editar etiqueta', () => {
      setEditing(null);
      onTitle('Etiquetas');
    });
  };

  return (
    <div className="label-picker">
      <input className="input" placeholder="Buscar etiquetas…" aria-label="Buscar etiquetas" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="label-picker__list">
        {labels.map((label) => {
          const checked = card.labelIds.includes(label.id);
          return (
            <div key={label.id} className="label-picker__row">
              <label className="label-picker__check">
                <input type="checkbox" checked={checked} onChange={() => S.toggleLabel(card.id, label.id)} />
                <LabelChip label={label} size="md" />
              </label>
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => startEdit(label.id)} aria-label="Editar etiqueta">
                <Pencil size={14} />
              </button>
            </div>
          );
        })}
        {labels.length === 0 && <p className="muted small">Ninguna etiqueta coincide.</p>}
      </div>
      <button type="button" className="btn btn--block" onClick={() => startEdit('new')}>
        <Plus size={15} /> Crear etiqueta{query ? ` "${query}"` : ''}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------- dates */

export function DatesPicker({ card, onDone }: { card: Card; onDone: () => void }) {
  const [useStart, setUseStart] = useState(!!card.start);
  const [start, setStart] = useState(card.start ? dateKeyOf(card.start) : todayKey());
  const [useDue, setUseDue] = useState(!!card.due || !card.start);
  const [due, setDue] = useState(card.due ? dateKeyOf(card.due) : addDaysKey(1));
  const [time, setTime] = useState(card.due ? timeOf(card.due) : '');

  const save = () => {
    S.updateCard(card.id, {
      start: useStart && start ? start : null,
      due: useDue && due ? combine(due, time) : null,
      dueDone: useDue ? card.dueDone : false,
    });
    onDone();
  };

  const quick = (key: string) => {
    setUseDue(true);
    setDue(key);
  };

  return (
    <form
      className="dates-picker"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="chip-row">
        <button type="button" className="chip" onClick={() => quick(todayKey())}>Hoy</button>
        <button type="button" className="chip" onClick={() => quick(addDaysKey(1))}>Mañana</button>
        <button type="button" className="chip" onClick={() => quick(nextWeekdayKey(1))}>Lunes</button>
        <button type="button" className="chip" onClick={() => quick(addDaysKey(7))}>+1 semana</button>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={useStart} onChange={(e) => setUseStart(e.target.checked)} /> Fecha de inicio
      </label>
      <input type="date" className="input" disabled={!useStart} value={start} onChange={(e) => setStart(e.target.value)} aria-label="Fecha de inicio" />
      <label className="checkbox-row">
        <input type="checkbox" checked={useDue} onChange={(e) => setUseDue(e.target.checked)} /> Fecha de vencimiento
      </label>
      <div className="dates-picker__due">
        <input type="date" className="input" disabled={!useDue} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha de vencimiento" />
        <input type="time" className="input" disabled={!useDue} value={time} onChange={(e) => setTime(e.target.value)} aria-label="Hora (opcional)" />
      </div>
      <p className="muted small">La hora es opcional: sin hora, vence al final del día.</p>
      <div className="dates-picker__actions">
        <button type="submit" className="btn btn--primary">Guardar</button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            S.updateCard(card.id, { start: null, due: null, dueDone: false });
            onDone();
          }}
        >
          Quitar
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------- cover */

export function CoverPicker({ card }: { card: Card }) {
  const cover = card.cover;
  const size = cover?.size ?? 'strip';
  const [image, setImage] = useState(cover?.image ?? '');
  const setSize = (s: 'strip' | 'full') => cover && S.setCover(card.id, { ...cover, size: s });
  return (
    <div className="cover-picker">
      {card.kind === 'card' && (
        <>
          <div className="field-label">Tamaño</div>
          <div className="cover-picker__sizes">
            <button type="button" className={`cover-size ${size === 'strip' ? 'is-selected' : ''}`} disabled={!cover} onClick={() => setSize('strip')}>
              <span className="cover-size__strip" />
              <span className="cover-size__lines" />
              Franja
            </button>
            <button type="button" className={`cover-size cover-size--full ${size === 'full' ? 'is-selected' : ''}`} disabled={!cover} onClick={() => setSize('full')}>
              <span className="cover-size__lines" />
              Completa
            </button>
          </div>
        </>
      )}
      <div className="field-label">Color</div>
      <SwatchGrid
        value={cover?.color ?? null}
        rows={[0, 1, 2]}
        size="sm"
        noneLabel="Quitar color"
        onChange={(color) =>
          S.setCover(card.id, color || cover?.image ? { color, image: cover?.image ?? null, size } : null)
        }
      />
      {card.kind === 'card' && (
        <>
          <div className="field-label">Imagen (URL)</div>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const url = image.trim() || null;
              S.setCover(card.id, url || cover?.color ? { color: cover?.color ?? null, image: url, size } : null);
            }}
          >
            <input className="input" type="url" placeholder="https://…" aria-label="URL de la imagen de portada" value={image} onChange={(e) => setImage(e.target.value)} />
            <button type="submit" className="btn">Aplicar</button>
          </form>
        </>
      )}
      <button type="button" className="btn btn--block" disabled={!cover} onClick={() => S.setCover(card.id, null)}>
        Quitar portada
      </button>
    </div>
  );
}

/* ----------------------------------------------------------- priority */

export function PriorityPicker({ card, onDone }: { card: Card; onDone: () => void }) {
  const pick = (p: Priority | null) => {
    S.updateCard(card.id, { priority: p });
    onDone();
  };
  return (
    <div className="menu-list">
      {PRIORITIES.map((p) => (
        <button type="button" key={p.key} className="menu-list__item" onClick={() => pick(p.key)}>
          <Flag size={16} color={p.color} fill={p.color} /> {p.name}
          {card.priority === p.key && <Check size={15} className="push-right" />}
        </button>
      ))}
      <div className="menu-list__sep" />
      <button type="button" className="menu-list__item" onClick={() => pick(null)}>
        Sin prioridad {card.priority === null && <Check size={15} className="push-right" />}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------- move/copy */

export function MoveCopyPicker({ card, mode, onDone }: { card: Card; mode: 'move' | 'copy'; onDone: () => void }) {
  const data = useStore((s) => s.data);
  const [boardId, setBoardId] = useState(card.boardId);
  const board = data.boards[boardId];
  const lists = board?.listIds.map((id) => data.lists[id]) ?? [];
  const [listId, setListId] = useState(card.listId);
  const effectiveListId = lists.some((l) => l.id === listId) ? listId : lists[0]?.id;
  const targetList = effectiveListId ? data.lists[effectiveListId] : undefined;
  const sameList = effectiveListId === card.listId;
  const maxPos = (targetList?.cardIds.length ?? 0) + (mode === 'copy' || !sameList ? 1 : 0);
  const currentPos = sameList ? (targetList?.cardIds.indexOf(card.id) ?? 0) + 1 : maxPos;
  const [position, setPosition] = useState<number | null>(null);
  const pos = Math.min(position ?? (mode === 'copy' && sameList ? currentPos + 1 : currentPos), maxPos);
  const [title, setTitle] = useState(card.title);
  const [keep, setKeep] = useState({ labels: true, checklists: true, attachments: true, comments: false });

  const submit = () => {
    if (!effectiveListId) return;
    if (mode === 'move') {
      S.moveCard(card.id, effectiveListId, pos - 1);
      if (boardId !== card.boardId && getRoute().page === 'board') {
        // Follow the card to its new board (replacing the card entry keeps "back" sensible).
        navigate({ boardId }, true);
        toast(`Tarjeta movida a "${data.boards[boardId].title}"`);
      }
    } else {
      const id = S.copyCard(card.id, effectiveListId, pos - 1, {
        title: title.trim() || card.title,
        keepLabels: keep.labels,
        keepChecklists: keep.checklists,
        keepAttachments: keep.attachments,
        keepComments: keep.comments,
      });
      if (id) openCard(id, boardId);
    }
    onDone();
  };

  return (
    <form
      className="move-picker"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {mode === 'copy' && (
        <>
          <label className="field-label" htmlFor="copy-title">Título</label>
          <textarea id="copy-title" className="input" rows={2} value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="field-label">Conservar</div>
          {(
            [
              ['labels', 'Etiquetas'],
              ['checklists', 'Checklists'],
              ['attachments', 'Enlaces'],
              ['comments', 'Notas'],
            ] as const
          ).map(([k, text]) => (
            <label key={k} className="checkbox-row">
              <input type="checkbox" checked={keep[k]} onChange={(e) => setKeep({ ...keep, [k]: e.target.checked })} /> {text}
            </label>
          ))}
        </>
      )}
      <label className="field-label" htmlFor="move-board">Tablero</label>
      <select
        id="move-board"
        className="select"
        value={boardId}
        onChange={(e) => {
          setBoardId(e.target.value);
          setPosition(null);
        }}
      >
        {data.boardOrder.map((id) => (
          <option key={id} value={id}>
            {data.boards[id].title}
            {id === card.boardId ? ' (actual)' : ''}
          </option>
        ))}
      </select>
      <div className="move-picker__row">
        <div>
          <label className="field-label" htmlFor="move-list">Lista</label>
          <select
            id="move-list"
            className="select"
            value={effectiveListId ?? ''}
            onChange={(e) => {
              setListId(e.target.value);
              setPosition(null);
            }}
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
                {l.id === card.listId ? ' (actual)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="move-pos">Posición</label>
          <select id="move-pos" className="select" value={pos} onChange={(e) => setPosition(Number(e.target.value))}>
            {Array.from({ length: Math.max(1, maxPos) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
                {sameList && mode === 'move' && n === currentPos ? ' (actual)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      {lists.length === 0 && <p className="muted small">Ese tablero no tiene listas.</p>}
      <button type="submit" className="btn btn--primary btn--block" disabled={!effectiveListId}>
        {mode === 'move' ? 'Mover' : 'Crear copia'}
      </button>
    </form>
  );
}

/* --------------------------------------------------- add checklist */

export function AddChecklistForm({ card, onDone }: { card: Card; onDone: (id: string) => void }) {
  const [title, setTitle] = useState('Checklist');
  const [copyFrom, setCopyFrom] = useState('');
  // Checklists from any card of this board can be copied.
  const sources = Object.values(getData().cards)
    .filter((c) => c.boardId === card.boardId && !c.archived && c.checklists.length > 0)
    .flatMap((c) => c.checklists.map((cl) => ({ key: `${c.id}:${cl.id}`, label: `${c.title} › ${cl.title}`, cl })));
  return (
    <form
      className="add-checklist"
      onSubmit={(e) => {
        e.preventDefault();
        const src = sources.find((s) => s.key === copyFrom)?.cl;
        onDone(S.addChecklist(card.id, title, src));
      }}
    >
      <label className="field-label" htmlFor="cl-title">Título</label>
      <input id="cl-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} onFocus={(e) => e.target.select()} />
      {sources.length > 0 && (
        <>
          <label className="field-label" htmlFor="cl-copy">Copiar elementos de…</label>
          <select id="cl-copy" className="select" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">(ninguno)</option>
            {sources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </>
      )}
      <button type="submit" className="btn btn--primary">Añadir</button>
    </form>
  );
}
