import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, X } from 'lucide-react';
import { useLayer } from '../../lib/layers';

interface PopoverProps {
  anchor: HTMLElement | DOMRect | null;
  onClose: () => void;
  title?: string;
  onBack?: () => void;
  width?: number;
  className?: string;
  children: ReactNode;
}

const MARGIN = 8;

export function Popover({ anchor, onClose, title, onBack, width = 304, className, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden', top: 0, left: 0, width });
  const isTop = useLayer(onClose);

  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el || !anchor) return;
      const rect = anchor instanceof DOMRect ? anchor : anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(width, vw - MARGIN * 2);
      const h = el.offsetHeight;
      let left = rect.left;
      if (left + w > vw - MARGIN) left = vw - w - MARGIN;
      left = Math.max(MARGIN, left);
      let top = rect.bottom + 6;
      if (top + h > vh - MARGIN) {
        const above = rect.top - h - 6;
        top = above >= MARGIN ? above : Math.max(MARGIN, vh - h - MARGIN);
      }
      setStyle({ top, left, width: w, maxHeight: vh - MARGIN * 2 });
    };
    place();
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [anchor, width]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (ref.current?.contains(target)) return;
      if (target.closest('.ctx-menu, .dialog')) return;
      if (anchor instanceof HTMLElement && anchor.contains(target)) return;
      if (isTop()) onClose();
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [anchor, onClose, isTop]);

  useEffect(() => {
    // Focus the first field for quick keyboard use.
    const el = ref.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=checkbox]), textarea');
    el?.focus({ preventScroll: true });
  }, []);

  return createPortal(
    <div ref={ref} className={`popover ${className ?? ''}`} style={style} role="dialog" aria-label={title}>
      {(title || onBack) && (
        <div className="popover__header">
          {onBack ? (
            <button type="button" className="icon-btn icon-btn--sm" onClick={onBack} aria-label="Volver">
              <ChevronLeft size={16} />
            </button>
          ) : (
            <span className="popover__spacer" />
          )}
          <span className="popover__title">{title}</span>
          <button type="button" className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
      )}
      <div className="popover__body">{children}</div>
    </div>,
    document.body,
  );
}

/** Small helper hook: tracks which popover (by key) is open and its anchor element. */
export function usePopover<K extends string>() {
  const [state, setState] = useState<{ key: K; anchor: HTMLElement } | null>(null);
  return {
    openKey: state?.key ?? null,
    anchor: state?.anchor ?? null,
    open: (key: K, anchor: HTMLElement) =>
      setState((s) => (s?.key === key && s.anchor === anchor ? null : { key, anchor })),
    close: () => setState(null),
  };
}
