import type { CSSProperties } from 'react';
import { POKEMON, type PokemonRow } from '../../shared/pokemon-data.js';
import {
  baseKey, isShiny, POKEMON_PREFIX, pokemonKey, pokemonRow, pokemonSpriteBox, pokemonSpriteSize, pokemonSpriteUrl, SHINY_SUFFIX,
} from '../../shared/pokemon.js';
import { normalize } from './icons';

/**
 * Pokémon icons: an icon value "poke:<key>" shows that Pokémon's (or form's) PokeAPI image, cropped to
 * the box the sprite really covers (see scripts/pokemon-data.mjs) so it reads well at small sizes.
 * "poke:<key>:s" is its shiny version.
 */
export { baseKey, isShiny, pokemonKey, type PokemonRow };

export const POKEMON_ROWS = POKEMON;
export const SPECIES_COUNT = POKEMON.filter((row) => row[0] === String(row[1])).length;
export const FORMS_COUNT = POKEMON.length - SPECIES_COUNT;

/** Sprite key of `key` in its normal or shiny version. */
export function withShiny(key: string, shiny: boolean): string {
  return baseKey(key) + (shiny ? SHINY_SUFFIX : '');
}

export function pokemonIconValue(key: string, shiny = isShiny(key)): string {
  return POKEMON_PREFIX + withShiny(key, shiny);
}

export function pokemonName(key: string): string {
  const name = pokemonRow(key)?.[2] ?? `#${baseKey(key)}`;
  return isShiny(key) ? `${name} shiny` : name;
}

export function isForm(row: PokemonRow): boolean {
  return row[0] !== String(row[1]);
}

/** By Spanish or English name ("alola", "gigamax", "mega"…), or by Pokédex number ("25", "#25"). */
export function searchPokemon(query: string, includeForms = true): PokemonRow[] {
  const rows = includeForms ? POKEMON : POKEMON.filter((row) => !isForm(row));
  const q = normalize(query.trim().replace(/^#/, ''));
  if (!q) return rows;
  if (/^\d+$/.test(q)) return rows.filter((row) => String(row[1]).startsWith(q));
  const terms = q.split(/\s+/);
  const matches = (text: string | undefined) => !!text && terms.every((t) => normalize(text).includes(t));
  return rows.filter((row) => matches(row[2]) || matches(row[12]));
}

export function randomPokemon(): string {
  return POKEMON[Math.floor(Math.random() * POKEMON.length)][0];
}

/** Inline style that draws Pokémon `key` fitted into a `size`×`size` square. */
export function spriteStyle(key: string, size: number): CSSProperties {
  const { width, height } = pokemonSpriteSize(key);
  const [x0, y0, x1, y1] = pokemonSpriteBox(key) ?? [0, 0, width - 1, height - 1];
  const boxW = x1 - x0 + 1;
  const boxH = y1 - y0 + 1;
  const scale = size / Math.max(boxW, boxH);
  const left = (size - boxW * scale) / 2 - x0 * scale;
  const top = (size - boxH * scale) / 2 - y0 * scale;
  return {
    width: size,
    height: size,
    backgroundImage: `url("${pokemonSpriteUrl(key)}")`,
    backgroundSize: `${width * scale}px ${height * scale}px`,
    backgroundPosition: `${left}px ${top}px`,
    backgroundRepeat: 'no-repeat',
    // Pixel art: keep it crisp when enlarged.
    imageRendering: scale >= 1 ? 'pixelated' : 'auto',
  };
}
