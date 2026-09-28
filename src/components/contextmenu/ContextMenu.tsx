import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../../store/store';
import { consumeEvent, useLayer } from '../../lib/layers';
import { closeContextMenu, useMenu, type MenuActionItem, type MenuItem } from './menuStore';

const SUBMENU_DELAY = 110;
const MARGIN = 6;
/** Below this width menus open as bottom sheets and submenus drill down instead of cascading. */
const SHEET_BREAKPOINT = 600;

function isSheetMode(): boolean {
  return window.innerWidth < SHEET_BREAKPOINT;
}

function isAction(item: MenuItem): item is MenuActionItem {
  return item.kind === undefined || item.kind === 'item';
}

interface PanelProps {
  items: MenuItem[];
  /** Anchor point (root) or anchor rect (submenu). */
  anchor: { x: number; y: number } | DOMRect;
  depth: number;
  autoFocus: boolean;
  onBack?: () => void;
  /** Called when the pointer enters this panel (keeps the parent submenu open). */
  onEnter?: () => void;
  /** Label of the parent item (shown as a "back" row in sheet mode). */
  title?: string;
}

function MenuPanel({ items, anchor, depth, autoFocus, onBack, onEnter, title }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const sheet = isSheetMode();
  // opacity (not visibility) while measuring, so the menu can take keyboard focus immediately.
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0, left: 0, top: 0 });
  const [active, setActive] = useState(-1);
  const [openSub, setOpenSub] = useState<{ index: number; rect: DOMRect; viaKeyboard: boolean } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (sheet) {
      setStyle({});
      return;
    }
    // offset* sizes ignore the opening scale animation.
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left: number;
    let top: number;
    if (anchor instanceof DOMRect) {
      left = anchor.right - 2;
      if (left + width > vw - MARGIN) left = Math.max(MARGIN, anchor.left - width + 2);
      top = anchor.top - 5;
    } else {
      left = anchor.x;
      top = anchor.y;
      if (left + width > vw - MARGIN) left = Math.max(MARGIN, vw - width - MARGIN);
    }
    if (top + height > vh - MARGIN) top = Math.max(MARGIN, vh - height - MARGIN);
    setStyle({ left, top, maxHeight: vh - MARGIN * 2 });
    // Only on mount / anchor change: items can change while open (toggles) without jumping around.
  }, [anchor]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  const focusable = items.map((item, i) => (isAction(item) && !item.disabled ? i : -1)).filter((i) => i >= 0);

  function openSubmenu(index: number, viaKeyboard: boolean) {
    const el = ref.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (!el) return;
    setOpenSub({ index, rect: el.getBoundingClientRect(), viaKeyboard });
  }

  function activate(index: number, viaKeyboard = false) {
    const item = items[index];
    if (!isAction(item) || item.disabled) return;
    if (item.submenu) {
      openSubmenu(index, viaKeyboard);
      return;
    }
    if (!item.keepOpen) closeContextMenu();
    item.onSelect?.();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (openSub?.viaKeyboard && e.target !== ref.current) return;
    const pos = focusable.indexOf(active);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        setActive(focusable[(pos + 1) % focusable.length] ?? -1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        setActive(focusable[pos < 0 ? focusable.length - 1 : (pos - 1 + focusable.length) % focusable.length] ?? -1);
        break;
      case 'ArrowRight': {
        e.preventDefault();
        e.stopPropagation();
        const item = items[active];
        if (item && isAction(item) && item.submenu) openSubmenu(active, true);
        break;
      }
      case 'ArrowLeft':
        e.preventDefault();
        e.stopPropagation();
        onBack?.();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        e.stopPropagation();
        if (active >= 0) activate(active, true);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        closeContextMenu();
        break;
      case 'Tab':
        e.preventDefault();
        break;
    }
  }

  function onItemEnter(index: number) {
    setActive(index);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const item = items[index];
    hoverTimer.current = setTimeout(() => {
      if (isAction(item) && item.submenu && !item.disabled) openSubmenu(index, false);
      else setOpenSub(null);
    }, SUBMENU_DELAY);
  }

  const hasChecks = items.some((i) => isAction(i) && i.checked !== undefined);
  const sub = openSub ? items[openSub.index] : null;

  return (
    <>
      <div
        ref={ref}
        className={`ctx-menu ${sheet ? 'ctx-menu--sheet' : ''}`}
        role="menu"
        tabIndex={-1}
        style={{ ...style, zIndex: 1000 + depth }}
        onKeyDown={onKeyDown}
        onMouseEnter={onEnter}
        onContextMenu={(e) => e.preventDefault()}
      >
        {sheet && onBack && (
          <button type="button" className="ctx-item ctx-back" onClick={onBack}>
            <ChevronLeft size={16} />
            <span className="ctx-label">{title}</span>
          </button>
        )}
        {items.map((item, i) => {
          if (item.kind === 'separator') return <div key={`sep-${i}`} className="ctx-sep" role="separator" />;
          if (item.kind === 'header') return <div key={`h-${i}`} className="ctx-header">{item.label}</div>;
          if (item.kind === 'custom') {
            return (
              <div key={item.key} className="ctx-custom" onMouseEnter={() => onItemEnter(i)}>
                {item.render(closeContextMenu)}
              </div>
            );
          }
          const isActive = active === i;
          return (
            <button
              key={`${item.label}-${i}`}
              type="button"
              role={item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={item.checked}
              aria-haspopup={item.submenu ? 'menu' : undefined}
              aria-expanded={item.submenu ? openSub?.index === i : undefined}
              data-index={i}
              disabled={item.disabled}
              className={[
                'ctx-item',
                isActive ? 'is-active' : '',
                item.danger ? 'is-danger' : '',
                openSub?.index === i ? 'is-open' : '',
              ].join(' ')}
              onMouseEnter={() => onItemEnter(i)}
              onMouseMove={() => active !== i && setActive(i)}
              onClick={() => activate(i)}
            >
              {hasChecks && <span className="ctx-check">{item.checked && <Check size={14} />}</span>}
              {item.icon !== undefined && <span className="ctx-icon">{item.icon}</span>}
              <span className="ctx-label">{item.label}</span>
              {item.hint && <span className="ctx-hint">{item.hint}</span>}
              {item.submenu && <ChevronRight size={14} className="ctx-arrow" />}
            </button>
          );
        })}
      </div>
      {openSub && sub && isAction(sub) && sub.submenu && (
        <MenuPanel
          key={openSub.index}
          title={sub.label}
          items={sub.submenu()}
          anchor={openSub.rect}
          depth={depth + 1}
          autoFocus={openSub.viaKeyboard}
          onBack={() => {
            setOpenSub(null);
            ref.current?.focus({ preventScroll: true });
          }}
          onEnter={() => {
            if (hoverTimer.current) clearTimeout(hoverTimer.current);
            setActive(openSub.index);
          }}
        />
      )}
    </>
  );
}

export function ContextMenuHost() {
  const { open, x, y, build } = useMenu();
  // Re-render when data changes so builders show fresh state (checked labels, etc).
  useStore((s) => s.data);
  const anchor = useRef<{ x: number; y: number }>({ x, y });
  if (anchor.current.x !== x || anchor.current.y !== y) anchor.current = { x, y };

  // Topmost layer while open: Escape closes the menu, not the modal underneath.
  useLayer(closeContextMenu, open);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.ctx-menu')) return;
      consumeEvent(e);
      closeContextMenu();
    };
    const onScroll = (e: Event) => {
      if (!(e.target instanceof HTMLElement && e.target.closest('.ctx-menu'))) closeContextMenu();
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', closeContextMenu);
    window.addEventListener('blur', closeContextMenu);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', closeContextMenu);
      window.removeEventListener('blur', closeContextMenu);
    };
  }, [open]);

  if (!open || !build) return null;
  const items = build();
  if (items.length === 0) return null;
  return createPortal(
    <>
      {isSheetMode() && <div className="ctx-backdrop" />}
      <MenuPanel key={`${x},${y}`} items={items} anchor={anchor.current} depth={0} autoFocus />
    </>,
    document.body,
  );
}
