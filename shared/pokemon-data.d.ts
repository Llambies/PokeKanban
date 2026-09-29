/** [sprite key, species number, Spanish name, x0, y0, x1, y1, 1 = 96×96 sprite / 0 = 68×56 icon, English name?] */
export type PokemonRow = [string, number, string, number, number, number, number, 0 | 1, string?];
export const POKEMON: PokemonRow[];
