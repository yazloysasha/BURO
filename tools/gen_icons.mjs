// Builds app icons (180/192/512) from the cat sprites: integer nearest-neighbor scale, padded, night background.
// Usage: node tools/gen_icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode } from './png.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const catDir = path.join(root, 'assets/sprites/cats');

function frame(name, anim, idx = 0) {
  const meta = JSON.parse(fs.readFileSync(path.join(catDir, name + '.json'), 'utf8'));
  const img = decode(fs.readFileSync(path.join(catDir, meta.image)));
  const a = meta.animations[anim];
  const fw = meta.frameW, fh = meta.frameH;
  const out = { width: fw, height: fh, data: Buffer.alloc(fw * fh * 4) };
  for (let y = 0; y < fh; y++) {
    img.data.copy(out.data, y * fw * 4, ((a.y + y) * img.width + idx * fw) * 4, ((a.y + y) * img.width + idx * fw + fw) * 4);
  }
  return out;
}

function bbox(img) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (img.data[(y * img.width + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255]; }

function build(size) {
  const pep = frame('peposya', 'sit');
  const dud = frame('dudonya', 'sit');
  const bp = bbox(pep), bd = bbox(dud);
  const gap = 2;
  // logical canvas (in sprite pixels): two cats, a floor, a moon
  const contentW = bp.w + gap + bd.w;
  const contentH = Math.max(bp.h, bd.h) + 2;
  const pad = Math.ceil(size * 0.16);
  const scale = Math.max(1, Math.floor(Math.min((size - pad * 2) / contentW, (size - pad * 2) / (contentH + 6))));
  const out = { width: size, height: size, data: Buffer.alloc(size * size * 4) };
  const bg = hex('#1b1630'), bg2 = hex('#2a2148'), floor = hex('#5a3a2a'), moon = hex('#f6e7b0');
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    c.forEach((v, i) => { out.data[(y * size + x) * 4 + i] = v; });
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, y < size * 0.7 ? bg : bg2);
  const ox = Math.floor((size - contentW * scale) / 2);
  const baseY = Math.floor(size * 0.7);
  // floor strip
  for (let y = baseY; y < baseY + scale; y++) for (let x = 0; x < size; x++) put(x, y, floor);
  // moon (pixel circle) top-left
  const mr = 3, mcx = pad + mr * scale, mcy = pad + mr * scale;
  for (let j = -mr; j <= mr; j++) for (let i = -mr; i <= mr; i++) {
    if (i * i + j * j <= mr * mr + 1) for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) put(mcx + i * scale + xx, mcy + j * scale + yy, moon);
  }
  const blit = (img, b, dx, flip) => {
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const sx = flip ? b.x1 - x : b.x0 + x;
      const o = ((b.y0 + y) * img.width + sx) * 4;
      if (img.data[o + 3] === 0) continue;
      const c = [img.data[o], img.data[o + 1], img.data[o + 2], 255];
      const py = baseY - (b.h - y) * scale;
      for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) put(dx + x * scale + xx, py + yy, c);
    }
  };
  blit(pep, bp, ox, false);
  blit(dud, bd, ox + (bp.w + gap) * scale, true);
  return encode(out);
}

fs.mkdirSync(path.join(root, 'icons'), { recursive: true });
for (const s of [180, 192, 512]) {
  fs.writeFileSync(path.join(root, 'icons', `icon-${s}.png`), build(s));
  console.log('icons/icon-' + s + '.png');
}
