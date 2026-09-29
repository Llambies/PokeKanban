import type { CSSProperties } from 'react';
import { POKEMON, type PokemonRow } from './pokemon-data';
import { POKEMON_PREFIX, pokemonId, pokemonSpriteSize, pokemonSpriteUrl } from '../../shared/pokemon.js';
import { normalize } from './icons';

/**
 * Pokémon icons: an icon value "poke:<number>" shows that Pokémon's PokeAPI icon, cropped to the
 * box the sprite really covers (see scripts/pokemon-data.mjs) so it reads well at small sizes.
 */
export { pokemonId };

const BY_ID = new Map<number, PokemonRow>(POKEMON.map((row) => [row[0], row]));

export const POKEMON_COUNT = POKEMON.length;

export function pokemonIconValue(id: number): string {
  return POKEMON_PREFIX + id;
}

export function pokemonName(id: number): string {
  return BY_ID.get(id)?.[1] ?? `#${id}`;
}

/** By Spanish or English name, or by number ("25", "#25"). */
export function searchPokemon(query: string): PokemonRow[] {
  const q = normalize(query.trim().replace(/^#/, ''));
  if (!q) return POKEMON;
  if (/^\d+$/.test(q)) return POKEMON.filter((row) => String(row[0]).startsWith(q));
  return POKEMON.filter((row) => normalize(row[1]).includes(q) || (row[6] !== undefined && normalize(row[6]).includes(q)));
}

export function randomPokemon(): number {
  return POKEMON[Math.floor(Math.random() * POKEMON.length)][0];
}

/** Inline style that draws the sprite of Pokémon `id` fitted into a `size`×`size` square. */
export function spriteStyle(id: number, size: number): CSSProperties {
  const { width, height } = pokemonSpriteSize(id);
  const row = BY_ID.get(id);
  const [x0, y0, x1, y1] = row ? row.slice(2, 6) as number[] : [0, 0, width - 1, height - 1];
  const boxW = x1 - x0 + 1;
  const boxH = y1 - y0 + 1;
  const scale = size / Math.max(boxW, boxH);
  const left = (size - boxW * scale) / 2 - x0 * scale;
  const top = (size - boxH * scale) / 2 - y0 * scale;
  return {
    width: size,
    height: size,
    backgroundImage: `url("${pokemonSpriteUrl(id)}")`,
    backgroundSize: `${width * scale}px ${height * scale}px`,
    backgroundPosition: `${left}px ${top}px`,
    backgroundRepeat: 'no-repeat',
    // Pixel art: keep it crisp when enlarged.
    imageRendering: scale >= 1 ? 'pixelated' : 'auto',
  };
}
