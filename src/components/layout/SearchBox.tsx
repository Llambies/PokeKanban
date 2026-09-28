import { useMemo, useRef, useState } from 'react';
import { LayoutDashboard, Search, X } from 'lucide-react';
import { useStore } from '../../store/store';
import { normalize } from '../../lib/icons';
import { navigate, openCard } from '../../lib/router';
import { getBoardBackground } from '../../lib/colors';

interface Result {
  kind: 'board' | 'card';
  id: string;
  boardId: string;
  title: string;
  subtitle: string;
}

export const SEARCH_INPUT_ID = 'global-search';

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
    return out;
  }, [query, data]);

  const go = (r: Result) => {
    setQuery('');
    inputRef.current?.blur();
    if (r.kind === 'board') navigate({ boardId: r.id });
    else openCard(r.id, r.boardId);
  };

  return (
    <div className={`search ${focused ? 'is-focused' : ''}`}>
      <Search size={16} className="search__icon" />
      <input
        id={SEARCH_INPUT_ID}
        ref={inputRef}
        className="search__input"
        placeholder="Buscar tarjetas y tableros"
        value={query}
        autoComplete="off"
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
        aria-label="Buscar"
        aria-expanded={focused && results.length > 0}
      />
      {query && (
        <button type="button" className="search__clear" onMouseDown={(e) => e.preventDefault()} onClick={() => setQuery('')} aria-label="Limpiar búsqueda">
          <X size={14} />
        </button>
      )}
      {focused && query.trim() && (
        <div className="search__results" role="listbox">
          {results.length === 0 && <div className="search__empty">Sin resultados para "{query}"</div>}
          {results.map((r, i) => (
            <button
              type="button"
              key={`${r.kind}-${r.id}`}
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
