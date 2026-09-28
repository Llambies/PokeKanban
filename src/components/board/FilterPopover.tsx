import { Flag } from 'lucide-react';
import type { Priority } from '../../types';
import { useBoard } from '../../store/hooks';
import { clearFilter, setFilter, useUI } from '../../store/ui';
import { activeFilterCount, type DueFilter } from '../../lib/filter';
import { PRIORITIES } from '../../lib/priority';
import { LabelChip } from '../common/LabelChip';

const DUE_OPTIONS: { key: DueFilter; label: string }[] = [
  { key: 'overdue', label: 'Vencidas' },
  { key: 'soon', label: 'Vencen en 24 h' },
  { key: 'week', label: 'Vencen esta semana' },
  { key: 'done', label: 'Completadas' },
  { key: 'none', label: 'Sin fecha' },
];

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function FilterPanel({ boardId }: { boardId: string }) {
  const board = useBoard(boardId);
  const filter = useUI((s) => s.filter);
  if (!board) return null;
  return (
    <div className="filter-panel">
      <label className="field-label" htmlFor="filter-text">
        Palabras clave
      </label>
      <input
        id="filter-text"
        className="input"
        placeholder="Buscar en título, descripción o etiquetas"
        value={filter.text}
        onChange={(e) => setFilter({ text: e.target.value })}
      />

      <div className="field-label">Fecha de vencimiento</div>
      {DUE_OPTIONS.map((o) => (
        <label key={o.key} className="checkbox-row">
          <input type="checkbox" checked={filter.due.includes(o.key)} onChange={() => setFilter({ due: toggle(filter.due, o.key) })} />
          {o.label}
        </label>
      ))}

      <div className="field-label">Prioridad</div>
      {PRIORITIES.map((p) => (
        <label key={p.key} className="checkbox-row">
          <input
            type="checkbox"
            checked={filter.priorities.includes(p.key)}
            onChange={() => setFilter({ priorities: toggle<Priority | 'none'>(filter.priorities, p.key) })}
          />
          <Flag size={14} color={p.color} fill={p.color} /> {p.name}
        </label>
      ))}
      <label className="checkbox-row">
        <input type="checkbox" checked={filter.priorities.includes('none')} onChange={() => setFilter({ priorities: toggle<Priority | 'none'>(filter.priorities, 'none') })} />
        Sin prioridad
      </label>

      <div className="field-label field-label--row">
        Etiquetas
        <select
          className="select select--sm"
          value={filter.labelMode}
          onChange={(e) => setFilter({ labelMode: e.target.value as 'any' | 'all' })}
          aria-label="Modo de coincidencia de etiquetas"
        >
          <option value="any">Cualquiera</option>
          <option value="all">Todas</option>
        </select>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={filter.noLabel} onChange={() => setFilter({ noLabel: !filter.noLabel })} />
        Sin etiquetas
      </label>
      {board.labels.map((label) => (
        <label key={label.id} className="checkbox-row">
          <input type="checkbox" checked={filter.labelIds.includes(label.id)} onChange={() => setFilter({ labelIds: toggle(filter.labelIds, label.id) })} />
          <LabelChip label={label} size="md" />
        </label>
      ))}

      <button type="button" className="btn btn--block" disabled={activeFilterCount(filter) === 0} onClick={clearFilter}>
        Quitar filtros
      </button>
    </div>
  );
}
