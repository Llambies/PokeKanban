import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isConsumed, useLayer } from '../../lib/layers';
import { captureFocus } from '../../lib/focus';

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  /** Re-find an element to restore focus to if nothing had real focus when this opened
   *  (e.g. it was opened by clicking a non-focusable tile). */
  restoreFocusSelector?: string;
}

export function Modal({ onClose, children, className, labelledBy, restoreFocusSelector }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isTop = useLayer(onClose, true, { container: ref, blocking: true });
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    const restore = captureFocus(restoreFocusSelector);
    ref.current?.focus({ preventScroll: true });
    return restore;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
