// Player models shared by the UI bot (playtest/bot.mjs) and the fast simulator (playtest/sim.mjs). Pure decisions over
// (save, data): the drivers carry them out, through taps or through the game's own functions.
//   random   - presses whatever: lower bound, and a crash finder
//   greedy   - bites everything, chases loot and elites, barely defends: a newcomer in a hurry
//   cautious - heals early, avoids risk, hoards: a careful newcomer
//   smart    - reads intents, focuses targets, plays combos, spends items at the right moment: a good player
import { aliveCats, aliveEnemies, catByKey, intentPreview, CAT_KEYS } from '../../js/game/combat.js';
import { combatCtx } from '../../js/game/data.js';
import { availableNodes, findNode } from '../../js/game/map.js';
import { backpackSize, runFee } from '../../js/game/meta.js';
import { canAfford } from '../../js/game/rooms.js';
import { talentStatus, tierUpStatus, upgradeStatus, slotFound, slotKey } from '../../js/game/progress.js';
import { sellPrice, parseKey } from '../../js/game/collection.js';
import { combosForChoice } from '../../js/game/combos.js';

export const STRATEGIES = ['random', 'greedy', 'cautious', 'smart'];

const hpRatio = (u) => u.hp / u.maxHp;
const partyRatio = (run) => {
  const ps = Object.values(run.party);
  return ps.reduce((s, p) => s + p.hp / p.maxHp, 0) / ps.length;
};
const lowest = (list, f) => list.slice().sort((a, b) => f(a) - f(b))[0];
const isConsumable = (it) => it && it.effect && it.effect.type !== 'stat';
export const usableItems = (run, data) => run.backpack.filter((b) => isConsumable(data.itemById[b.id]));

// How good a backpack item is to the player right now: gear > useful consumable > trinket, price breaks ties.
function itemValue(data, id, mods = []) {
  const it = data.itemById[id];
  let v = it.price / 10;
  if (it.effect) v += it.effect.type === 'stat' ? 12 + it.effect.value * 4 : 10;
  if (mods.includes('golden')) v += it.price / 2;
  if (mods.includes('rainbow')) v += it.price;
  if (mods.includes('dirty')) v -= 1;
  return v;
}

const EVENT_VALUE = {
  greedy: { coins: 1.2, heal: 0.1, healPct: 2, damage: -0.5, maxHp: 2, item: 6, consumable: 6, sparkles: 4, sticker: 5, block: { common: 14, uncommon: 22, rare: 40, epic: 70 }, status: { sleepy: -1, scared: -1, sticky: -1, sharp: 2, lucky: 2, cozy: 1 } },
  cautious: { coins: 0.5, heal: 1, healPct: 25, damage: -4, maxHp: 4, item: 6, consumable: 6, sparkles: 2, sticker: 2, block: { common: 6, uncommon: 8, rare: 12, epic: 16 }, status: { sleepy: -6, scared: -6, sticky: -6, sharp: 2, lucky: 2, cozy: 4 } },
  smart: { coins: 1, heal: 0.6, healPct: 12, damage: -2, maxHp: 5, item: 7, consumable: 8, sparkles: 4, sticker: 4, block: { common: 10, uncommon: 18, rare: 32, epic: 60 }, status: { sleepy: -5, scared: -4, sticky: -4, sharp: 4, lucky: 4, cozy: 3 } },
};

function outcomeScore(o, w) {
  let v = 0;
  for (const e of o.effects || []) {
    for (const [k, n] of Object.entries(e)) {
      if (k === 'block') v += w.block[n] || w.block.common;
      else if (k === 'status') v += w.status[n] || 0;
      else if (k === 'item' || k === 'consumable') v += w[k];
      else if (k === 'sticker') v += w.sticker;
      else if (typeof w[k] === 'number') v += w[k] * n;
    }
  }
  return v;
}

const ROOM_PREF = {
  greedy: { loot: 10, elite: 9, shop: 7, event: 6, anomaly: 6, shelf: 5, wash: 3, combat: 4, rest: 2 },
  cautious: { loot: 10, rest: 9, event: 7, shop: 7, anomaly: 6, shelf: 6, wash: 7, combat: 3, elite: 1 },
  smart: { loot: 10, elite: 6, event: 7, anomaly: 7, shop: 6, shelf: 6, wash: 5, combat: 5, rest: 5 },
};

// The UI numbers action buttons in this order.
export const ACTION_ORDER = ['bite', 'hiss', 'purr', 'item', 'special'];

export function makeStrategy(name, rng) {
  const pref = ROOM_PREF[name];
  const skill = { random: 0.2, greedy: 0.6, cautious: 0.75, smart: 0.9 }[name];

  function chooseLeader() {
    if (name === 'random') return rng.pick(CAT_KEYS);
    if (name === 'greedy') return 'dudonya'; // more coins, better finds
    return 'peposya';
  }

  function chooseNode(save, data) {
    const run = save.run;
    const ids = availableNodes(run.map, run.pos);
    if (name === 'random') return rng.pick(ids);
    const ratio = partyRatio(run);
    const score = (id) => {
      const t = findNode(run.map, id).type;
      let v = pref[t] ?? 1;
      if (t === 'rest') v += ratio < 0.6 ? 8 : ratio > 0.9 ? -3 : 0;
      if (t === 'elite' && ratio < 0.6) v -= 6;
      if (t === 'combat' && ratio < 0.4) v -= 2;
      if (t === 'shop' && run.coins < 15) v -= 3;
      if (t === 'wash' && !run.backpack.some((b) => b.mods.includes('dirty')) && ratio > 0.85) v -= 3;
      return v + rng.next();
    };
    return ids.slice().sort((a, b) => score(b) - score(a))[0];
  }

  // --- combat -----------------------------------------------------------------
  function incoming(c, ctx) {
    const map = { peposya: 0, dudonya: 0 };
    for (const e of aliveEnemies(c)) {
      const it = e.intent;
      if (!it) continue;
      const dmg = intentPreview(c, e, ctx) || 0;
      if (it.type === 'attack' || it.type === 'debuff') map[it.target] = (map[it.target] || 0) + dmg;
      if (it.type === 'attack_all') for (const k of CAT_KEYS) map[k] += dmg;
    }
    return map;
  }

  function target(c, how = 'focus') {
    const list = aliveEnemies(c);
    if (how === 'random') return rng.pick(list);
    return lowest(list, (e) => e.hp + (e.block || 0) - (e.boss ? 100 : 0) * 0);
  }

  function takeItem(run, data, want, used) {
    for (const b of usableItems(run, data)) {
      if (used.has(b.uid)) continue;
      const eff = data.itemById[b.id].effect;
      if (want(eff)) return b;
    }
    return null;
  }

  function combatActions(save, data) {
    const run = save.run;
    const c = run.room.combat;
    const ctx = combatCtx(data, run);
    const actions = {};
    const used = new Set();
    const hit = incoming(c, ctx);
    const enemies = aliveEnemies(c);
    const lowestCat = lowest(aliveCats(c), hpRatio);
    const boss = enemies.some((e) => e.boss);

    for (const key of CAT_KEYS) {
      const cat = catByKey(c, key);
      if (!cat || cat.ko || cat.hp <= 0) continue;
      const canSpecial = cat.cooldown <= 0;
      const set = (action, t, itemUid) => {
        actions[key] = { action, target: t ? t.uid : enemies[0].uid };
        if (itemUid) {
          actions[key].itemUid = itemUid;
          used.add(itemUid);
        }
      };
      const useItem = (want) => {
        const b = takeItem(run, data, want, used);
        if (!b) return false;
        set('item', target(c), b.uid);
        return true;
      };
      if (name === 'random') {
        const opts = ['bite', 'bite', 'hiss', 'purr'];
        if (canSpecial) opts.push('special');
        if (usableItems(run, data).some((b) => !used.has(b.uid))) opts.push('item');
        const a = rng.pick(opts);
        if (a === 'item') useItem(() => true);
        else set(a, target(c, 'random'));
        continue;
      }
      if (name === 'greedy') {
        if (hpRatio(lowestCat) < 0.25 && useItem((e) => e.type === 'heal' || e.type === 'heal_all')) continue;
        if (key === 'dudonya' && hpRatio(lowestCat) < 0.25) {
          set('purr', target(c));
          continue;
        }
        if (key === 'peposya' && canSpecial && enemies.length >= 2) {
          set('special', target(c));
          continue;
        }
        set('bite', target(c));
        continue;
      }
      if (name === 'cautious') {
        if (hpRatio(lowestCat) < 0.45 && useItem((e) => e.type === 'heal' || e.type === 'heal_all')) continue;
        if (key === 'dudonya' && hpRatio(lowestCat) < 0.6) {
          set('purr', target(c));
          continue;
        }
        if (key === 'peposya' && hit.peposya + hit.dudonya >= 8) {
          set('purr', target(c));
          continue;
        }
        if (key === 'peposya' && canSpecial && enemies.length >= 2) {
          set('special', target(c));
          continue;
        }
        set('bite', target(c));
        continue;
      }
      // smart: survive first, crack shells with a hiss, then the strongest attack, with combos when they cost nothing
      const shelled = enemies.find((e) => e.statuses.some((s) => s.id === 'shell'));
      if (shelled && !Object.values(actions).some((a) => a.action === 'hiss')) {
        set('hiss', shelled);
        continue;
      }
      const danger = hit[lowestCat.key] >= lowestCat.hp;
      const bad = cat.statuses.some((s) => data.statusById[s.id].kind === 'debuff') || aliveCats(c).some((u) => u.statuses.some((s) => s.id === 'poisoned' || s.id === 'sleepy'));
      if (hpRatio(lowestCat) < 0.4 && useItem((e) => e.type === 'heal' || e.type === 'heal_all' || e.type === 'revive')) continue;
      if (c.cats.some((u) => u.ko) && useItem((e) => e.type === 'revive')) continue;
      if (danger && key === 'peposya') {
        set('purr', target(c));
        continue;
      }
      if (key === 'dudonya' && hpRatio(lowestCat) < 0.5) {
        set('purr', target(c));
        continue;
      }
      if (key === 'dudonya' && bad && canSpecial) {
        set('special', target(c));
        continue;
      }
      if ((boss || enemies.length >= 2) && useItem((e) => e.type === 'damage_all' || e.type === 'damage' || (e.type === 'status_enemy' && e.status === 'sleepy'))) continue;
      if (boss && useItem((e) => e.type === 'buff' && (e.status === 'sharp' || e.status === 'lucky'))) continue;
      if (key === 'peposya' && canSpecial && enemies.length >= 2) {
        set('special', target(c));
        continue;
      }
      const other = actions[key === 'peposya' ? 'dudonya' : 'peposya'];
      const biteCombo = combosForChoice(data, key, 'bite', c.seq[key], other && other.action).length > 0;
      if (biteCombo) {
        set('bite', target(c));
        continue;
      }
      const incomingBig = enemies.filter((e) => e.intent && (e.intent.type === 'attack' || e.intent.type === 'attack_all')).length >= 2 || (boss && hit.peposya + hit.dudonya >= 12);
      if (incomingBig && key === 'dudonya' && enemies.some((e) => !e.statuses.some((s) => s.id === 'scared'))) {
        set('hiss', target(c));
        continue;
      }
      set('bite', target(c));
    }
    return actions;
  }

  // --- puzzle rooms -------------------------------------------------------------
  // The backroom: how likely this player notices an anomaly of each subtlety, and how often they see ghosts.
  const notice = { random: [0.5, 0.5, 0.5], greedy: [0.85, 0.6, 0.35], cautious: [0.9, 0.75, 0.55], smart: [0.97, 0.88, 0.7] }[name];
  const falseAlarm = { random: 0.5, greedy: 0.05, cautious: 0.15, smart: 0.05 }[name];
  function backroomChoice(state, data) {
    if (!state.cur) return rng.next() < falseAlarm ? 'back' : 'forward';
    const a = data.anomalies.find((x) => x.id === state.cur);
    const p = Math.min(0.99, notice[a.level - 1] + (state.hints ? 0.25 : 0));
    return rng.next() < p ? 'back' : 'forward';
  }

  function shelfPick(room) {
    const s = room.shelf;
    const items = s.items.map((it, i) => ({ it, i })).filter((x) => !x.it.placed);
    const x = items[0];
    if (rng.next() < skill) return [x.i, x.it.target];
    return [x.i, rng.int(0, s.shelves.length - 1)];
  }

  function eventChoice(save, data, ev) {
    const run = save.run;
    const ok = ev.choices.map((c, i) => ({ c, i })).filter((x) => canAfford(save, run, x.c.cost));
    if (name === 'random') return rng.pick(ok).i;
    const w = EVENT_VALUE[name];
    const score = (c) => {
      let v = 0;
      for (const o of c.outcomes) v += o.p * outcomeScore(o, w);
      if (c.cost && c.cost.coins) v -= c.cost.coins * w.coins;
      if (c.cost && c.cost.sparkles) v -= c.cost.sparkles * w.sparkles;
      return v;
    };
    return ok.sort((a, b) => score(b.c) - score(a.c))[0].i;
  }

  function restChoice(save) {
    if (name === 'random') return rng.pick(['sleep', 'purr']);
    const threshold = name === 'cautious' ? 0.85 : 0.7;
    return partyRatio(save.run) < threshold ? 'sleep' : 'purr';
  }

  function washCats(save) {
    return name !== 'random' && partyRatio(save.run) < 0.9;
  }

  // Index of the next shop stock item to buy, or null to leave.
  function shopNext(save, data) {
    const run = save.run;
    const stock = run.room.shop.stock;
    const can = stock.map((s, i) => ({ s, i })).filter((x) => !x.s.sold && run.coins >= x.s.price);
    if (!can.length) return null;
    const space = run.backpack.length < backpackSize(save, data);
    const find = (f) => can.find((x) => f(x.s));
    const ratio = partyRatio(run);
    const isHealItem = (s) => s.kind === 'item' && ['heal', 'heal_all'].includes(data.itemById[s.id].effect.type);
    const isGear = (s) => s.kind === 'item' && data.itemById[s.id].effect.type === 'stat';
    let pick = null;
    if (name === 'random') pick = rng.next() < 0.5 ? rng.pick(can) : null;
    else if (name === 'greedy') pick = find((s) => s.kind === 'block') || (space && find(isGear));
    else if (name === 'cautious') pick = (ratio < 0.8 && find((s) => s.kind === 'heal')) || (space && find(isHealItem));
    else pick = (ratio < 0.65 && find((s) => s.kind === 'heal')) || (space && find(isGear)) || find((s) => s.kind === 'block') || (space && find(isHealItem));
    if (!pick) return null;
    if (pick.s.kind === 'item' && !space) return null;
    return pick.i;
  }

  // Backpack full: uid to drop for the new find, or null to sell the find.
  function fullBackpack(save, data, block) {
    const run = save.run;
    if (name === 'random') return rng.next() < 0.5 ? rng.pick(run.backpack).uid : null;
    const worst = lowest(run.backpack, (b) => itemValue(data, b.id, b.mods));
    return itemValue(data, block.id, block.mods) > itemValue(data, worst.id, worst.mods) ? worst.uid : null;
  }

  // --- run end ------------------------------------------------------------------
  function sellPlan(save, data) {
    const run = save.run;
    const seen = save.collection.seen;
    if (name === 'random') return run.backpack.filter(() => rng.next() < 0.5).map((b) => b.uid);
    if (name === 'cautious') return run.backpack.filter((b) => seen[b.id] && sellPrice(save, data, b.id) >= 5).map((b) => b.uid);
    return run.backpack.filter((b) => seen[b.id]).map((b) => b.uid); // keep the new, sell the known
  }

  function keepOne(save, data) {
    const run = save.run;
    if (!run.backpack.length) return null;
    if (name === 'random') return rng.pick(run.backpack).uid;
    const fresh = run.backpack.filter((b) => !save.collection.seen[b.id]);
    const pool = fresh.length ? fresh : run.backpack;
    return pool.slice().sort((a, b) => sellPrice(save, data, b.id) - sellPrice(save, data, a.id))[0].uid;
  }

  // --- between runs -------------------------------------------------------------
  // What to spend on, one thing at a time (drivers keep asking until null).
  function metaNext(save, data) {
    const coins = save.meta.coins;
    const reserve = runFee(save, data);
    // stickers first: free progress
    for (const page of data.album) {
      for (let i = 0; i < page.slots.length; i++) {
        if (slotFound(save, page.slots[i]) && !save.album.placed[slotKey(page.id, i)]) return { type: 'sticker', page: page.id, i };
      }
    }
    if (name !== 'random') {
      const t = tierUpStatus(save, data);
      const margin = name === 'cautious' ? 1.4 : 1;
      if (t && t.winsOk && coins >= t.tier.cost * margin && !(name === 'cautious' && save.stats.wins < t.tier.wins + 2)) return { type: 'tier' };
    }
    const upOrder = { random: null, greedy: ['backpack', 'lucky_charm', 'start_kit', 'first_aid', 'guest_room'], cautious: ['first_aid', 'start_kit', 'backpack', 'guest_room', 'lucky_charm'], smart: ['first_aid', 'start_kit', 'guest_room', 'backpack', 'lucky_charm'] }[name];
    if (upOrder || rng.next() < 0.5) {
      for (const id of upOrder || data.upgrades.map((u) => u.id)) {
        const up = data.upgrades.find((u) => u.id === id);
        const st = upgradeStatus(save, up);
        if (!st.maxed && st.cost <= coins - reserve) return { type: 'upgrade', id };
      }
    }
    const talentOrder = { random: null, greedy: ['pep_claws', 'shop_thrift', 'dud_luck', 'shop_charm', 'pep_eye', 'pep_fur'], cautious: ['pep_claws', 'pep_fur', 'dud_luck', 'dud_purr', 'dud_fluff', 'shop_thrift'], smart: ['pep_claws', 'pep_fur', 'pep_eye', 'dud_luck', 'dud_purr', 'pep_guard', 'pep_hide', 'dud_fluff', 'shop_thrift'] }[name];
    const allTalents = data.talents.flatMap((b) => b.nodes.map((n) => n.id));
    for (const id of talentOrder ? [...talentOrder, ...allTalents] : allTalents) {
      if (talentStatus(save, data, id).affordable && (talentOrder || rng.next() < 0.5)) return { type: 'talent', id };
    }
    const slots = 1 + data.upgrades.filter((u) => u.id === 'guest_room').reduce((s, u) => s + (save.meta.upgrades[u.id] || 0), 0);
    if (save.meta.guests.length < slots) {
      const owned = data.animals.filter((a) => save.collection.animals[a.id] && !save.meta.guests.includes(a.id));
      if (owned.length) {
        const rank = (a) => (a.passive.type === 'stat' ? { atk: 4, def: 3, hp: 2, crit: 3, luck: 2 }[a.passive.stat] || 1 : a.passive.type === 'coin_bonus' ? 2 : 1) * (1 + a.passive.value);
        const a = owned.slice().sort((x, y) => rank(y) - rank(x))[0];
        return { type: 'guest', id: a.id };
      }
    }
    if (name !== 'random' && coins < reserve) {
      const commons = Object.keys(save.collection.items).filter((k) => {
        const p = parseKey(k);
        const it = data.itemById[p.id];
        return it && it.rarity === 'common' && !p.mods.length && !(save.meta.showcase || []).includes(k);
      });
      if (commons.length) return { type: 'sellCommons', keys: commons };
    }
    return null;
  }

  // Who comes along on runs: the best fighter among the owned animals (random: whoever).
  function chooseCompanion(save, data) {
    const owned = data.animals.filter((a) => save.collection.animals[a.id]);
    if (!owned.length) return null;
    if (name === 'random') return rng.pick(owned).id;
    const order = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    const pref = { greedy: ['magic', 'splash', 'peck', 'sneak'], cautious: ['heal', 'shield', 'roar'], smart: ['magic', 'splash', 'heal', 'peck', 'roar'] }[name];
    const score = (a) => order.indexOf(a.rarity) * 10 + (pref.includes(a.assist) ? 5 - pref.indexOf(a.assist) : 0);
    return owned.slice().sort((x, y) => score(y) - score(x))[0].id;
  }

  // A customer at the counter: the key to sell them, or null.
  function customerSale(save, data, offer, matches) {
    const keys = Object.keys(save.collection.items).filter((k) => matches(k));
    if (!keys.length) return null;
    if (name === 'random') return rng.next() < 0.5 ? rng.pick(keys) : null;
    // sell a duplicate or a plain one first: the sticker counts once seen anyway
    return keys.sort((a, b) => offer(b) - offer(a))[0];
  }

  return { name, chooseCompanion, customerSale, chooseLeader, chooseNode, combatActions, backroomChoice, shelfPick, eventChoice, restChoice, washCats, shopNext, fullBackpack, sellPlan, keepOne, metaNext };
}
