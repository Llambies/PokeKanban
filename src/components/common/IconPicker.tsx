import { useMemo, useState } from 'react';
import { Ban } from 'lucide-react';
import { EMOJIS, LUCIDE_PREFIX, lucideIconValue, searchIcons } from '../../lib/icons';

interface IconPickerProps {
  value: string | null;
  onChange: (icon: string | null) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [tab, setTab] = useState<'icons' | 'emoji'>(value && !value.startsWith(LUCIDE_PREFIX) ? 'emoji' : 'icons');
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');
  const icons = useMemo(() => searchIcons(query), [query]);

  return (
    <div className="icon-picker">
      <div className="segmented" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'icons'} className={tab === 'icons' ? 'is-active' : ''} onClick={() => setTab('icons')}>
          Iconos
        </button>
        <button type="button" role="tab" aria-selected={tab === 'emoji'} className={tab === 'emoji' ? 'is-active' : ''} onClick={() => setTab('emoji')}>
          Emoji
        </button>
        <button type="button" className={`icon-picker__none ${value === null ? 'is-active' : ''}`} onClick={() => onChange(null)} title="Sin icono">
          <Ban size={14} /> Ninguno
        </button>
      </div>
      {tab === 'icons' ? (
        <>
          <input
            className="input input--sm"
            placeholder="Buscar icono (fuego, bug, casa…)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="icon-grid">
            {icons.map(({ name, Icon }) => {
              const v = lucideIconValue(name);
              return (
                <button
                  type="button"
                  key={name}
                  className={`icon-cell ${value === v ? 'is-selected' : ''}`}
                  onClick={() => onChange(v)}
                  title={name}
                  aria-label={name}
                >
                  <Icon size={18} />
                </button>
              );
            })}
            {icons.length === 0 && <p className="muted small">Sin resultados</p>}
          </div>
        </>
      ) : (
        <>
          <div className="icon-picker__custom">
            <input
              className="input input--sm"
              placeholder="Pega o escribe cualquier emoji"
              value={custom}
              maxLength={8}
              onChange={(e) => setCustom(e.target.value)}
            />
            <button type="button" className="btn btn--sm" disabled={!custom.trim()} onClick={() => onChange(custom.trim())}>
              Usar
            </button>
          </div>
          <div className="icon-grid icon-grid--emoji">
            {EMOJIS.map((emoji) => (
              <button
                type="button"
                key={emoji}
                className={`icon-cell ${value === emoji ? 'is-selected' : ''}`}
                onClick={() => onChange(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
