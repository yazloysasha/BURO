// Computes the service-worker precache list: app shell + every asset referenced by data/, css/ and sheet JSONs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function walk(dir, filter) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue; // dotfiles: .DS_Store, macOS "._*" metadata (binary, would break JSON parsing)
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(rel, filter));
    else if (filter(rel)) out.push(rel);
  }
  return out;
}

function collectStrings(v, out) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => collectStrings(x, out));
  return out;
}

// all "assets/..." paths referenced anywhere in data/*.json (recursively)
export function dataAssetRefs() {
  const refs = new Set();
  for (const f of walk('data', (p) => p.endsWith('.json'))) {
    const json = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    for (const s of collectStrings(json, [])) if (/^assets\/.+\.(png|json|m4a|mp3)$/.test(s)) refs.add(s);
  }
  return refs;
}

export function cssAssetRefs() {
  const refs = new Set();
  for (const f of walk('css', (p) => p.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) {
      refs.add(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])));
    }
  }
  return refs;
}

export function computeList() {
  const files = new Set(['index.html', 'manifest.webmanifest']);
  for (const f of walk('css', () => true)) files.add(f);
  for (const f of walk('js', (p) => p.endsWith('.js'))) files.add(f);
  for (const f of walk('data', (p) => p.endsWith('.json'))) files.add(f);
  for (const f of walk('fonts', (p) => /\.(ttf|woff2?)$/.test(p))) files.add(f);
  for (const f of walk('icons', (p) => p.endsWith('.png'))) files.add(f);
  for (const r of cssAssetRefs()) files.add(r);
  const refs = dataAssetRefs();
  for (const r of refs) {
    files.add(r);
    // sheet JSONs pull in their image
    if (r.endsWith('.json')) {
      const meta = JSON.parse(fs.readFileSync(path.join(ROOT, r), 'utf8'));
      if (meta.image) files.add(path.posix.join(path.posix.dirname(r), meta.image));
    }
  }
  // all sfx (the game picks m4a or mp3 at runtime)
  const sfx = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx_index.json'), 'utf8'));
  files.add('assets/sfx_index.json');
  for (const e of Object.values(sfx)) {
    files.add('assets/' + e.m4a);
    files.add('assets/' + e.mp3);
  }
  const { catIndex } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
  const cats = JSON.parse(fs.readFileSync(path.join(ROOT, catIndex), 'utf8'));
  for (const list of Object.values(cats.groups)) {
    for (const file of list) files.add(path.posix.join(path.posix.dirname(catIndex), file));
  }
  return [...files].sort();
}

export function computeHash(list) {
  const h = crypto.createHash('sha256');
  for (const f of list) {
    h.update(f);
    h.update(fs.readFileSync(path.join(ROOT, f)));
  }
  return h.digest('hex').slice(0, 16);
}

export function readManifest() {
  const p = path.join(ROOT, 'precache-manifest.js');
  if (!fs.existsSync(p)) return null;
  const txt = fs.readFileSync(p, 'utf8');
  const version = Number((txt.match(/BURO_VERSION = (\d+)/) || [])[1] || 0);
  const hash = (txt.match(/BURO_HASH = '([0-9a-f]+)'/) || [])[1] || '';
  const list = JSON.parse((txt.match(/BURO_PRECACHE = (\[[\s\S]*\]);/) || [])[1] || '[]');
  return { version, hash, list };
}
