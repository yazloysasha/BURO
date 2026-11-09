// The Lavka interior, painted procedurally in pixels (logical 128x88), with both cats living in it.
import { CatSprite, pixelCanvas, enemyFrame, animateWhileAttached } from '../core/sprite.js';
import { getImage, loadImage, sheets } from '../core/assets.js';
import { play } from '../core/audio.js';
import { Stage } from './stage.js';
import { game } from '../game/state.js';

export const HUB_W = 128;
export const HUB_H = 88;

function rect(ctx, x, y, w, hh, c) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, hh);
}

// The Lavka grows with its tier: a plant and lights, a sign, a rug and more lamps, gold trim.
function paintDecor(ctx, tier, time) {
  if (tier >= 2) {
    // potted plant by the window
    rect(ctx, 4, 60, 11, 6, '#a0522d');
    rect(ctx, 3, 59, 13, 2, '#c06a3a');
    for (const [x, y] of [[9, 50], [8, 52], [10, 52], [7, 54], [11, 54], [6, 56], [9, 55], [12, 56], [9, 57], [5, 58], [13, 58], [8, 58], [10, 58]]) rect(ctx, x, y, 1 + (x % 2), 1, '#4fa34a');
    // string of lights under the ceiling
    const cols = tier >= 5 ? ['#ffd24a', '#fff4c0'] : ['#ff6b8a', '#ffd24a', '#6fd3ff', '#8aff7a'];
    for (let x = 2, i = 0; x < 128; x += 6, i++) {
      rect(ctx, x, 3 + (i % 2), 1, 1, '#3b2c55');
      const on = (Math.floor(time * 1.5) + i) % 3 !== 0;
      rect(ctx, x, 4 + (i % 2), 2, 2, on ? cols[i % cols.length] : '#3b2c55');
    }
  }
  if (tier >= 3) {
    // a wooden sign on the counter with a coin on it
    rect(ctx, 46, 46, 16, 8, '#c9a06a');
    rect(ctx, 46, 46, 16, 1, '#e0bc84');
    rect(ctx, 48, 49, 12, 1, '#6e4a2e');
    rect(ctx, 48, 51, 8, 1, '#6e4a2e');
    rect(ctx, 63, 61, 4, 4, '#ffcf4a');
    rect(ctx, 64, 60, 2, 6, '#ffcf4a');
    rect(ctx, 64, 62, 2, 2, '#c98a1a');
  }
  if (tier >= 4) {
    // rug in front of the counter and two more lamps
    rect(ctx, 38, 76, 52, 7, '#7a2f5a');
    rect(ctx, 40, 78, 48, 1, '#c9a46a');
    rect(ctx, 40, 80, 48, 1, '#c9a46a');
    for (const lx of [100, 118]) {
      rect(ctx, lx, 0, 1, 7, '#18121f');
      rect(ctx, lx - 2, 7, 5, 2, '#8a5a2a');
      rect(ctx, lx - 1, 9, 3, 1, '#ffe28a');
    }
  }
  if (tier >= 5) {
    // gold trim: the Night Auction
    rect(ctx, 44, 54, 40, 1, '#ffd24a');
    rect(ctx, 44, 72, 40, 1, '#c98a1a');
    rect(ctx, 52, 21, 72, 1, '#ffd24a');
    rect(ctx, 52, 41, 72, 1, '#ffd24a');
  }
}

function paintBackground(ctx, shelfIcons, anomaly = null, tier = 1, time = 0) {
  // wall
  rect(ctx, 0, 0, HUB_W, HUB_H, '#2b2140');
  for (let x = 0; x < HUB_W; x += 8) rect(ctx, x, 0, 1, 66, '#241b37');
  rect(ctx, 0, 64, HUB_W, 2, '#3b2c55');
  // window with night sky
  rect(ctx, 6, 8, 34, 28, '#4a3a2a');
  rect(ctx, 8, 10, 30, 24, '#151030');
  const stars = [[11, 13], [20, 12], [33, 15], [14, 24], [27, 21], [35, 29], [10, 30]];
  for (const [x, y] of stars) rect(ctx, x, y, 1, 1, '#d8d0ff');
  // moon
  const moon = anomaly === 'hub_moon_red' ? '#e04848' : '#f6e7b0';
  rect(ctx, 25, 13, 6, 6, moon);
  rect(ctx, 24, 14, 8, 4, moon);
  rect(ctx, 26, 12, 4, 8, moon);
  rect(ctx, 28, 14, 2, 1, '#e3cf8e');
  rect(ctx, 26, 17, 1, 1, '#e3cf8e');
  if (anomaly === 'hub_window_eyes') for (const x of [11, 13, 17, 19]) rect(ctx, x, 27, 1, 1, '#ffe14a');
  rect(ctx, 22, 10, 1, 24, '#4a3a2a');
  rect(ctx, 8, 21, 30, 1, '#4a3a2a');
  rect(ctx, 5, 36, 36, 2, '#5c4733');
  // shelves on the right
  for (const sy of [22, 42]) {
    rect(ctx, 52, sy, 72, 3, '#7a5332');
    rect(ctx, 52, sy + 3, 72, 1, '#4d321e');
    rect(ctx, 54, sy + 4, 2, 3, '#4d321e');
    rect(ctx, 120, sy + 4, 2, 3, '#4d321e');
  }
  // lamp glow (dithered)
  const lx = 46, ly = 14;
  for (let y = 0; y < 44; y++) for (let x = -30; x <= 30; x++) {
    const d = Math.sqrt(x * x + (y * 1.4) * (y * 1.4)) / 30;
    if (d < 1 && (x + y) % 2 === 0 && d > 0.25) {
      ctx.fillStyle = `rgba(255, 210, 120, ${0.10 * (1 - d)})`;
      ctx.fillRect(lx + x, ly + y, 1, 1);
    }
  }
  rect(ctx, lx, 0, 1, 10, '#18121f');
  rect(ctx, lx - 3, 10, 7, 3, '#8a5a2a');
  rect(ctx, lx - 1, 13, 3, 2, '#ffe28a');
  // a klobster creeping down from the ceiling, half of it still up there
  if (anomaly === 'hub_ceiling') {
    const f = enemyFrame('klobster');
    if (f) {
      ctx.save();
      ctx.translate(27, 9);
      ctx.scale(1, -1);
      ctx.drawImage(f.img, 0, f.y, 16, 16, 0, 0, 16, 16);
      ctx.restore();
    }
  }
  // floor
  rect(ctx, 0, 66, HUB_W, 22, '#5a3a2a');
  for (let y = 66; y < HUB_H; y += 5) rect(ctx, 0, y, HUB_W, 1, '#4a2e20');
  for (let y = 66, i = 0; y < HUB_H; y += 5, i++) for (let x = (i % 2) * 12; x < HUB_W; x += 24) rect(ctx, x, y, 1, 5, '#4a2e20');
  // counter
  rect(ctx, 44, 54, 40, 4, '#9b6a3e');
  rect(ctx, 44, 58, 40, 14, '#7a5332');
  rect(ctx, 46, 60, 36, 1, '#5e3e25');
  rect(ctx, 44, 72, 40, 1, '#3d2616');
  paintDecor(ctx, tier, time);
  // icons on shelves (16x16 sprites, drawn native)
  shelfIcons.forEach((src, i) => {
    const img = getImage(src);
    if (!img) return;
    const row = Math.floor(i / 4);
    const col = i % 4;
    const x = 58 + col * 16;
    const y = (row === 0 ? 22 : 42) - img.naturalHeight;
    ctx.drawImage(img, x, y);
  });
}

// Up to 8 small icons for the shelves: the showcase first, then other finds, then default clutter.
function shelfIconList() {
  const out = [];
  const items = game.data.itemById || {};
  const keys = [...(game.save.meta.showcase || []), ...Object.keys(game.save.collection.items || {})];
  for (const key of keys) {
    const it = items[key.split('|')[0]];
    if (it && it.w === 16 && it.h === 16 && !out.includes(it.icon)) out.push(it.icon);
    if (out.length >= 8) break;
  }
  for (const src of game.data.assets.hubShelf || []) {
    if (out.length >= 8) break;
    if (!out.includes(src)) out.push(src);
  }
  return out;
}

// where each hub anomaly sits, for its tap zone
const HUB_ANOMALY_ZONE = { hub_moon_red: [18, 6, 20, 18], hub_window_eyes: [4, 20, 24, 16], hub_ceiling: [22, 0, 24, 16] };

export function createHubScene(availW, availH, { anomaly = null, onAnomaly = null, customer = null, onCustomer = null } = {}) {
  const stage = new Stage(HUB_W, HUB_H, availW, availH);
  const icons = shelfIconList();
  const tier = game.save.meta.tier;
  let shown = anomaly;
  let t0 = performance.now();
  const paint = () => {
    stage.ctx.clearRect(0, 0, HUB_W, HUB_H);
    paintBackground(stage.ctx, icons, shown, tier, (performance.now() - t0) / 1000);
  };
  // the garland twinkles
  if (tier >= 2) {
    let acc = 0;
    animateWhileAttached(stage.bg, (dt) => {
      acc += dt;
      if (acc < 0.25) return;
      acc = 0;
      paint();
    });
  }
  // a customer at the counter with a wish
  const visitor = customer && game.data.animalById[customer.animal];
  if (visitor) {
    const cv = pixelCanvas(16, 16, 1, 'customer');
    loadImage(visitor.sprite).then((img) => img && cv.getContext('2d').drawImage(img, Math.floor((16 - img.naturalWidth) / 2), 16 - img.naturalHeight));
    stage.place(cv, 66, 38, 4);
    // a speech bubble with "!" over the visitor
    const mark = pixelCanvas(7, 10, 1, 'bubble');
    const m = mark.getContext('2d');
    m.fillStyle = '#2a1d14';
    m.fillRect(0, 0, 7, 8);
    m.fillStyle = '#fff4dc';
    m.fillRect(1, 1, 5, 6);
    m.fillRect(2, 8, 2, 1);
    m.fillStyle = '#e0485a';
    m.fillRect(3, 2, 1, 3);
    m.fillRect(3, 6, 1, 1);
    stage.place(mark, 76, 28, 7);
    stage.zone(60, 28, 26, 26, () => onCustomer && onCustomer(), visitor.name);
  }
  if (shown && HUB_ANOMALY_ZONE[shown]) {
    const [x, y, w, hh] = HUB_ANOMALY_ZONE[shown];
    const zone = stage.zone(x, y, w, hh, () => {
      if (!shown) return;
      const id = shown;
      shown = null;
      zone.remove();
      paint();
      onAnomaly && onAnomaly(id);
    });
  }
  paint();
  Promise.all(icons.map(loadImage)).then(paint);
  // invited animal guests wander on the floor
  (game.save.meta.guests || []).forEach((id, i) => {
    const a = game.data.animalById[id];
    if (!a) return;
    const c = pixelCanvas(16, 16, 1, 'guest');
    loadImage(a.sprite).then((img) => img && c.getContext('2d').drawImage(img, Math.floor((16 - img.naturalWidth) / 2), 16 - img.naturalHeight));
    stage.place(c, 48 + i * 18, 68, 6);
  });

  const skins = game.save.meta.skins;
  const pepKey = skins.peposya !== 'default' && sheets[skins.peposya] ? skins.peposya : 'peposya';
  const dudKey = skins.dudonya !== 'default' && sheets[skins.dudonya] ? skins.dudonya : 'dudonya';
  const pep = new CatSprite(pepKey, { anim: 'idle' });
  const dud = new CatSprite(dudKey, { anim: 'sit', flip: true });
  stage.place(pep.el, 14, 48, 5);
  stage.place(dud.el, 86, 48, 5);

  const bubble = pixelCanvas(16, 16, 1, 'bubble');
  bubble.style.display = 'none';
  stage.place(bubble, 0, 0, 30);
  const vfx = sheets.meow_vfx;
  let bubbleTimer = null;
  const showBubble = (x, y) => {
    const ctx = bubble.getContext('2d');
    let f = 0;
    bubble.style.display = 'block';
    stage.move(bubble, x, y);
    clearInterval(bubbleTimer);
    const draw = () => {
      ctx.clearRect(0, 0, 16, 16);
      ctx.drawImage(vfx.img, f * 16, 0, 16, 16, 0, 0, 16, 16);
      f++;
      if (f >= vfx.meta.frames) {
        clearInterval(bubbleTimer);
        setTimeout(() => (bubble.style.display = 'none'), 500);
      }
    };
    draw();
    bubbleTimer = setInterval(draw, 1000 / vfx.meta.fps);
  };

  // idle life: occasional cozy actions (cosmetic randomness only)
  const behaviours = ['lick1', 'lick2', 'itch', 'stretch', 'meow', 'sit'];
  const life = setInterval(() => {
    const cat = Math.random() < 0.5 ? pep : dud;
    if (cat.busy) return;
    const b = behaviours[Math.floor(Math.random() * behaviours.length)];
    cat.busy = true;
    cat.play(b, { loop: false }).then(() => {
      setTimeout(() => {
        cat.busy = false;
        cat.play(cat === pep ? 'idle' : 'sit');
      }, 600);
    });
  }, 4200);

  const meow = (cat, bx, by) => {
    if (cat.busy) return false;
    cat.busy = true;
    play(Math.random() < 0.5 ? 'meow_sub' : 'meow_sub_2', { rate: cat === pep ? 0.9 : 1.15 });
    showBubble(bx, by);
    cat.play('meow', { loop: false }).then(() => {
      cat.busy = false;
      cat.play(cat === pep ? 'idle' : 'sit');
    });
    return true;
  };

  return {
    stage,
    pep,
    dud,
    onTapCat(fn) {
      stage.zone(14, 56, 32, 24, () => fn('peposya', meow(pep, 34, 46)));
      stage.zone(86, 56, 32, 24, () => fn('dudonya', meow(dud, 84, 46)));
    },
    destroy() {
      clearInterval(life);
      clearInterval(bubbleTimer);
    },
  };
}
