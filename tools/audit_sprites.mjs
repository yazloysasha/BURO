// Sprite audit: measures every enemy/animal/item sprite (opaque pixels, bounding box) so tiny or empty art gets caught.
// Usage: node tools/audit_sprites.mjs [--all]   (exits non-zero if something is below the limits used by the tests)
import fs from 'node:fs';
import path from 'node:path';
import { decode } from './png.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

// Limits are in pixels of a 16x16 cell after the runtime zoom/crop (an 8x8 sprite counts double on each side).
export const MIN_OPAQUE = 16; // opaque px: below this a sprite reads as a speck on screen
export const MIN_SIDE = 5; // the longer bbox side

export function measure(img, x0 = 0, y0 = 0, w = img.width, h = img.height) {
  let opaque = 0, minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (img.data[((y0 + y) * img.width + x0 + x) * 4 + 3] < 128) continue;
    opaque++;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { opaque, bw: maxX - minX + 1, bh: maxY - minY + 1 };
}

const scaled = (m, k) => ({ opaque: Math.round(m.opaque * k * k), bw: m.bw * k, bh: m.bh * k });

export function auditAll() {
  const out = [];
  const meta = read('assets/sprites/enemies/enemies.json');
  const sheet = decode(fs.readFileSync(path.join(ROOT, 'assets/sprites/enemies', meta.image)));
  for (const e of read('data/enemies.json')) {
    const f = meta.enemies[e.sprite];
    const m = f ? measure(sheet, 0, f.y, meta.frameW, meta.frameH) : { opaque: 0, bw: 0, bh: 0 };
    out.push({ kind: 'enemy', id: e.id, ...scaled(m, (f && f.art && f.art.zoom) || 1) });
  }
  for (const a of read('data/animals.json')) {
    const m = measure(decode(fs.readFileSync(path.join(ROOT, a.sprite))));
    const side = a.art ? Math.max(a.art.w, a.art.h) + 1 : Math.max(a.w, a.h);
    out.push({ kind: 'animal', id: a.id, ...scaled(m, Math.max(1, 16 / side)) });
  }
  for (const i of read('data/items.json')) out.push({ kind: 'item', id: i.id, ...measure(decode(fs.readFileSync(path.join(ROOT, i.icon)))) });
  return out;
}

export const tooSmall = (r) => r.opaque < MIN_OPAQUE || Math.max(r.bw, r.bh) < MIN_SIDE;

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const rows = auditAll();
  const bad = rows.filter(tooSmall);
  if (process.argv.includes('--all')) for (const r of rows) console.log(r.kind, r.id, r.opaque, r.bw + 'x' + r.bh);
  for (const k of ['enemy', 'animal', 'item']) {
    const list = rows.filter((r) => r.kind === k).sort((a, b) => a.opaque - b.opaque);
    console.log(k, list.length, 'smallest:', list.slice(0, 6).map((r) => `${r.id}=${r.opaque}px/${r.bw}x${r.bh}`).join(' '));
  }
  console.log('below limits:', bad.length ? bad.map((r) => r.id).join(', ') : 'none');
  process.exit(bad.length ? 1 : 0);
}
