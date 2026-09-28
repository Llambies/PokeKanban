import { useState } from 'react';
import type { Label } from '../../types';
import { LabelChip } from './LabelChip';
import { SwatchGrid } from './SwatchGrid';
import { IconPicker } from './IconPicker';

interface LabelEditorProps {
  initial?: Partial<Label>;
  onSave: (label: Omit<Label, 'id'>) => void;
  onDelete?: () => void;
  onCancel?: () => void;
}

export function LabelEditor({ initial, onSave, onDelete, onCancel }: LabelEditorProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState<string | null>(initial?.color !== undefined ? initial.color : 'green');
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);

  return (
    <form
      className="label-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name: name.trim(), color, icon });
      }}
    >
      <div className="label-editor__preview">
        <LabelChip label={{ name: name || (color || icon ? '' : 'Etiqueta'), color, icon }} size="md" />
      </div>
      <label className="field-label" htmlFor="label-name">Nombre</label>
      <input id="label-name" className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Ej.: Urgente" />
      <div className="field-label">Color</div>
      <SwatchGrid value={color} onChange={setColor} size="sm" />
      <div className="field-label">Icono</div>
      <IconPicker value={icon} onChange={setIcon} />
      <div className="label-editor__actions">
        <button type="submit" className="btn btn--primary">
          {initial?.id ? 'Guardar' : 'Crear'}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancelar
          </button>
        )}
        {onDelete && (
          <button type="button" className="btn btn--danger push-right" onClick={onDelete}>
            Eliminar
          </button>
        )}
      </div>
    </form>
  );
}
