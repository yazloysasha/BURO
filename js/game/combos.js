// Combos: discovered by playing, recorded in the journal. Triggers: action sequences, same-round party actions,
// backpack sets, guest + item, room sequences, modifier + room, special kills.
import { runHooks } from './hooks.js';
import { aliveCats, aliveEnemies } from './combat.js';

export function discover(save, id) {
  if (save.combos.discovered.includes(id)) return false;
  save.combos.discovered.push(id);
  save.combos.recent = save.combos.recent || [];
  save.combos.recent.push(id);
  return true;
}

// ---------- matchers ----------
export function matchItem(matcher, entry, data) {
  const item = data.itemById[entry.id];
  if (!item) return false;
  const [kind, val] = matcher.split(':');
  if (kind === 'tag') return (item.tags || []).includes(val);
  if (kind === 'cat') return item.category === val;
  if (kind === 'id') return item.id === val;
  if (kind === 'mod') return (entry.mods || []).includes(val);
  return false;
}

const wild = (pattern, id) => (pattern === '*' ? true : pattern.endsWith('*') ? id.startsWith(pattern.slice(0, -1)) : pattern === id);

// Greedy distinct assignment of backpack entries to matchers. Returns used uids or null.
export function backpackMatch(trigger, backpack, data) {
  const used = new Set();
  const take = (matcher) => {
    const e = backpack.find((b) => !used.has(b.uid) && matchItem(matcher, b, data));
    if (!e) return false;
    used.add(e.uid);
    return true;
  };
  for (const m of trigger.all || []) if (!take(m)) return null;
  for (const [m, n] of Object.entries(trigger.count || {})) for (let i = 0; i < n; i++) if (!take(m)) return null;
  return [...used];
}

function guestMatch(trigger, save, run, data) {
  if (!save.meta.guests.some((g) => wild(trigger.animal, g))) return null;
  return backpackMatch({ count: { [trigger.item]: trigger.count || 1 } }, run.backpack, data);
}

// Combos currently satisfied by the backpack/guests (their passive effects apply while true).
export function activeCombos(save, data, run) {
  if (!run) return [];
  return (data.combos || []).filter((c) => {
    if (c.trigger.type === 'backpack') return !!backpackMatch(c.trigger, run.backpack, data);
    if (c.trigger.type === 'guest_item') return !!guestMatch(c.trigger, save, run, data);
    return false;
  });
}

export function comboStatBonus(save, data, run) {
  const b = {};
  for (const c of activeCombos(save, data, run)) {
    if (c.effect.type === 'stat') b[c.effect.stat] = (b[c.effect.stat] || 0) + c.effect.value;
  }
  return b;
}

export function comboValue(save, data, run, type) {
  return activeCombos(save, data, run).filter((c) => c.effect.type === type).reduce((s, c) => s + (c.effect.value || 0), 0);
}

// Backpack sets the player is one item away from, for a hint in the backpack (undiscovered ones stay a hint, not a recipe).
export function nearCombos(save, data, run) {
  const out = [];
  for (const c of data.combos || []) {
    if (c.trigger.type !== 'backpack' || backpackMatch(c.trigger, run.backpack, data)) continue;
    const needs = [...(c.trigger.all || []), ...Object.entries(c.trigger.count || {}).flatMap(([m, n]) => Array(n).fill(m))];
    const used = new Set();
    let have = 0;
    for (const m of needs) {
      const e = run.backpack.find((b) => !used.has(b.uid) && matchItem(m, b, data));
      if (e) {
        used.add(e.uid);
        have++;
      }
    }
    if (have >= 1 && have === needs.length - 1) out.push(c);
  }
  return out;
}

// Guest combos of an animal: shown on its card, so the puzzle is findable from the animal's side too.
export function guestCombos(data, animalId) {
  return (data.combos || []).filter((c) => c.trigger.type === 'guest_item' && wild(c.trigger.animal, animalId));
}

// One-shot effects of set combos fire once per run; passive ones are just discovered. Returns fired ids.
export function checkRunCombos(save, data, run, helpers) {
  const fired = [];
  run.flags.combosFired = run.flags.combosFired || {};
  for (const c of activeCombos(save, data, run)) {
    discover(save, c.id);
    if (run.flags.combosFired[c.id]) continue;
    const e = c.effect;
    if (e.type === 'stat' || e.type === 'combat_start_enemy_status') continue;
    run.flags.combosFired[c.id] = true;
    if (e.type === 'coins') run.coins += e.value;
    if (e.type === 'heal_party') for (const p of Object.values(run.party)) p.hp = Math.min(p.maxHp, p.hp + e.value);
    if (e.type === 'craft') {
      const used = c.trigger.type === 'backpack' ? backpackMatch(c.trigger, run.backpack, data) : null;
      if (used) {
        run.backpack = run.backpack.filter((b) => !used.includes(b.uid));
        helpers.addToBackpack(e.item);
        run.flags.combosFired[c.id] = false; // crafting can happen again with new ingredients
      }
    }
    fired.push(c.id);
  }
  return fired;
}

// Room-sequence combos fire when entering the room that completes the sequence.
export function roomSequenceCombos(save, data, run, enteringType) {
  const history = [...run.visited.map((id) => findType(run, id)), enteringType];
  const out = [];
  for (const c of data.combos || []) {
    if (c.trigger.type !== 'room_sequence') continue;
    const seq = c.trigger.rooms;
    if (history.length < seq.length) continue;
    if (!seq.every((t, i) => history[history.length - seq.length + i] === t)) continue;
    discover(save, c.id);
    const e = c.effect;
    if (e.type === 'status_party') for (const p of Object.values(run.party)) p.statuses = [...(p.statuses || []).filter((s) => s.id !== e.status), { id: e.status, turns: e.turns }];
    if (e.type === 'shop_discount') run.flags.shopDiscount = e.value;
    if (e.type === 'anomaly_hint') run.flags.anomalyHint = e.value;
    out.push(c.id);
  }
  return out;
}

function findType(run, id) {
  for (const row of run.map.floors) for (const n of row) if (n.id === id) return n.type;
  return null;
}

export function roomModCombo(save, data, run, room) {
  const c = (data.combos || []).find((x) => x.trigger.type === 'room_mod' && x.trigger.room === room && run.backpack.some((b) => b.mods.includes(x.trigger.mod)));
  if (!c) return null;
  discover(save, c.id);
  return c;
}

// ---------- combat ----------
const endsWith = (seq, tail) => tail.length <= seq.length && tail.every((a, i) => seq[seq.length - tail.length + i] === a);

function seqCombos(data, catKey, seq) {
  return (data.combos || []).filter((c) => c.trigger.type === 'action_sequence' && (!c.trigger.cat || c.trigger.cat === catKey) && endsWith(seq, c.trigger.actions));
}

function partyCombos(data, actions, c) {
  const alive = aliveCats(c).map((u) => u.key);
  return (data.combos || []).filter((cb) => cb.trigger.type === 'party_round' && alive.length === 2 && actions.peposya && actions.dudonya && actions.peposya.action === cb.trigger.peposya && actions.dudonya.action === cb.trigger.dudonya);
}

// Combos that picking `action` for this cat would complete right now, given its history and what the other cat chose.
export function combosForChoice(data, catKey, action, seq, otherAction) {
  const out = seqCombos(data, catKey, [...seq, action]);
  for (const cb of data.combos || []) {
    if (cb.trigger.type !== 'party_round' || !otherAction) continue;
    const mine = cb.trigger[catKey];
    const other = cb.trigger[catKey === 'peposya' ? 'dudonya' : 'peposya'];
    if (mine === action && other === otherAction) out.push(cb);
  }
  return out;
}

function applyNonDamage(e, c, actor, ev) {
  const statusUnits = (units, status, turns) => {
    for (const u of units) {
      const cur = u.statuses.find((s) => s.id === status);
      if (cur) cur.turns = Math.max(cur.turns, turns);
      else u.statuses.push({ id: status, turns, fresh: true });
      ev.push({ type: 'status', target: u.uid, status });
    }
  };
  if (e.type === 'status_party') statusUnits(aliveCats(c), e.status, e.turns);
  if (e.type === 'status_self' && actor) statusUnits([actor], e.status, e.turns);
  if (e.type === 'status_enemies') statusUnits(aliveEnemies(c), e.status, e.turns);
  if (e.type === 'heal_party') {
    for (const u of aliveCats(c)) {
      const before = u.hp;
      u.hp = Math.min(u.maxHp, u.hp + e.value);
      ev.push({ type: 'heal', target: u.uid, amount: u.hp - before, hp: u.hp });
    }
  }
  if (e.block) {
    for (const u of aliveCats(c)) {
      u.block += e.block;
      ev.push({ type: 'block', target: u.uid, amount: e.block });
    }
  }
}

runHooks.combat.push((save, data, run, actions) => {
  const c = run.room.combat;
  const party = partyCombos(data, actions, c);
  return {
    lastCombo: null,
    onRoundStart(cc, ev) {
      for (const cb of party) {
        if (cb.effect.type !== 'damage_mult' || cb.effect.block) {
          applyNonDamage(cb.effect, cc, null, ev);
          ev.push({ type: 'combo', id: cb.id });
          discover(save, cb.id);
        }
      }
    },
    damageMult(catKey, action, cc) {
      let m = 1;
      this.lastCombo = null;
      for (const cb of seqCombos(data, catKey, [...cc.seq[catKey], action])) {
        if (cb.effect.type === 'damage_mult') {
          m *= cb.effect.value;
          this.lastCombo = cb.id;
          discover(save, cb.id);
        }
      }
      for (const cb of party) {
        if (cb.effect.type !== 'damage_mult' || cb.trigger[catKey] !== action) continue;
        if (cb.trigger.target && cb.trigger.target !== catKey) continue;
        m *= cb.effect.value;
        this.lastCombo = cb.id;
        discover(save, cb.id);
      }
      return m;
    },
    onCatAction(catKey, action, ev, cc) {
      const actor = cc.cats.find((u) => u.key === catKey);
      for (const cb of seqCombos(data, catKey, cc.seq[catKey])) {
        if (cb.effect.type === 'damage_mult') continue;
        applyNonDamage(cb.effect, cc, actor, ev);
        ev.push({ type: 'combo', id: cb.id });
        discover(save, cb.id);
      }
    },
  };
});

// Kill combos are checked when a fight is won.
runHooks.afterWin.push((save, data, run, room, helpers) => {
  const c = room.combat;
  const log = c.killLog || [];
  for (const cb of data.combos || []) {
    if (cb.trigger.type !== 'kill') continue;
    const tr = cb.trigger;
    const hits = log.filter((k) => wild(tr.enemy, k.enemy) && byMatch(tr.by, k));
    let ok = hits.length > 0;
    if (tr.count) {
      const per = {};
      for (const k of hits) per[k.n] = (per[k.n] || 0) + 1;
      ok = Object.values(per).some((v) => v >= tr.count);
    }
    if (!ok) continue;
    discover(save, cb.id);
    const e = cb.effect;
    if (e.type === 'coins') {
      run.coins += e.value;
      room.reward.coins = (room.reward.coins || 0) + e.value;
    }
    if (e.type === 'sparkles') save.meta.sparkles += e.value;
    if (e.type === 'block') room.blocks = [...(room.blocks || []), ...helpers.rollBlocks(1, { minRarity: e.minRarity })];
    room.reward.combos = [...(room.reward.combos || []), cb.id];
  }
});

function byMatch(by, k) {
  const [kind, val] = by.split(':');
  if (kind === 'item') return !!k.item && wild(val, k.item);
  if (kind === 'action') return k.action === val;
  return false;
}

// ---------- journal milestones and quests ----------
export const MILESTONE_STEP = 10;

// Milestones reached but not claimed yet: 10, 20, 30, 40 discovered combos.
export function openMilestones(save) {
  const n = save.combos.discovered.length;
  const got = save.combos.milestones || [];
  const out = [];
  for (let m = MILESTONE_STEP; m <= n; m += MILESTONE_STEP) if (!got.includes(m)) out.push(m);
  return out;
}

// The puzzles worth chasing: up to three undiscovered set, guest and kill combos, as quests with their hint.
export function comboQuests(save, data) {
  const found = new Set(save.combos.discovered);
  return (data.combos || []).filter((c) => !found.has(c.id) && ['backpack', 'guest_item', 'kill', 'room_sequence'].includes(c.trigger.type)).slice(0, 3);
}
