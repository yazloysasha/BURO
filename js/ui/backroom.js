// The backroom scene (data/backroom.json), painted in pixels from its object list, and the loop view shared by the
// map room and the night shift. The same painter also draws the normal room for comparison.
import { h, setChildren } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { play } from '../core/audio.js';
import { tween } from '../core/loop.js';
import { CatSprite, animateWhileAttached, enemyFrame } from '../core/sprite.js';
import { getImage, loadImage } from '../core/assets.js';
import { game } from '../game/state.js';
import { sceneWith } from '../game/backroom.js';
import { Stage } from './stage.js';
import { button, shake } from './app.js';
import { catSheetKey } from './widgets.js';

const rect = (ctx, x, y, w, hh, c) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, hh);
};

// offscreen helpers for flipped / upside-down / recoloured sprites
function drawSprite(ctx, img, sx, sy, sw, sh, dx, dy, { flip = false, rot180 = false, recolor = false, silhouette = false } = {}) {
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const o = c.getContext('2d');
  o.save();
  if (flip || rot180) {
    o.translate(flip !== rot180 ? sw : rot180 ? sw : 0, rot180 ? sh : 0);
    o.scale(flip !== rot180 ? -1 : rot180 ? -1 : 1, rot180 ? -1 : 1);
  }
  o.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  o.restore();
  if (recolor) {
    const d = o.getImageData(0, 0, sw, sh);
    for (let i = 0; i < d.data.length; i += 4) {
      const r = d.data[i];
      d.data[i] = Math.min(255, (r + d.data[i + 2]) * 0.65 + 24);
      d.data[i + 1] = Math.round(d.data[i + 1] * 0.65);
      d.data[i + 2] = Math.min(255, r * 1.15 + 40);
    }
    o.putImageData(d, 0, 0);
  }
  if (silhouette) {
    o.globalCompositeOperation = 'source-atop';
    o.fillStyle = '#0b0812';
    o.fillRect(0, 0, sw, sh);
  }
  ctx.drawImage(c, dx, dy);
}

const topCache = new Map();
// first opaque row and its middle column of an icon (where a candle's wick is)
function iconTop(img) {
  if (topCache.has(img.src)) return topCache.get(img.src);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const o = c.getContext('2d', { willReadFrequently: true });
  o.drawImage(img, 0, 0);
  const d = o.getImageData(0, 0, c.width, c.height).data;
  let res = { x: 8, y: 2 };
  outer: for (let y = 0; y < c.height; y++) {
    const xs = [];
    for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 128) xs.push(x);
    if (xs.length) {
      res = { x: xs[xs.length >> 1], y };
      break outer;
    }
  }
  topCache.set(img.src, res);
  return res;
}

const PAINT = {
  wall(ctx) {
    rect(ctx, 0, 0, 128, 66, '#2b2140');
    for (let x = 0; x < 128; x += 8) rect(ctx, x, 0, 1, 62, '#241b37');
    rect(ctx, 0, 62, 128, 4, '#3b2c55');
  },
  floor(ctx, o) {
    rect(ctx, 0, 66, 128, 22, '#5a3a2a');
    for (let k = 0, y = 70; y < 88; y += 5, k++) {
      if (o.seamMissing !== k) rect(ctx, 0, y, 128, 1, '#302018');
      for (let x = (k % 2) * 12; x < 128; x += 24) rect(ctx, x, y - 4, 1, 4, '#4a2e20');
    }
  },
  door(ctx, o) {
    const { x, y } = o;
    rect(ctx, x - 1, y - 1, 20, 31, '#3d2a1c');
    if (o.open) {
      rect(ctx, x, y, 18, 30, '#0b0812');
      rect(ctx, x, y, 12, 30, '#6e4a2e');
      rect(ctx, x + 2, y + 3, 8, 10, '#5e3e25');
      rect(ctx, x + 2, y + 16, 8, 11, '#5e3e25');
      return;
    }
    rect(ctx, x, y, 18, 30, '#6e4a2e');
    rect(ctx, x + 3, y + 3, 12, 10, '#5e3e25');
    rect(ctx, x + 3, y + 16, 12, 11, '#5e3e25');
    rect(ctx, o.knob === 'left' ? x + 2 : x + 14, y + 15, 2, 2, '#e0c060');
  },
  window(ctx, o) {
    const { x, y, w, h: hh } = o;
    rect(ctx, x - 2, y - 2, w + 4, hh + 4, '#4a3a2a');
    rect(ctx, x, y, w, hh, o.sky);
  },
  windowFront(ctx, o, time) {
    const { x, y, w, h: hh } = o;
    if (o.rain === 'tl') {
      const pw = Math.floor(w / 2);
      const ph = Math.floor(hh / 2);
      for (let i = 0; i < 10; i++) {
        const px = x + ((i * 5 + Math.floor(time * 4)) % pw);
        const py = y + ((i * 7 + Math.floor(time * 18)) % ph);
        rect(ctx, px, py, 1, Math.min(3, y + ph - py), '#a4d4ff');
      }
    }
    if (o.barV) rect(ctx, x + Math.floor(w / 2), y, 1, hh, '#4a3a2a');
    if (o.barH) rect(ctx, x, y + Math.floor(hh / 2), w, 1, '#4a3a2a');
    rect(ctx, x - 3, y + hh + 2, w + 6, 2, '#5c4733');
  },
  stars(ctx, o) {
    if (o.hidden) return;
    for (const [x, y] of o.points) rect(ctx, x, y, 1, 1, '#d8d0ff');
  },
  moon(ctx, o, time, all) {
    if (o.hidden) return;
    const { x, y } = o;
    rect(ctx, x + 1, y + 1, 6, 6, o.color);
    rect(ctx, x, y + 2, 8, 4, o.color);
    rect(ctx, x + 2, y, 4, 8, o.color);
    if (o.phase === 'crescent') {
      const sky = all.window ? all.window.sky : '#151030';
      rect(ctx, x + 3, y + 1, 6, 6, sky);
      rect(ctx, x + 2, y + 2, 7, 4, sky);
      return;
    }
    rect(ctx, x + 4, y + 2, 2, 1, '#e3cf8e');
    rect(ctx, x + 2, y + 5, 1, 1, '#e3cf8e');
  },
  clock(ctx, o) {
    const { x: cx, y: cy } = o;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const d = dx * dx + dy * dy;
      if (d <= 36) rect(ctx, cx + dx, cy + dy, 1, 1, d > 25 ? '#6b4a2a' : '#e8dcc0');
    }
    for (const [dx, dy] of [[0, -4], [4, 0], [0, 4], [-4, 0]]) rect(ctx, cx + dx, cy + dy, 1, 1, '#8a7a60');
    if (!o.hands) return;
    const hand = (ang, len) => {
      for (let i = 1; i <= len; i++) rect(ctx, cx + Math.round(Math.sin(ang) * i), cy - Math.round(Math.cos(ang) * i), 1, 1, '#2a1d14');
    };
    hand((((o.hour % 12) + o.minute / 60) / 12) * Math.PI * 2, 3);
    hand((o.minute / 60) * Math.PI * 2, 5);
    rect(ctx, cx, cy, 1, 1, '#2a1d14');
  },
  poster(ctx, o) {
    const c = document.createElement('canvas');
    c.width = 18;
    c.height = 22;
    const p = c.getContext('2d');
    rect(p, 0, 0, 18, 22, '#8a6a44');
    rect(p, 1, 1, 16, 20, '#d9c9a3');
    const f = enemyFrame(o.enemy);
    if (f) drawSprite(p, f.img, 0, f.y, 16, 16, 1, 1, { flip: !o.iconFlip });
    rect(p, 3, 17, 12, 1, '#8a6a44');
    rect(p, 5, 19, 8, 1, '#8a6a44');
    if (o.rot180) drawSprite(ctx, c, 0, 0, 18, 22, o.x, o.y, { rot180: true });
    else ctx.drawImage(c, o.x, o.y);
  },
  lamp(ctx, o, time) {
    const x = o.x;
    const lit = lampLit(o, time);
    rect(ctx, x, 0, 1, 10, '#18121f');
    rect(ctx, x - 4, 10, 9, 3, '#8a5a2a');
    rect(ctx, x - 1, 13, 3, 2, lit ? '#ffe28a' : '#4a4030');
  },
  shelf(ctx, o) {
    rect(ctx, o.x, o.y, o.w, 3, '#7a5332');
    rect(ctx, o.x, o.y + 3, o.w, 1, '#4d321e');
    rect(ctx, o.x + 2, o.y + 4, 2, 3, '#4d321e');
    rect(ctx, o.x + o.w - 4, o.y + 4, 2, 3, '#4d321e');
  },
  icon(ctx, o, time) {
    if (o.hidden) return;
    const img = getImage(o.src);
    if (!img) return;
    const x = o.x + (o.anim === 'creep' ? Math.round(4 + Math.sin(time * 2) * 4) : 0);
    drawSprite(ctx, img, 0, 0, img.naturalWidth, img.naturalHeight, x, o.y, { rot180: !!o.rot180, recolor: !!o.recolor });
    if (o.flame) {
      const top = iconTop(img);
      const wob = Math.floor(time * 6) % 2;
      rect(ctx, x + top.x - 1 + wob, o.y + top.y - 3, 2, 2, '#ffb030');
      rect(ctx, x + top.x, o.y + top.y - 4, 1, 1, '#ffe080');
    }
  },
  hole(ctx, o) {
    rect(ctx, o.x, o.y + 2, 6, 4, '#0b0812');
    rect(ctx, o.x + 1, o.y + 1, 4, 1, '#0b0812');
    if (o.light) rect(ctx, o.x + 2, o.y + 3, 2, 2, '#ffd25a');
  },
  bed(ctx, o) {
    rect(ctx, o.x, o.y + 4, 32, 8, '#8a5a32');
    for (let i = 2; i < 32; i += 4) rect(ctx, o.x + i, o.y + 5, 1, 7, '#6e4424');
    rect(ctx, o.x + 2, o.y + 1, 28, 5, '#c75a6a');
    rect(ctx, o.x + 3, o.y + 1, 26, 1, '#e07a88');
  },
  underbed(ctx, o, time) {
    rect(ctx, o.x, o.y, 28, 2, '#1a1010');
    if (o.eyes && Math.floor(time * 2) % 7 !== 0) {
      for (const dx of [8, 10, 17, 19]) rect(ctx, o.x + dx, o.y, 1, 1, '#ffe14a');
    }
  },
  rug(ctx, o) {
    rect(ctx, o.x, o.y, o.w, 7, o.color);
    rect(ctx, o.x + 2, o.y + 2, o.w - 4, 1, '#c9a46a');
    rect(ctx, o.x + 2, o.y + 4, o.w - 4, 1, '#c9a46a');
  },
  box(ctx, o) {
    rect(ctx, o.x, o.y, 18, 12, '#b08850');
    rect(ctx, o.x, o.y, 18, 2, '#c9a06a');
    rect(ctx, o.x + 8, o.y, 2, 12, '#8a6a3a');
    rect(ctx, o.x, o.y + 11, 18, 1, '#7a5a30');
  },
  shadow(ctx, o) {
    rect(ctx, o.side === 'right' ? o.x + 18 : o.x - 12, o.y, 14, 2, '#2e1d14');
  },
  enemy(ctx, o) {
    const f = enemyFrame(o.enemy);
    if (f) drawSprite(ctx, f.img, 0, f.y, 16, 16, o.x, o.y, { flip: true, rot180: !!o.rot180, silhouette: !!o.silhouette });
  },
};

const lampLit = (o, time) => o.on && !(o.anim === 'flicker' && Math.floor(time * 1.2) % 4 === 0);

// The lamp lights the whole room: warm glow when on, the room sinks into the dark when it's off.
function light(ctx, lamp, time, w, hh) {
  if (!lamp) return;
  if (!lampLit(lamp, time)) {
    ctx.fillStyle = 'rgba(6, 4, 16, 0.55)';
    ctx.fillRect(0, 0, w, hh);
    return;
  }
  for (let y = 0; y < 62; y++) for (let dx = -40; dx <= 40; dx++) {
    const d = Math.sqrt(dx * dx + (y * 1.3) * (y * 1.3)) / 40;
    if (d < 1 && (dx + y) % 2 === 0 && d > 0.18) {
      ctx.fillStyle = `rgba(255, 210, 120, ${0.16 * (1 - d)})`;
      ctx.fillRect(lamp.x + dx, 14 + y, 1, 1);
    }
  }
}

const ANIMATED = (o) => o.anim || o.rain || o.eyes || o.flame;
// stars, the moon and anything seen through the window are painted between the sky and the window bars
const inWindow = (o) => o.kind === 'stars' || o.kind === 'moon' || (o.kind === 'enemy' && o.silhouette);

export function createBackroomScene(availW, availH) {
  const scene = game.data.backroom;
  const stage = new Stage(scene.w, scene.h, availW, availH);
  let objs = [];
  let started = performance.now();
  let cats = [];
  const paint = () => {
    const ctx = stage.ctx;
    const time = (performance.now() - started) / 1000;
    const byId = Object.fromEntries(objs.map((o) => [o.id, o]));
    ctx.clearRect(0, 0, scene.w, scene.h);
    for (const o of objs) {
      if (o.kind === 'cat' || inWindow(o) || !PAINT[o.kind]) continue;
      PAINT[o.kind](ctx, o, time, byId);
      if (o.kind === 'window') {
        for (const i of objs) if (inWindow(i)) PAINT[i.kind](ctx, i, time, byId);
        PAINT.windowFront(ctx, o, time, byId);
      }
    }
    light(ctx, byId.lamp, time, scene.w, scene.h);
  };
  const set = (list) => {
    objs = list.map((o) => ({ ...o }));
    started = performance.now();
    for (const c of cats) c.el.remove();
    cats = objs.filter((o) => o.kind === 'cat').map((o) => {
      const sp = new CatSprite(catSheetKey(o.cat), { anim: o.anim, flip: !!o.flip, scale: 1 });
      stage.place(sp.el, o.x, o.y, 5);
      return sp;
    });
    const lamp = objs.find((o) => o.kind === 'lamp');
    for (const c of cats) c.el.style.filter = lamp && !lamp.on ? 'brightness(0.45)' : '';
    paint();
  };
  let acc = 0;
  animateWhileAttached(stage.bg, (dt) => {
    if (!objs.some(ANIMATED)) return;
    acc += dt;
    if (acc < 0.1) return;
    acc = 0;
    paint();
  });
  const srcs = scene.objects.filter((o) => o.src).map((o) => o.src);
  for (const a of game.data.anomalies) for (const op of a.ops) if (op.object && op.object.src) srcs.push(op.object.src);
  Promise.all(srcs.map(loadImage)).then(paint);
  return { stage, set };
}

// The loop view. getState() returns the backroom state; onCall(choice) performs it (state change + commit) and returns
// the result; onDone() runs once the walk is over.
export function renderBackroomLoop(root, { getState, onCall, onDone }) {
  const wide = document.body.classList.contains('wide');
  const availW = root.clientWidth || 360;
  const availH = root.clientHeight || 600;
  const scene = createBackroomScene(wide ? availW * 0.6 : availW, wide ? availH - 16 : availH * 0.6);
  const plaque = h('div.br-plaque');
  const u = scene.stage.unit;
  Object.assign(plaque.style, { left: 7 * u + 'px', top: 22 * u + 'px', width: 12 * u + 'px' });
  scene.stage.el.append(plaque);
  const msg = h('div.combat-log.br-msg');
  const actions = h('div.row.br-actions');
  let comparing = false;
  let busy = false;
  const compare = button(t('backroom.compare'), () => {
    if (busy) return;
    comparing = !comparing;
    draw();
  }, { cls: 'grey block br-compare', sound: 'select' });
  compare.setAttribute('aria-pressed', 'false');
  root.append(h('div.split', null, h('div.split-a', null, scene.stage.el), h('div.split-b', null, msg, actions, compare)));

  const draw = () => {
    const st = getState();
    plaque.textContent = String(st.at);
    scene.set(sceneWith(game.data, comparing ? null : st.cur));
    scene.stage.el.classList.toggle('br-reference', comparing);
    compare.setAttribute('aria-pressed', String(comparing));
    const last = st.last;
    let text = '';
    if (!last && st.firstVisit) text = t('backroom.intro');
    else if (last && last.anomaly) text = t('backroom.caught', { name: game.data.anomalies.find((a) => a.id === last.anomaly).name });
    else if (last && last.missed) text = t('backroom.missed');
    else if (last && last.falseAlarm) text = t('backroom.falseAlarm');
    if (st.cur && st.hints) text = (text ? text + ' ' : '') + t('backroom.hint');
    msg.textContent = comparing ? t('backroom.reference') : text || t('backroom.inspect');
    msg.classList.toggle('accent', comparing || !!(last && last.anomaly));
    setChildren(
      actions,
      button(t('backroom.back'), () => go('back'), { cls: 'blue big grow br-back', sound: null, disabled: comparing }),
      button(t('backroom.forward'), () => go('forward'), { cls: 'green big grow br-forward', sound: null, disabled: comparing }),
    );
  };

  async function go(choice) {
    if (busy || comparing) return;
    busy = true;
    play(choice === 'back' ? 'door_close' : 'step');
    actions.querySelectorAll('button').forEach((b) => (b.disabled = true));
    const el = scene.stage.el;
    await tween(140, (k) => (el.style.opacity = String(1 - k)));
    const r = onCall(choice);
    if (r && r.caught) play('confirm');
    else if (r && !r.correct) {
      play('glitch_2');
      shake(plaque);
    }
    if (r && r.done) {
      el.style.opacity = '1';
      busy = false;
      return onDone();
    }
    draw();
    // the new buttons answer right away; the fade-in is only cosmetic
    busy = false;
    await tween(160, (k) => (el.style.opacity = String(k)));
    if (!busy) el.style.opacity = '';
  }
  draw();
}
