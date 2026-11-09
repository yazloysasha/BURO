// Run lifecycle: fee, map, rooms, combat rounds, rewards, victory/defeat. Pure functions over (save, data).
// Every randomness goes through run.rng (or save.meta.rng outside runs); callers commit() after each call.
import { Rng } from '../core/rng.js';
import { generateMap, availableNodes, findNode } from './map.js';
import { createCombat, makeCatUnit, makeEnemyUnit, planIntents, resolveRound, CAT_KEYS } from './combat.js';
import { combatCtx } from './data.js';
import * as meta from './meta.js';
import { rollRunBlocks, settleRoomBlocks } from './blocks.js';
import { addItem, sellItem, grantSticker } from './collection.js';
import { runHooks } from './hooks.js';
import { comboStatBonus, activeCombos, checkRunCombos, roomSequenceCombos } from './combos.js';
import { initBackroom, initShelf, initWash, initEvent, initShop } from './rooms.js';
import { actionMods } from './progress.js';
import { eliteName } from './namegen.js';
import { rollCustomer } from './customers.js';

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
// Relics: legendaries in the backpack that change the rules of the run.
export function hasRelic(run, data, relic) {
  return !!run && run.backpack.some((b) => {
    const it = data.itemById[b.id];
    return it && it.effect && it.effect.type === 'relic' && it.effect.relic === relic;
  });
}

// Gear quirks in the backpack, counted (two thorny shields prick twice as hard). Glitchy gear adds "mirror".
export function gearQuirks(data, run) {
  const q = {};
  for (const b of run.backpack) {
    const it = data.itemById[b.id];
    if (!it || !it.effect || it.effect.type !== 'stat') continue;
    if (it.effect.quirk) q[it.effect.quirk] = (q[it.effect.quirk] || 0) + 1;
    if (b.mods.includes('glitchy')) q.mirror = (q.mirror || 0) + 1;
  }
  if (q.thorns) q.thorns *= 2;
  if (hasRelic(run, data, 'ninelives')) q.guardian = (q.guardian || 0) + 1;
  return q;
}

// The animal that comes along on runs (chosen on its card), as the combat engine wants it.
export function companionUnit(data, run) {
  const a = run.companion && data.animalById[run.companion];
  if (!a) return null;
  const bal = data.balance.assist;
  const every = hasRelic(run, data, 'bouquet') ? 1 : bal.every[a.rarity] + (a.assist === 'magic' ? 1 : 0);
  return { id: a.id, name: a.name, sprite: a.sprite, w: a.w, h: a.h, art: a.art || null, assist: { type: a.assist, value: bal.value[a.rarity], every }, cd: 0 };
}

export function floorMod(data, run) {
  const id = run.map.floorMods && run.map.floorMods[run.floorNo - 1];
  return id ? { id, ...data.balance.floorMods.mods[id] } : null;
}

export function startRun(save, data, { leader = 'peposya' } = {}) {
  if (save.run) throw new Error('run already active');
  const free = meta.runIsFree(save, data);
  const fee = free ? 0 : meta.runFee(save, data);
  save.meta.coins -= fee;
  const seed = withMetaRng(save, (r) => r.seed());
  const rng = Rng.fromSeed('run:' + seed);
  const tier = save.meta.tier;
  const map = generateMap(rng, { tier, rooms: data.rooms, balance: data.balance });
  // the first two runs always end at the King; then the night decides who waits upstairs
  const boss = save.meta.runsStarted < 2 ? 'klobster_king' : rng.pick(data.balance.bosses);
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
    leader,
    boss,
    companion: save.meta.companion && save.collection.animals[save.meta.companion] ? save.meta.companion : null,
    flags: {},
    actionMods: actionMods(save, data),
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
export function addToBackpack(save, data, run, itemId, mods = [], { noConvert = false } = {}) {
  const item = data.itemById[itemId];
  if (!item) return { added: false };
  if (run.backpack.length >= meta.backpackSize(save, data)) {
    if (noConvert) return { added: false, full: true };
    const coins = Math.max(1, Math.floor(item.price / 2));
    run.coins += coins;
    run.stats.coinsFound += coins;
    return { added: false, converted: true, coins, itemId };
  }
  const entry = { uid: 'i' + run.nextUid++, id: itemId, mods: mods.slice(0, 2) };
  run.backpack.push(entry);
  afterBackpackChange(save, data, run);
  return { added: true, entry };
}

let comboDepth = 0;
function afterBackpackChange(save, data, run) {
  if (comboDepth > 2) return;
  comboDepth++;
  try {
    checkRunCombos(save, data, run, { addToBackpack: (id) => addToBackpack(save, data, run, id) });
  } finally {
    comboDepth--;
  }
}

export function removeFromBackpack(run, uid) {
  const i = run.backpack.findIndex((b) => b.uid === uid);
  return i >= 0 ? run.backpack.splice(i, 1)[0] : null;
}

// A found item that doesn't fit stays closed in the room: opening it asks what to do, nothing is sold behind the player's back.
export function giveItem(save, data, run, itemId, mods = []) {
  const r = addToBackpack(save, data, run, itemId, mods, { noConvert: true });
  if (!r.full) return r;
  const room = run.room;
  room.blocks = [...(room.blocks || []), { rarity: data.itemById[itemId].rarity, forced: null, kind: 'item', id: itemId, mods, opened: false }];
  return { pending: true, itemId };
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
    return [{ def: data.enemyById[run.boss] || data.enemyById.klobster_king }];
  }
  if (kind === 'elite') {
    // nests are led by enemies with a trick of their own
    const pool = enemies.filter((e) => e.tier <= tier && e.minFloor <= floor + 1 && e.eliteTrait);
    const def = rng.pick(pool.length ? pool : enemies);
    const list = [{ def, elite: true, eliteName: eliteName(data, def.name, 'elite:' + rng.seed()) }];
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
    enc.forEach((e, i) => {
      const tr = e.elite && e.def.eliteTrait && data.balance.eliteTraits[e.def.eliteTrait];
      if (!tr) return;
      enemies[i].trait = e.def.eliteTrait;
      if (tr.start) enemies[i].statuses.push({ id: tr.start, turns: 99 });
      if (tr.move) enemies[i].extraMoves = [tr.move];
    });
    const fm = floorMod(data, run);
    if (fm && !(fm.id === 'dark' && hasRelic(run, data, 'torch'))) {
      for (const e of enemies) {
        if (fm.evasion) e.evasion = Math.min(0.6, e.evasion + fm.evasion);
        if (fm.atkMult) e.atk = Math.max(1, Math.round(e.atk * fm.atkMult));
        if (fm.spd) e.spd += fm.spd;
      }
    }
    const gear = equipmentBonus(save, data, run);
    const quirks = gearQuirks(data, run);
    // cursed gear is stronger but every fight costs the cats a little health
    const cursed = run.backpack.filter((b) => b.mods.includes('cursed') && data.itemById[b.id] && data.itemById[b.id].effect && data.itemById[b.id].effect.type === 'stat').length;
    if (cursed) for (const k of CAT_KEYS) if (run.party[k].hp > 1) run.party[k].hp = Math.max(1, run.party[k].hp - cursed);
    const cats = CAT_KEYS.map((k) => {
      const b = meta.catBonus(save, data, k);
      for (const s of Object.keys(gear)) b[s] = (b[s] || 0) + gear[s];
      return makeCatUnit(k, data.cats[k], run.party[k], b);
    });
    const c = createCombat({ cats, enemies, kind, companion: companionUnit(data, run), quirks });
    if (quirks.opener) for (const e of c.enemies) e.statuses.push({ id: 'sticky', turns: 1 });
    for (const cb of activeCombos(save, data, run)) {
      if (cb.effect.type !== 'combat_start_enemy_status') continue;
      for (const e of c.enemies) e.statuses.push({ id: cb.effect.status, turns: cb.effect.turns });
    }
    planIntents(c, rng, combatCtx(data, run));
    return c;
  });
}

// Equipment in the backpack (effect.type 'stat') boosts both cats for the whole run; crit is in percent points.
export function equipmentBonus(save, data, run) {
  const b = { atk: 0, def: 0, spd: 0, luck: 0, crit: 0 };
  for (const e of run.backpack) {
    const it = data.itemById[e.id];
    if (!it || !it.effect || it.effect.type !== 'stat') continue;
    const v = it.effect.value * (e.mods.includes('cursed') ? 1.5 : 1);
    if (it.effect.stat === 'crit') b.crit += v / 100;
    else if (b[it.effect.stat] !== undefined) b[it.effect.stat] += Math.floor(v);
    if (e.mods.includes('rainbow')) b.luck += 2;
  }
  // gear helps, but a backpack full of swords shouldn't trivialise the King
  const cap = data.balance.gearCap;
  for (const k of Object.keys(cap)) b[k] = Math.min(b[k], cap[k]);
  const combo = comboStatBonus(save, data, run);
  for (const k of Object.keys(combo)) if (b[k] !== undefined) b[k] += combo[k];
  const lead = data.balance.leader[run.leader];
  if (lead) for (const k of Object.keys(lead.stats || {})) b[k] += lead.stats[k];
  return b;
}

// Room initializers for the room types implemented so far. Unknown types fall back to a small coin find.
export const roomHandlers = {
  combat: { init: (save, data, run, room) => (room.combat = startCombat(save, data, run, 'combat')) },
  elite: { init: (save, data, run, room) => (room.combat = startCombat(save, data, run, 'elite')) },
  boss: { init: (save, data, run, room) => (room.combat = startCombat(save, data, run, 'boss')) },
  rest: { init: (save, data, run, room) => (room.phase = 'choose') },
  anomaly: { init: (...a) => initBackroom(...a) },
  shelf: { init: (...a) => initShelf(...a) },
  wash: { init: (...a) => initWash(...a) },
  event: { init: (...a) => initEvent(...a) },
  shop: { init: (...a) => initShop(...a) },
  loot: {
    init: (save, data, run, room) => {
      const n = withRunRng(run, (rng) => {
        const coins = Math.round(rng.int(3, 6 + run.floorNo) * meta.coinMult(save, data));
        run.coins += coins;
        run.stats.coinsFound += coins;
        room.reward = { coins, items: [] };
        return rng.weighted([[1, 50], [2, 35], [3, 15]])[0];
      });
      room.blocks = rollRunBlocks(save, data, run, n);
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
  room.combos = roomSequenceCombos(save, data, run, node.type);
  const handler = roomHandlers[node.type] || roomHandlers.loot;
  handler.init(save, data, run, room);
  afterBackpackChange(save, data, run);
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
  settleRoomBlocks(save, data);
  run.visited.push(room.nodeId);
  run.pos = room.nodeId;
  run.stats.rooms++;
  if (hasRelic(run, data, 'purse')) {
    run.coins += 3;
    run.stats.coinsFound += 3;
  }
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
      return item && item.effect ? moddedEffect(item, entry) : null;
    },
  };
  for (const f of runHooks.combat) Object.assign(hooks, f(save, data, run, actions));
  const ev = withRunRng(run, (rng) => resolveRound(c, actions, rng, ctx, hooks));
  syncParty(run, c);
  if (c.over === 'win') onCombatWin(save, data, run, room);
  else if (c.over === 'lose') {
    room.phase = 'lost';
    run.result = { outcome: 'lose' };
  }
  return ev;
}

// Modifiers change consumables: dirty weaker, cursed stronger but bites the user, glitchy swings either way.
export function moddedEffect(item, entry) {
  const eff = { ...item.effect, itemId: item.id };
  let mult = 1;
  if (entry.mods.includes('dirty')) mult *= 0.75;
  if (entry.mods.includes('cursed')) {
    mult *= 1.5;
    eff.selfDamage = 3;
  }
  if (entry.mods.includes('glitchy')) {
    let h = 0;
    for (const ch of entry.uid) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    mult *= h % 2 ? 1.6 : 0.6;
  }
  if (typeof eff.value === 'number' && eff.type !== 'revive') eff.value = Math.max(1, Math.round(eff.value * mult));
  return eff;
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
  const n = room.reward.blocksN;
  if (n) room.blocks = [...(room.blocks || []), ...rollRunBlocks(save, data, run, n, c.kind === 'boss' ? { minRarity: 'rare' } : {})];
  room.phase = 'reward';
  const helpers = { rollBlocks: (n, opts) => rollRunBlocks(save, data, run, n, opts) };
  for (const f of runHooks.afterWin) f(save, data, run, room, helpers);
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
  if (c.loot) coins += c.loot; // a sneaky companion's pickings
  if (c.quirks && c.quirks.coinpaw) coins += c.kills.length * c.quirks.coinpaw;
  const fm = floorMod(data, run);
  coins = Math.round(coins * meta.coinMult(save, data) * (fm && fm.coinMult ? fm.coinMult : 1));
  run.coins += coins;
  run.stats.coinsFound += coins;
  const items = [];
  const kind = c.kind;
  const drops = kind === 'boss' ? bal.bossConsumables : rng.chance(bal.consumableDrop[kind] || 0) ? 1 : 0;
  for (let i = 0; i < drops; i++) items.push(giveItem(save, data, run, pickConsumable(rng, data).id));
  // enemy stickers for the album: kept even if the run is lost
  const stickers = [];
  const stickerChance = { combat: 0.25, elite: 0.6, boss: 1 }[kind] || 0;
  const killed = c.enemies.filter((e) => e.hp <= 0 && !e.summoned);
  if (killed.length && rng.chance(stickerChance)) {
    // a sticker the album still needs, if this fight offers one
    const fresh = killed.filter((e) => !save.collection.stickers[e.id] && !run.stickers.includes(e.id));
    const id = rng.pick(fresh.length ? fresh : killed).id;
    run.stickers.push(id);
    stickers.push(id);
  }
  const extraChance = fm && fm.blockChance ? fm.blockChance : 0.12;
  const eliteBlocks = 1 + (hasRelic(run, data, 'torch') ? 1 : 0);
  return { coins, items, stickers, blocksN: kind === 'boss' ? 2 : kind === 'elite' ? eliteBlocks : rng.chance(extraChance) ? 1 : 0 };
}

// ---------- end ----------
// The coins a finished run brings home, before any selling.
export function runPayout(run, data) {
  const win = run.result.outcome === 'win';
  const lead = data.balance.leader[run.leader];
  const base = win ? run.coins : Math.floor(run.coins * data.balance.defeatCoinKeep);
  return Math.round(base * (1 + ((lead && lead.coinBonus) || 0)));
}

// keepUid: the one item saved from a defeat. sellUids: finds the player chose to sell at the Lavka's price (the sticker
// still counts as found, so selling never costs album progress).
export function finishRun(save, data, { keepUid = null, sellUids = [] } = {}) {
  const run = save.run;
  if (!run || !run.result) return null;
  const win = run.result.outcome === 'win';
  const coins = runPayout(run, data);
  const kept = win ? run.backpack.slice() : run.backpack.filter((b) => b.uid === keepUid).slice(0, 1);
  save.meta.coins += coins;
  save.stats.coinsEarned += coins;
  let soldFor = 0;
  for (const b of kept) {
    const key = addItem(save, b.id, b.mods);
    if (sellUids.includes(b.uid)) soldFor += sellItem(save, data, key, 1);
  }
  for (const s of run.stickers) grantSticker(save, data, s);
  save.stats.kills += run.stats.kills;
  if (win) {
    save.stats.wins++;
    save.meta.grit = 0;
  } else {
    save.stats.losses++;
    save.meta.grit = (save.meta.grit || 0) + 1;
  }
  const sparkles = win ? 3 : 1;
  save.meta.sparkles += sparkles;
  const summary = {
    outcome: run.result.outcome,
    coins,
    soldFor,
    sparkles,
    items: kept.map((b) => b.id),
    stickers: run.stickers.slice(),
    rooms: run.stats.rooms,
    kills: run.stats.kills,
    endedAt: new Date().toISOString(),
  };
  save.lastRun = summary;
  // someone may drop by the Lavka while the cats unpack (only if nobody is already waiting)
  if (!save.meta.customer) withMetaRng(save, (rng) => rollCustomer(save, data, rng));
  save.run = null;
  return summary;
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
