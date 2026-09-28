import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { dismissToast, useUI } from '../../store/ui';
import { useLayer } from '../../lib/layers';

function ConfirmDialog() {
  const req = useUI((s) => s.confirm);
  const close = (ok: boolean) => {
    req?.resolve(ok);
    useUI.setState({ confirm: null });
  };
  useLayer(() => close(false), !!req);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (req) btn.current?.focus();
  }, [req]);
  if (!req) return null;
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title" className="dialog__title">{req.title}</h2>
        {req.message && <p className="dialog__message">{req.message}</p>}
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => close(false)}>
            Cancelar
          </button>
          <button
            ref={btn}
            type="button"
            className={`btn ${req.danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={() => close(true)}
          >
            {req.confirmText ?? 'Aceptar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PromptDialog() {
  const req = useUI((s) => s.prompt);
  const [value, setValue] = useState('');
  const close = (result: string | null) => {
    req?.resolve(result);
    useUI.setState({ prompt: null });
  };
  useLayer(() => close(null), !!req);
  useEffect(() => {
    if (req) setValue(req.value);
  }, [req]);
  if (!req) return null;
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(null)}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-title"
        onSubmit={(e) => {
          e.preventDefault();
          close(value);
        }}
      >
        <h2 id="prompt-title" className="dialog__title">{req.title}</h2>
        {req.label && <label className="field-label" htmlFor="prompt-input">{req.label}</label>}
        <input
          id="prompt-input"
          className="input"
          autoFocus
          type={req.inputType ?? 'text'}
          value={value}
          placeholder={req.placeholder}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => close(null)}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary">
            {req.confirmText ?? 'Guardar'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function ChoiceDialog() {
  const req = useUI((s) => s.choice);
  const close = (value: string | null) => {
    req?.resolve(value);
    useUI.setState({ choice: null });
  };
  useLayer(() => close(null), !!req);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (req) first.current?.focus();
  }, [req]);
  if (!req) return null;
  const firstEnabled = req.options.findIndex((o) => !o.disabled);
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(null)}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="choice-title">
        <h2 id="choice-title" className="dialog__title">{req.title}</h2>
        {req.message && <p className="dialog__message">{req.message}</p>}
        <div className="choice-list">
          {req.options.map((o, i) => (
            <button
              key={o.value}
              ref={i === firstEnabled ? first : undefined}
              type="button"
              className={`choice ${o.danger ? 'choice--danger' : ''}`}
              disabled={o.disabled}
              onClick={() => close(o.value)}
            >
              <span className="choice__label">{o.label}</span>
              {o.description && <span className="choice__desc">{o.description}</span>}
            </button>
          ))}
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => close(null)}>
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Toasts() {
  const toasts = useUI((s) => s.toasts);
  if (toasts.length === 0) return null;
  return createPortal(
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                t.action?.();
                dismissToast(t.id);
              }}
            >
              {t.actionText ?? 'Deshacer'}
            </button>
          )}
          <button type="button" className="icon-btn icon-btn--sm toast__close" onClick={() => dismissToast(t.id)} aria-label="Cerrar">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function DialogHost() {
  return (
    <>
      <ConfirmDialog />
      <PromptDialog />
      <ChoiceDialog />
      <Toasts />
    </>
  );
}
