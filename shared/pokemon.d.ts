import type { PokemonRow } from './pokemon-data.js';

export const POKEMON_PREFIX: string;
export function pokemonKey(icon: string | null | undefined): string | null;
export function pokemonRow(key: string): PokemonRow | null;
export function pokemonSpriteUrl(key: string): string;
export function pokemonSpriteSize(key: string): { width: number; height: number };
