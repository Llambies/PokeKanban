export interface Hue {
  hue: string;
  name: string;
  subtle: string;
  normal: string;
  bold: string;
}
export const HUES: Hue[];
export const DARK_TEXT: string;
export const LIGHT_TEXT: string;
export function colorHex(key: string | null | undefined): string | null;
