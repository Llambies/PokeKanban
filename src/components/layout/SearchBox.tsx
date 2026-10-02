import { useMemo, useRef, useState } from 'react';
import { LayoutDashboard, Search, X } from 'lucide-react';
import { useStore } from '../../store/store';
import { normalize } from '../../lib/icons';
import { navigate, openCard, openEvent } from '../../lib/router';
import { getBoardBackground, getColor } from '../../lib/colors';
import { todayKey } from '../../lib/dates';
import { eventColorKey, eventIcon, KIND_INFO, shortDate } from '../../lib/calendar';
import { dayToKey, keyToDay, occurrences } from '../../../shared/calendar.js';
import { IconGlyph } from '../common/LabelChip';

interface Result {
  kind: 'board' | 'card' | 'event';
  id: string;
  boardId: string;
  title: string;
  subtitle: string;
  /** Events: occurrence to open. */
  occ?: string;
}

export const SEARCH_INPUT_ID = 'global-search';
const SEARCH_LISTBOX_ID = 'global-search-listbox';
const resultOptionId = (i: number) => `global-search-option-${i}`;

export function SearchBox() {
  const data = useStore((s) => s.data);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo<Result[]>(() => {
    const q = normalize(query);
    if (!q) return [];
    const terms = q.split(/\s+/);
    const match = (text: string) => {
      const n = normalize(text);
      return terms.every((t) => n.includes(t));
    };
    const out: Result[] = [];
    for (const id of data.boardOrder) {
      const b = data.boards[id];
      if (match(b.title)) out.push({ kind: 'board', id, boardId: id, title: b.title, subtitle: 'Tablero' });
    }
    for (const card of Object.values(data.cards)) {
      if (card.archived) continue;
      const list = data.lists[card.listId];
      if (!list || list.archived) continue;
      if (!match(`${card.title} ${card.description}`)) continue;
      out.push({
        kind: 'card',
        id: card.id,
        boardId: card.boardId,
        title: card.title,
        subtitle: `${data.boards[card.boardId]?.title ?? ''} › ${list.title}`,
      });
      if (out.length >= 30) break;
    }
    // Events: open the next occurrence (or the last one if the series is over).
    const today = todayKey();
    for (const event of Object.values(data.events)) {
      if (out.length >= 40) break;
      if (!match(`${event.title} ${event.notes} ${event.location}`)) continue;
      const next = occurrences(event, today, dayToKey(keyToDay(today) + 800))[0];
      const occ = next ?? event.start.slice(0, 10);
      out.push({
        kind: 'event',
        id: event.id,
        boardId: '',
        title: event.title,
        subtitle: `${KIND_INFO[event.kind].label} · ${shortDate(occ)}`,
        occ,
      });
    }
    return out;
  }, [query, data]);

  const go = (r: Result) => {
    setQuery('');
    inputRef.current?.blur();
    if (r.kind === 'board') navigate({ boardId: r.id });
    else if (r.kind === 'event') openEvent(r.id, r.occ ?? null);
    else openCard(r.id, r.boardId);
  };

  return (
    <div className={`search ${focused ? 'is-focused' : ''}`}>
      <Search size={16} className="search__icon" />
      <input
        id={SEARCH_INPUT_ID}
        ref={inputRef}
        className="search__input"
        placeholder="Buscar tarjetas, tableros y eventos"
        value={query}
        autoComplete="off"
        role="combobox"
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-controls={SEARCH_LISTBOX_ID}
        aria-label="Buscar tarjetas, tableros y eventos"
        aria-expanded={focused && results.length > 0}
        aria-activedescendant={focused && results[active] ? resultOptionId(active) : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            go(results[active]);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setQuery('');
            inputRef.current?.blur();
          }
        }}
      />
      {query && (
        <button type="button" className="search__clear" onMouseDown={(e) => e.preventDefault()} onClick={() => setQuery('')} aria-label="Limpiar búsqueda">
          <X size={14} />
        </button>
      )}
      {focused && query.trim() && (
        <div className="search__results" role="listbox" id={SEARCH_LISTBOX_ID}>
          {results.length === 0 && <div className="search__empty">Sin resultados para "{query}"</div>}
          {results.map((r, i) => (
            <button
              type="button"
              key={`${r.kind}-${r.id}`}
              id={resultOptionId(i)}
              role="option"
              aria-selected={i === active}
              className={`search__result ${i === active ? 'is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r)}
            >
              {r.kind === 'board' ? (
                <span className="search__thumb" style={{ background: getBoardBackground(data.boards[r.id].background).css }}>
                  <LayoutDashboard size={12} color="#fff" />
                </span>
              ) : r.kind === 'event' ? (
                <span
                  className="search__thumb"
                  style={{
                    background: getColor(eventColorKey(data.events[r.id], data.eventLabels))?.bg,
                    color: getColor(eventColorKey(data.events[r.id], data.eventLabels))?.fg,
                  }}
                >
                  <IconGlyph icon={eventIcon(data.events[r.id])} size={12} />
                </span>
              ) : (
                <span className="search__thumb search__thumb--card" />
              )}
              <span className="search__text">
                <span className="search__title">{r.title}</span>
                <span className="search__subtitle">{r.subtitle}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
