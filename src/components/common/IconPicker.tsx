import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Dices, Sparkles } from 'lucide-react';
import { EMOJIS, LUCIDE_PREFIX, lucideIconValue, normalize, searchIcons } from '../../lib/icons';
import {
  countIcons, ICON_FAMILIES, iconLabel, type IconIndex, loadIconIndex, parseReactIcon, reactIconValue, requestIcons,
  searchIconIndex, useIconGetter,
} from '../../lib/reactIcons';
import {
  baseKey, FORMS_COUNT, isForm, isShiny, pokemonIconValue, pokemonKey, randomPokemon, searchPokemon, SPECIES_COUNT,
  spriteStyle, withShiny,
} from '../../lib/pokemon';

const POKEMON_PAGE = 96;
const FORM_SHORTCUTS = ['Alola', 'Galar', 'Hisui', 'Paldea', 'Mega', 'Gigamax'];

function PokemonTab({ value, onChange }: { value: string | null; onChange: (icon: string) => void }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(POKEMON_PAGE);
  const results = useMemo(() => searchPokemon(query), [query]);
  const selected = pokemonKey(value);
  // Shiny mode shows (and picks) the shiny version of every Pokémon.
  const [shiny, setShiny] = useState(() => !!selected && isShiny(selected));
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
          aria-label="Buscar Pokémon o forma por nombre o número"
          value={query}
          onChange={(e) => search(e.target.value)}
        />
        <button
          type="button"
          className="btn btn--sm icon-picker__shiny"
          title={shiny ? 'Mostrando shiny: pulsa para ver los normales' : 'Ver los Pokémon shiny'}
          aria-label="Shiny"
          aria-pressed={shiny}
          onClick={() => setShiny(!shiny)}
        >
          <Sparkles size={15} />
        </button>
        <button type="button" className="btn btn--sm" title="Uno al azar" aria-label="Pokémon al azar" onClick={() => onChange(pokemonIconValue(randomPokemon(), shiny))}>
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
          const [base, species, name] = row;
          const key = withShiny(base, shiny);
          // The current icon in its other version (normal / shiny) is outlined: picking it switches it.
          const state = selected === key ? 'is-selected' : selected && baseKey(selected) === base ? 'is-other' : '';
          const label = shiny ? `${name} shiny` : name;
          return (
            <button
              type="button"
              key={key}
              className={`icon-cell ${state} ${isForm(row) ? 'is-form' : ''}`}
              onClick={() => onChange(pokemonIconValue(key))}
              title={`#${species} ${label}`}
              aria-label={label}
            >
              <span className="poke-glyph" style={spriteStyle(key, 30)} />
            </button>
          );
        })}
        {results.length === 0 && <p className="muted small">Ningún Pokémon coincide</p>}
      </div>
      <p className="muted small icon-picker__credit">
        {query ? `${results.length} resultados` : `${SPECIES_COUNT} Pokémon y ${FORMS_COUNT} formas`} ·{' '}
        {shiny ? 'shiny' : 'iconos'} de PokeAPI
      </p>
    </>
  );
}

const ICON_PAGE = 160;
const FEATURED = 'featured';

function FamilyHeader({ name, count, license }: { name: string; count: number; license?: string }) {
  return (
    <div className="icon-grid__family" title={license ? `${name} · licencia ${license}` : name}>
      <span>{name}</span>
      <span className="icon-grid__family-meta">
        {count.toLocaleString('es-ES')}
        {license && ` · ${license}`}
      </span>
    </div>
  );
}

/** The app's featured icons (searchable in Spanish) and then every react-icons family. */
function IconsTab({ value, onChange }: { value: string | null; onChange: (icon: string) => void }) {
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('');
  const [limit, setLimit] = useState(ICON_PAGE);
  const [index, setIndex] = useState<IconIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const getIcon = useIconGetter();
  const search = useDeferredValue(query);

  useEffect(() => {
    let alive = true;
    loadIconIndex().then(
      (i) => alive && setIndex(i),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  const featured = useMemo(() => (family === '' || family === FEATURED ? searchIcons(search) : []), [search, family]);
  const sections = useMemo(() => {
    if (!index || family === FEATURED) return [];
    // Spanish words find the featured icons; their English names find the same idea in every family.
    const extra = normalize(search).length >= 3 ? searchIcons(search).map((d) => d.name.replace(/\d+$/, '')) : [];
    return searchIconIndex(index, search, family || null, extra);
  }, [index, search, family]);
  const familyCounts = useMemo(() => (index ? new Map(searchIconIndex(index, '').map((s) => [s.family.id, s.names.length])) : null), [index]);
  const total = featured.length + countIcons(sections);

  const reset = () => {
    setLimit(ICON_PAGE);
    if (gridRef.current) gridRef.current.scrollTop = 0;
  };

  // Only the first `limit` icons are drawn (more as the grid scrolls), and only they are downloaded.
  const cells: ReactNode[] = [];
  const shown: { family: string; name: string }[] = [];
  let budget = limit;
  if (featured.length > 0) {
    if (family === '') cells.push(<FamilyHeader key="h-featured" name="Destacados" count={featured.length} />);
    for (const { name, Icon } of featured.slice(0, budget)) {
      const v = lucideIconValue(name);
      cells.push(
        <button type="button" key={v} className={`icon-cell ${value === v ? 'is-selected' : ''}`} onClick={() => onChange(v)} title={name} aria-label={name}>
          <Icon size={18} />
        </button>,
      );
    }
    budget -= featured.length;
  }
  for (const section of sections) {
    if (budget <= 0) break;
    const fam = section.family;
    cells.push(<FamilyHeader key={`h-${fam.id}`} name={fam.name} count={section.names.length} license={fam.license} />);
    for (const name of section.names.slice(0, budget)) {
      const v = reactIconValue(fam.id, name);
      const Icon = getIcon(fam.id, name);
      if (!Icon) shown.push({ family: fam.id, name });
      const label = `${iconLabel(fam, name)} · ${fam.name}`;
      cells.push(
        <button type="button" key={v} className={`icon-cell ${value === v ? 'is-selected' : ''}`} onClick={() => onChange(v)} title={label} aria-label={label}>
          {Icon && <Icon size={18} />}
        </button>,
      );
    }
    budget -= section.names.length;
  }
  const missing = shown.map((i) => `${i.family}:${i.name}`).join(',');
  useEffect(() => {
    requestIcons(missing ? missing.split(',').map((key) => ({ family: key.split(':')[0], name: key.split(':')[1] })) : []);
  }, [missing]);

  return (
    <>
      <div className="icon-picker__custom">
        <input
          className="input input--sm"
          placeholder="Buscar (fuego, casa…)"
          aria-label="Buscar icono"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            reset();
          }}
        />
        <select
          className="select select--sm icon-picker__family"
          aria-label="Familia de iconos"
          value={family}
          onChange={(e) => {
            setFamily(e.target.value);
            reset();
          }}
        >
          <option value="">Todas</option>
          <option value={FEATURED}>Destacados</option>
          {ICON_FAMILIES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {familyCounts ? ` (${(familyCounts.get(f.id) ?? 0).toLocaleString('es-ES')})` : ''}
            </option>
          ))}
        </select>
      </div>
      <div
        ref={gridRef}
        className="icon-grid icon-grid--all"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight > el.scrollHeight - 80 && limit < total) setLimit((l) => l + ICON_PAGE);
        }}
      >
        {cells}
        {total === 0 && (index || failed) && <p className="muted small">Sin resultados</p>}
      </div>
      <p className="muted small icon-picker__credit">
        {failed
          ? 'Sin conexión: solo los iconos destacados'
          : !index
            ? 'Cargando todos los iconos…'
            : `${total.toLocaleString('es-ES')} ${query ? 'resultados' : 'iconos'} · react-icons`}
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
    pokemonKey(value) ? 'pokemon' : value && !value.startsWith(LUCIDE_PREFIX) && !parseReactIcon(value) ? 'emoji' : 'icons',
  );
  const [custom, setCustom] = useState('');

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
        <IconsTab value={value} onChange={onChange} />
      ) : (
        <>
          <div className="icon-picker__custom">
            <input
              className="input input--sm"
              placeholder="Pega o escribe cualquier emoji"
              aria-label="Emoji personalizado"
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
