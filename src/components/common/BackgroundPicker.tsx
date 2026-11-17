import { useRef, useState, type CSSProperties } from 'react';
import { Clock, Upload } from 'lucide-react';
import { usePersist } from '../../store/persistence';
import { updateBoard, useStore } from '../../store/store';
import { toast } from '../../store/ui';
import { uploadFile } from '../../lib/upload';
import {
  BACKGROUND_GROUPS, backgroundGroupOf, DEFAULT_PATTERN, DEFAULT_PATTERN_COLOR, getBoardBackground, parsePattern, patternCss,
  patternKey, PATTERN_COLORS, PATTERNS, SKY_KEY, type BackgroundGroupKey,
} from '../../lib/backgrounds';
import { useSkyPeriod } from '../../lib/useSkyPeriod';

type OnChange = (key: string) => void;

function BackgroundImage({ value, onChange }: { value: string; onChange: OnChange }) {
  const [url, setUrl] = useState(value.startsWith('image:') ? value.slice(6) : '');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploads = usePersist((s) => s.mode === 'server');
  return (
    <div className="bg-image">
      <div className="field-label">Imagen de fondo</div>
      {/* Not a <form>: this may live inside the "create board" form. */}
      <div className="inline-form">
        <input
          className="input input--sm"
          type="url"
          placeholder="https://…/foto.jpg"
          aria-label="URL de la imagen de fondo"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (url.trim()) onChange(`image:${url.trim()}`);
            }
          }}
        />
        <button type="button" className="btn btn--sm" disabled={!url.trim()} onClick={() => onChange(`image:${url.trim()}`)}>
          Usar
        </button>
        {uploads && (
          <button type="button" className="btn btn--sm" disabled={busy} onClick={() => fileInput.current?.click()} title="Subir imagen">
            <Upload size={14} />
          </button>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          try {
            const up = await uploadFile(file);
            setUrl(up.url);
            onChange(`image:${up.url}`);
          } catch (err) {
            toast(err instanceof Error ? err.message : 'No se pudo subir la imagen');
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

/** The "+" swatch: any color, through the browser's color input. */
function CustomColor({ value, selected, label, onChange }: { value: string; selected: boolean; label: string; onChange: (hex: string) => void }) {
  return (
    <label className={`bg-swatch bg-swatch--custom ${selected ? 'is-selected' : ''}`} title={label} style={{ background: selected ? value : undefined }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <span>+</span>
    </label>
  );
}

/** Patterns are picked in two steps, in any order: the pattern and its color. */
function PatternPanel({ value, onChange, menu }: { value: string; onChange: OnChange; menu: boolean }) {
  const current = parsePattern(value);
  const pattern = current?.pattern ?? DEFAULT_PATTERN;
  const color = current?.color ?? DEFAULT_PATTERN_COLOR;
  return (
    <>
      <div className="field-label">Trama</div>
      <div className="bg-grid">
        {PATTERNS.map((p) => (
          <button
            key={p.key}
            type="button"
            // Drawn at 2.5x and scaled down, so the pattern still shows in such a small swatch.
            className={`bg-swatch bg-swatch--zoom ${current && pattern === p.key ? 'is-selected' : ''}`}
            style={{ '--bg': patternCss(p.key, color) } as CSSProperties}
            title={p.name}
            aria-label={p.name}
            aria-pressed={!!current && pattern === p.key}
            onClick={() => onChange(patternKey(p.key, color))}
          />
        ))}
      </div>
      <div className="field-label">Color</div>
      <div className="bg-grid">
        {PATTERN_COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            className={`bg-swatch ${current && color === c.hex ? 'is-selected' : ''}`}
            style={{ background: c.hex }}
            title={c.name}
            aria-label={c.name}
            aria-pressed={!!current && color === c.hex}
            onClick={() => onChange(patternKey(pattern, c.hex))}
          />
        ))}
        {!menu && (
          <CustomColor
            value={color}
            selected={!!current && !PATTERN_COLORS.some((c) => c.hex === color)}
            label="Otro color"
            onChange={(hex) => onChange(patternKey(pattern, hex))}
          />
        )}
      </div>
    </>
  );
}

/**
 * Board backgrounds by collection. `menu` is the compact version for the context menu: no image
 * field and no color inputs (their native dialog would close the menu).
 */
export function BackgroundPicker({ value, onChange, allowImage = false, menu = false }: { value: string; onChange: OnChange; allowImage?: boolean; menu?: boolean }) {
  useSkyPeriod();
  const [tab, setTab] = useState<BackgroundGroupKey>(() => backgroundGroupOf(value) ?? 'gradient');
  const custom = value.startsWith('custom:') ? value.slice(7) : '#0c66e4';
  return (
    <div className={`bg-picker ${menu ? 'bg-picker--menu' : ''}`}>
      <div className="chip-row bg-tabs" role="group" aria-label="Colección de fondos">
        {BACKGROUND_GROUPS.map((g) => (
          <button key={g.key} type="button" className={`chip ${tab === g.key ? 'is-active' : ''}`} aria-pressed={tab === g.key} onClick={() => setTab(g.key)}>
            {g.name}
          </button>
        ))}
      </div>
      {tab === 'pattern' ? (
        <PatternPanel value={value} onChange={onChange} menu={menu} />
      ) : (
        <div className="bg-grid">
          {BACKGROUND_GROUPS.find((g) => g.key === tab)?.items.map(({ key, name }) => {
            const label = key === SKY_KEY ? `${name}: cambia según la hora` : name;
            return (
              <button
                key={key}
                type="button"
                className={`bg-swatch ${value === key ? 'is-selected' : ''}`}
                style={{ background: getBoardBackground(key).css }}
                title={label}
                aria-label={label}
                aria-pressed={value === key}
                onClick={() => onChange(key)}
              >
                {key === SKY_KEY && <Clock size={12} />}
              </button>
            );
          })}
          {tab === 'solid' && !menu && (
            <CustomColor value={custom} selected={value.startsWith('custom:')} label="Color personalizado" onChange={(hex) => onChange(`custom:${hex}`)} />
          )}
        </div>
      )}
      {allowImage && <BackgroundImage value={value} onChange={onChange} />}
    </div>
  );
}

/** The picker of the board context menu: follows the board, since the menu stays open while picking. */
export function BoardBackgroundMenu({ boardId }: { boardId: string }) {
  const background = useStore((s) => s.data.boards[boardId]?.background);
  if (background === undefined) return null;
  return <BackgroundPicker menu value={background} onChange={(key) => updateBoard(boardId, { background: key })} />;
}
