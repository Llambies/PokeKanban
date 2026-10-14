import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createApi } from './server/api.mjs';

/** Serves the JSON storage API from the dev server too, so `npm run dev` is fully functional. */
function storageApi(): Plugin {
  return {
    name: 'pokekanban-storage-api',
    configureServer(server) {
      const api = createApi({
        dataDir: process.env.POKEKANBAN_DATA_DIR ?? 'data',
        password: process.env.POKEKANBAN_PASSWORD ?? '',
      });
      server.middlewares.use((req, res, next) => {
        api(req, res)
          .then((handled) => {
            if (!handled) next();
          })
          .catch(next);
      });
    },
  };
}

/** Icons per chunk: an icon in a card only downloads its chunk, not its whole family. */
const ICON_CHUNK_SIZE = 128;

/**
 * Every react-icons icon, read from the package and split in small modules:
 * - `virtual:react-icons-index`: the names by family, `{ tb: 'TbAB,TbABOff,…' }` (only for the picker).
 * - `virtual:react-icons-chunks`: per family, the first name of each chunk and its loader.
 * - `virtual:react-icons/<family>/<n>`: the SVG trees of a chunk, `{ TbFlame: {tag, attr, child} }`.
 * Names are sorted, so a chunk holds a range of names and a name's chunk is found by binary search.
 */
export function reactIcons(): Plugin {
  const dir = path.resolve('node_modules/react-icons');
  let families: Map<string, [string, string][]> | null = null;
  const read = () => {
    if (families) return families;
    families = new Map();
    for (const family of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, family, 'index.mjs');
      if (family === 'lib' || !fs.existsSync(file)) continue;
      const source = fs.readFileSync(file, 'utf8');
      const icons = [...source.matchAll(/^export function (\w+) \(props\) \{\n {2}return GenIcon\((.*)\)\(props\);\n\};$/gm)];
      families.set(family, icons.map((m): [string, string] => [m[1], m[2]]).sort((x, y) => (x[0] < y[0] ? -1 : 1)));
    }
    return families;
  };
  const chunksOf = <T,>(list: T[]) => Array.from({ length: Math.ceil(list.length / ICON_CHUNK_SIZE) }, (_, i) => list.slice(i * ICON_CHUNK_SIZE, (i + 1) * ICON_CHUNK_SIZE));
  return {
    name: 'pokekanban-react-icons',
    resolveId: (id) => (id.startsWith('virtual:react-icons') ? '\0' + id : null),
    load(id) {
      if (!id.startsWith('\0virtual:react-icons')) return null;
      const name = id.slice(1);
      if (name === 'virtual:react-icons-index') {
        return `export default ${JSON.stringify(Object.fromEntries([...read()].map(([f, icons]) => [f, icons.map((i) => i[0]).join(',')])))};`;
      }
      if (name === 'virtual:react-icons-chunks') {
        const families = [...read()].map(([f, icons]) => {
          const chunks = chunksOf(icons).map((c, i) => `[${JSON.stringify(c[0][0])}, () => import(${JSON.stringify(`virtual:react-icons/${f}/${i}`)})]`);
          return `${JSON.stringify(f)}: [${chunks.join(',')}]`;
        });
        return `export default {${families.join(',\n')}};`;
      }
      const [, family, n] = name.split('/');
      const chunk = chunksOf(read().get(family) ?? [])[Number(n)];
      if (!chunk) return null;
      return `export default {${chunk.map(([icon, tree]) => `${JSON.stringify(icon)}:${tree}`).join(',\n')}};`;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), storageApi(), reactIcons()],
  // The react-icons name index (loaded only by the icon picker) is ~750 kB; everything else is far smaller.
  build: { chunkSizeWarningLimit: 800 },
});
