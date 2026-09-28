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
