import { useMemo, useRef, useState } from 'react';
import { AlignLeft, ExternalLink, Link2, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import type { Card } from '../../types';
import * as S from '../../store/store';
import { renderMarkdown } from '../../lib/markdown';
import { formatTimestamp } from '../../lib/dates';
import { AutoTextarea } from '../common/AutoTextarea';

/* ------------------------------------------------------ description */

export function Description({ card }: { card: Card }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(card.description);
  const html = useMemo(() => (card.description.trim() ? renderMarkdown(card.description) : ''), [card.description]);

  const start = () => {
    setText(card.description);
    setEditing(true);
  };
  const save = () => {
    if (text !== card.description) S.updateCard(card.id, { description: text });
    setEditing(false);
  };

  return (
    <section className="card-section">
      <div className="card-section__head">
        <AlignLeft size={18} className="card-section__icon" />
        <h3 className="card-section__title">Descripción</h3>
        {!editing && card.description && (
          <div className="card-section__tools">
            <button type="button" className="btn btn--sm" onClick={start}>
              Editar
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="description-editor">
          <AutoTextarea
            className="input description-editor__input"
            autoFocus
            value={text}
            placeholder="Añade una descripción más detallada… (admite Markdown)"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                save();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setEditing(false);
              }
            }}
          />
          <div className="composer__actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={save}>
              Guardar
            </button>
            <button type="button" className="btn btn--sm" onClick={() => setEditing(false)}>
              Cancelar
            </button>
            <span className="muted small push-right">Markdown · Ctrl+Enter para guardar</span>
          </div>
        </div>
      ) : html ? (
        <div
          className="markdown"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a')) return;
            start();
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <button type="button" className="placeholder-box" onClick={start}>
          Añade una descripción más detallada…
        </button>
      )}
    </section>
  );
}

/* ----------------------------------------------------- attachments */

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function AttachmentForm({ onSubmit, initial }: { onSubmit: (name: string, url: string) => void; initial?: { name: string; url: string } }) {
  const [url, setUrl] = useState(initial?.url ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  return (
    <form
      className="attachment-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!url.trim()) return;
        const full = normalizeUrl(url);
        onSubmit(name.trim() || hostOf(full), full);
      }}
    >
      <label className="field-label" htmlFor="att-url">Enlace</label>
      <input id="att-url" className="input" autoFocus placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
      <label className="field-label" htmlFor="att-name">Texto a mostrar (opcional)</label>
      <input id="att-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="btn btn--primary" disabled={!url.trim()}>
        {initial ? 'Guardar' : 'Añadir'}
      </button>
    </form>
  );
}

export function Attachments({ card, onAdd }: { card: Card; onAdd: (anchor: HTMLElement) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  if (card.attachments.length === 0) return null;
  return (
    <section className="card-section">
      <div className="card-section__head">
        <Link2 size={18} className="card-section__icon" />
        <h3 className="card-section__title">Enlaces</h3>
        <div className="card-section__tools">
          <button type="button" className="btn btn--sm" onClick={(e) => onAdd(e.currentTarget)}>
            Añadir
          </button>
        </div>
      </div>
      <div className="attachments">
        {card.attachments.map((a) =>
          editing === a.id ? (
            <div key={a.id} className="attachment attachment--editing">
              <AttachmentForm
                initial={a}
                onSubmit={(name, url) => {
                  S.updateAttachment(card.id, a.id, { name, url });
                  setEditing(null);
                }}
              />
              <button type="button" className="btn btn--sm" onClick={() => setEditing(null)}>
                Cancelar
              </button>
            </div>
          ) : (
            <div key={a.id} className="attachment">
              <span className="attachment__icon">
                <Link2 size={16} />
              </span>
              <div className="attachment__main">
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="attachment__name">
                  {a.name} <ExternalLink size={12} />
                </a>
                <span className="muted small">
                  {hostOf(a.url)} · {formatTimestamp(a.createdAt)}
                </span>
              </div>
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => setEditing(a.id)} aria-label="Editar enlace">
                <Pencil size={14} />
              </button>
              <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => S.deleteAttachment(card.id, a.id)} aria-label="Eliminar enlace">
                <Trash2 size={14} />
              </button>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

/* --------------------------------------------------------- comments */

function CommentItem({ cardId, id, text, createdAt, editedAt }: { cardId: string; id: string; text: string; createdAt: number; editedAt?: number }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  const html = useMemo(() => renderMarkdown(text), [text]);
  return (
    <div className="comment">
      <div className="comment__meta">
        {formatTimestamp(createdAt)}
        {editedAt && ' (editada)'}
      </div>
      {editing ? (
        <div className="description-editor">
          <AutoTextarea
            className="input"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (value.trim()) S.updateComment(cardId, id, value.trim());
                setEditing(false);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setEditing(false);
              }
            }}
          />
          <div className="composer__actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => {
                if (value.trim()) S.updateComment(cardId, id, value.trim());
                setEditing(false);
              }}
            >
              Guardar
            </button>
            <button type="button" className="btn btn--sm" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="comment__body markdown" dangerouslySetInnerHTML={{ __html: html }} />
          <div className="comment__actions">
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setValue(text);
                setEditing(true);
              }}
            >
              Editar
            </button>
            ·
            <button type="button" className="link-btn" onClick={() => S.deleteComment(cardId, id)}>
              Eliminar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Comments({ card }: { card: Card }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const submit = () => {
    if (!text.trim()) return;
    S.addComment(card.id, text);
    setText('');
  };
  return (
    <section className="card-section">
      <div className="card-section__head">
        <MessageSquare size={18} className="card-section__icon" />
        <h3 className="card-section__title">Notas y actividad</h3>
      </div>
      <div className={`comment-composer ${focused || text ? 'is-open' : ''}`}>
        <AutoTextarea
          ref={ref}
          className="input"
          placeholder="Escribe una nota…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {(focused || text) && (
          <div className="composer__actions">
            <button type="button" className="btn btn--primary btn--sm" disabled={!text.trim()} onMouseDown={(e) => e.preventDefault()} onClick={submit}>
              Guardar nota
            </button>
            <span className="muted small push-right">Ctrl+Enter</span>
          </div>
        )}
      </div>
      <div className="comments">
        {card.comments.map((c) => (
          <CommentItem key={c.id} cardId={card.id} {...c} />
        ))}
        <div className="comment comment--system">
          <div className="comment__meta">{formatTimestamp(card.createdAt)}</div>
          <div className="comment__body">Tarjeta creada</div>
        </div>
      </div>
    </section>
  );
}
