// Pixel-art rendering helpers. Canvases keep native resolution; CSS scales them by an integer factor with
// image-rendering: pixelated, so nothing is ever resampled smoothly.
import { onFrame } from './loop.js';
import { getImage, loadImage, sheets } from './assets.js';

export function pixelCanvas(w, h, scale = 1, cls = '') {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.className = 'px ' + cls;
  c.style.width = w * scale + 'px';
  c.style.height = h * scale + 'px';
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return c;
}

// Runs fn every frame while el is in the document; stops forever once it has been attached and then removed.
export function animateWhileAttached(el, fn) {
  let seen = false;
  let grace = 0;
  onFrame((dt, now) => {
    if (el.isConnected) {
      seen = true;
      fn(dt, now);
      return true;
    }
    if (seen) return false;
    grace += dt;
    return grace < 5; // never attached within 5s -> drop
  });
}

// ---------- Cats (32x32 sheets with named animation rows) ----------
export class CatSprite {
  constructor(sheetKey, { scale = 3, anim = 'idle', flip = false } = {}) {
    this.sheet = sheets[sheetKey];
    this.meta = this.sheet.meta;
    this.flip = flip;
    this.el = pixelCanvas(this.meta.frameW, this.meta.frameH, scale, 'cat');
    this.ctx = this.el.getContext('2d');
    this.time = 0;
    this.speed = 1;
    this.play(anim);
    animateWhileAttached(this.el, (dt) => this.tick(dt));
  }

  resolve(name) {
    const m = this.meta;
    if (m.animations[name]) {
      const a = m.animations[name];
      return { y: a.y, frames: [...Array(a.frames).keys()], fps: a.fps };
    }
    const al = m.aliases && m.aliases[name];
    if (al) {
      const a = m.animations[al.use];
      if (a) return { y: a.y, frames: al.frames || [...Array(a.frames).keys()], fps: a.fps };
    }
    const idle = m.animations.idle;
    return { y: idle.y, frames: [...Array(idle.frames).keys()], fps: idle.fps };
  }

  // play an animation; loop=false holds the last frame (or returns to `then`) after one cycle
  play(name, { loop = true, then = null, fps = null } = {}) {
    this.name = name;
    this.anim = this.resolve(name);
    if (fps) this.anim.fps = fps;
    this.loop = loop;
    this.then = then;
    this.time = 0;
    this.draw(0);
    return new Promise((r) => (this.onDone = r));
  }

  tick(dt) {
    this.time += dt * this.speed;
    const n = this.anim.frames.length;
    let f = Math.floor(this.time * this.anim.fps);
    if (f >= n) {
      if (this.loop) f %= n;
      else {
        f = n - 1;
        const done = this.onDone;
        this.onDone = null;
        if (this.then) {
          const t = this.then;
          this.then = null;
          this.play(t);
        }
        if (done) done();
      }
    }
    if (f !== this.frame) this.draw(f);
  }

  draw(f) {
    this.frame = f;
    const { frameW: w, frameH: hh } = this.meta;
    const idx = this.anim.frames[Math.min(f, this.anim.frames.length - 1)];
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, hh);
    ctx.save();
    if (this.flip) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this.sheet.img, idx * w, this.anim.y, w, hh, 0, 0, w, hh);
    ctx.restore();
  }
}

// ---------- Enemies (16x16 rows, 1-2 frames) ----------
export function enemyFrame(id) {
  const s = sheets.enemies;
  const e = s.meta.enemies[id];
  return e ? { img: s.img, y: e.y, frames: e.frames, w: s.meta.frameW, h: s.meta.frameH } : null;
}

export function enemyCanvas(id, scale = 4, { flip = true, animate = true } = {}) {
  const f = enemyFrame(id);
  const c = pixelCanvas(16, 16, scale, 'enemy');
  const ctx = c.getContext('2d');
  let cur = -1;
  const draw = (i) => {
    if (i === cur || !f) return;
    cur = i;
    ctx.clearRect(0, 0, 16, 16);
    ctx.save();
    if (flip) {
      ctx.translate(16, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(f.img, i * 16, f.y, 16, 16, 0, 0, 16, 16);
    ctx.restore();
  };
  draw(0);
  if (animate && f && f.frames > 1) {
    let t = Math.random();
    animateWhileAttached(c, (dt) => {
      t += dt;
      draw(Math.floor(t * 3) % f.frames);
    });
  }
  return c;
}

// Draw a sheet tile (ui_sheet, tiles) into a ctx.
export function drawTile(ctx, sheetKey, index, dx, dy) {
  const s = sheets[sheetKey];
  const fr = s && s.meta.frames[String(index)];
  if (!fr) return;
  ctx.drawImage(s.img, fr.x, fr.y, fr.w, fr.h, dx, dy, fr.w, fr.h);
}

// ---------- Icons with runtime modifiers ----------
// Integer scale so the icon (+1px padding on each side) lands near `target` CSS px.
export function iconScale(native, target) {
  return Math.max(1, Math.round(target / (native + 2)));
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

const ANIMATED_MODS = new Set(['shiny', 'glitchy', 'rainbow']);

// Paint src image with modifiers into ImageData (size w+2 x h+2). t = seconds for animated mods.
function paintModifiers(base, w, h, mods, seed, t) {
  const W = w + 2, H = h + 2;
  const out = new ImageData(W, H);
  const src = base.data;
  const o = out.data;
  const at = (x, y) => (y * W + x) * 4;
  const has = (m) => mods.includes(m);
  // copy with per-pixel color transforms
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const a = src[si + 3];
      if (!a) continue;
      let r = src[si], g = src[si + 1], b = src[si + 2];
      const lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
      if (has('golden')) {
        const gold = [[92, 54, 10], [176, 112, 20], [240, 180, 40], [255, 236, 140]];
        const c = gold[Math.min(3, Math.floor(lum * 4))];
        [r, g, b] = c;
      }
      if (has('rainbow')) {
        const c = hslToRgb((t * 0.35 + (x + y) / 24) % 1, 0.85, 0.35 + lum * 0.4);
        r = (r + c[0] * 2) / 3; g = (g + c[1] * 2) / 3; b = (b + c[2] * 2) / 3;
      }
      if (has('cursed')) {
        r = r * 0.75 + 30; g = g * 0.6; b = b * 0.8 + 40;
      }
      if (has('dirty')) {
        const n = hash32(seed + ':' + (x >> 1) + ',' + (y >> 1)) % 100;
        if (n < 22) { r = r * 0.45 + 60; g = g * 0.4 + 40; b = b * 0.3 + 15; }
      }
      if (has('shiny')) {
        const band = ((x + y) - ((t * 24) % (w + h + 20)) + 10);
        if (band > -1.5 && band < 1.5) { r = 255; g = 255; b = 255; }
      }
      const d = at(x + 1, y + 1);
      o[d] = r; o[d + 1] = g; o[d + 2] = b; o[d + 3] = a;
    }
  }
  if (has('glitchy')) {
    // channel split + occasional row jitter (stepped in time so it reads as "digital")
    const step = Math.floor(t * 6);
    const shift = (hash32(seed + step) % 3) - 1;
    const copy = new Uint8ClampedArray(o);
    for (let y = 0; y < H; y++) {
      const jitter = hash32(seed + ':' + y + ':' + step) % 9 === 0 ? (hash32(seed + y) % 2 ? 1 : -1) : 0;
      for (let x = 0; x < W; x++) {
        const d = at(x, y);
        const rx = Math.min(W - 1, Math.max(0, x + 1 + jitter + shift));
        const bx = Math.min(W - 1, Math.max(0, x - 1 + jitter));
        const ax = Math.min(W - 1, Math.max(0, x + jitter));
        o[d] = copy[at(rx, y)];
        o[d + 2] = copy[at(bx, y) + 2];
        o[d + 1] = copy[at(ax, y) + 1];
        o[d + 3] = Math.max(copy[at(rx, y) + 3], copy[at(bx, y) + 3], copy[at(ax, y) + 3]);
      }
    }
  }
  if (has('cursed') || has('golden')) {
    // 1px outline aura
    const col = has('cursed') ? [170, 60, 230] : [255, 220, 90];
    const alpha = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : o[at(x, y) + 3]);
    const marks = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (alpha(x, y)) continue;
      if (alpha(x - 1, y) > 128 || alpha(x + 1, y) > 128 || alpha(x, y - 1) > 128 || alpha(x, y + 1) > 128) marks.push(at(x, y));
    }
    const pulse = has('cursed') ? 140 + Math.floor(60 * Math.sin(t * 3)) : 120;
    for (const d of marks) { o[d] = col[0]; o[d + 1] = col[1]; o[d + 2] = col[2]; o[d + 3] = pulse; }
  }
  return out;
}

const baseCache = new Map();
function baseData(img) {
  let d = baseCache.get(img.src);
  if (!d) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    d = ctx.getImageData(0, 0, c.width, c.height);
    baseCache.set(img.src, d);
  }
  return d;
}

// Returns a canvas element showing the icon (async load ok). opts: {mods:[], target:css px, seed}
export function iconCanvas(src, { mods = [], target = 48, seed = '', w = 16, h = 16, cls = '' } = {}) {
  const scale = iconScale(Math.max(w, h), target);
  const c = pixelCanvas(w + 2, h + 2, scale, 'icon ' + cls);
  const ctx = c.getContext('2d');
  const animated = mods.some((m) => ANIMATED_MODS.has(m)) || mods.includes('cursed');
  const render = (img, t) => {
    if (!mods.length) {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 1 + Math.floor((w - img.naturalWidth) / 2), 1 + (h - img.naturalHeight), img.naturalWidth, img.naturalHeight);
      return;
    }
    const bd = baseData(img);
    // center smaller-than-cell images (8x8 bugs) at the bottom of the cell
    let data = bd;
    if (bd.width !== w || bd.height !== h) {
      data = new ImageData(w, h);
      const ox = Math.floor((w - bd.width) / 2), oy = h - bd.height;
      for (let y = 0; y < bd.height; y++) for (let x = 0; x < bd.width; x++) {
        const s = (y * bd.width + x) * 4, d = ((y + oy) * w + x + ox) * 4;
        for (let k = 0; k < 4; k++) data.data[d + k] = bd.data[s + k];
      }
    }
    ctx.putImageData(paintModifiers(data, w, h, mods, seed || src, t), 0, 0);
  };
  const start = (img) => {
    if (!img) return;
    render(img, 0);
    if (animated) {
      let t = 0, acc = 0;
      animateWhileAttached(c, (dt) => {
        t += dt;
        acc += dt;
        if (acc < 1 / 15) return; // 15 fps is plenty for shimmer
        acc = 0;
        render(img, t);
      });
    }
  };
  const ready = getImage(src);
  if (ready) start(ready);
  else loadImage(src).then(start);
  return c;
}
