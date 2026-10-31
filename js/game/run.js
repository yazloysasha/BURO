// Run lifecycle: fee, map, rooms, combat rounds, rewards, victory/defeat. Pure functions over (save, data).
// Every randomness goes through run.rng (or save.meta.rng outside runs); callers commit() after each call.
import { Rng } from '../core/rng.js';
import { generateMap, availableNodes, findNode } from './map.js';
import { createCombat, makeCatUnit, makeEnemyUnit, planIntents, resolveRound, CAT_KEYS } from './combat.js';
import { combatCtx } from './data.js';
import * as meta from './meta.js';

export function withRunRng(run, fn) {
  const rng = new Rng(run.rng);
  const r = fn(rng);
  run.rng = rng.state();
  return r;
}

export function withMetaRng(save, fn) {
  const rng = new Rng(save.meta.rng);
  const r = fn(rng);
  save.meta.rng = rng.state();
  return r;
}

// Extension points for later systems (combos, stickers): combat hook factories and after-win listeners.
export const runHooks = { combat: [], afterWin: [] };

const DEFAULT_RARITY_W = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 0.9, slop: 0.1 };

export function rarityWeights(data) {
  if (!data.rarities) return DEFAULT_RARITY_W;
  return Object.fromEntries(data.rarities.map((r) => [r.id, r.w]));
}

export function consumables(data) {
  return data.items.filter((i) => i.effect && i.tags && i.tags.includes('consumable'));
}

export function pickConsumable(rng, data, { maxRarity = 'rare' } = {}) {
  const order = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'slop'];
  const w = rarityWeights(data);
  const pool = consumables(data).filter((i) => order.indexOf(i.rarity) <= order.indexOf(maxRarity));
  return rng.weighted(pool, (i) => w[i.rarity] || 1);
}

// ---------- start ----------
export function startRun(save, data) {
  if (save.run) throw new Error('run already active');
  const free = meta.runIsFree(save, data);
  const fee = free ? 0 : meta.runFee(save, data);
  save.meta.coins -= fee;
  const seed = withMetaRng(save, (r) => r.seed());
  const rng = Rng.fromSeed('run:' + seed);
  const tier = save.meta.tier;
  const map = generateMap(rng, { tier, rooms: data.rooms, balance: data.balance });
  const party = {};
  for (const key of CAT_KEYS) {
    const b = meta.catBonus(save, data, key);
    const maxHp = data.cats[key].stats.hp + b.hp;
    party[key] = { hp: maxHp, maxHp, statuses: [] };
  }
  const run = {
    seed,
    tier,
    rng: rng.state(),
    map,
    pos: null,
    floorNo: 0,
    visited: [],
    party,
    coins: 0,
    backpack: [],
    stickers: [],
    room: null,
    nextUid: 1,
    fee,
    stats: { kills: 0, rooms: 0, coinsFound: 0, blocks: 0 },
    flags: {},
    result: null,
    startedAt: new Date().toISOString(),
  };
  const start = meta.startingConsumables(save, data);
  for (let i = 0; i < start; i++) addToBackpack(save, data, run, withRunRng(run, (r) => pickConsumable(r, data, { maxRarity: 'common' })).id);
  save.run = run;
  save.meta.runsStarted++;
  save.stats.runs++;
  return run;
}

// ---------- backpack ----------
export function addToBackpack(save, data, run, itemId, mods = []) {
  const item = data.itemById[itemId];
  if (!item) return { added: false };
  if (run.backpack.length >= meta.backpackSize(save, data)) {
    const coins = Math.max(1, Math.floor(item.price / 2));
    run.coins += coins;
    run.stats.coinsFound += coins;
    return { added: false, converted: true, coins, itemId };
  }
  const entry = { uid: 'i' + run.nextUid++, id: itemId, mods: mods.slice(0, 2) };
  run.backpack.push(entry);
  return { added: true, entry };
}

export function removeFromBackpack(run, uid) {
  const i = run.backpack.findIndex((b) => b.uid === uid);
  return i >= 0 ? run.backpack.splice(i, 1)[0] : null;
}

// ---------- rooms ----------
export function canEnter(run, nodeId) {
  return !run.room && !run.result && availableNodes(run.map, run.pos).includes(nodeId);
}

function buildEncounter(rng, data, run, kind) {
  const bal = data.balance;
  const floor = run.floorNo;
  const tier = run.tier;
  const enemies = data.enemies.filter((e) => !e.boss);
  if (kind === 'boss') {
    return [{ def: data.enemyById.klobster_king }];
  }
  if (kind === 'elite') {
    const pool = enemies.filter((e) => e.tier <= tier && e.minFloor <= floor + 1 && e.cost >= 2);
    const def = rng.pick(pool.length ? pool : enemies);
    const titles = data.gen.elite.titles;
    const list = [{ def, elite: true, eliteName: def.name + '-' + rng.pick(titles) }];
    if (floor >= 6) {
      const minions = enemies.filter((e) => !e.eliteOnly && e.tier <= tier && e.cost <= 1 && e.minFloor <= floor);
      if (minions.length) list.push({ def: rng.pick(minions) });
    }
    return list;
  }
  const b = bal.encounterBudget;
  let budget = b.base + b.perFloor * (floor - 1) + b.perTier * (tier - 1);
  const pool = enemies.filter((e) => !e.eliteOnly && e.tier <= tier && e.minFloor <= floor);
  const list = [];
  while (list.length < b.max && budget > 0.25) {
    const cand = pool.filter((e) => e.cost <= budget + 0.5);
    if (!cand.length) break;
    const def = rng.pick(cand);
    list.push({ def });
    budget -= def.cost;
  }
  if (!list.length) list.push({ def: data.enemyById.klobster });
  return list;
}

export function startCombat(save, data, run, kind) {
  return withRunRng(run, (rng) => {
    const enc = buildEncounter(rng, data, run, kind);
    const enemies = enc.map((e, i) =>
      makeEnemyUnit(e.def, 'e' + (i + 1), { floor: run.floorNo, tier: run.tier, elite: !!e.elite, eliteName: e.eliteName, balance: data.balance }),
    );
    const cats = CAT_KEYS.map((k) => makeCatUnit(k, data.cats[k], run.party[k], meta.catBonus(save, data, k)));
    const c = createCombat({ cats, enemies, kind });
    planIntents(c, rng, combatCtx(data, run));
    return c;
  });
}

// Room initializers for the room types implemented so far. Unknown types fall back to a small coin find.
export const roomHandlers = {
  combat: { init: (save, data, run, room) => (room.combat = startCombat(save, data, run, 'combat')) },
  elite: { init: (save, data, run, room) => (room.combat = startCombat(save, data, run, 'elite')) },
  boss: { init: (save, data, run, room) => (room.combat = startCombat(save, data, run, 'boss')) },
  rest: { init: (save, data, run, room) => (room.phase = 'choose') },
  loot: {
    init: (save, data, run, room) => {
      room.reward = withRunRng(run, (rng) => {
        const coins = Math.round(rng.int(6, 12 + run.floorNo) * meta.coinMult(save, data));
        run.coins += coins;
        run.stats.coinsFound += coins;
        const r = addToBackpack(save, data, run, pickConsumable(rng, data).id);
        return { coins, items: [r] };
      });
      room.phase = 'reward';
    },
  },
};

export function enterNode(save, data, nodeId) {
  const run = save.run;
  if (!canEnter(run, nodeId)) throw new Error('cannot enter ' + nodeId);
  const node = findNode(run.map, nodeId);
  run.floorNo = node.f + 1;
  const room = { nodeId, type: node.type, phase: 'active' };
  run.room = room;
  const handler = roomHandlers[node.type] || roomHandlers.loot;
  handler.init(save, data, run, room);
  return room;
}

export function restChoice(save, data, choice) {
  const run = save.run;
  const room = run.room;
  if (!room || room.type !== 'rest' || room.phase !== 'choose') return null;
  const heal = data.balance.restHeal;
  const res = { choice, healed: {} };
  for (const k of CAT_KEYS) {
    const p = run.party[k];
    if (choice === 'sleep') {
      const before = p.hp;
      p.hp = Math.min(p.maxHp, Math.max(p.hp, 0) + Math.round(p.maxHp * heal));
      p.statuses = [];
      res.healed[k] = p.hp - before;
    } else {
      p.maxHp += 4;
      p.hp = Math.min(p.maxHp, p.hp + 4);
      p.statuses = [{ id: 'cozy', turns: 3 }];
      res.healed[k] = 4;
    }
  }
  room.phase = 'done';
  room.result = res;
  return res;
}

export function completeRoom(save, data) {
  const run = save.run;
  const room = run.room;
  if (!room) return;
  run.visited.push(room.nodeId);
  run.pos = room.nodeId;
  run.stats.rooms++;
  const wasBoss = room.type === 'boss';
  run.room = null;
  if (wasBoss) run.result = { outcome: 'win' };
}

// ---------- combat ----------
function syncParty(run, c) {
  for (const u of c.cats) {
    run.party[u.key].hp = Math.max(0, u.hp);
  }
}

export function playRound(save, data, actions) {
  const run = save.run;
  const room = run.room;
  const c = room && room.combat;
  if (!c || c.over) return [];
  const ctx = combatCtx(data, run);
  const hooks = {
    useItem: (catKey, uid) => {
      const entry = removeFromBackpack(run, uid);
      if (!entry) return null;
      const item = data.itemById[entry.id];
      return item && item.effect ? { ...item.effect, itemId: item.id } : null;
    },
  };
  for (const f of runHooks.combat) Object.assign(hooks, f(save, data, run));
  const ev = withRunRng(run, (rng) => resolveRound(c, actions, rng, ctx, hooks));
  syncParty(run, c);
  if (c.over === 'win') onCombatWin(save, data, run, room);
  else if (c.over === 'lose') {
    room.phase = 'lost';
    run.result = { outcome: 'lose' };
  }
  return ev;
}

function onCombatWin(save, data, run, room) {
  const c = room.combat;
  run.stats.kills += c.kills.length;
  for (const k of CAT_KEYS) {
    const p = run.party[k];
    if (p.hp <= 0) p.hp = Math.max(1, Math.round(p.maxHp * data.balance.koReviveHp));
    p.statuses = [];
  }
  room.reward = withRunRng(run, (rng) => combatReward(save, data, run, c, rng));
  room.phase = 'reward';
  for (const f of runHooks.afterWin) f(save, data, run, room);
}

export function combatReward(save, data, run, c, rng) {
  const bal = data.balance;
  let coins = 0;
  for (const e of c.enemies) {
    if (e.hp > 0) continue;
    const def = data.enemyById[e.id];
    const [a, b] = def.loot.coins;
    let v = rng.int(a, b);
    if (e.elite) v *= bal.elite.coins;
    if (e.summoned) v = Math.ceil(v / 2);
    coins += v;
  }
  coins = Math.round(coins * meta.coinMult(save, data));
  run.coins += coins;
  run.stats.coinsFound += coins;
  const items = [];
  const kind = c.kind;
  const drops = kind === 'boss' ? bal.bossConsumables : rng.chance(bal.consumableDrop[kind] || 0) ? 1 : 0;
  for (let i = 0; i < drops; i++) items.push(addToBackpack(save, data, run, pickConsumable(rng, data).id));
  return { coins, items };
}

// ---------- end ----------
export function finishRun(save, data, { keepUid = null } = {}) {
  const run = save.run;
  if (!run || !run.result) return null;
  const win = run.result.outcome === 'win';
  const coins = win ? run.coins : Math.floor(run.coins * data.balance.defeatCoinKeep);
  const kept = win ? run.backpack.slice() : run.backpack.filter((b) => b.uid === keepUid).slice(0, 1);
  save.meta.coins += coins;
  save.stats.coinsEarned += coins;
  for (const b of kept) addToCollection(save, b.id, b.mods);
  for (const s of run.stickers) save.collection.stickers[s] = (save.collection.stickers[s] || 0) + 1;
  save.stats.kills += run.stats.kills;
  if (win) save.stats.wins++;
  else save.stats.losses++;
  const summary = {
    outcome: run.result.outcome,
    coins,
    items: kept.map((b) => b.id),
    stickers: run.stickers.slice(),
    rooms: run.stats.rooms,
    kills: run.stats.kills,
    endedAt: new Date().toISOString(),
  };
  save.lastRun = summary;
  save.run = null;
  return summary;
}

export function addToCollection(save, itemId, mods = []) {
  const col = save.collection.items;
  col[itemId] = (col[itemId] || 0) + 1;
  if (mods && mods.length) {
    save.collection.mods = save.collection.mods || {};
    const key = itemId + '|' + mods.slice().sort().join('+');
    save.collection.mods[key] = (save.collection.mods[key] || 0) + 1;
  }
}

// Healing items can also be used on the map between rooms.
export const MAP_USABLE = ['heal', 'heal_all', 'cleanse'];

export function useItemOutside(save, data, uid, catKey) {
  const run = save.run;
  const entry = run.backpack.find((b) => b.uid === uid);
  const item = entry && data.itemById[entry.id];
  if (!item || !item.effect || !MAP_USABLE.includes(item.effect.type)) return null;
  removeFromBackpack(run, uid);
  const eff = item.effect;
  const healed = {};
  const targets = eff.type === 'heal' ? [catKey || lowestCat(run)] : CAT_KEYS;
  for (const k of targets) {
    const p = run.party[k];
    const before = p.hp;
    if (eff.type === 'cleanse') p.statuses = [];
    p.hp = Math.min(p.maxHp, p.hp + (eff.value || 0));
    healed[k] = p.hp - before;
  }
  return { item: item.id, healed };
}

function lowestCat(run) {
  return CAT_KEYS.slice().sort((a, b) => run.party[a].hp / run.party[a].maxHp - run.party[b].hp / run.party[b].maxHp)[0];
}
