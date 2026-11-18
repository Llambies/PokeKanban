import { useState, type ReactNode } from 'react';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { GripVertical, Pencil, Plus } from 'lucide-react';
import type { Label } from '../../types';
import { confirmDialog } from '../../store/ui';
import { DRAG_HANDLE_INSTRUCTIONS } from '../../lib/dndA11y';
import { LabelChip } from './LabelChip';
import { LabelEditor } from './LabelEditor';

interface LabelsManagerProps {
  labels: Label[];
  /** How many items use each label (by label id). */
  counts: Record<string, number>;
  /** Plural noun for the items that carry labels: "tarjeta(s)", "evento(s)". */
  itemNoun: string;
  /** Tooltip of the usage count: "Tarjetas con esta etiqueta". */
  countTitle: string;
  hint?: ReactNode;
  /** Show 1…9 next to the first labels (keyboard shortcuts). */
  showIndex?: boolean;
  onCreate: (label: Omit<Label, 'id'>) => void;
  onUpdate: (id: string, label: Omit<Label, 'id'>) => void;
  onDelete: (id: string) => void;
  onMove: (from: number, to: number) => void;
}

/** List of labels with reorder, usage count, edit, create and delete. Shared by boards and the calendar. */
export function LabelsManager({ labels, counts, itemNoun, countTitle, hint, showIndex, onCreate, onUpdate, onDelete, onMove }: LabelsManagerProps) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  if (editing) {
    const label = labels.find((l) => l.id === editing);
    return (
      <LabelEditor
        key={editing}
        initial={label}
        onCancel={() => setEditing(null)}
        onSave={(value) => {
          if (label) onUpdate(label.id, value);
          else onCreate(value);
          setEditing(null);
        }}
        onDelete={
          label
            ? async () => {
                const n = counts[label.id] ?? 0;
                const ok = await confirmDialog({
                  title: '¿Eliminar etiqueta?',
                  message: n ? `Se quitará de ${n} ${itemNoun}.` : undefined,
                  confirmText: 'Eliminar',
                  danger: true,
                });
                if (ok) {
                  onDelete(label.id);
                  setEditing(null);
                }
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="labels-manager">
      {hint && <p className="muted small">{hint}</p>}
      <DragDropContext
        onDragEnd={(r) => {
          if (r.destination && r.destination.index !== r.source.index) onMove(r.source.index, r.destination.index);
        }}
        dragHandleUsageInstructions={DRAG_HANDLE_INSTRUCTIONS}
      >
        <Droppable droppableId="labels">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="labels-manager__list">
              {labels.map((label, i) => (
                <Draggable key={label.id} draggableId={label.id} index={i}>
                  {(p) => (
                    <div ref={p.innerRef} {...p.draggableProps} className="labels-manager__row">
                      <span {...p.dragHandleProps} className="drag-handle" aria-label="Arrastrar">
                        <GripVertical size={14} />
                      </span>
                      {showIndex && <span className="labels-manager__index">{i < 9 ? i + 1 : ''}</span>}
                      <button type="button" className="labels-manager__chip" onClick={() => setEditing(label.id)}>
                        <LabelChip label={label} size="md" />
                      </button>
                      <span className="labels-manager__count" title={countTitle}>
                        {counts[label.id] ?? 0}
                      </span>
                      <button type="button" className="icon-btn icon-btn--sm" onClick={() => setEditing(label.id)} aria-label="Editar etiqueta">
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
      <button type="button" className="btn btn--block" onClick={() => setEditing('new')}>
        <Plus size={15} /> Crear etiqueta
      </button>
    </div>
  );
}
