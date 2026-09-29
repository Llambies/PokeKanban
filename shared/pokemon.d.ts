export const POKEMON_PREFIX: string;
export const POKEMON_ICON_MAX: number;
export function pokemonId(icon: string | null | undefined): number | null;
export function pokemonSpriteUrl(id: number): string;
export function pokemonSpriteSize(id: number): { width: number; height: number };
