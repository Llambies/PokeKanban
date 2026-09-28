import { useState } from 'react';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { CalendarDays, CheckSquare, ChevronDown, Eye, EyeOff, GripVertical, Hash, Pencil, Plus, Type, X } from 'lucide-react';
import type { CustomField, CustomFieldOption, CustomFieldType } from '../../types';
import * as S from '../../store/store';
import { useBoard } from '../../store/hooks';
import { confirmDialog } from '../../store/ui';
import { FIELD_TYPES, fieldTypeName } from '../../lib/fields';
import { PALETTE_ROWS, getColor } from '../../lib/colors';
import { uid } from '../../lib/id';

export function FieldTypeIcon({ type, size = 15 }: { type: CustomFieldType; size?: number }) {
  switch (type) {
    case 'number':
      return <Hash size={size} />;
    case 'checkbox':
      return <CheckSquare size={size} />;
    case 'date':
      return <CalendarDays size={size} />;
    case 'select':
      return <ChevronDown size={size} />;
    default:
      return <Type size={size} />;
  }
}

function OptionRow({ option, onChange, onDelete }: { option: CustomFieldOption; onChange: (o: CustomFieldOption) => void; onDelete: () => void }) {
  const [picking, setPicking] = useState(false);
  const color = getColor(option.color);
  return (
    <div className="field-option">
      <button
        type="button"
        className="field-option__color"
        style={color ? { background: color.bg } : undefined}
        onClick={() => setPicking(!picking)}
        aria-label="Color de la opción"
        title="Color"
      />
      <input className="input input--sm" value={option.name} placeholder="Nombre de la opción" onChange={(e) => onChange({ ...option, name: e.target.value })} />
      <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={onDelete} aria-label="Quitar opción">
        <X size={14} />
      </button>
      {picking && (
        <div className="field-option__palette">
          <button type="button" className="field-option__swatch field-option__swatch--none" onClick={() => { onChange({ ...option, color: null }); setPicking(false); }} aria-label="Sin color" />
          {PALETTE_ROWS[1].concat(PALETTE_ROWS[2]).map((c) => (
            <button
              type="button"
              key={c.key}
              className="field-option__swatch"
              style={{ background: c.bg }}
              aria-label={c.name}
              title={c.name}
              onClick={() => {
                onChange({ ...option, color: c.key });
                setPicking(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldEditor({ initial, onSave, onCancel, onDelete }: {
  initial?: CustomField;
  onSave: (f: Omit<CustomField, 'id'>) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<CustomFieldType>(initial?.type ?? 'text');
  const [options, setOptions] = useState<CustomFieldOption[]>(initial?.options ?? []);
  const [showOnCard, setShowOnCard] = useState(initial?.showOnCard ?? true);
  const [newOption, setNewOption] = useState('');

  const addOption = () => {
    if (!newOption.trim()) return;
    const palette = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink'];
    setOptions([...options, { id: uid(), name: newOption.trim(), color: palette[options.length % palette.length] }]);
    setNewOption('');
  };

  return (
    <form
      className="field-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave({ name: name.trim(), type, options: type === 'select' ? options.filter((o) => o.name.trim()) : [], showOnCard });
      }}
    >
      <label className="field-label" htmlFor="field-name">Nombre</label>
      <input id="field-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Estimación, Cliente, Coste…" />
      <label className="field-label" htmlFor="field-type">Tipo</label>
      <select
        id="field-type"
        className="select"
        value={type}
        onChange={(e) => setType(e.target.value as CustomFieldType)}
      >
        {FIELD_TYPES.map((t) => (
          <option key={t.type} value={t.type}>
            {t.name}
          </option>
        ))}
      </select>
      {initial && initial.type !== type && (
        <p className="muted small">Al cambiar el tipo se borrarán los valores que no encajen.</p>
      )}
      {type === 'select' && (
        <>
          <div className="field-label">Opciones</div>
          <div className="field-options">
            {options.map((o, i) => (
              <OptionRow
                key={o.id}
                option={o}
                onChange={(next) => setOptions(options.map((x, j) => (j === i ? next : x)))}
                onDelete={() => setOptions(options.filter((_, j) => j !== i))}
              />
            ))}
          </div>
          <div className="inline-form">
            <input
              className="input input--sm"
              placeholder="Nueva opción"
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addOption();
                }
              }}
            />
            <button type="button" className="btn btn--sm" onClick={addOption} disabled={!newOption.trim()}>
              Añadir
            </button>
          </div>
        </>
      )}
      <label className="checkbox-row">
        <input type="checkbox" checked={showOnCard} onChange={(e) => setShowOnCard(e.target.checked)} />
        Mostrar en la tarjeta del tablero
      </label>
      <div className="label-editor__actions">
        <button type="submit" className="btn btn--primary" disabled={!name.trim()}>
          {initial ? 'Guardar' : 'Crear'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancelar
        </button>
        {onDelete && (
          <button type="button" className="btn btn--danger push-right" onClick={onDelete}>
            Eliminar
          </button>
        )}
      </div>
    </form>
  );
}

export function FieldsManager({ boardId }: { boardId: string }) {
  const board = useBoard(boardId);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  if (!board) return null;

  if (editing) {
    const field = board.fields.find((f) => f.id === editing);
    return (
      <FieldEditor
        key={editing}
        initial={field}
        onCancel={() => setEditing(null)}
        onSave={(value) => {
          if (field) S.updateField(boardId, field.id, value);
          else S.createField(boardId, value);
          setEditing(null);
        }}
        onDelete={
          field
            ? async () => {
                const ok = await confirmDialog({
                  title: `¿Eliminar el campo "${field.name}"?`,
                  message: 'Se borrará su valor en todas las tarjetas del tablero. Puedes deshacerlo con Ctrl+Z.',
                  confirmText: 'Eliminar',
                  danger: true,
                });
                if (ok) {
                  S.deleteField(boardId, field.id);
                  setEditing(null);
                }
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="fields-manager">
      <p className="muted small">Añade datos propios a las tarjetas: estimaciones, costes, clientes, estados…</p>
      <DragDropContext
        onDragEnd={(r) => {
          if (r.destination && r.destination.index !== r.source.index) S.moveField(boardId, r.source.index, r.destination.index);
        }}
      >
        <Droppable droppableId="fields">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="labels-manager__list">
              {board.fields.map((field, i) => (
                <Draggable key={field.id} draggableId={field.id} index={i}>
                  {(p) => (
                    <div ref={p.innerRef} {...p.draggableProps} className="labels-manager__row fields-manager__row">
                      <span {...p.dragHandleProps} className="drag-handle" aria-label="Arrastrar">
                        <GripVertical size={14} />
                      </span>
                      <span className="fields-manager__icon">
                        <FieldTypeIcon type={field.type} />
                      </span>
                      <button type="button" className="fields-manager__name" onClick={() => setEditing(field.id)}>
                        <strong>{field.name}</strong>
                        <span className="muted small">{fieldTypeName(field.type)}</span>
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm"
                        title={field.showOnCard ? 'Visible en la tarjeta' : 'Oculto en la tarjeta'}
                        aria-label={field.showOnCard ? 'Ocultar en la tarjeta' : 'Mostrar en la tarjeta'}
                        onClick={() => S.updateField(boardId, field.id, { showOnCard: !field.showOnCard })}
                      >
                        {field.showOnCard ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button type="button" className="icon-btn icon-btn--sm" onClick={() => setEditing(field.id)} aria-label="Editar campo">
                        <Pencil size={14} />
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      {board.fields.length === 0 && <p className="muted small">Todavía no hay campos.</p>}
      <button type="button" className="btn btn--block" onClick={() => setEditing('new')}>
        <Plus size={15} /> Nuevo campo
      </button>
    </div>
  );
}
