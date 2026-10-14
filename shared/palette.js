// Color palette shared by the web app, the server (agenda for the Android widget) and the widget itself.
// Keys: "<hue>_subtle", "<hue>" and "<hue>_bold" (e.g. "green", "green_bold").

export const HUES = [
  { hue: 'green', name: 'Verde', subtle: '#BAF3DB', normal: '#4BCE97', bold: '#1F845A' },
  { hue: 'yellow', name: 'Amarillo', subtle: '#F8E6A0', normal: '#F5CD47', bold: '#946F00' },
  { hue: 'orange', name: 'Naranja', subtle: '#FEDEC8', normal: '#FEA362', bold: '#C25100' },
  { hue: 'red', name: 'Rojo', subtle: '#FFD5D2', normal: '#F87168', bold: '#C9372C' },
  { hue: 'purple', name: 'Morado', subtle: '#DFD8FD', normal: '#9F8FEF', bold: '#6E5DC6' },
  { hue: 'blue', name: 'Azul', subtle: '#CCE0FF', normal: '#579DFF', bold: '#0C66E4' },
  { hue: 'sky', name: 'Celeste', subtle: '#C6EDFB', normal: '#6CC3E0', bold: '#227D9B' },
  { hue: 'lime', name: 'Lima', subtle: '#D3F1A7', normal: '#94C748', bold: '#5B7F24' },
  { hue: 'pink', name: 'Rosa', subtle: '#FDD0EC', normal: '#E774BB', bold: '#AE4787' },
  { hue: 'black', name: 'Gris', subtle: '#DCDFE4', normal: '#8590A2', bold: '#44546F' },
];

export const DARK_TEXT = '#172B4D';
export const LIGHT_TEXT = '#FFFFFF';

const HEX = new Map();
for (const h of HUES) {
  HEX.set(`${h.hue}_subtle`, h.subtle);
  HEX.set(h.hue, h.normal);
  HEX.set(`${h.hue}_bold`, h.bold);
}

/** Background hex of a palette key or custom "#rrggbb" color, or null. */
export function colorHex(key) {
  if (!key) return null;
  if (HEX.has(key)) return HEX.get(key);
  return /^#[0-9a-f]{6}$/i.test(key) ? key : null;
}

// Backgrounds the item icons sit on: the app's and the Android widget's surfaces, light and dark.
const ICON_BG = { light: '#FFFFFF', dark: '#22272B' };
const ICON_MIN_CONTRAST = 3;

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** `hex` moved towards `to` by `amount` (0–1). */
function mix(hex, to, amount) {
  const channel = (h, i) => parseInt(h.slice(i, i + 2), 16);
  return (
    '#' +
    [1, 3, 5]
      .map((i) => Math.round(channel(hex, i) + (channel(to, i) - channel(hex, i)) * amount).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/**
 * Color for an item's icon, the hue of its color with enough contrast to read as a thin line icon:
 * on light backgrounds the bold shade, on dark ones the normal one; custom colors are lightened or
 * darkened as needed. Null when the item has no color (the icon stays grey).
 */
export function iconColor(key, theme) {
  const hue = key && HUES.find((h) => key === h.hue || key === `${h.hue}_subtle` || key === `${h.hue}_bold`);
  let hex = hue ? (theme === 'dark' ? hue.normal : hue.bold) : colorHex(key);
  if (!hex) return null;
  hex = hex.toUpperCase();
  const bg = ICON_BG[theme === 'dark' ? 'dark' : 'light'];
  const towards = theme === 'dark' ? '#FFFFFF' : '#000000';
  for (let step = 1; step <= 10 && contrast(hex, bg) < ICON_MIN_CONTRAST; step++) hex = mix(hex, towards, 0.1);
  return hex;
}
