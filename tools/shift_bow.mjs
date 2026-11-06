// One-off: moves Дудоня's pink bow by dx pixels in every frame of assets/sprites/cats/dudonya.png. The fur under the old
// bow comes from the bow-less base cat (skin_grey_tabby, same frames), the "hurt" row is re-tinted from idle frame 0
// exactly like tools/prep/build_cats.py does. Usage: node tools/shift_bow.mjs -1
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode } from './png.mjs';

const dx = Number(process.argv[2] || -1);
const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../assets/sprites/cats');
const dud = decode(fs.readFileSync(path.join(dir, 'dudonya.png')));
const base = decode(fs.readFileSync(path.join(dir, 'skins/skin_grey_tabby.png')));
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'dudonya.json'), 'utf8'));
const BOW = ['255,140,190', '226,88,150', '160,40,100'];
const W = dud.width;
const at = (img, x, y) => (y * img.width + x) * 4;
const hurtY = meta.animations.hurt.y;

const out = { width: W, height: dud.height, data: Buffer.from(dud.data) };
let moved = 0;
let mismatch = 0;
for (let y = 0; y < hurtY; y++) for (let x = 0; x < W; x++) {
  const i = at(dud, x, y);
  const isBow = dud.data[i + 3] && BOW.includes(`${dud.data[i]},${dud.data[i + 1]},${dud.data[i + 2]}`);
  if (!isBow && x < base.width && y < base.height && !dud.data.subarray(i, i + 4).equals(base.data.subarray(at(base, x, y), at(base, x, y) + 4))) mismatch++;
}
// 1) restore the fur everywhere a bow pixel was, 2) paint the bow one step over (never across a frame edge)
const bowPx = [];
for (let y = 0; y < hurtY; y++) for (let x = 0; x < W; x++) {
  const i = at(dud, x, y);
  if (dud.data[i + 3] && BOW.includes(`${dud.data[i]},${dud.data[i + 1]},${dud.data[i + 2]}`)) bowPx.push([x, y, dud.data.subarray(i, i + 4)]);
}
for (const [x, y] of bowPx) base.data.copy(out.data, at(out, x, y), at(base, x, y), at(base, x, y) + 4);
for (const [x, y, px] of bowPx) {
  const nx = x + dx;
  if (Math.floor(nx / meta.frameW) !== Math.floor(x / meta.frameW)) continue;
  Buffer.from(px).copy(out.data, at(out, nx, y));
  moved++;
}
// 3) hurt frames: tint(idle0, red, .55) and tint(idle0, white, .85)
const tints = [[[255, 60, 60], 0.55], [[255, 255, 255], 0.85]];
tints.forEach(([rgb, k], f) => {
  for (let y = 0; y < meta.frameH; y++) for (let x = 0; x < meta.frameW; x++) {
    const s = at(out, x, y);
    const d = at(out, f * meta.frameW + x, hurtY + y);
    const a = out.data[s + 3];
    if (!a) {
      out.data.fill(0, d, d + 4);
      continue;
    }
    for (let c = 0; c < 3; c++) out.data[d + c] = Math.trunc(out.data[s + c] + (rgb[c] - out.data[s + c]) * k);
    out.data[d + 3] = a;
  }
});
fs.writeFileSync(path.join(dir, 'dudonya.png'), encode(out));
console.log(`bow pixels moved: ${moved}/${bowPx.length}, non-bow pixels differing from the base cat: ${mismatch}`);
