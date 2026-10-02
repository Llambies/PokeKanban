import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { LayoutTemplate, X } from 'lucide-react';
import { createCard, createFromTemplate, useStore } from '../../store/store';
import { useUI } from '../../store/ui';
import { AutoTextarea } from '../common/AutoTextarea';
import { Popover } from '../common/Popover';

export function CardComposer({ listId, onAdded }: { listId: string; onAdded?: () => void }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const close = () => useUI.setState({ composerListId: null });

  useEffect(() => {
    ref.current?.focus();
    formRef.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  const submit = () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      ref.current?.focus();
      return;
    }
    // Pasting several lines creates one card per line.
    for (const line of lines) createCard(listId, line);
    setText('');
    onAdded?.();
    requestAnimationFrame(() => {
      ref.current?.focus();
      formRef.current?.scrollIntoView({ block: 'nearest' });
    });
  };

  return (
    <form
      ref={formRef}
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node) && !text.trim()) close();
      }}
    >
      <AutoTextarea
        ref={ref}
        className="composer__input"
        placeholder="Título de la tarjeta… (Enter para añadir)"
        aria-label="Título de la tarjeta"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
      />
      <div className="composer__actions">
        <button type="submit" className="btn btn--primary btn--sm">
          Añadir tarjeta
        </button>
        <button type="button" className="icon-btn" onClick={close} aria-label="Cancelar">
          <X size={18} />
        </button>
      </div>
    </form>
  );
}

/** Button + popover to create a card from one of the board's templates. */
export function TemplatePicker({ listId, boardId }: { listId: string; boardId: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const templates = useStore(
    useShallow((s) => Object.values(s.data.cards).filter((c) => c.boardId === boardId && c.isTemplate && !c.archived)),
  );
  return (
    <>
      <button
        type="button"
        className="icon-btn list__template-btn"
        title="Crear desde plantilla"
        aria-label="Crear desde plantilla"
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        <LayoutTemplate size={16} />
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} title="Plantillas" width={280}>
          {templates.length === 0 ? (
            <p className="muted small">
              No hay plantillas en este tablero. Haz clic derecho en una tarjeta y elige <strong>Usar como plantilla</strong>.
            </p>
          ) : (
            <div className="menu-list">
              {templates.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className="menu-list__item"
                  onClick={() => {
                    createFromTemplate(t.id, listId);
                    setAnchor(null);
                  }}
                >
                  <LayoutTemplate size={15} /> {t.title}
                </button>
              ))}
            </div>
          )}
        </Popover>
      )}
    </>
  );
}
