// Pokémon icons ("poke:<sprite key>" icon values: "poke:25", "poke:10091" for Alolan Rattata,
// "poke:201-b" for Unown B, "poke:25:s" for shiny Pikachu…), shared by the web app, the server
// (notification images) and tests. Images come from the PokeAPI sprites repository: the 68×56 menu
// icons when they exist, the regular 96×96 sprites otherwise (the table in pokemon-data.js says which
// one each Pokémon uses). Menu icons have no shiny version, so shiny Pokémon use the 96×96 shiny sprite.

import { POKEMON } from './pokemon-data.js';

const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

export const POKEMON_PREFIX = 'poke:';
export const SHINY_SUFFIX = ':s';

const BY_KEY = new Map(POKEMON.map((row) => [row[0], row]));

/** Sprite key of an icon value ("poke:10091" -> "10091", "poke:25:s" -> "25:s"), or null. */
export function pokemonKey(icon) {
  if (!icon || !icon.startsWith(POKEMON_PREFIX)) return null;
  const key = icon.slice(POKEMON_PREFIX.length);
  return /^\d+(-[a-z0-9-]+)?(:s)?$/.test(key) ? key : null;
}

export function isShiny(key) {
  return key.endsWith(SHINY_SUFFIX);
}

/** The key without the shiny mark ("25:s" -> "25"). */
export function baseKey(key) {
  return isShiny(key) ? key.slice(0, -SHINY_SUFFIX.length) : key;
}

export function pokemonRow(key) {
  return BY_KEY.get(baseKey(key)) ?? null;
}

function usesFrontSprite(key) {
  if (isShiny(key)) return true;
  const row = BY_KEY.get(key);
  if (row) return row[7] === 1;
  // Unknown key (newer than the table): Pokémon after #898 only have the regular sprite.
  const n = Number(key);
  return Number.isInteger(n) && n > 898 && n < 10000;
}

export function pokemonSpriteUrl(key) {
  if (isShiny(key)) return `${SPRITES}/shiny/${baseKey(key)}.png`;
  return usesFrontSprite(key) ? `${SPRITES}/${key}.png` : `${SPRITES}/versions/generation-viii/icons/${key}.png`;
}

/** Pixel size of the image behind pokemonSpriteUrl(key). */
export function pokemonSpriteSize(key) {
  return usesFrontSprite(key) ? { width: 96, height: 96 } : { width: 68, height: 56 };
}

/** [x0, y0, x1, y1]: the box the Pokémon covers in the image behind pokemonSpriteUrl(key), or null. */
export function pokemonSpriteBox(key) {
  const row = pokemonRow(key);
  if (!row) return null;
  return isShiny(key) ? row.slice(8, 12) : row.slice(3, 7);
}
