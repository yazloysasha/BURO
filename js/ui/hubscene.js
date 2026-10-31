// The Lavka interior, painted procedurally in pixels (logical 128x88), with both cats living in it.
import { CatSprite, pixelCanvas } from '../core/sprite.js';
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

function paintBackground(ctx, shelfIcons) {
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
  rect(ctx, 25, 13, 6, 6, '#f6e7b0');
  rect(ctx, 24, 14, 8, 4, '#f6e7b0');
  rect(ctx, 26, 12, 4, 8, '#f6e7b0');
  rect(ctx, 28, 14, 2, 1, '#e3cf8e');
  rect(ctx, 26, 17, 1, 1, '#e3cf8e');
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
  // floor
  rect(ctx, 0, 66, HUB_W, 22, '#5a3a2a');
  for (let y = 66; y < HUB_H; y += 5) rect(ctx, 0, y, HUB_W, 1, '#4a2e20');
  for (let y = 66, i = 0; y < HUB_H; y += 5, i++) for (let x = (i % 2) * 12; x < HUB_W; x += 24) rect(ctx, x, y, 1, 5, '#4a2e20');
  // counter
  rect(ctx, 44, 54, 40, 4, '#9b6a3e');
  rect(ctx, 44, 58, 40, 14, '#7a5332');
  rect(ctx, 46, 60, 36, 1, '#5e3e25');
  rect(ctx, 44, 72, 40, 1, '#3d2616');
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

// Pick up to 8 small icons to show on the shelves: the player's own finds first.
function shelfIconList() {
  const out = [];
  const items = game.data.itemById || {};
  const owned = Object.keys(game.save.collection.items || {});
  for (const id of owned) {
    const it = items[id];
    if (it && it.w === 16 && it.h === 16) out.push(it.icon);
    if (out.length >= 8) break;
  }
  for (const src of game.data.assets.hubShelf || []) {
    if (out.length >= 8) break;
    if (!out.includes(src)) out.push(src);
  }
  return out;
}

export function createHubScene(availW, availH) {
  const stage = new Stage(HUB_W, HUB_H, availW, availH);
  const icons = shelfIconList();
  const paint = () => {
    stage.ctx.clearRect(0, 0, HUB_W, HUB_H);
    paintBackground(stage.ctx, icons);
  };
  paint();
  Promise.all(icons.map(loadImage)).then(paint);

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
