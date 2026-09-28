import { Ban, Check } from 'lucide-react';
import { PALETTE_ROWS, type PaletteColor } from '../../lib/colors';

interface SwatchGridProps {
  value: string | null;
  onChange: (key: string | null) => void;
  /** Which rows to show: 0 = subtle, 1 = normal, 2 = bold. */
  rows?: number[];
  allowNone?: boolean;
  noneLabel?: string;
  size?: 'sm' | 'md';
}

export function SwatchGrid({ value, onChange, rows = [0, 1, 2], allowNone = true, noneLabel = 'Sin color', size = 'md' }: SwatchGridProps) {
  return (
    <div className={`swatch-grid swatch-grid--${size}`}>
      {rows.map((r) => (
        <div className="swatch-row" key={r}>
          {PALETTE_ROWS[r].map((c) => (
            <Swatch key={c.key} color={c} selected={value === c.key} onClick={() => onChange(c.key)} />
          ))}
        </div>
      ))}
      {allowNone && (
        <button
          type="button"
          className={`swatch-none ${value === null ? 'is-selected' : ''}`}
          onClick={() => onChange(null)}
        >
          <Ban size={14} /> {noneLabel}
        </button>
      )}
    </div>
  );
}

function Swatch({ color, selected, onClick }: { color: PaletteColor; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`swatch ${selected ? 'is-selected' : ''}`}
      style={{ background: color.bg, color: color.fg }}
      title={color.name}
      aria-label={color.name}
      aria-pressed={selected}
      onClick={onClick}
    >
      {selected && <Check size={14} strokeWidth={3} />}
    </button>
  );
}
