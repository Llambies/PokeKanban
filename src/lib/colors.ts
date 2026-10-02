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

/** WCAG relative luminance (0–1) of an sRGB triple. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** WCAG contrast ratio (1–21) between two relative luminances. */
function contrastFromLuminance(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG contrast ratio (1–21) between two hex colors. */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return 1;
  return contrastFromLuminance(relativeLuminance(a), relativeLuminance(b));
}

const DARK_TEXT_LUMINANCE = relativeLuminance(hexToRgb(DARK_TEXT) ?? [0, 0, 0]);
const LIGHT_TEXT_LUMINANCE = relativeLuminance(hexToRgb(LIGHT_TEXT) ?? [255, 255, 255]);

/**
 * Picks black or white text for a hex background: whichever gives the higher
 * actual contrast ratio, rather than a fixed luminance cutoff (which used to pick
 * white for plenty of mid-luminance colors that read better with dark text).
 */
export function contrastText(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return DARK_TEXT;
  const bgLuminance = relativeLuminance(rgb);
  const darkContrast = contrastFromLuminance(bgLuminance, DARK_TEXT_LUMINANCE);
  const lightContrast = contrastFromLuminance(bgLuminance, LIGHT_TEXT_LUMINANCE);
  return darkContrast >= lightContrast ? DARK_TEXT : LIGHT_TEXT;
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
  /**
   * CSS color for the scrim behind the white text on the board (header, "Añadir otra lista",
   * home tiles). Omitted presets fall back to the CSS default of rgba(0, 0, 0, 0.24); presets
   * with a light top color need a stronger scrim to keep >=4.5:1 contrast.
   */
  scrim?: string;
}

export const BOARD_BACKGROUNDS: BoardBackground[] = [
  { key: 'ocean', name: 'Océano', css: 'linear-gradient(135deg, #0c66e4 0%, #09326c 100%)', base: '#0c4aa6' },
  {
    key: 'sunset',
    name: 'Atardecer',
    css: 'linear-gradient(135deg, #f87168 0%, #e774bb 55%, #6e5dc6 100%)',
    base: '#b85494',
    scrim: 'rgba(0, 0, 0, 0.26)',
  },
  { key: 'forest', name: 'Bosque', css: 'linear-gradient(135deg, #1f845a 0%, #0f4c35 100%)', base: '#17684a' },
  {
    key: 'aurora',
    name: 'Aurora',
    css: 'linear-gradient(135deg, #227d9b 0%, #4bce97 50%, #94c748 100%)',
    base: '#2f9a86',
    scrim: 'rgba(0, 0, 0, 0.38)',
  },
  { key: 'dusk', name: 'Anochecer', css: 'linear-gradient(135deg, #6e5dc6 0%, #352c63 100%)', base: '#4f4396' },
  {
    key: 'fire',
    name: 'Fuego',
    css: 'linear-gradient(135deg, #f5cd47 0%, #fea362 45%, #c9372c 100%)',
    base: '#e0703c',
    scrim: 'rgba(0, 0, 0, 0.45)',
  },
  {
    key: 'candy',
    name: 'Caramelo',
    css: 'linear-gradient(135deg, #fdd0ec 0%, #cce0ff 100%)',
    base: '#b99fd0',
    scrim: 'rgba(0, 0, 0, 0.5)',
  },
  { key: 'night', name: 'Noche', css: 'linear-gradient(135deg, #1d2125 0%, #44546f 100%)', base: '#2c333a' },
  { key: 'blue', name: 'Azul', css: '#0079bf', base: '#0079bf' },
  { key: 'green', name: 'Verde', css: '#519839', base: '#519839' },
  { key: 'orange', name: 'Naranja', css: '#d29034', base: '#d29034', scrim: 'rgba(0, 0, 0, 0.28)' },
  { key: 'red', name: 'Rojo', css: '#b04632', base: '#b04632' },
  { key: 'purple', name: 'Morado', css: '#89609e', base: '#89609e' },
  { key: 'pink', name: 'Rosa', css: '#cd5a91', base: '#cd5a91' },
  { key: 'lime', name: 'Lima', css: '#4bbf6b', base: '#4bbf6b', scrim: 'rgba(0, 0, 0, 0.32)' },
  { key: 'sky', name: 'Celeste', css: '#00aecc', base: '#00aecc', scrim: 'rgba(0, 0, 0, 0.28)' },
  { key: 'grey', name: 'Gris', css: '#838c91', base: '#838c91' },
];

const BG_BY_KEY = new Map(BOARD_BACKGROUNDS.map((b) => [b.key, b]));

/** Safe value for `url("…")` in inline styles. */
export function cssUrl(url: string): string {
  return `url("${url.replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`;
}

/**
 * Smallest black-scrim alpha (>= the default 0.24) that keeps white text at
 * >=4.5:1 over `hex`. Used for custom/image backgrounds, whose brightness we
 * can't pre-tune like the fixed presets above.
 */
function scrimAlphaFor(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.24;
  const bgLuminance = relativeLuminance(rgb);
  for (let alpha = 0.24; alpha < 0.9; alpha += 0.02) {
    // Alpha-composite black at `alpha` over the color: luminance scales linearly.
    const effLuminance = bgLuminance * (1 - alpha);
    if (contrastFromLuminance(effLuminance, LIGHT_TEXT_LUMINANCE) >= 4.6) return Math.round(alpha * 100) / 100;
  }
  return 0.9;
}

export function getBoardBackground(key: string): BoardBackground {
  if (key.startsWith('image:')) {
    // Unknown brightness: keep white text but use a strong, fixed scrim.
    return {
      key,
      name: 'Imagen',
      css: `#2c333a ${cssUrl(key.slice(6))} center / cover no-repeat`,
      base: '#2c333a',
      scrim: 'rgba(0, 0, 0, 0.55)',
    };
  }
  if (key.startsWith('custom:')) {
    const hex = key.slice(7);
    return { key, name: 'Personalizado', css: hex, base: hex, scrim: `rgba(0, 0, 0, ${scrimAlphaFor(hex)})` };
  }
  return BG_BY_KEY.get(key) ?? BOARD_BACKGROUNDS[0];
}
