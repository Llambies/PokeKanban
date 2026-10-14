import { useEffect, useSyncExternalStore } from 'react';
import { GenIcon, type IconTree, type IconType } from 'react-icons';
import { normalize } from './icons';

/** Icon values from react-icons look like "ri:tb:TbFlame" (family, then the exported name). */
export const REACT_ICON_PREFIX = 'ri:';

export interface IconFamily {
  id: string;
  name: string;
  /** Prefix of every icon name in the family ("Tb" in "TbFlame"). */
  prefix: string;
  license: string;
}

// The package is ~44 MB of JS, so it's never bundled whole: the plugin in vite.config.ts splits it
// in chunks of 128 icons, downloaded as the picker shows them or a card uses one of them.
// Line icons, like the app's, go first.
const RAW: [string, string, string, string][] = [
  ['lu', 'Lucide', 'Lu', 'ISC'],
  ['tb', 'Tabler Icons', 'Tb', 'MIT'],
  ['fi', 'Feather', 'Fi', 'MIT'],
  ['hi2', 'Heroicons 2', 'Hi', 'MIT'],
  ['pi', 'Phosphor Icons', 'Pi', 'MIT'],
  ['ri', 'Remix Icon', 'Ri', 'Apache 2.0'],
  ['md', 'Material Design', 'Md', 'Apache 2.0'],
  ['fa6', 'Font Awesome 6', 'Fa', 'CC BY 4.0'],
  ['bs', 'Bootstrap Icons', 'Bs', 'MIT'],
  ['io5', 'Ionicons 5', 'Io', 'MIT'],
  ['ai', 'Ant Design Icons', 'Ai', 'MIT'],
  ['bi', 'BoxIcons', 'Bi', 'MIT'],
  ['rx', 'Radix Icons', 'Rx', 'MIT'],
  ['go', 'GitHub Octicons', 'Go', 'MIT'],
  ['vsc', 'VS Code Icons', 'Vsc', 'CC BY 4.0'],
  ['ci', 'Circum Icons', 'Ci', 'MPL 2.0'],
  ['cg', 'css.gg', 'Cg', 'MIT'],
  ['gr', 'Grommet Icons', 'Gr', 'Apache 2.0'],
  ['lia', 'Line Awesome', 'Lia', 'MIT'],
  ['sl', 'Simple Line Icons', 'Sl', 'MIT'],
  ['tfi', 'Themify Icons', 'Tfi', 'MIT'],
  ['ti', 'Typicons', 'Ti', 'CC BY-SA 3.0'],
  ['im', 'IcoMoon Free', 'Im', 'CC BY 4.0'],
  ['hi', 'Heroicons', 'Hi', 'MIT'],
  ['io', 'Ionicons 4', 'Io', 'MIT'],
  ['fa', 'Font Awesome 5', 'Fa', 'CC BY 4.0'],
  ['gi', 'Game Icons', 'Gi', 'CC BY 3.0'],
  ['wi', 'Weather Icons', 'Wi', 'SIL OFL 1.1'],
  ['fc', 'Flat Color Icons', 'Fc', 'MIT'],
  ['di', 'Devicons', 'Di', 'MIT'],
  ['si', 'Simple Icons (marcas)', 'Si', 'CC0 1.0'],
];

export const ICON_FAMILIES: IconFamily[] = RAW.map(([id, name, prefix, license]) => ({ id, name, prefix, license }));

const FAMILY_BY_ID = new Map(ICON_FAMILIES.map((f) => [f.id, f]));

export function getIconFamily(id: string): IconFamily | undefined {
  return FAMILY_BY_ID.get(id);
}

export function reactIconValue(family: string, name: string): string {
  return `${REACT_ICON_PREFIX}${family}:${name}`;
}

/** Family and name of a react-icons value, or null if it isn't one (or its family is unknown). */
export function parseReactIcon(value: string | null | undefined): { family: string; name: string } | null {
  if (!value?.startsWith(REACT_ICON_PREFIX)) return null;
  const match = /^ri:([a-z0-9]+):(\w+)$/.exec(value);
  if (!match || !FAMILY_BY_ID.has(match[1])) return null;
  return { family: match[1], name: match[2] };
}

/** Readable name of an icon: "TbFlameOff" -> "Flame Off". */
export function iconLabel(family: IconFamily, name: string): string {
  return name
    .slice(name.startsWith(family.prefix) ? family.prefix.length : 0)
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Z])/g, '$1 $2');
}

// ------------------------------------------------------------------ loading icons

/** Index of the chunk holding `name`, given the (sorted) first name of each chunk. */
export function chunkIndex(firstNames: string[], name: string): number {
  let lo = 0;
  let hi = firstNames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (firstNames[mid] <= name) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

type ChunkTable = Record<string, { firsts: string[]; loads: (() => Promise<{ default: Record<string, IconTree> }>)[] }>;

let table: Promise<ChunkTable> | null = null;
const trees = new Map<string, IconTree>();
const components = new Map<string, IconType>();
const chunkLoads = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let version = 0;

function loadTable(): Promise<ChunkTable> {
  table ??= import('virtual:react-icons-chunks').then(
    (m) =>
      Object.fromEntries(
        Object.entries(m.default).map(([family, chunks]) => [family, { firsts: chunks.map((c) => c[0]), loads: chunks.map((c) => c[1]) }]),
      ),
    (error) => {
      table = null; // Offline: try again next time.
      throw error;
    },
  );
  return table;
}

/** Downloads (once) the chunk holding an icon. */
function loadChunk(t: ChunkTable, family: string, name: string): Promise<void> {
  const fam = t[family];
  if (!fam) return Promise.resolve();
  const i = chunkIndex(fam.firsts, name);
  const key = `${family}/${i}`;
  let load = chunkLoads.get(key);
  if (!load) {
    load = fam.loads[i]().then(
      (chunk) => {
        for (const [icon, tree] of Object.entries(chunk.default)) trees.set(`${family}:${icon}`, tree);
        version++;
        listeners.forEach((l) => l());
      },
      () => {
        chunkLoads.delete(key); // Offline: try again next time.
      },
    );
    chunkLoads.set(key, load);
  }
  return load;
}

/** Starts downloading the chunks of these icons (once each); `useIconGetter` re-renders as they arrive. */
export function requestIcons(icons: { family: string; name: string }[]): void {
  if (icons.length === 0) return;
  loadTable()
    .then((t) => icons.forEach(({ family, name }) => void loadChunk(t, family, name)))
    .catch(() => undefined);
}

/** The SVG tree of a react-icons value, downloading its chunk if needed (null if unknown or offline). */
export async function reactIconTree(value: string): Promise<IconTree | null> {
  const parsed = parseReactIcon(value);
  if (!parsed) return null;
  const key = `${parsed.family}:${parsed.name}`;
  if (!trees.has(key)) await loadChunk(await loadTable(), parsed.family, parsed.name).catch(() => undefined);
  return trees.get(key) ?? null;
}

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Standalone SVG of an icon tree, drawn like react-icons draws it (`currentColor` stroke and fill,
 * no stroke unless the icon sets one) in the given color. Used to make images for the Android widget.
 */
export function iconTreeSvg(tree: IconTree, size: number, color: string): string {
  const attrs = (attr: Record<string, string>) =>
    Object.entries(attr)
      .map(([k, v]) => ` ${k === 'viewBox' ? k : k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${escapeXml(String(v))}"`)
      .join('');
  const node = (n: IconTree): string => `<${n.tag}${attrs(n.attr)}>${(n.child ?? []).map(node).join('')}</${n.tag}>`;
  const root = { stroke: 'currentColor', fill: 'currentColor', strokeWidth: '0', ...tree.attr, width: String(size), height: String(size) };
  return `<svg xmlns="http://www.w3.org/2000/svg" color="${escapeXml(color)}"${attrs(root)}>${(tree.child ?? []).map(node).join('')}</svg>`;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getIcon(family: string, name: string): IconType | undefined {
  const key = `${family}:${name}`;
  let Icon = components.get(key);
  if (!Icon) {
    const tree = trees.get(key);
    if (!tree) return undefined;
    Icon = GenIcon(tree) as IconType;
    components.set(key, Icon);
  }
  return Icon;
}

/** Looks up icons already downloaded; the component re-renders as more arrive. */
export function useIconGetter(): (family: string, name: string) => IconType | undefined {
  useSyncExternalStore(subscribe, () => version);
  return getIcon;
}

/** Downloads (if needed) and returns the component of a react-icons value. */
export function useReactIcon(value: string | null | undefined): IconType | undefined {
  const parsed = parseReactIcon(value);
  const get = useIconGetter();
  const family = parsed?.family;
  const name = parsed?.name;
  useEffect(() => {
    if (family && name) requestIcons([{ family, name }]);
  }, [family, name]);
  return family && name ? get(family, name) : undefined;
}

// ------------------------------------------------------------------ name index and search

/** Every icon name by family: `{ tb: 'TbFlame,TbFlameOff,…' }` (see the plugin in vite.config.ts). */
export type IconIndex = Record<string, string>;

export function loadIconIndex(): Promise<IconIndex> {
  return import('virtual:react-icons-index').then((m) => m.default);
}

interface FamilyNames {
  names: string[];
  /** Lowercase names without the prefix, for searching. */
  keys: string[];
}

const namesCache = new WeakMap<IconIndex, Map<string, FamilyNames>>();

function familyNames(index: IconIndex, family: IconFamily): FamilyNames {
  let byFamily = namesCache.get(index);
  if (!byFamily) namesCache.set(index, (byFamily = new Map()));
  let entry = byFamily.get(family.id);
  if (!entry) {
    const names = (index[family.id] ?? '').split(',').filter(Boolean).sort();
    entry = { names, keys: names.map((n) => n.slice(family.prefix.length).toLowerCase()) };
    byFamily.set(family.id, entry);
  }
  return entry;
}

export interface IconSection {
  family: IconFamily;
  names: string[];
}

/**
 * Icons matching the query, grouped by family in display order. `extraTerms` are other English
 * words to look for (the names of the featured icons whose Spanish keywords match the query).
 */
export function searchIconIndex(index: IconIndex, query: string, family: string | null = null, extraTerms: string[] = []): IconSection[] {
  const q = normalize(query).replace(/[^a-z0-9]/g, '');
  const terms = q ? [q, ...extraTerms.map((t) => t.toLowerCase()).filter((t) => t && !t.includes(q))] : [];
  const sections: IconSection[] = [];
  for (const fam of ICON_FAMILIES) {
    if (family && fam.id !== family) continue;
    const { names, keys } = familyNames(index, fam);
    const matches = terms.length ? names.filter((_, i) => terms.some((t) => keys[i].includes(t))) : names;
    if (matches.length) sections.push({ family: fam, names: matches });
  }
  return sections;
}

export function countIcons(sections: IconSection[]): number {
  return sections.reduce((n, s) => n + s.names.length, 0);
}
