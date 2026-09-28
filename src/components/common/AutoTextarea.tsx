import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

/** Textarea that grows with its content. */
export const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function AutoTextarea(props, forwarded) {
    const ref = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(forwarded, () => ref.current!);
    useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }, [props.value]);
    return <textarea rows={1} {...props} ref={ref} />;
  },
);

/** Title editor: Enter saves, Escape cancels, blur saves. */
export function InlineTitleEditor({
  value,
  onSave,
  onCancel,
  className,
  placeholder,
  selectAll = true,
}: {
  value: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  className?: string;
  placeholder?: string;
  selectAll?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (selectAll) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
  }, [selectAll]);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const text = ref.current?.value.trim() ?? '';
    if (save && text && text !== value) onSave(text);
    else onCancel();
  };
  return (
    <AutoTextarea
      ref={ref}
      className={className}
      defaultValue={value}
      placeholder={placeholder}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      onInput={(e) => {
        const el = e.currentTarget;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
      }}
    />
  );
}
