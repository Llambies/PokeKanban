import { DARK_TEXT, HUES } from '../../shared/palette.js';
import { contrastText, cssUrl, hexLuminance, mixHex, scrimAlphaFor } from './colors';

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

export type BackgroundGroupKey = 'gradient' | 'mesh' | 'pattern' | 'scene' | 'type' | 'solid';

export interface BackgroundGroup {
  key: BackgroundGroupKey;
  name: string;
  /** Empty for "pattern": those are built from a pattern and a color (see patternKey). */
  items: BoardBackground[];
}

/* ------------------------------------------------------------------ helpers */

/** Hex colors of a background, leaving out what's inside its url("…") layers. */
function hexesOf(css: string): string[] {
  return css.replace(/url\("[^"]*"\)/g, '').match(/#[0-9a-f]{6}\b/gi) ?? [];
}

function lightest(hexes: string[]): string {
  return hexes.reduce((a, b) => (hexLuminance(b) > hexLuminance(a) ? b : a), hexes[0] ?? '#000000');
}

/**
 * A preset whose scrim is worked out from its lightest color (or from `light`, the lightest
 * color that ends up behind the white text, when the css has brighter areas elsewhere).
 */
function preset(key: string, name: string, css: string, opts: { base?: string; light?: string } = {}): BoardBackground {
  const hexes = hexesOf(css);
  const alpha = scrimAlphaFor(opts.light ?? lightest(hexes));
  return {
    key,
    name,
    css,
    base: opts.base ?? hexes[0] ?? '#2c333a',
    ...(alpha > 0.24 ? { scrim: `rgba(0, 0, 0, ${alpha})` } : {}),
  };
}

/** Inline SVG as a CSS url(): single quotes inside, so it fits in url("…") with little escaping. */
function svgUrl(attrs: string, body: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' ${attrs}>${body}</svg>`;
  return `url("data:image/svg+xml,${svg.replace(/[#<>%]/g, (c) => encodeURIComponent(c))}")`;
}

/** Small deterministic generator, so the drawn scenes are the same on every load. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------- gradients */

const GRADIENTS: BoardBackground[] = [
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
  preset('lavender', 'Lavanda', 'linear-gradient(135deg, #9f8fef 0%, #579dff 100%)', { base: '#7b96f7' }),
  preset('mint', 'Menta', 'linear-gradient(135deg, #4bce97 0%, #227d9b 100%)', { base: '#37a699' }),
  preset('peach', 'Melocotón', 'linear-gradient(135deg, #fea362 0%, #e774bb 100%)', { base: '#f38c8f' }),
  preset('glacier', 'Glaciar', 'linear-gradient(135deg, #c6edfb 0%, #579dff 100%)', { base: '#8fc5fd' }),
  preset('grape', 'Uva', 'linear-gradient(135deg, #ae4787 0%, #352c63 100%)', { base: '#723a75' }),
  preset('moss', 'Musgo', 'linear-gradient(135deg, #5b7f24 0%, #164b35 100%)', { base: '#39652d' }),
  preset('ember', 'Brasa', 'linear-gradient(135deg, #c9372c 0%, #5d1f1a 100%)', { base: '#932b23' }),
  preset('abyss', 'Abismo', 'linear-gradient(160deg, #09326c 0%, #101214 100%)', { base: '#0d2240' }),
];

/* --------------------------------------------------------------------- mesh */

/** Blurred blobs of color (`[x, y, color, reach]`) over a base color. */
function mesh(key: string, name: string, base: string, blobs: [number, number, string, number][]): BoardBackground {
  const layers = blobs.map(([x, y, color, reach]) => `radial-gradient(at ${x}% ${y}%, ${color} 0, transparent ${reach}%)`);
  return preset(key, name, `${layers.join(', ')}, ${base}`, { base });
}

const MESHES: BoardBackground[] = [
  mesh('nebula', 'Nebulosa', '#1b1740', [[15, 20, '#6e5dc6', 55], [85, 15, '#ae4787', 50], [70, 95, '#0c66e4', 55]]),
  mesh('boreal', 'Boreal', '#0b2a3a', [[18, 85, '#4bce97', 50], [85, 15, '#227d9b', 55], [55, 45, '#6e5dc6', 45]]),
  mesh('coral', 'Coral', '#7a2740', [[10, 10, '#f87168', 55], [90, 30, '#fea362', 50], [50, 105, '#ae4787', 60]]),
  mesh('lagoon', 'Laguna', '#0f4c5c', [[0, 100, '#1f845a', 55], [100, 0, '#6cc3e0', 50], [60, 60, '#0c66e4', 50]]),
  mesh('twilight', 'Crepúsculo', '#4f4396', [[50, 115, '#fea362', 55], [0, 0, '#352c63', 60], [100, 20, '#ae4787', 55]]),
  mesh('cotton', 'Algodón', '#c6edfb', [[15, 15, '#fdd0ec', 55], [85, 25, '#cce0ff', 55], [50, 95, '#dfd8fd', 60]]),
];

/* ----------------------------------------------------------------- patterns */

export type PatternKey = 'dots' | 'grid' | 'stripes' | 'blueprint' | 'waves' | 'crosses';

export const PATTERNS: { key: PatternKey; name: string }[] = [
  { key: 'dots', name: 'Puntos' },
  { key: 'grid', name: 'Cuadrícula' },
  { key: 'stripes', name: 'Diagonales' },
  { key: 'blueprint', name: 'Plano' },
  { key: 'waves', name: 'Olas' },
  { key: 'crosses', name: 'Cruces' },
];

/** Colors offered for the patterns; any other one can be picked with the color input. */
export const PATTERN_COLORS: { hex: string; name: string }[] = [
  ...HUES.map((h) => ({ hex: h.bold.toLowerCase(), name: h.name })),
  { hex: '#dcdfe4', name: 'Claro' },
];

export const DEFAULT_PATTERN: PatternKey = 'dots';
export const DEFAULT_PATTERN_COLOR = '#0c66e4';

const PATTERN_PREFIX = 'pattern:';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function patternKey(pattern: PatternKey, hex: string): string {
  return `${PATTERN_PREFIX}${pattern}:${hex.toLowerCase()}`;
}

/** Pattern and color of a "pattern:<pattern>:#rrggbb" background, or null if it isn't one. */
export function parsePattern(key: string): { pattern: PatternKey; color: string } | null {
  if (!key.startsWith(PATTERN_PREFIX)) return null;
  const [name, hex = ''] = key.slice(PATTERN_PREFIX.length).split(':');
  return {
    pattern: PATTERNS.find((p) => p.key === name)?.key ?? DEFAULT_PATTERN,
    color: HEX_COLOR.test(hex) ? hex.toLowerCase() : DEFAULT_PATTERN_COLOR,
  };
}

/** A faint pattern over `hex`: white ink on dark colors, dark ink on light ones. */
export function patternCss(pattern: PatternKey, hex: string): string {
  const onLight = contrastText(hex) === DARK_TEXT;
  const inkHex = onLight ? DARK_TEXT : '#ffffff';
  const ink = (alpha: number) => (onLight ? `rgba(23, 43, 77, ${alpha})` : `rgba(255, 255, 255, ${alpha})`);
  const lines = (alpha: number, size: number) =>
    `linear-gradient(${ink(alpha)} 1px, transparent 1px) 0 0 / ${size}px ${size}px, ` +
    `linear-gradient(90deg, ${ink(alpha)} 1px, transparent 1px) 0 0 / ${size}px ${size}px`;
  const tile = (w: number, h: number, d: string, opacity: number) =>
    `${svgUrl(
      `width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'`,
      `<path d='${d}' fill='none' stroke='${inkHex}' stroke-opacity='${opacity}' stroke-width='1.5' stroke-linecap='round'/>`,
    )} 0 0 / ${w}px ${h}px`;
  const layers: Record<PatternKey, string> = {
    dots: `radial-gradient(${ink(0.24)} 1.5px, transparent 2px) 0 0 / 20px 20px`,
    grid: lines(0.11, 26),
    stripes: `repeating-linear-gradient(135deg, ${ink(0.075)} 0 14px, transparent 14px 28px)`,
    blueprint: `${lines(0.2, 80)}, ${lines(0.07, 16)}`,
    waves: tile(80, 24, 'M0 12 Q20 0 40 12 T80 12', 0.2),
    crosses: tile(32, 32, 'M16 12v8M12 16h8', 0.26),
  };
  return `${layers[pattern]}, linear-gradient(135deg, ${hex}, ${mixHex(hex, '#000000', onLight ? 0.1 : 0.45)})`;
}

function patternBackground(key: string, pattern: PatternKey, color: string): BoardBackground {
  return {
    key,
    name: PATTERNS.find((p) => p.key === pattern)?.name ?? 'Trama',
    css: patternCss(pattern, color),
    base: color,
    scrim: `rgba(0, 0, 0, ${scrimAlphaFor(color)})`,
  };
}

/* ------------------------------------------------------------------- scenes */

const W = 1200;
const H = 300;
const n = (v: number) => v.toFixed(0);
const shape = (d: string, fill: string) => `<path d='${d}' fill='${fill}'/>`;

/** Jagged ridge between `base` and `base - amp`. Starts and ends at `base`, so it tiles sideways. */
function ridge(seed: number, base: number, amp: number, step: number): string {
  const r = seeded(seed);
  let d = `M0 ${H}V${base}`;
  for (let x = step * (0.5 + r() * 0.5); x < W; x += step * (0.6 + r() * 0.8)) d += `L${n(x)} ${n(base - r() * amp)}`;
  return `${d}L${W} ${base}V${H}Z`;
}

/** Rolling hills, periodic every W so they tile sideways. */
function hills(seed: number, base: number, amp: number, count: number): string {
  const r = seeded(seed);
  const step = W / count;
  const heights = Array.from({ length: count }, () => base - r() * amp);
  const at = (i: number) => heights[((i % count) + count) % count];
  let d = `M${-step} ${H}V${n(at(-1))}`;
  for (let i = 0; i <= count + 1; i++) d += `Q${n(i * step)} ${n(at(i))} ${n((i + 0.5) * step)} ${n((at(i) + at(i + 1)) / 2)}`;
  return `${d}V${H}Z`;
}

function pines(seed: number, base: number, min: number, max: number): string {
  const r = seeded(seed);
  let d = `M0 ${H}V${base}`;
  for (let x = 0; x < W; ) {
    const w = Math.min(30 + r() * 30, W - x);
    d += `L${n(x + w / 2)} ${n(base - (min + r() * (max - min)))}L${n(x + w)} ${base}`;
    x += w;
  }
  return `${d}V${H}Z`;
}

/** Skyline of blocks; `lights` adds a single path with the lit windows. */
function skyline(seed: number, base: number, min: number, max: number, fill: string, lights: boolean): string {
  const r = seeded(seed);
  let blocks = `M0 ${H}`;
  let windows = '';
  for (let x = 0; x < W; ) {
    const w = 28 + r() * 46;
    const top = base - (min + r() * (max - min));
    blocks += `V${n(top)}H${n(Math.min(x + w, W))}`;
    if (lights) {
      for (let wy = top + 10; wy < H - 10; wy += 16) {
        for (let wx = x + 7; wx < x + w - 9; wx += 12) if (r() < 0.24) windows += `M${n(wx)} ${n(wy)}h5v6h-5z`;
      }
    }
    x += w;
  }
  return shape(`${blocks}V${H}Z`, fill) + (windows ? `<path d='${windows}' fill='#f5cd47' opacity='.7'/>` : '');
}

/** Round dots in three sizes; `moon` adds a crescent. */
function starrySky(seed: number, count: number, moon = false): string {
  const r = seeded(seed);
  const sizes = [1.4, 2.2, 3];
  const paths = ['', '', ''];
  for (let i = 0; i < count; i++) paths[Math.floor(r() * r() * 3)] += `M${n(r() * 1200)} ${n(r() * 520)}h0`;
  const dots = paths
    .map((d, i) => (d ? `<path d='${d}' stroke='#fff' stroke-width='${sizes[i]}' stroke-linecap='round' opacity='${0.55 + i * 0.2}'/>` : ''))
    .join('');
  const crescent = moon
    ? "<mask id='m'><rect width='1200' height='700' fill='#fff'/><circle cx='705' cy='119' r='30'/></mask><circle cx='720' cy='130' r='34' fill='#fdf6d8' mask='url(#m)'/>"
    : '';
  return `${svgUrl("viewBox='0 0 1200 700' preserveAspectRatio='xMidYMin slice'", dots + crescent)} center / cover no-repeat`;
}

/** The silhouettes, along the bottom of the board (where there are no lists) and as wide as needed. */
function ground(body: string): string {
  return `${svgUrl(`width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'`, body)} center bottom / auto 48% repeat-x`;
}

function hillsGround(far: string, mid: string, near: string): string {
  return ground(shape(hills(7, 150, 90, 6), far) + shape(hills(21, 215, 70, 8), mid) + shape(hills(33, 265, 45, 10), near));
}

const glow = (x: number, y: number, core: string, halo: string, reach: number) =>
  `radial-gradient(circle at ${x}% ${y}%, ${core} 0, ${halo} ${Math.round(reach * 0.3)}%, transparent ${reach}%)`;

/**
 * A drawn scene: `layers` over a top-to-bottom sky. The white text sits on the upper part of the
 * board, so the scrim is tuned for the sky there rather than for the brighter horizon.
 */
function scene(key: string, name: string, sky: string[], layers: string[]): BoardBackground {
  const upper = sky.length > 2 ? mixHex(sky[0], sky[1], 0.9) : mixHex(sky[0], sky[1], 0.45);
  const css = `${layers.join(', ')}, linear-gradient(180deg, ${sky.join(', ')})`;
  return preset(key, name, css, { base: sky[0], light: lightest([sky[0], upper]) });
}

const SCENES: BoardBackground[] = [
  scene('mountains', 'Montañas', ['#352c63', '#ae4787', '#fea362'], [
    ground(shape(ridge(3, 150, 120, 110), '#6e5dc6') + shape(ridge(11, 210, 100, 90), '#4f4396') + shape(ridge(29, 262, 70, 70), '#2a2350')),
    glow(70, 56, 'rgba(255, 236, 170, 0.95)', 'rgba(255, 200, 120, 0.45)', 24),
  ]),
  scene('dunes', 'Dunas', ['#e0703c', '#f5cd47'], [
    hillsGround('#e0703c', '#c25100', '#8a3a00'),
    glow(24, 30, 'rgba(255, 250, 220, 0.9)', 'rgba(255, 240, 180, 0.35)', 20),
  ]),
  scene('sea', 'Mar', ['#579dff', '#c6edfb'], [
    ground(shape(hills(5, 170, 30, 13), '#227d9b') + shape(hills(17, 215, 30, 11), '#0c66e4') + shape(hills(41, 262, 28, 12), '#09326c')),
  ]),
  scene('pines', 'Pinar', ['#17684a', '#94c748'], [
    ground(shape(pines(9, 190, 45, 110), '#1f845a') + shape(pines(23, 250, 45, 120), '#0f4c35') + shape(pines(57, 300, 40, 100), '#0a3324')),
  ]),
  scene('city', 'Ciudad', ['#1b1740', '#6e5dc6'], [
    ground(skyline(13, 190, 30, 150, '#3a3170', false) + skyline(31, 250, 40, 170, '#1a1633', true)),
    starrySky(4, 70),
  ]),
  scene('stars', 'Estrellas', ['#06132b', '#0c4aa6'], [hillsGround('#0e2a57', '#0a1f42', '#06132b'), starrySky(8, 150, true)]),
];

/* ------------------------------------------------------- sky by time of day */

export type SkyPeriod = 'dawn' | 'day' | 'dusk' | 'night';

/** Key of the background that follows the device's clock. */
export const SKY_KEY = 'sky-time';
const SKY_NAME = 'Cielo';

/** Dawn 6–9 h, day 9–18 h, dusk 18–21 h, night the rest. */
export function skyPeriod(date: Date): SkyPeriod {
  const hour = date.getHours();
  if (hour >= 6 && hour < 9) return 'dawn';
  if (hour >= 9 && hour < 18) return 'day';
  if (hour >= 18 && hour < 21) return 'dusk';
  return 'night';
}

const SKIES: Record<SkyPeriod, BoardBackground> = {
  dawn: scene(SKY_KEY, SKY_NAME, ['#6e5dc6', '#e774bb', '#fea362'], [
    hillsGround('#8a5aa8', '#5d3f86', '#3a2a5c'),
    glow(30, 60, 'rgba(255, 240, 200, 0.95)', 'rgba(255, 210, 150, 0.4)', 22),
  ]),
  day: scene(SKY_KEY, SKY_NAME, ['#0c66e4', '#6cc3e0'], [
    hillsGround('#2f9a6b', '#1f845a', '#17684a'),
    glow(76, 38, 'rgba(255, 255, 240, 0.95)', 'rgba(255, 255, 220, 0.3)', 18),
  ]),
  dusk: scene(SKY_KEY, SKY_NAME, ['#352c63', '#c9372c', '#f5cd47'], [
    hillsGround('#7a2f4f', '#4f2247', '#2a1633'),
    glow(70, 62, 'rgba(255, 220, 150, 0.95)', 'rgba(255, 160, 90, 0.45)', 24),
  ]),
  night: scene(SKY_KEY, SKY_NAME, ['#05102a', '#09326c'], [hillsGround('#0e2a57', '#0a1f42', '#06132b'), starrySky(15, 150, true)]),
};

/** The four looks of the "Cielo" background, for previews and tests. */
export const SKY_PERIODS: SkyPeriod[] = ['dawn', 'day', 'dusk', 'night'];

export function skyBackground(period: SkyPeriod): BoardBackground {
  return SKIES[period];
}

/* -------------------------------------------------------------------- types */

const BALL = svgUrl(
  "viewBox='0 0 100 100'",
  "<g fill='none' stroke='#fff' stroke-width='5' opacity='.16'><circle cx='50' cy='50' r='46'/><path d='M4 50H35M65 50H96'/><circle cx='50' cy='50' r='15'/></g>" +
    "<circle cx='50' cy='50' r='6' fill='#fff' opacity='.16'/>",
);

const TYPE_COLORS: [string, string, string][] = [
  ['grass', 'Planta', '#63bc5a'],
  ['fire', 'Fuego', '#ff9d55'],
  ['water', 'Agua', '#5090d6'],
  ['electric', 'Eléctrico', '#f4d23c'],
  ['ice', 'Hielo', '#73cec0'],
  ['psychic', 'Psíquico', '#fa7179'],
  ['fairy', 'Hada', '#ec8fe6'],
  ['dragon', 'Dragón', '#0b6dc3'],
  ['ghost', 'Fantasma', '#5269ad'],
  ['dark', 'Siniestro', '#5a5465'],
  ['poison', 'Veneno', '#aa6bc8'],
  ['fighting', 'Lucha', '#ce416b'],
  ['ground', 'Tierra', '#d97845'],
  ['rock', 'Roca', '#c5b78c'],
  ['bug', 'Bicho', '#91c12f'],
  ['flying', 'Volador', '#8fa9de'],
  ['steel', 'Acero', '#5a8ea2'],
  ['normal', 'Normal', '#919aa2'],
];

const TYPES: BoardBackground[] = TYPE_COLORS.map(([key, name, color]) =>
  preset(
    `type-${key}`,
    `Tipo ${name}`,
    `${BALL} right -5% bottom -42% / auto 115% no-repeat, linear-gradient(135deg, ${color} 0%, ${mixHex(color, '#000000', 0.5)} 100%)`,
    { base: mixHex(color, '#000000', 0.2) },
  ),
);

/* ------------------------------------------------------------------- solids */

const SOLIDS: BoardBackground[] = [
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

/* ------------------------------------------------------------------- lookup */

export const BACKGROUND_GROUPS: BackgroundGroup[] = [
  { key: 'gradient', name: 'Degradados', items: GRADIENTS },
  { key: 'mesh', name: 'Malla', items: MESHES },
  { key: 'pattern', name: 'Tramas', items: [] },
  // "Cielo" is listed with its daytime look; getBoardBackground() gives the one for the current hour.
  { key: 'scene', name: 'Paisajes', items: [...SCENES, SKIES.day] },
  { key: 'type', name: 'Tipos', items: TYPES },
  { key: 'solid', name: 'Colores', items: SOLIDS },
];

/** Every fixed preset (all the groups but the patterns). */
export const BOARD_BACKGROUNDS: BoardBackground[] = BACKGROUND_GROUPS.flatMap((g) => g.items);

const BG_BY_KEY = new Map(BOARD_BACKGROUNDS.map((b) => [b.key, b]));
const GROUP_BY_KEY = new Map(BACKGROUND_GROUPS.flatMap((g) => g.items.map((b) => [b.key, g.key] as const)));

/** Group a background belongs to: the tab the picker opens on. Images have none (null). */
export function backgroundGroupOf(key: string): BackgroundGroupKey | null {
  if (key.startsWith('image:')) return null;
  if (key.startsWith('custom:')) return 'solid';
  if (key.startsWith(PATTERN_PREFIX)) return 'pattern';
  return GROUP_BY_KEY.get(key) ?? 'gradient';
}

export function getBoardBackground(key: string, now: Date = new Date()): BoardBackground {
  if (key === SKY_KEY) return SKIES[skyPeriod(now)];
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
  const pattern = parsePattern(key);
  if (pattern) return patternBackground(key, pattern.pattern, pattern.color);
  return BG_BY_KEY.get(key) ?? GRADIENTS[0];
}
