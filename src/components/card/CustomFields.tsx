import { SlidersHorizontal } from 'lucide-react';
import type { Card, CustomField, CustomFieldValue } from '../../types';
import * as S from '../../store/store';
import { getColor } from '../../lib/colors';
import { FieldTypeIcon } from '../board/FieldsManager';

const NO_FIELDS: CustomField[] = [];

function FieldInput({ field, value, onChange }: { field: CustomField; value: CustomFieldValue | undefined; onChange: (v: CustomFieldValue | null) => void }) {
  const id = `cf-${field.id}`;
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };
  let input: React.ReactNode;
  switch (field.type) {
    case 'checkbox':
      input = (
        <label className="checkbox-row custom-field__check">
          <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked ? true : null)} />
          {value === true ? 'Sí' : 'No'}
        </label>
      );
      break;
    case 'date':
      input = <input id={id} type="date" className="input input--sm" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || null)} />;
      break;
    case 'number':
      input = (
        <input
          id={id}
          key={String(value)}
          type="number"
          step="any"
          className="input input--sm"
          defaultValue={value === undefined ? '' : String(value)}
          placeholder="—"
          onBlur={(e) => {
            const raw = e.target.value.trim();
            onChange(raw === '' ? null : Number(raw));
          }}
          onKeyDown={blurOnEnter}
        />
      );
      break;
    case 'select': {
      const option = field.options.find((o) => o.id === value);
      const color = getColor(option?.color);
      input = (
        <select
          id={id}
          className="select select--sm custom-field__select"
          value={option?.id ?? ''}
          style={color ? { background: color.bg, color: color.fg, borderColor: color.bg } : undefined}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      );
      break;
    }
    default:
      input = (
        <input
          id={id}
          key={String(value)}
          className="input input--sm"
          defaultValue={typeof value === 'string' ? value : ''}
          placeholder="—"
          onBlur={(e) => onChange(e.target.value.trim() || null)}
          onKeyDown={blurOnEnter}
        />
      );
  }
  return (
    <div className="custom-field">
      <label className="custom-field__label" htmlFor={id}>
        <FieldTypeIcon type={field.type} size={13} /> {field.name}
      </label>
      {input}
    </div>
  );
}

export function CustomFieldsSection({ card, onManage }: { card: Card; onManage: (anchor: HTMLElement) => void }) {
  const fields = S.useStore((s) => s.data.boards[card.boardId]?.fields ?? NO_FIELDS);
  if (fields.length === 0) return null;
  return (
    <section className="card-section">
      <div className="card-section__head">
        <SlidersHorizontal size={18} className="card-section__icon" />
        <h3 className="card-section__title">Campos personalizados</h3>
        <div className="card-section__tools">
          <button type="button" className="btn btn--sm" onClick={(e) => onManage(e.currentTarget)}>
            Editar campos
          </button>
        </div>
      </div>
      <div className="custom-fields">
        {fields.map((f) => (
          <FieldInput key={f.id} field={f} value={card.fields[f.id]} onChange={(v) => S.setCardField(card.id, f.id, v)} />
        ))}
      </div>
    </section>
  );
}
