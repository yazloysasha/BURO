// Non-combat rooms: backroom anomalies, shelf sorting, wash, events, night shop. Pure; randomness via run.rng.
import { withRunRng, addToBackpack, giveItem, pickConsumable } from './run.js';
import { rollRunBlocks, blockLuck } from './blocks.js';
import { roomModCombo } from './combos.js';
import { coinMult } from './meta.js';
import { newBackroom, rollLoop, callLoop, backroomGrade } from './backroom.js';

const coins = (save, data, n) => Math.max(1, Math.round(n * coinMult(save, data)));

function giveCoins(run, n) {
  run.coins += n;
  run.stats.coinsFound += n;
  return n;
}

// ---------- backroom: the familiar room in loops (see backroom.js) ----------
export function initBackroom(save, data, run, room) {
  const firstVisit = !save.meta.backroomVisited;
  save.meta.backroomVisited = true;
  const state = newBackroom({ loops: run.floorNo >= 6 ? 4 : 3, maxLevel: run.floorNo >= 5 ? 3 : 2, firstVisit, hints: run.flags.anomalyHint || 0 });
  run.flags.anomalyHint = 0;
  withRunRng(run, (rng) => rollLoop(state, rng, data, save));
  room.backroom = state;
  room.phase = 'play';
}

export function backroomCall(save, data, choice) {
  const run = save.run;
  const room = run.room;
  if (!room || !room.backroom || room.phase !== 'play') return null;
  const r = withRunRng(run, (rng) => callLoop(room.backroom, save, choice, rng, data));
  if (r && r.done) finishBackroom(save, data, run, room);
  return r;
}

function finishBackroom(save, data, run, room) {
  const f = run.floorNo;
  const grade = (room.grade = backroomGrade(room.backroom));
  const c = coins(save, data, { perfect: 12 + f * 2, good: 9 + f, rough: 5 + f, lost: 3 }[grade]);
  giveCoins(run, c);
  room.reward = { coins: c, items: [] };
  if (grade === 'perfect') room.blocks = rollRunBlocks(save, data, run, 1, { minRarity: 'uncommon' });
  else if (grade === 'good') room.blocks = rollRunBlocks(save, data, run, 1);
  room.phase = 'reward';
}

// ---------- shelf: sort items by a rule, limited moves, no timer ----------
const COLOR_SHELVES = ['red', 'green', 'blue', 'purple', 'yellow'];
const RARITY_SHELVES = ['common', 'uncommon', 'rare'];

export function initShelf(save, data, run, room) {
  withRunRng(run, (rng) => {
    const f = run.floorNo;
    const n = f <= 3 ? 6 : f <= 6 ? 9 : 12;
    const per = n / 3;
    const rule = rng.pick(['category', 'color', 'rarity']);
    const value = (it) => (rule === 'category' ? it.category : rule === 'color' ? it.color : it.rarity === 'common' || it.rarity === 'uncommon' ? it.rarity : 'rare');
    let keys;
    if (rule === 'category') {
      const cats = [...new Set(data.items.map((i) => i.category))].filter((c) => data.items.filter((i) => i.category === c).length >= per);
      keys = rng.shuffle(cats).slice(0, 3);
    } else keys = rng.shuffle(rule === 'color' ? COLOR_SHELVES : RARITY_SHELVES).slice(0, 3);
    const items = [];
    keys.forEach((k, shelf) => {
      const pool = rng.shuffle(data.items.filter((i) => value(i) === k && !(i.tags || []).includes('slop')));
      for (const it of pool.slice(0, per)) items.push({ id: it.id, target: shelf, placed: false });
    });
    room.shelf = { rule, shelves: keys, items: rng.shuffle(items), movesLeft: n + 3, mistakes: 0 };
  });
  room.phase = 'play';
}

export function placeOnShelf(save, data, itemIdx, shelfIdx) {
  const run = save.run;
  const room = run.room;
  const s = room && room.shelf;
  if (!s || room.phase !== 'play') return null;
  const it = s.items[itemIdx];
  if (!it || it.placed) return null;
  s.movesLeft--;
  const ok = it.target === shelfIdx;
  if (ok) it.placed = true;
  else s.mistakes++;
  const placed = s.items.filter((x) => x.placed).length;
  const done = placed === s.items.length || s.movesLeft <= 0;
  if (done) finishShelf(save, data, run, room, placed);
  return { ok, done };
}

function finishShelf(save, data, run, room, placed) {
  const s = room.shelf;
  const all = placed === s.items.length;
  const c = all ? coins(save, data, 8 + run.floorNo + (s.mistakes === 0 ? 6 : 0)) : coins(save, data, 2 * placed);
  giveCoins(run, c);
  room.reward = { coins: c, items: [] };
  room.grade = all ? (s.mistakes === 0 ? 'perfect' : 'good') : 'partial';
  if (all) room.blocks = rollRunBlocks(save, data, run, 1, s.mistakes <= 1 ? { minRarity: 'uncommon' } : {});
  room.phase = 'reward';
}

// ---------- wash: remove "dirty", maybe become shiny ----------
export function initWash(save, data, run, room) {
  const combo = roomModCombo(save, data, run, 'wash');
  room.wash = { shinyChance: combo ? combo.effect.value : 0.3, combo: combo ? combo.id : null, washed: [], catsWashed: false };
  room.phase = 'wash';
}

export function washItem(save, data, uid) {
  const run = save.run;
  const room = run.room;
  if (!room || !room.wash) return null;
  const e = run.backpack.find((b) => b.uid === uid);
  if (!e || !e.mods.includes('dirty')) return null;
  e.mods = e.mods.filter((m) => m !== 'dirty');
  const shiny = withRunRng(run, (rng) => rng.next() < room.wash.shinyChance) && !e.mods.includes('shiny') && e.mods.length < 2;
  if (shiny) e.mods.push('shiny');
  room.wash.washed.push({ uid, shiny });
  return { shiny };
}

export function washCats(save, data) {
  const run = save.run;
  const room = run.room;
  if (!room || !room.wash || room.wash.catsWashed) return null;
  room.wash.catsWashed = true;
  const healed = {};
  for (const [k, p] of Object.entries(run.party)) {
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.15));
    p.statuses = [{ id: 'cozy', turns: 2 }];
    healed[k] = p.hp - before;
  }
  return { healed };
}

// ---------- events: data-driven scenes with choices and luck checks ----------
export function initEvent(save, data, run, room) {
  withRunRng(run, (rng) => {
    // never twice in a run, and not again soon after the last runs
    const seen = run.flags.events || [];
    const recent = save.meta.recentEvents || [];
    let pool = data.events.filter((e) => !seen.includes(e.id) && !recent.includes(e.id));
    if (!pool.length) pool = data.events.filter((e) => !seen.includes(e.id));
    if (!pool.length) pool = data.events;
    const ev = rng.pick(pool);
    run.flags.events = [...seen, ev.id];
    save.meta.recentEvents = [...recent, ev.id].slice(-Math.floor(data.events.length * 0.6));
    room.event = { id: ev.id, choice: null, outcome: null, results: [] };
  });
  room.phase = 'choose';
}

export function canAfford(save, run, cost) {
  if (!cost) return true;
  if (cost.coins && run.coins < cost.coins) return false;
  if (cost.sparkles && save.meta.sparkles < cost.sparkles) return false;
  return true;
}

export function chooseEvent(save, data, choiceIdx) {
  const run = save.run;
  const room = run.room;
  if (!room || !room.event || room.phase !== 'choose') return null;
  const ev = data.events.find((e) => e.id === room.event.id);
  const ch = ev.choices[choiceIdx];
  if (!ch || !canAfford(save, run, ch.cost)) return null;
  if (ch.cost && ch.cost.coins) run.coins -= ch.cost.coins;
  if (ch.cost && ch.cost.sparkles) save.meta.sparkles -= ch.cost.sparkles;
  const luck = blockLuck(save, data, run);
  const outcomeIdx = withRunRng(run, (rng) => {
    const entries = ch.outcomes.map((o, i) => [i, o.p * (o.good ? 1 + 0.04 * luck : 1)]);
    return rng.weighted(entries)[0];
  });
  const out = ch.outcomes[outcomeIdx];
  const results = applyEventEffects(save, data, run, room, out.effects);
  room.event.choice = choiceIdx;
  room.event.outcome = outcomeIdx;
  room.event.results = results;
  room.phase = 'done';
  return { outcome: out, results };
}

export function applyEventEffects(save, data, run, room, effects) {
  const res = [];
  const blocks = [];
  const reward = (room.reward = room.reward || { coins: 0, items: [] });
  for (const e of effects) {
    if (e.coins) {
      const n = e.coins > 0 ? coins(save, data, e.coins) : Math.max(-run.coins, e.coins);
      run.coins += n;
      if (n > 0) {
        run.stats.coinsFound += n;
        reward.coins += n;
      }
      res.push({ type: 'coins', value: n });
    }
    if (e.heal || e.healPct) {
      for (const p of Object.values(run.party)) p.hp = Math.min(p.maxHp, p.hp + (e.heal || Math.round(p.maxHp * e.healPct)));
      res.push({ type: 'heal', value: e.heal || Math.round(e.healPct * 100) + '%' });
    }
    if (e.damage) {
      for (const p of Object.values(run.party)) p.hp = Math.max(1, p.hp - e.damage);
      res.push({ type: 'damage', value: e.damage });
    }
    if (e.maxHp) {
      for (const p of Object.values(run.party)) {
        p.maxHp += e.maxHp;
        p.hp += e.maxHp;
      }
      res.push({ type: 'maxHp', value: e.maxHp });
    }
    if (e.status) {
      for (const p of Object.values(run.party)) p.statuses = [...(p.statuses || []).filter((s) => s.id !== e.status), { id: e.status, turns: 2 }];
      res.push({ type: 'status', value: e.status });
    }
    if (e.item || e.consumable) {
      const id = e.item || withRunRng(run, (rng) => pickConsumable(rng, data).id);
      reward.items.push(giveItem(save, data, run, id));
    }
    if (e.block) blocks.push(e.block);
    if (e.sparkles) {
      save.meta.sparkles += e.sparkles;
      res.push({ type: 'sparkles', value: e.sparkles });
    }
    if (e.sticker) {
      run.stickers.push(e.sticker);
      reward.stickers = [...(reward.stickers || []), e.sticker];
    }
  }
  for (const min of blocks) room.blocks = [...(room.blocks || []), ...rollRunBlocks(save, data, run, 1, min === 'common' ? {} : { minRarity: min })];
  return res;
}

// ---------- night shop ----------
export function initShop(save, data, run, room) {
  const disc = run.flags.shopDiscount || 0;
  run.flags.shopDiscount = 0;
  const price = (p) => Math.max(1, Math.round(p * (1 - disc)));
  const stock = withRunRng(run, (rng) => {
    const list = [];
    const ids = new Set();
    while (list.length < 4) {
      const it = pickConsumable(rng, data, { maxRarity: 'rare' });
      if (ids.has(it.id)) continue;
      ids.add(it.id);
      list.push({ kind: 'item', id: it.id, price: price(Math.round(it.price * 1.3) + 2), sold: false });
    }
    const gear = data.items.filter((i) => i.effect && i.effect.type === 'stat' && ['uncommon', 'rare'].includes(i.rarity));
    const g = rng.pick(gear);
    list.push({ kind: 'item', id: g.id, price: price(Math.round(g.price * 1.1)), sold: false });
    list.push({ kind: 'block', price: price(25 + run.floorNo * 2), sold: false });
    list.push({ kind: 'heal', price: price(12), sold: false });
    return list;
  });
  room.shop = { stock, discount: disc };
  room.phase = 'shop';
}

export function buyShop(save, data, idx) {
  const run = save.run;
  const room = run.room;
  const s = room && room.shop && room.shop.stock[idx];
  if (!s || s.sold) return { ok: false, reason: 'sold' };
  if (run.coins < s.price) return { ok: false, reason: 'coins' };
  if (s.kind === 'item') {
    const r = addToBackpack(save, data, run, s.id, [], { noConvert: true });
    if (r.full) return { ok: false, reason: 'full' };
  }
  run.coins -= s.price;
  s.sold = true;
  if (s.kind === 'block') room.blocks = [...(room.blocks || []), ...rollRunBlocks(save, data, run, 1)];
  if (s.kind === 'heal') for (const p of Object.values(run.party)) p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.4));
  return { ok: true };
}
