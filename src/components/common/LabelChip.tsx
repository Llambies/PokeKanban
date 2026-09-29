import type { CSSProperties } from 'react';
import type { Label } from '../../types';
import { getColor } from '../../lib/colors';
import { getLucideIcon } from '../../lib/icons';
import { pokemonKey, spriteStyle } from '../../lib/pokemon';

export function IconGlyph({ icon, size = 14 }: { icon: string | null | undefined; size?: number }) {
  if (!icon) return null;
  const Lucide = getLucideIcon(icon);
  if (Lucide) return <Lucide size={size} strokeWidth={2.25} aria-hidden />;
  const poke = pokemonKey(icon);
  // Sprites have no stroke weight: draw them a bit bigger than line icons.
  if (poke) return <span className="poke-glyph" style={spriteStyle(poke, Math.round(size * 1.3))} aria-hidden />;
  return (
    <span className="emoji-glyph" style={{ fontSize: size }} aria-hidden>
      {icon}
    </span>
  );
}

interface LabelChipProps {
  label: Pick<Label, 'name' | 'color' | 'icon'>;
  compact?: boolean;
  size?: 'sm' | 'md';
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
}

export function LabelChip({ label, compact, size = 'sm', onClick, title }: LabelChipProps) {
  const color = getColor(label.color);
  const style: CSSProperties = color ? { background: color.bg, color: color.fg } : {};
  const className = [
    'label-chip',
    `label-chip--${size}`,
    compact ? 'label-chip--compact' : '',
    color ? '' : 'label-chip--nocolor',
    onClick ? 'is-clickable' : '',
  ].join(' ');
  const content = compact ? (
    label.icon ? <IconGlyph icon={label.icon} size={10} /> : null
  ) : (
    <>
      {label.icon && <IconGlyph icon={label.icon} size={size === 'md' ? 15 : 13} />}
      {label.name && <span className="label-chip__name">{label.name}</span>}
    </>
  );
  const tooltip = title ?? (label.name || color?.name || 'Etiqueta');
  if (onClick) {
    return (
      <button type="button" className={className} style={style} onClick={onClick} title={tooltip}>
        {content}
      </button>
    );
  }
  return (
    <span className={className} style={style} title={tooltip}>
      {content}
    </span>
  );
}
