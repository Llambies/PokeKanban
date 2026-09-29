// Builds shared/pokemon-data.js: every Pokémon and its alternate forms (regional, Mega, Gigantamax,
// cosmetic…) with a Spanish name (and the English one if different), which PokeAPI image it uses and
// the box the Pokémon covers in it, so small icons can be cropped and shown big. Data comes from the
// PokeAPI repositories on GitHub (CSV data and sprites). Run it when new Pokémon are added:
//
//   node scripts/pokemon-data.mjs

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const SPANISH = '7';
const ENGLISH = '9';

/* ----------------------------------------------------------------- CSV */

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) rows.push([...row, field]);
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const csv = async (name) => parseCsv(await (await fetch(`${CSV}/${name}`)).text());

/* ------------------------------------------------------------------ PNG */

/** Minimal PNG decoder: returns { width, height, alpha(x, y) } for 8-bit (or palette) images. */
function decodePng(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 8;
  let type = 6;
  let interlace = 0;
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
    } else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  if (interlace || depth === 16) return null;
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
  return { width, height, alpha };
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
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

/* ---------------------------------------------------------------- names */

const REGIONS = { Alolan: 'Alola', Galarian: 'Galar', Hisuian: 'Hisui', Paldean: 'Paldea' };
const REGION_IDS = { alola: 'Alola', galar: 'Galar', hisui: 'Hisui', paldea: 'Paldea' };
const REGION_ES = /^Forma de (Alola|Galar|Hisui|Paldea)$/;

// Spanish for the form names PokeAPI only has in English (longest phrases first).
const TERMS = [
  ['Vanilla Cream', 'Crema de Vainilla'], ['Ruby Cream', 'Crema Rosa'], ['Matcha Cream', 'Crema de Té'],
  ['Mint Cream', 'Crema de Menta'], ['Lemon Cream', 'Crema de Limón'], ['Salted Cream', 'Crema Salada'],
  ['Ruby Swirl', 'Mezcla Rosa'], ['Caramel Swirl', 'Mezcla Caramelo'], ['Rainbow Swirl', 'Tres Sabores'],
  ['Berry Sweet', 'Dulce Fresa'], ['Love Sweet', 'Dulce Corazón'], ['Star Sweet', 'Dulce Estrella'],
  ['Clover Sweet', 'Dulce Trébol'], ['Flower Sweet', 'Dulce Flor'], ['Ribbon Sweet', 'Dulce Lazo'],
  ['Combat Breed', 'Raza Combatiente'], ['Blaze Breed', 'Raza Ardiente'], ['Aqua Breed', 'Raza Acuática'],
  ['Single Strike', 'Estilo Brusco'], ['Rapid Strike', 'Estilo Fluido'],
  ['Origin Forme', 'Forma Origen'], ['Therian Forme', 'Forma Tótem'], ['White-Striped Form', 'Forma Raya Blanca'],
  ['Antique Form', 'Forma Genuina'], ['Hero Form', 'Forma Heroica'], ['Roaming Form', 'Forma Andante'],
  ['Three-Segment Form', 'Forma Trinodular'], ['Droopy Form', 'Forma Lánguida'], ['Stretchy Form', 'Forma Estirada'],
  ['Blue Plumage', 'Plumaje Azul'], ['Yellow Plumage', 'Plumaje Amarillo'], ['White Plumage', 'Plumaje Blanco'],
  ['Rock Star', 'Roquera'], ['Pop Star', 'Superstar'], ['Belle', 'Aristócrata'], ['Libre', 'Enmascarada'],
  ['Ph. D.', 'Doctora'], ['Ph.D.', 'Doctora'], ['Cosplay', 'Coqueta'], ['Original', 'Color Vetusto'], ['starter', 'Compañero'],
  ['Amped', 'Forma Aguda'], ['Low Key', 'Forma Grave'], ['Curly', 'Forma Curvada'], ['Droopy', 'Forma Lánguida'],
  ['Stretchy', 'Forma Estirada'], ['Female', 'Hembra'], ['Male', 'Macho'],
];

function tr(text) {
  let out = text;
  for (const [en, es] of TERMS) out = out.split(en).join(es);
  // "Crema de Vainilla Dulce Fresa" -> "Crema de Vainilla, Dulce Fresa"
  return out.replace(/(\S) Dulce /g, '$1, Dulce ').trim();
}

/** Spanish display name of a form ("Rattata de Alola", "Mega-Clefable", "Charizard Gigamax"…). */
function formName(species, es, en, identifier) {
  const base = species.es ?? species.en;
  const speciesEn = species.en ?? base;
  const lower = (s) => s.toLowerCase();
  const totem = identifier.includes('totem') ? ' dominante' : '';
  const regionId = Object.keys(REGION_IDS).find((r) => identifier.split('-').includes(r));
  const withRegion = (name) =>
    regionId && !name.includes(REGION_IDS[regionId]) ? name.replace(base, `${base} de ${REGION_IDS[regionId]}`) : name;
  const enForm = en?.form ?? '';
  const enPokemon = en?.pokemon ?? '';

  if (es) {
    const region = REGION_ES.exec(es);
    if (region) return `${base} de ${region[1]}${totem}`;
    if (lower(es).includes(lower(base))) return withRegion(es) + totem;
    return withRegion(`${base} (${es})`) + totem;
  }
  const regional = /^(Alolan|Galarian|Hisuian|Paldean) Form(?: \((.+)\))?$/.exec(enForm);
  if (regional) return `${base} de ${REGIONS[regional[1]]}${regional[2] ? ` (${tr(regional[2])})` : ''}${totem}`;
  if (/^Mega /.test(enPokemon)) {
    const rest = enPokemon.replace(/^Mega /, '').replace(speciesEn, '').replace(/\s+/g, ' ').trim();
    const suffix = /^[XYZ]$/.test(rest) ? ` ${rest}` : rest ? ` (${tr(rest)})` : '';
    return `Mega-${base}${suffix}`;
  }
  if (/^Gigantamax/.test(enForm)) {
    const rest = enPokemon.replace(/^Gigantamax /, '').replace(speciesEn, '').trim();
    return `${base} Gigamax${rest ? ` (${tr(rest)})` : ''}`;
  }
  if (totem) {
    const region = Object.entries(REGIONS).find(([adj]) => enPokemon.includes(adj));
    return `${base}${region ? ` de ${region[1]}` : ''} dominante`;
  }
  if (enForm && enForm.includes(speciesEn)) {
    // "Cosplay Pikachu", "Pikachu Rock Star" -> "Pikachu Coqueta", "Pikachu Roquera"
    return withRegion(`${base} ${tr(enForm.replace(speciesEn, ''))}`);
  }
  if (enForm) return withRegion(`${base} (${tr(enForm)})`);
  return withRegion(`${base} (${tr(identifier.replace(/^[^-]+-/, ''))})`);
}

/* ----------------------------------------------------------------- data */

const [speciesNames, pokemon, forms, formNames] = await Promise.all([
  csv('pokemon_species_names.csv'),
  csv('pokemon.csv'),
  csv('pokemon_forms.csv'),
  csv('pokemon_form_names.csv'),
]);

const species = new Map();
for (const r of speciesNames) {
  if (r.local_language_id !== SPANISH && r.local_language_id !== ENGLISH) continue;
  const entry = species.get(Number(r.pokemon_species_id)) ?? {};
  entry[r.local_language_id === SPANISH ? 'es' : 'en'] = r.name;
  species.set(Number(r.pokemon_species_id), entry);
}
const pokemonById = new Map(pokemon.map((p) => [p.id, p]));
const namesByForm = new Map();
for (const r of formNames) {
  const entry = namesByForm.get(r.pokemon_form_id) ?? {};
  if (r.local_language_id === SPANISH) entry.es = r.form_name || null;
  if (r.local_language_id === ENGLISH) entry.en = { form: r.form_name, pokemon: r.pokemon_name };
  namesByForm.set(r.pokemon_form_id, entry);
}

// Candidates: [key, species, name, English name, sort order]
const candidates = [];
for (const [id, names] of species) candidates.push({ key: String(id), species: id, name: names.es ?? names.en, en: names.en, order: [id, 0, 0] });

for (const form of forms) {
  const owner = pokemonById.get(form.pokemon_id);
  if (!owner) continue;
  const speciesId = Number(owner.species_id);
  const base = species.get(speciesId);
  if (!base) continue;
  let key;
  if (owner.is_default === '0' && form.is_default === '1') key = owner.id; // regional, Mega, Gigantamax…
  else if (form.is_default === '0' && form.form_identifier) key = `${speciesId}-${form.form_identifier}`; // cosmetic
  else continue;
  const names = namesByForm.get(form.id) ?? {};
  const name = formName(base, names.es, names.en, form.identifier);
  const en = names.en?.pokemon || null;
  candidates.push({ key, species: speciesId, name, en, order: [speciesId, 1, Number(form.order) || Number(form.id)] });
}

async function download(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt === 2) throw new Error(`${url}: ${err.message}`);
    }
  }
  return null;
}

const results = [];
const queue = [...candidates];
async function worker() {
  while (queue.length) {
    const c = queue.shift();
    // The menu icon when there is one, otherwise the regular sprite.
    let front = 0;
    let png = await download(`${SPRITES}/versions/generation-viii/icons/${c.key}.png`);
    if (!png) {
      front = 1;
      png = await download(`${SPRITES}/${c.key}.png`);
    }
    if (!png) continue;
    const decoded = decodePng(png);
    const box = decoded && bounds(decoded);
    if (!box) continue;
    results.push({ ...c, front, box, hash: crypto.createHash('sha1').update(png).digest('hex') });
  }
}
await Promise.all(Array.from({ length: 16 }, worker));

const cmp = (a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2];
results.sort(cmp);
// Forms whose image (or name) is identical to one already listed are left out.
const seen = new Set();
const rows = [];
for (const r of results) {
  if (seen.has(r.hash) || seen.has(r.name)) continue;
  seen.add(r.hash);
  seen.add(r.name);
  const row = [r.key, r.species, r.name, ...r.box, r.front];
  if (r.en && r.en !== r.name) row.push(r.en);
  rows.push(row);
}

fs.writeFileSync(
  path.join(root, 'shared/pokemon-data.js'),
  `// Generated by scripts/pokemon-data.mjs from PokeAPI data (https://pokeapi.co). Do not edit.
// [sprite key, species number, Spanish name, x0, y0, x1, y1 (box the Pokémon covers),
//  1 = regular 96×96 sprite (0 = 68×56 menu icon), English name if different]
export const POKEMON = [
${rows.map((r) => `  ${JSON.stringify(r)},`).join('\n')}
];
`,
);
const formsCount = rows.filter((r) => r[0] !== String(r[1])).length;
console.log(`${rows.length - formsCount} Pokémon y ${formsCount} formas en shared/pokemon-data.js`);
