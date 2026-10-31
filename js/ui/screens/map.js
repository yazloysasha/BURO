// Run map: floors bottom-to-top, room icons, the cats' current spot, party status and backpack.
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { play } from '../../core/audio.js';
import { CatSprite, iconCanvas, enemyCanvas } from '../../core/sprite.js';
import { game, commit } from '../../game/state.js';
import { availableNodes, findNode } from '../../game/map.js';
import { enterNode } from '../../game/run.js';
import { button, go, modal, setTopbarTitle } from '../app.js';
import { partyBar, openBackpack } from '../runwidgets.js';

const FLOOR_H = 76;
const NODE = 52;

export function roomIcon(type, target = 34) {
  const r = game.data.roomById[type];
  if (r && r.enemySprite) return enemyCanvas(r.enemySprite, 3, { flip: true });
  const item = r && r.icon;
  const isSkill = item && item.includes('/skills/');
  return iconCanvas(item, { target, w: isSkill ? 34 : sizeOf(item), h: isSkill ? 34 : sizeOf(item) });
}

function sizeOf(src) {
  if (!src) return 16;
  if (src.includes('/rpg496_')) return 34;
  if (src.includes('/food_')) return 32;
  return 16;
}

export function render(root) {
  const run = game.save.run;
  if (!run) return go('hub');
  if (run.result) return go('runEnd');
  if (run.room) return go('room');
  setTopbarTitle(t('map.floor', { f: Math.min(run.floorNo + 1, run.map.floors.length), n: run.map.floors.length }));

  const avail = new Set(availableNodes(run.map, run.pos));
  const floors = run.map.floors;
  const width = Math.min(root.clientWidth || 360, 520);
  const height = floors.length * FLOOR_H + 24;
  const area = h('div.map-area', { style: { height: height + 'px', width: width + 'px' } });
  const pos = (n) => ({ x: Math.round(24 + n.x * (width - 48)), y: Math.round(height - 12 - FLOOR_H / 2 - n.f * FLOOR_H) });

  // dotted pixel lines
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const cv = document.createElement('canvas');
  cv.width = width * dpr;
  cv.height = height * dpr;
  cv.className = 'px map-lines';
  Object.assign(cv.style, { width: width + 'px', height: height + 'px' });
  const ctx = cv.getContext('2d');
  const visited = new Set(run.visited);
  for (const row of floors) {
    for (const n of row) {
      const a = pos(n);
      for (const uid of n.up) {
        const m = findNode(run.map, uid);
        const b = pos(m);
        const walked = visited.has(n.id) && (visited.has(m.id) || (run.pos === n.id && avail.has(m.id)));
        ctx.fillStyle = walked ? '#ffcf4a' : visited.has(n.id) || n.f >= (run.pos ? findNode(run.map, run.pos).f : 0) ? '#6c5a96' : '#3a3058';
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.floor(len / 7);
        for (let i = 1; i < steps; i++) {
          const x = Math.round(a.x + ((b.x - a.x) * i) / steps);
          const y = Math.round(a.y + ((b.y - a.y) * i) / steps);
          ctx.fillRect((x - 1) * dpr, (y - 1) * dpr, 2 * dpr, 2 * dpr);
        }
      }
    }
  }
  area.append(cv);

  for (const row of floors) {
    for (const n of row) {
      const p = pos(n);
      const isAvail = avail.has(n.id);
      const el = h(
        'button.map-node' + (isAvail ? '.avail' : '') + (visited.has(n.id) ? '.visited' : '') + (n.type === 'boss' ? '.boss' : ''),
        { type: 'button', style: { left: p.x - NODE / 2 + 'px', top: p.y - NODE / 2 + 'px' } },
        roomIcon(n.type),
      );
      el.addEventListener('click', () => onNode(n, isAvail));
      area.append(el);
    }
  }
  // the cats sit on the current node (or at the entrance)
  const mini = new CatSprite('mini_peposya', { anim: 'idle', scale: 2 });
  const mini2 = new CatSprite('mini_dudonya', { anim: 'idle', scale: 2, flip: true });
  const cats = h('div.map-cats', null, mini.el, mini2.el);
  if (run.pos) {
    const p = pos(findNode(run.map, run.pos));
    Object.assign(cats.style, { left: p.x - 32 + 'px', top: p.y - NODE / 2 - 30 + 'px' });
  } else {
    Object.assign(cats.style, { left: width / 2 - 32 + 'px', top: height - 32 + 'px' });
  }
  area.append(cats);

  const scroller = h('div.scroll.map-scroll', null, area);
  const top = h(
    'div.row.wrap',
    { style: { justifyContent: 'space-between' } },
    partyBar(run),
    h('div.row', null, button(t('map.backpack', { n: run.backpack.length }), () => openBackpack(() => go('map')), { cls: 'blue small' })),
  );
  const coins = h('div.dim', { text: t('map.runCoins', { n: run.coins }) });
  root.append(top, coins, scroller, h('div.hub-note', { text: t('map.hint') }));
  requestAnimationFrame(() => {
    const target = run.pos ? pos(findNode(run.map, run.pos)).y : height;
    scroller.scrollTop = Math.max(0, target - scroller.clientHeight * 0.65);
  });
}

function onNode(n, isAvail) {
  const r = game.data.roomById[n.type];
  const body = h('div.col', null, h('div.row', null, roomIcon(n.type), h('h2', { text: r.name })), h('p', { text: r.desc }));
  if (!isAvail) {
    play('tap');
    modal(body, [{ label: t('common.close'), value: false, cls: 'grey', sound: 'back' }]);
    return;
  }
  play('select');
  modal(body, [
    { label: t('common.cancel'), value: false, cls: 'grey', sound: 'back' },
    { label: t('map.enter'), value: true, cls: 'green', sound: 'door_open' },
  ]).then((ok) => {
    if (!ok) return;
    enterNode(game.save, game.data, n.id);
    commit();
    go('room');
  });
}
