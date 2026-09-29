// Pokémon icons ("poke:<number>" icon values), shared by the web app, the server (notification
// images) and the data script. Images come from the PokeAPI sprites repository: the menu icons
// (68×56) up to #898, the regular sprites (96×96) for later Pokémon, which have no icon yet.

const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

export const POKEMON_PREFIX = 'poke:';
export const POKEMON_ICON_MAX = 898;

/** Number of the Pokémon in an icon value ("poke:25" -> 25), or null. */
export function pokemonId(icon) {
  if (!icon || !icon.startsWith(POKEMON_PREFIX)) return null;
  const id = Number(icon.slice(POKEMON_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function pokemonSpriteUrl(id) {
  return id <= POKEMON_ICON_MAX ? `${SPRITES}/versions/generation-viii/icons/${id}.png` : `${SPRITES}/${id}.png`;
}

/** Pixel size of the image behind pokemonSpriteUrl(id). */
export function pokemonSpriteSize(id) {
  return id <= POKEMON_ICON_MAX ? { width: 68, height: 56 } : { width: 96, height: 96 };
}
