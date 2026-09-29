// Builds src/lib/pokemon-data.ts: every Pokémon with its Spanish (and English) name and the box its
// PokeAPI icon actually covers, so small icons can be cropped and shown big. Data comes from the
// PokeAPI repositories on GitHub (names CSV and sprites). Run it when new Pokémon are added:
//
//   node scripts/pokemon-data.mjs

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { pokemonSpriteUrl, POKEMON_ICON_MAX } from '../shared/pokemon.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMES_CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv';
const SPANISH = 7;
const ENGLISH = 9;

/** Minimal PNG decoder: returns { width, height, alpha(x, y) } for 8-bit (or palette) images. */
function decodePng(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 8;
  let type = 6;
  let interlace = 0;
  let palette = null;
  let trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  if (interlace) return null;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const bpp = Math.max(1, (channels * depth) / 8);
  const stride = Math.ceil((width * channels * depth) / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? pixels[y * stride + x - bpp] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[(y - 1) * stride + x - bpp] : 0;
      let out = v;
      if (filter === 1) out = v + a;
      else if (filter === 2) out = v + b;
      else if (filter === 3) out = v + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        out = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      pixels[y * stride + x] = out & 255;
    }
  }
  const sample = (x, y, channel) => {
    if (depth === 8) return pixels[y * stride + x * channels + channel];
    const bit = (x * channels + channel) * depth;
    return (pixels[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
  };
  const alpha = (x, y) => {
    if (type === 6) return sample(x, y, 3);
    if (type === 4) return sample(x, y, 1);
    if (type === 3) {
      const index = sample(x, y, 0);
      return trns && index < trns.length ? trns[index] : 255;
    }
    return 255;
  };
  return { width, height, alpha, palette };
}

function bounds(png) {
  let x0 = png.width;
  let y0 = png.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.alpha(x, y) <= 10) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? [0, 0, png.width - 1, png.height - 1] : [x0, y0, x1, y1];
}

const csv = await (await fetch(NAMES_CSV)).text();
const names = new Map();
for (const line of csv.split('\n').slice(1)) {
  const [id, lang, name] = line.split(',');
  if (!name || (Number(lang) !== SPANISH && Number(lang) !== ENGLISH)) continue;
  const entry = names.get(Number(id)) ?? {};
  entry[Number(lang) === SPANISH ? 'es' : 'en'] = name;
  names.set(Number(id), entry);
}
const ids = [...names.keys()].sort((a, b) => a - b);

const rows = [];
const queue = [...ids];
async function worker() {
  while (queue.length) {
    const id = queue.shift();
    let box = null;
    for (let attempt = 0; attempt < 3 && !box; attempt++) {
      try {
        const res = await fetch(pokemonSpriteUrl(id));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const png = decodePng(Buffer.from(await res.arrayBuffer()));
        box = png ? bounds(png) : id <= POKEMON_ICON_MAX ? [0, 0, 67, 55] : [0, 0, 95, 95];
      } catch (err) {
        if (attempt === 2) throw new Error(`#${id}: ${err.message}`);
      }
    }
    const { es, en } = names.get(id);
    const name = es ?? en;
    rows.push([id, name, ...box, ...(en && en !== name ? [en] : [])]);
  }
}
await Promise.all(Array.from({ length: 12 }, worker));
rows.sort((a, b) => a[0] - b[0]);

const body = rows.map((r) => `  ${JSON.stringify(r)},`).join('\n');
fs.writeFileSync(
  path.join(root, 'src/lib/pokemon-data.ts'),
  `// Generated by scripts/pokemon-data.mjs from PokeAPI data (https://pokeapi.co). Do not edit.
// [number, Spanish name, x0, y0, x1, y1 (box the icon covers), English name if different]
export type PokemonRow = [number, string, number, number, number, number, string?];

export const POKEMON: PokemonRow[] = [
${body}
];
`,
);
console.log(`${rows.length} Pokémon en src/lib/pokemon-data.ts`);
