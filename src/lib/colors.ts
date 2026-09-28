import type { ColorKey } from '../types';
import { DARK_TEXT, HUES, LIGHT_TEXT } from '../../shared/palette.js';

export interface PaletteColor {
  key: ColorKey;
  name: string;
  bg: string;
  /** Text color with good contrast on bg. */
  fg: string;
}

export const PALETTE: PaletteColor[] = [];
/** Palette laid out as rows (subtle / normal / bold), handy for swatch grids. */
export const PALETTE_ROWS: PaletteColor[][] = [[], [], []];

for (const h of HUES) {
  const subtle = { key: `${h.hue}_subtle`, name: `${h.name} claro`, bg: h.subtle, fg: DARK_TEXT };
  const normal = { key: h.hue, name: h.name, bg: h.normal, fg: DARK_TEXT };
  const bold = { key: `${h.hue}_bold`, name: `${h.name} oscuro`, bg: h.bold, fg: LIGHT_TEXT };
  PALETTE.push(subtle, normal, bold);
  PALETTE_ROWS[0].push(subtle);
  PALETTE_ROWS[1].push(normal);
  PALETTE_ROWS[2].push(bold);
}

const BY_KEY = new Map(PALETTE.map((c) => [c.key, c]));

export function getColor(key: ColorKey | null | undefined): PaletteColor | null {
  if (!key) return null;
  const found = BY_KEY.get(key);
  if (found) return found;
  if (key.startsWith('#')) return { key, name: key, bg: key, fg: contrastText(key) };
  return null;
}

export function colorName(key: ColorKey | null | undefined): string {
  return getColor(key)?.name ?? 'Sin color';
}

/** Picks black or white text for a hex background. */
export function contrastText(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return DARK_TEXT;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.36 ? DARK_TEXT : LIGHT_TEXT;
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export interface BoardBackground {
  key: string;
  name: string;
  css: string;
  /** Dominant color used for the translucent header. */
  base: string;
}

export const BOARD_BACKGROUNDS: BoardBackground[] = [
  { key: 'ocean', name: 'Océano', css: 'linear-gradient(135deg, #0c66e4 0%, #09326c 100%)', base: '#0c4aa6' },
  { key: 'sunset', name: 'Atardecer', css: 'linear-gradient(135deg, #f87168 0%, #e774bb 55%, #6e5dc6 100%)', base: '#b85494' },
  { key: 'forest', name: 'Bosque', css: 'linear-gradient(135deg, #1f845a 0%, #0f4c35 100%)', base: '#17684a' },
  { key: 'aurora', name: 'Aurora', css: 'linear-gradient(135deg, #227d9b 0%, #4bce97 50%, #94c748 100%)', base: '#2f9a86' },
  { key: 'dusk', name: 'Anochecer', css: 'linear-gradient(135deg, #6e5dc6 0%, #352c63 100%)', base: '#4f4396' },
  { key: 'fire', name: 'Fuego', css: 'linear-gradient(135deg, #f5cd47 0%, #fea362 45%, #c9372c 100%)', base: '#e0703c' },
  { key: 'candy', name: 'Caramelo', css: 'linear-gradient(135deg, #fdd0ec 0%, #cce0ff 100%)', base: '#b99fd0' },
  { key: 'night', name: 'Noche', css: 'linear-gradient(135deg, #1d2125 0%, #44546f 100%)', base: '#2c333a' },
  { key: 'blue', name: 'Azul', css: '#0079bf', base: '#0079bf' },
  { key: 'green', name: 'Verde', css: '#519839', base: '#519839' },
  { key: 'orange', name: 'Naranja', css: '#d29034', base: '#d29034' },
  { key: 'red', name: 'Rojo', css: '#b04632', base: '#b04632' },
  { key: 'purple', name: 'Morado', css: '#89609e', base: '#89609e' },
  { key: 'pink', name: 'Rosa', css: '#cd5a91', base: '#cd5a91' },
  { key: 'lime', name: 'Lima', css: '#4bbf6b', base: '#4bbf6b' },
  { key: 'sky', name: 'Celeste', css: '#00aecc', base: '#00aecc' },
  { key: 'grey', name: 'Gris', css: '#838c91', base: '#838c91' },
];

const BG_BY_KEY = new Map(BOARD_BACKGROUNDS.map((b) => [b.key, b]));

/** Safe value for `url("…")` in inline styles. */
export function cssUrl(url: string): string {
  return `url("${url.replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`;
}

export function getBoardBackground(key: string): BoardBackground {
  if (key.startsWith('image:')) {
    return { key, name: 'Imagen', css: `#2c333a ${cssUrl(key.slice(6))} center / cover no-repeat`, base: '#2c333a' };
  }
  if (key.startsWith('custom:')) {
    const hex = key.slice(7);
    return { key, name: 'Personalizado', css: hex, base: hex };
  }
  return BG_BY_KEY.get(key) ?? BOARD_BACKGROUNDS[0];
}
