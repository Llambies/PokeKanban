import { useState } from 'react';
import {
  Archive, ArrowRightLeft, CheckSquare, Clock, Copy, CreditCard, Flag, LayoutTemplate, Link, Paperclip, PanelTop, Plus,
  RotateCcw, SeparatorHorizontal, SlidersHorizontal, Tag, Trash2, X,
} from 'lucide-react';
import type { Card } from '../../types';
import * as S from '../../store/store';
import { useCard } from '../../store/hooks';
import { toast } from '../../store/ui';
import { closeCard, cardLink } from '../../lib/router';
import { getColor } from '../../lib/colors';
import { DUE_STATUS_TEXT, dueStatus, formatDate } from '../../lib/dates';
import { getPriority } from '../../lib/priority';
import { copyToClipboard } from '../../lib/download';
import { uploadFile } from '../../lib/upload';
import { usePersist } from '../../store/persistence';
import { Modal } from '../common/Modal';
import { Popover, usePopover } from '../common/Popover';
import { LabelChip } from '../common/LabelChip';
import { InlineTitleEditor } from '../common/AutoTextarea';
import { deleteCardWithConfirm, undoToast } from '../contextmenu/menus';
import { Checklists } from './Checklists';
import { CustomFieldsSection } from './CustomFields';
import { FieldsManager } from '../board/FieldsManager';
import { Attachments, AttachmentForm, Comments, Description } from './CardSections';
import { AddChecklistForm, CoverPicker, DatesPicker, LabelPicker, MoveCopyPicker, PriorityPicker } from './pickers';

type PopKey = 'labels' | 'dates' | 'cover' | 'priority' | 'move' | 'copy' | 'checklist' | 'attachment' | 'fields';

const POP_TITLES: Record<PopKey, string> = {
  labels: 'Etiquetas',
  dates: 'Fechas',
  cover: 'Portada',
  priority: 'Prioridad',
  move: 'Mover tarjeta',
  copy: 'Copiar tarjeta',
  checklist: 'Añadir checklist',
  attachment: 'Adjuntar',
  fields: 'Campos personalizados',
};

function CardHeader({ card }: { card: Card }) {
  const [editing, setEditing] = useState(false);
  const list = S.useStore((s) => s.data.lists[card.listId]);
  return (
    <div className="card-modal__title-row">
      <CreditCard size={20} className="card-section__icon" />
      <div className="card-modal__title-wrap">
        {editing ? (
          <InlineTitleEditor
            className="card-modal__title-input"
            value={card.title}
            selectAll={false}
            onSave={(title) => {
              S.updateCard(card.id, { title });
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <h2 id="card-title" className="card-modal__title" onClick={() => setEditing(true)}>
            {card.title || <span className="muted">Sin título</span>}
          </h2>
        )}
        <p className="muted small">
          en la lista <strong>{list?.title ?? '—'}</strong>
          {card.archived && ' · archivada'}
          {card.isTemplate && ' · plantilla'}
        </p>
      </div>
    </div>
  );
}

export function CardModal({ cardId }: { cardId: string }) {
  const card = useCard(cardId);
  const labels = S.useStore((s) => (card ? s.data.boards[card.boardId]?.labels : undefined));
  const pop = usePopover<PopKey>();
  const [popTitle, setPopTitle] = useState<{ title: string; back?: () => void } | null>(null);
  const [focusChecklist, setFocusChecklist] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const uploads = usePersist((s) => s.mode === 'server');

  if (!card) {
    return (
      <Modal onClose={closeCard} className="modal--small">
        <div className="modal__header">
          <h2>Tarjeta no encontrada</h2>
          <button type="button" className="icon-btn" onClick={closeCard} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <p className="muted">Puede que se haya eliminado. Si fue un error, pulsa Ctrl+Z.</p>
      </Modal>
    );
  }

  const openPop = (key: PopKey, el: HTMLElement) => {
    setPopTitle(null);
    pop.open(key, el);
  };
  const closePop = () => {
    setPopTitle(null);
    pop.close();
  };

  const attachFiles = async (files: File[]) => {
    if (!uploads) {
      toast('Subir archivos requiere el servidor (npm start). En modo navegador usa enlaces.');
      return;
    }
    for (const file of files) {
      toast(`Subiendo "${file.name || 'imagen'}"…`, { duration: 1500 });
      try {
        const up = await uploadFile(file);
        const current = S.getData().cards[cardId];
        const image = up.type.startsWith('image/');
        // Like Trello: the first image becomes the cover if the card has none.
        const cover = image && current && !current.cover ? { color: null, image: up.url, size: 'strip' as const } : undefined;
        S.addAttachment(cardId, up.name, up.url, { kind: 'file', size: up.size, mime: up.type }, cover);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'No se pudo subir el archivo');
      }
    }
  };

  const cover = card.cover;
  const coverColor = getColor(cover?.color);
  const status = dueStatus(card.due, card.dueDone);
  const priority = getPriority(card.priority);
  const cardLabels = (labels ?? []).filter((l) => card.labelIds.includes(l.id));
  const isSeparator = card.kind === 'separator';

  const SideButton = ({ k, icon, text }: { k: PopKey; icon: React.ReactNode; text: string }) => (
    <button type="button" className={`side-btn ${pop.openKey === k ? 'is-active' : ''}`} onClick={(e) => openPop(k, e.currentTarget)}>
      {icon} {text}
    </button>
  );

  return (
    <Modal onClose={closeCard} className="card-modal" labelledBy="card-title">
      <div
        className="card-modal__dropzone"
        onPaste={(e) => {
          const files = [...e.clipboardData.files];
          if (files.length === 0) return;
          e.preventDefault();
          void attachFiles(files);
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDropping(false);
          void attachFiles([...e.dataTransfer.files]);
        }}
      >
      {dropping && (
        <div className="card-modal__drop-overlay">
          <Paperclip size={28} /> Suelta para adjuntar
        </div>
      )}
      {cover && (coverColor || cover.image) && (
        <div
          className={`card-modal__cover ${cover.image ? 'has-image' : ''}`}
          style={{ backgroundColor: coverColor?.bg, ...(cover.image ? { backgroundImage: `url("${cover.image}")` } : {}) }}
        >
          <button type="button" className="btn btn--sm card-modal__cover-btn" onClick={(e) => openPop('cover', e.currentTarget)}>
            <PanelTop size={15} /> Portada
          </button>
        </div>
      )}
      <button type="button" className="icon-btn card-modal__close" onClick={closeCard} aria-label="Cerrar">
        <X size={20} />
      </button>
      {card.archived && (
        <div className="banner banner--archived">
          <Archive size={16} /> Esta tarjeta está archivada.
          <button type="button" className="btn btn--sm" onClick={() => S.restoreCard(card.id)}>
            <RotateCcw size={14} /> Restaurar
          </button>
          <button type="button" className="btn btn--sm btn--danger" onClick={async () => (await deleteCardWithConfirm(card.id)) && closeCard()}>
            <Trash2 size={14} /> Eliminar
          </button>
        </div>
      )}
      <div className="card-modal__content">
        <div className="card-modal__main">
          <CardHeader card={card} />

          <div className="card-meta">
            {cardLabels.length > 0 && (
              <div className="card-meta__group">
                <div className="card-meta__label">Etiquetas</div>
                <div className="card-meta__labels">
                  {cardLabels.map((l) => (
                    <LabelChip key={l.id} label={l} size="md" onClick={(e) => openPop('labels', e.currentTarget as HTMLElement)} />
                  ))}
                  <button type="button" className="icon-btn icon-btn--square" onClick={(e) => openPop('labels', e.currentTarget)} aria-label="Añadir etiqueta">
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            )}
            {priority && (
              <div className="card-meta__group">
                <div className="card-meta__label">Prioridad</div>
                <button type="button" className="meta-btn" onClick={(e) => openPop('priority', e.currentTarget)} style={{ color: priority.color }}>
                  <Flag size={15} fill={priority.color} /> {priority.name}
                </button>
              </div>
            )}
            {(card.due || card.start) && (
              <div className="card-meta__group">
                <div className="card-meta__label">{card.due ? 'Vencimiento' : 'Inicio'}</div>
                <div className="card-meta__dates">
                  {card.due && (
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={card.dueDone}
                      onChange={() => S.updateCard(card.id, { dueDone: !card.dueDone })}
                      aria-label="Marcar como completada"
                    />
                  )}
                  <button type="button" className="meta-btn" onClick={(e) => openPop('dates', e.currentTarget)}>
                    {card.start && card.due ? `${formatDate(card.start)} – ${formatDate(card.due)}` : formatDate((card.due ?? card.start)!)}
                    {status && status !== 'normal' && <span className={`status-pill is-${status}`}>{DUE_STATUS_TEXT[status]}</span>}
                  </button>
                </div>
              </div>
            )}
          </div>

          {!isSeparator && <CustomFieldsSection card={card} onManage={(el) => openPop('fields', el)} />}
          {!isSeparator && <Description card={card} />}
          {!isSeparator && (
            <Checklists
              card={card}
              focusChecklistId={focusChecklist}
            />
          )}
          {!isSeparator && <Attachments card={card} onAdd={(el) => openPop('attachment', el)} />}
          {!isSeparator && <Comments card={card} />}
          {isSeparator && (
            <p className="muted">
              Esta tarjeta es un <strong>separador</strong>: se muestra como una cabecera de color dentro de la lista. Cambia su color desde
              «Color» o conviértela en tarjeta normal.
            </p>
          )}
        </div>

        <aside className="card-modal__sidebar">
          <div className="side-group">
            <div className="side-group__title">Añadir a la tarjeta</div>
            <SideButton k="labels" icon={<Tag size={16} />} text="Etiquetas" />
            {!isSeparator && <SideButton k="checklist" icon={<CheckSquare size={16} />} text="Checklist" />}
            {!isSeparator && <SideButton k="dates" icon={<Clock size={16} />} text="Fechas" />}
            {!isSeparator && <SideButton k="priority" icon={<Flag size={16} />} text="Prioridad" />}
            <SideButton k="cover" icon={<PanelTop size={16} />} text={isSeparator ? 'Color' : 'Portada'} />
            {!isSeparator && <SideButton k="attachment" icon={<Paperclip size={16} />} text="Adjunto" />}
            {!isSeparator && <SideButton k="fields" icon={<SlidersHorizontal size={16} />} text="Campos" />}
          </div>
          <div className="side-group">
            <div className="side-group__title">Acciones</div>
            <SideButton k="move" icon={<ArrowRightLeft size={16} />} text="Mover" />
            <SideButton k="copy" icon={<Copy size={16} />} text="Copiar" />
            <button
              type="button"
              className="side-btn"
              onClick={() =>
                S.updateCard(card.id, {
                  kind: isSeparator ? 'card' : 'separator',
                  ...(!isSeparator && !card.cover ? { cover: { color: 'black_bold', image: null, size: 'full' as const } } : {}),
                })
              }
            >
              <SeparatorHorizontal size={16} /> {isSeparator ? 'Convertir en tarjeta' : 'Convertir en separador'}
            </button>
            {!isSeparator && (
              <button type="button" className={`side-btn ${card.isTemplate ? 'is-on' : ''}`} onClick={() => S.updateCard(card.id, { isTemplate: !card.isTemplate })}>
                <LayoutTemplate size={16} /> {card.isTemplate ? 'Es plantilla ✓' : 'Usar como plantilla'}
              </button>
            )}
            <button
              type="button"
              className="side-btn"
              onClick={async () => {
                if (await copyToClipboard(cardLink(card.boardId, card.id))) toast('Enlace copiado');
              }}
            >
              <Link size={16} /> Copiar enlace
            </button>
            {!card.archived ? (
              <button
                type="button"
                className="side-btn"
                onClick={() => {
                  S.archiveCard(card.id);
                  undoToast('Tarjeta archivada');
                }}
              >
                <Archive size={16} /> Archivar
              </button>
            ) : (
              <button type="button" className="side-btn" onClick={() => S.restoreCard(card.id)}>
                <RotateCcw size={16} /> Restaurar
              </button>
            )}
            <button
              type="button"
              className="side-btn side-btn--danger"
              onClick={async () => {
                if (await deleteCardWithConfirm(card.id)) closeCard();
              }}
            >
              <Trash2 size={16} /> Eliminar
            </button>
          </div>
        </aside>
      </div>

      {pop.openKey && pop.anchor && (
        <Popover
          anchor={pop.anchor}
          onClose={closePop}
          title={popTitle?.title ?? POP_TITLES[pop.openKey]}
          onBack={popTitle?.back}
          width={pop.openKey === 'labels' || pop.openKey === 'fields' ? 320 : 304}
        >
          {pop.openKey === 'labels' && <LabelPicker card={card} onTitle={(title, back) => setPopTitle({ title, back })} />}
          {pop.openKey === 'dates' && <DatesPicker card={card} onDone={closePop} />}
          {pop.openKey === 'fields' && <FieldsManager boardId={card.boardId} />}
          {pop.openKey === 'cover' && <CoverPicker card={card} />}
          {pop.openKey === 'priority' && <PriorityPicker card={card} onDone={closePop} />}
          {pop.openKey === 'move' && <MoveCopyPicker card={card} mode="move" onDone={closePop} />}
          {pop.openKey === 'copy' && <MoveCopyPicker card={card} mode="copy" onDone={closePop} />}
          {pop.openKey === 'checklist' && (
            <AddChecklistForm
              card={card}
              onDone={(id) => {
                closePop();
                setFocusChecklist(id);
              }}
            />
          )}
          {pop.openKey === 'attachment' && (
            <AttachmentForm
              onSubmit={(name, url) => {
                S.addAttachment(card.id, name, url, { kind: 'link' });
                closePop();
              }}
              onFiles={
                uploads
                  ? (files) => {
                      closePop();
                      void attachFiles(files);
                    }
                  : undefined
              }
            />
          )}
        </Popover>
      )}
      </div>
    </Modal>
  );
}
