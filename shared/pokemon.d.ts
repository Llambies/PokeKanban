import type { PokemonRow } from './pokemon-data.js';

export const POKEMON_PREFIX: string;
export const SHINY_SUFFIX: string;
export function pokemonKey(icon: string | null | undefined): string | null;
export function isShiny(key: string): boolean;
export function baseKey(key: string): string;
export function pokemonRow(key: string): PokemonRow | null;
export function pokemonSpriteUrl(key: string): string;
export function pokemonSpriteSize(key: string): { width: number; height: number };
export function pokemonSpriteBox(key: string): [number, number, number, number] | null;
