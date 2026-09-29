import { useMemo, useState } from 'react';
import { Ban, Dices } from 'lucide-react';
import { EMOJIS, LUCIDE_PREFIX, lucideIconValue, searchIcons } from '../../lib/icons';
import {
  FORMS_COUNT, isForm, pokemonIconValue, pokemonKey, randomPokemon, searchPokemon, SPECIES_COUNT, spriteStyle,
} from '../../lib/pokemon';

const POKEMON_PAGE = 96;
const FORM_SHORTCUTS = ['Alola', 'Galar', 'Hisui', 'Paldea', 'Mega', 'Gigamax'];

function PokemonTab({ value, onChange }: { value: string | null; onChange: (icon: string) => void }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(POKEMON_PAGE);
  const results = useMemo(() => searchPokemon(query), [query]);
  const selected = pokemonKey(value);
  const search = (text: string) => {
    setQuery(text);
    setLimit(POKEMON_PAGE);
  };
  return (
    <>
      <div className="icon-picker__custom">
        <input
          className="input input--sm"
          placeholder="Buscar Pokémon o forma (nombre o número)"
          value={query}
          onChange={(e) => search(e.target.value)}
        />
        <button type="button" className="btn btn--sm" title="Uno al azar" aria-label="Pokémon al azar" onClick={() => onChange(pokemonIconValue(randomPokemon()))}>
          <Dices size={15} />
        </button>
      </div>
      <div className="chip-row icon-picker__shortcuts">
        {FORM_SHORTCUTS.map((word) => (
          <button
            type="button"
            key={word}
            className={`chip ${query.toLowerCase() === word.toLowerCase() ? 'is-active' : ''}`}
            onClick={() => search(query.toLowerCase() === word.toLowerCase() ? '' : word)}
          >
            {word}
          </button>
        ))}
      </div>
      <div
        className="icon-grid icon-grid--poke"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight > el.scrollHeight - 80) setLimit((l) => Math.min(l + POKEMON_PAGE, results.length));
        }}
      >
        {results.slice(0, limit).map((row) => {
          const [key, species, name] = row;
          return (
            <button
              type="button"
              key={key}
              className={`icon-cell ${selected === key ? 'is-selected' : ''} ${isForm(row) ? 'is-form' : ''}`}
              onClick={() => onChange(pokemonIconValue(key))}
              title={`#${species} ${name}`}
              aria-label={name}
            >
              <span className="poke-glyph" style={spriteStyle(key, 30)} />
            </button>
          );
        })}
        {results.length === 0 && <p className="muted small">Ningún Pokémon coincide</p>}
      </div>
      <p className="muted small icon-picker__credit">
        {query ? `${results.length} resultados` : `${SPECIES_COUNT} Pokémon y ${FORMS_COUNT} formas`} · iconos de PokeAPI
      </p>
    </>
  );
}

interface IconPickerProps {
  value: string | null;
  onChange: (icon: string | null) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [tab, setTab] = useState<'icons' | 'emoji' | 'pokemon'>(
    pokemonKey(value) ? 'pokemon' : value && !value.startsWith(LUCIDE_PREFIX) ? 'emoji' : 'icons',
  );
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
        <button type="button" role="tab" aria-selected={tab === 'pokemon'} className={tab === 'pokemon' ? 'is-active' : ''} onClick={() => setTab('pokemon')}>
          Pokémon
        </button>
        <button type="button" className={`icon-picker__none ${value === null ? 'is-active' : ''}`} onClick={() => onChange(null)} title="Sin icono">
          <Ban size={14} /> Ninguno
        </button>
      </div>
      {tab === 'pokemon' ? (
        <PokemonTab value={value} onChange={onChange} />
      ) : tab === 'icons' ? (
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
