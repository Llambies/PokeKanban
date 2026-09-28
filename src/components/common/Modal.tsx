import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isConsumed, useLayer } from '../../lib/layers';

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}

export function Modal({ onClose, children, className, labelledBy }: ModalProps) {
  const isTop = useLayer(onClose);
  const downOnBackdrop = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    return () => previous?.focus?.({ preventScroll: true });
  }, []);

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        // Ignore the click that just dismissed a popover or menu on top of the modal.
        downOnBackdrop.current = e.target === e.currentTarget && isTop() && !isConsumed(e.nativeEvent);
      }}
      onMouseUp={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget && isTop()) onClose();
        downOnBackdrop.current = false;
      }}
    >
      <div ref={ref} className={`modal ${className ?? ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
