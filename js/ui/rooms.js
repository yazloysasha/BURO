// Views for the non-combat rooms: anomaly, shelf, wash, event, night shop.
import { h, setChildren } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { play } from '../core/audio.js';
import { loadImage } from '../core/assets.js';
import { pixelCanvas, iconCanvas } from '../core/sprite.js';
import { game, commit } from '../game/state.js';
import { tapAnomaly, placeOnShelf, washItem, washCats, chooseEvent, canAfford, buyShop } from '../game/rooms.js';
import { button, go, toast, shake, haptic } from './app.js';
import { roomViews, rewardView, leaveRoom, leaveButton, openBlockAt } from './screens/room.js';
import { itemRow, itemIcon, effectText, partyBar } from './runwidgets.js';
import { blockCard, pityLine } from './luckyblock.js';
import { displayName } from '../game/names.js';
import { createCatPair } from './widgets.js';

// ---------- anomaly ----------
function paintVariant(canvas, img, cell) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 16, 16);
  const ox = Math.floor((16 - img.naturalWidth) / 2);
  const oy = 16 - img.naturalHeight;
  if (cell.kind === 'mirror') {
    ctx.save();
    ctx.translate(16, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, ox, oy);
    ctx.restore();
    return;
  }
  ctx.drawImage(img, ox, oy);
  if (cell.kind === 'recolor') {
    const d = ctx.getImageData(0, 0, 16, 16);
    for (let i = 0; i < d.data.length; i += 4) {
      const r = d.data[i];
      d.data[i] = d.data[i + 2];
      d.data[i + 2] = d.data[i + 1];
      d.data[i + 1] = r;
    }
    ctx.putImageData(d, 0, 0);
  } else if (cell.kind === 'pixel') {
    // the nearest transparent pixel touching the sprite, starting from the rolled spot
    const d = ctx.getImageData(0, 0, 16, 16);
    const a = (x, y) => (x < 0 || y < 0 || x > 15 || y > 15 ? 0 : d.data[(y * 16 + x) * 4 + 3]);
    let best = null;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (a(x, y) || !(a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1))) continue;
      const dist = Math.abs(x - cell.px) + Math.abs(y - cell.py);
      if (!best || dist < best.dist) best = { x, y, dist };
    }
    if (best) {
      ctx.fillStyle = '#ff2fd0';
      ctx.fillRect(best.x, best.y, 1, 1);
    }
  }
}

roomViews.anomaly = (root, room) => {
  const a = room.anomaly;
  const item = game.data.itemById[a.icon];
  const box = h('div.col.room-center');
  const info = h('div.center');
  const drawInfo = () => setChildren(info, h('div', { text: t('anomaly.task', { n: a.total }) }), h('div.accent', { text: t('anomaly.taps', { n: a.tapsLeft, f: a.found, total: a.total }) }));
  drawInfo();
  const availW = Math.min(root.clientWidth || 360, 480);
  const cellCss = Math.floor((availW - (a.size - 1) * 6) / a.size);
  const scale = Math.max(1, Math.floor((cellCss - 20) / 18));
  const grid = h('div.anomaly-grid', { style: { gridTemplateColumns: `repeat(${a.size}, 1fr)` } });
  const cells = [];
  loadImage(item.icon).then((img) => {
    a.cells.forEach((cell, i) => {
      let cv;
      if (cell.kind === 'glitch') cv = iconCanvas(item.icon, { mods: ['glitchy'], target: 16 * scale + 2, seed: 'anomaly' + cell.seed });
      else {
        cv = pixelCanvas(16, 16, scale);
        if (img) paintVariant(cv, img, cell);
      }
      const b = h('button.anomaly-cell', { type: 'button', 'aria-label': t('a11y.anomalyCell', { n: i + 1 }) }, cv);
      b.addEventListener('click', () => onTap(i));
      cells.push(b);
      grid.append(b);
    });
    markAll(room.phase !== 'play');
  });
  function markAll(reveal) {
    a.cells.forEach((cell, i) => {
      const b = cells[i];
      if (!b) return;
      b.classList.toggle('hit', cell.tapped && cell.kind !== 'normal');
      b.classList.toggle('miss', cell.tapped && cell.kind === 'normal');
      b.classList.toggle('reveal', reveal && !cell.tapped && cell.kind !== 'normal');
      b.disabled = reveal || cell.tapped;
    });
  }
  function onTap(i) {
    const r = tapAnomaly(game.save, game.data, i);
    if (!r) return;
    commit();
    if (r.hit) {
      play('confirm');
      haptic(20);
    } else {
      play('error');
      shake(cells[i]);
    }
    drawInfo();
    markAll(r.done);
    if (r.done) go('room'); // the reward screen shows the same grid with the answers revealed
  }
  box.append(info, grid);
  if (room.phase === 'reward') {
    box.append(h('p.center', { text: t('anomaly.grade.' + room.grade) }));
    const holder = h('div');
    box.append(holder);
    rewardView(holder, room.reward, { title: t('anomaly.done'), scroll: false });
  }
  root.append(h('div.scroll', null, box));
};

// ---------- shelf ----------
function shelfLabel(rule, key) {
  if (rule === 'category') return t('categories.' + key);
  if (rule === 'color') return t('colors.' + key);
  return t('shelf.rarity.' + key);
}

roomViews.shelf = (root, room) => {
  const s = room.shelf;
  let selected = null;
  const box = h('div.col.room-center');
  const head = h('div.center');
  const pool = h('div.shelf-pool');
  const shelves = h('div.col');
  const draw = () => {
    setChildren(head, h('div', { text: t('shelf.task.' + s.rule) }), h('div.accent', { text: t('shelf.moves', { n: s.movesLeft }) }));
    setChildren(pool);
    s.items.forEach((it, i) => {
      if (it.placed) return;
      const item = game.data.itemById[it.id];
      const b = h('button.shelf-item' + (selected === i ? '.sel' : ''), { type: 'button', 'aria-label': t('a11y.shelfItem', { name: item.name }) }, itemIcon(item, { target: 40 }));
      b.addEventListener('click', () => {
        if (room.phase !== 'play') return;
        selected = selected === i ? null : i;
        play('tap');
        draw();
      });
      pool.append(b);
    });
    setChildren(shelves);
    s.shelves.forEach((key, si) => {
      const placed = s.items.filter((x) => x.placed && x.target === si);
      const sh = h(
        'button.shelf' + (selected !== null ? '.ready' : ''),
        { type: 'button' },
        h('div.shelf-label', { text: shelfLabel(s.rule, key) }),
        h('div.shelf-row', null, ...placed.map((x) => itemIcon(game.data.itemById[x.id], { target: 28 }))),
      );
      sh.addEventListener('click', () => {
        if (selected === null || room.phase !== 'play') return;
        const r = placeOnShelf(game.save, game.data, selected, si);
        commit();
        if (r.ok) play('shelf_place');
        else {
          play('error');
          shake(sh);
        }
        selected = null;
        if (r.done) return go('room');
        draw();
      });
      shelves.append(sh);
    });
  };
  draw();
  box.append(head, pool, shelves);
  if (room.phase === 'reward') {
    box.append(h('p.center', { text: t('shelf.grade.' + room.grade) }));
    const holder = h('div');
    box.append(holder);
    rewardView(holder, room.reward, { title: t('shelf.done'), scroll: false });
  }
  root.append(h('div.scroll', null, box));
};

// ---------- wash ----------
roomViews.wash = (root, room) => {
  const run = game.save.run;
  const box = h('div.col.room-center');
  const list = h('div.col');
  const draw = () => {
    const dirty = run.backpack.filter((b) => b.mods.includes('dirty'));
    setChildren(list);
    if (room.wash.combo) list.append(h('div.accent.center', { text: t('wash.combo') }));
    if (!dirty.length) list.append(h('p.center.dim', { text: t('wash.noDirty') }));
    for (const b of dirty) {
      const item = game.data.itemById[b.id];
      list.append(
        itemRow(item, {
          mods: b.mods,
          extra: button(t('wash.wash'), () => {
            const r = washItem(game.save, game.data, b.uid);
            commit();
            play('wash_sub');
            if (r && r.shiny) {
              setTimeout(() => play('shiny'), 250);
              toast(t('wash.shiny', { item: displayName(item, b.mods) }));
            }
            draw();
          }, { cls: 'blue small', sound: null }),
        }),
      );
    }
    if (!room.wash.catsWashed) {
      list.append(
        button(t('wash.cats'), () => {
          washCats(game.save, game.data);
          commit();
          play('wash_sub');
          toast(t('wash.catsDone'));
          draw();
        }, { cls: 'blue block', sub: t('wash.catsSub'), sound: null }),
      );
    }
    list.append(partyBar(run));
  };
  draw();
  box.append(h('h1.center', { text: t('wash.title') }), h('p.center', { text: t('wash.text') }), list, button(t('common.continue'), leaveRoom, { cls: 'green big block', sound: 'confirm' }));
  root.append(h('div.scroll', null, box));
};

// ---------- event ----------
roomViews.event = (root, room) => {
  const ev = game.data.eventById[room.event.id];
  const run = game.save.run;
  const box = h('div.col.room-center');
  box.append(createCatPair('sit', 'sit', 3), h('h1.center', { text: ev.title }), h('p', { text: ev.text }));
  if (room.phase === 'choose') {
    ev.choices.forEach((ch, i) => {
      const ok = canAfford(game.save, run, ch.cost);
      box.append(
        button(ch.label, () => {
          const r = chooseEvent(game.save, game.data, i);
          if (!r) return;
          commit();
          play(r.outcome.good ? 'confirm_big' : 'question');
          go('room');
        }, { cls: 'blue block event-choice', disabled: !ok, sub: ch.cost ? (ok ? t('event.cost', costParams(ch.cost)) : t('event.cantAfford', costParams(ch.cost))) : null }),
      );
    });
    box.append(h('div.dim.center', { text: t('map.runCoins', { n: run.coins }) }));
    root.append(h('div.scroll', null, box));
    return;
  }
  const out = ev.choices[room.event.choice].outcomes[room.event.outcome];
  box.append(h('div.accent', { text: '» ' + ev.choices[room.event.choice].label }), h('p', { text: out.text }));
  for (const r of room.event.results) {
    if (r.type === 'coins' && r.value > 0) continue; // shown by the reward block
    box.append(h('div.dim', { text: t('event.result.' + r.type, { v: r.type === 'status' ? game.data.statusById[r.value].name : r.value }) }));
  }
  const holder = h('div');
  box.append(holder);
  rewardView(holder, room.reward, { title: '', scroll: false });
  root.append(h('div.scroll', null, box));
};

function costParams(cost) {
  return { n: cost.coins || cost.sparkles, what: cost.coins ? t('event.coins') : t('event.sparkles') };
}

// ---------- shop ----------
roomViews.shop = (root, room) => {
  const run = game.save.run;
  const box = h('div.col');
  const coins = h('div.accent.center');
  const list = h('div.col');
  const blocks = h('div');
  const draw = () => {
    coins.textContent = t('map.runCoins', { n: run.coins });
    setChildren(list);
    room.shop.stock.forEach((s, i) => {
      let row;
      const buy = button(s.sold ? t('shop.sold') : t('shop.buy', { n: s.price }), () => {
        const r = buyShop(game.save, game.data, i);
        if (!r.ok) {
          play('error');
          toast(t('shop.fail.' + r.reason));
          return;
        }
        commit();
        play('coin_small');
        draw();
      }, { cls: 'green small', disabled: s.sold || run.coins < s.price, sound: null });
      if (s.kind === 'item') {
        const item = game.data.itemById[s.id];
        row = itemRow(item, { extra: h('div', null, item.effect ? h('div.effect', { text: effectText(item.effect) }) : null, buy) });
      } else {
        const icon = s.kind === 'block' ? game.data.assets.blocks.run : game.data.assets.icons.heal;
        row = h('div.item-row', null, h('div.item-icon', null, iconCanvas(icon, { target: 40 })), h('div.grow', null, h('div.item-name', { text: t('shop.' + s.kind) }), h('div.dim.small', { text: t('shop.' + s.kind + 'Desc') }), buy));
      }
      list.append(row);
    });
    setChildren(blocks);
    if (room.blocks && room.blocks.length) {
      const row = h('div.lucky-row');
      room.blocks.forEach((b, i) => row.append(blockCard(b, { closedIcon: game.data.assets.blocks.run, opener: () => openBlockAt(i), onRevealed: () => leave.refresh() })));
      blocks.append(row, h('div.dim.center', { text: pityLine() }));
    }
    leave.refresh();
  };
  const leave = leaveButton(t('shop.leave'), { cls: 'grey big block', sound: 'door_close' });
  draw();
  box.append(h('h1.center', { text: t('shop.title') }), h('p.center', { text: room.shop.discount ? t('shop.discount', { p: Math.round(room.shop.discount * 100) }) : t('shop.text') }), coins, list, blocks, partyBar(run), leave);
  root.append(h('div.scroll', null, box));
};
