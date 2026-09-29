// Converts the Lucide icons the app offers (src/lib/icons.tsx) into Android vector drawables, so the
// home-screen widget shows the same icons as the app. Run after changing the icon list:
//
//   node scripts/android-icons.mjs
//
// Writes android/app/src/main/res/drawable/lucide_*.xml and LucideIcons.java (name -> drawable).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lucideDir = path.join(root, 'node_modules/lucide-react/dist/esm');
const drawableDir = path.join(root, 'android/app/src/main/res/drawable');
const javaFile = path.join(root, 'android/app/src/main/java/com/llambies/pokekanban/LucideIcons.java');

// Icons offered by the icon picker, plus the defaults used for each kind of calendar item.
const iconsSource = fs.readFileSync(path.join(root, 'src/lib/icons.tsx'), 'utf8');
const names = new Set([...iconsSource.matchAll(/\['(\w+)', \w+, '/g)].map((m) => m[1]));
for (const name of ['Calendar', 'CakeSlice', 'Heart', 'Flag', 'Bell', 'ClipboardList']) names.add(name);

// Export name -> module file (aliases such as BarChart3 -> chart-column.mjs).
const index = fs.readFileSync(path.join(lucideDir, 'lucide-react.mjs'), 'utf8');
const files = new Map();
for (const [, exports, file] of index.matchAll(/export \{([^}]*)\} from '\.\/icons\/([\w-]+\.mjs)'/g)) {
  for (const [, name] of exports.matchAll(/default as (\w+)/g)) files.set(name, file);
}

const n = (v) => Number(v);
const fmt = (v) => String(Math.round(v * 1000) / 1000);

/** Re-serializes SVG path data with explicit separators (Android's parser can't read packed arc flags). */
function normalizePath(d) {
  const counts = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  const out = [];
  let i = 0;
  let cmd = null;
  let param = 0;
  const number = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
  while (i < d.length) {
    const ch = d[i];
    if (/[\s,]/.test(ch)) {
      i++;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      cmd = ch;
      param = 0;
      out.push(ch);
      i++;
      continue;
    }
    if (!cmd) throw new Error(`Path sin comando: ${d}`);
    const lower = cmd.toLowerCase();
    if (lower === 'a' && (param % 7 === 3 || param % 7 === 4)) {
      out.push(d[i]); // arc flag: a single 0 or 1
      i++;
    } else {
      const m = number.exec(d.slice(i));
      if (!m) throw new Error(`No se pudo leer "${d.slice(i, i + 12)}" en ${d}`);
      out.push(m[0]);
      i += m[0].length;
    }
    param++;
    // Extra coordinates after a moveto are implicit linetos.
    if (counts[lower] && param % counts[lower] === 0 && lower === 'm') cmd = cmd === 'm' ? 'l' : 'L';
  }
  return out.join(' ');
}

function toPath(tag, a) {
  switch (tag) {
    case 'path':
      return normalizePath(a.d);
    case 'circle':
    case 'ellipse': {
      const [cx, cy] = [n(a.cx), n(a.cy)];
      const rx = n(a.rx ?? a.r);
      const ry = n(a.ry ?? a.r);
      return `M ${fmt(cx - rx)} ${fmt(cy)} a ${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(2 * rx)} 0 a ${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(-2 * rx)} 0 z`;
    }
    case 'rect': {
      const [x, y, w, h] = [n(a.x ?? 0), n(a.y ?? 0), n(a.width), n(a.height)];
      const rx = Math.min(n(a.rx ?? a.ry ?? 0), w / 2);
      const ry = Math.min(n(a.ry ?? a.rx ?? 0), h / 2);
      if (!rx) return `M ${fmt(x)} ${fmt(y)} h ${fmt(w)} v ${fmt(h)} h ${fmt(-w)} z`;
      return [
        `M ${fmt(x + rx)} ${fmt(y)} h ${fmt(w - 2 * rx)}`,
        `a ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(rx)} ${fmt(ry)} v ${fmt(h - 2 * ry)}`,
        `a ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(-rx)} ${fmt(ry)} h ${fmt(-(w - 2 * rx))}`,
        `a ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(-rx)} ${fmt(-ry)} v ${fmt(-(h - 2 * ry))}`,
        `a ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(rx)} ${fmt(-ry)} z`,
      ].join(' ');
    }
    case 'line':
      return `M ${fmt(n(a.x1))} ${fmt(n(a.y1))} L ${fmt(n(a.x2))} ${fmt(n(a.y2))}`;
    case 'polyline':
    case 'polygon': {
      const pts = a.points.trim().split(/[\s,]+/).map(Number);
      let dd = `M ${fmt(pts[0])} ${fmt(pts[1])}`;
      for (let i = 2; i < pts.length; i += 2) dd += ` L ${fmt(pts[i])} ${fmt(pts[i + 1])}`;
      return tag === 'polygon' ? `${dd} z` : dd;
    }
    default:
      throw new Error(`Elemento SVG no soportado: ${tag}`);
  }
}

const snake = (name) =>
  name
    .replace(/([a-z])([A-Z0-9])/g, '$1_$2')
    .replace(/([0-9])([A-Za-z])/g, '$1_$2')
    .toLowerCase();

const generated = [];
const preview = [];
for (const name of [...names].sort()) {
  const file = files.get(name);
  if (!file) throw new Error(`Icono de Lucide no encontrado: ${name}`);
  const { __iconData } = await import(pathToFileURL(path.join(lucideDir, 'icons', file)).href);
  const paths = __iconData.node.map(([tag, attrs]) => ({ d: toPath(tag, attrs), fill: attrs.fill && attrs.fill !== 'none' }));
  const drawable = `lucide_${snake(name)}`;
  const body = paths
    .map(
      (p) => `    <path
        android:fillColor="${p.fill ? '#FFFFFFFF' : '#00000000'}"
        android:pathData="${p.d}"
        android:strokeColor="#FFFFFFFF"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:strokeWidth="2" />`,
    )
    .join('\n');
  fs.writeFileSync(
    path.join(drawableDir, `${drawable}.xml`),
    `<?xml version="1.0" encoding="utf-8"?>
<!-- Lucide "${name}" (ISC license), generated by scripts/android-icons.mjs. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
${body}
</vector>
`,
  );
  generated.push([name, drawable]);
  preview.push({ name, paths });
}

fs.writeFileSync(
  javaFile,
  `package com.llambies.pokekanban;

import java.util.HashMap;
import java.util.Map;

/** Lucide icons of the app as drawables ("lucide:CakeSlice" -> R.drawable.lucide_cake_slice). Generated by scripts/android-icons.mjs. */
final class LucideIcons {

    private static final Map<String, Integer> ICONS = new HashMap<>();

    static {
${generated.map(([name, drawable]) => `        ICONS.put("${name}", R.drawable.${drawable});`).join('\n')}
    }

    private LucideIcons() {}

    /** Drawable for an icon value such as "lucide:Star", or 0 if it is not a Lucide icon of the app. */
    static int drawableFor(String icon) {
        if (icon == null || !icon.startsWith("lucide:")) return 0;
        Integer id = ICONS.get(icon.substring(7));
        return id == null ? 0 : id;
    }
}
`,
);

if (process.argv.includes('--preview')) {
  // Contact sheet (SVG) to check the conversion by eye.
  const cell = 40;
  const cols = 16;
  const rows = Math.ceil(preview.length / cols);
  const icons = preview
    .map(
      ({ paths }, i) =>
        `<g transform="translate(${(i % cols) * cell + 8} ${Math.floor(i / cols) * cell + 8})">${paths
          .map((p) => `<path d="${p.d}" fill="${p.fill ? '#172b4d' : 'none'}" stroke="#172b4d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`)
          .join('')}</g>`,
    )
    .join('');
  fs.writeFileSync(
    process.argv[process.argv.indexOf('--preview') + 1],
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * cell}" style="background:#fff">${icons}</svg>`,
  );
}

console.log(`${generated.length} iconos generados en ${path.relative(root, drawableDir)}`);
