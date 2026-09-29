// Pokémon icons ("poke:<sprite key>" icon values: "poke:25", "poke:10091" for Alolan Rattata,
// "poke:201-b" for Unown B…), shared by the web app, the server (notification images) and tests.
// Images come from the PokeAPI sprites repository: the 68×56 menu icons when they exist, the regular
// 96×96 sprites otherwise (the table in pokemon-data.js says which one each Pokémon uses).

import { POKEMON } from './pokemon-data.js';

const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

export const POKEMON_PREFIX = 'poke:';

const BY_KEY = new Map(POKEMON.map((row) => [row[0], row]));

/** Sprite key of an icon value ("poke:10091" -> "10091"), or null. */
export function pokemonKey(icon) {
  if (!icon || !icon.startsWith(POKEMON_PREFIX)) return null;
  const key = icon.slice(POKEMON_PREFIX.length);
  return /^\d+(-[a-z0-9-]+)?$/.test(key) ? key : null;
}

export function pokemonRow(key) {
  return BY_KEY.get(key) ?? null;
}

function usesFrontSprite(key) {
  const row = BY_KEY.get(key);
  if (row) return row[7] === 1;
  // Unknown key (newer than the table): Pokémon after #898 only have the regular sprite.
  const n = Number(key);
  return Number.isInteger(n) && n > 898 && n < 10000;
}

export function pokemonSpriteUrl(key) {
  return usesFrontSprite(key) ? `${SPRITES}/${key}.png` : `${SPRITES}/versions/generation-viii/icons/${key}.png`;
}

/** Pixel size of the image behind pokemonSpriteUrl(key). */
export function pokemonSpriteSize(key) {
  return usesFrontSprite(key) ? { width: 96, height: 96 } : { width: 68, height: 56 };
}
