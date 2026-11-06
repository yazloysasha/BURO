import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../js/core/rng.js';
import { computeDamage, createCombat, makeCatUnit, makeEnemyUnit, planIntents, resolveRound, aliveEnemies } from '../js/game/combat.js';
import { combatCtx } from '../js/game/data.js';
import { newSave } from '../js/core/save.js';
import { startRun, enterNode, playRound, completeRoom, finishRun, restChoice, canEnter } from '../js/game/run.js';
import { availableNodes, findNode } from '../js/game/map.js';
import { runFee, runIsFree } from '../js/game/meta.js';
import { loadData } from './helpers.mjs';
import { openRunBlock, resolveFullBackpack } from '../js/game/blocks.js';
import { chooseEvent, tapAnomaly, placeOnShelf } from '../js/game/rooms.js';

const data = loadData();
const ctx = combatCtx(data, { floorNo: 1, tier: 1 });

// RNG stub returning a fixed sequence
const seq = (...vals) => ({ i: 0, next() { return vals[this.i++ % vals.length]; } });

const unit = (o) => ({ atk: 10, def: 0, luck: 0, crit: 0, evasion: 0, block: 0, statuses: [], ...o });

test('damage: attack minus defense, never below 1', () => {
  // evade roll 0.99 (no miss), variance roll 0.5 (x1.0), crit roll 0.99 (no crit)
  assert.equal(computeDamage(unit({}), unit({ def: 3 }), 1, seq(0.99, 0.5, 0.99), ctx).dmg, 7);
  assert.equal(computeDamage(unit({ atk: 2 }), unit({ def: 50 }), 1, seq(0.99, 0.5, 0.99), ctx).dmg, 1);
});

test('damage: crit multiplies before defense', () => {
  const r = computeDamage(unit({ crit: 1 }), unit({ def: 2 }), 1, seq(0.99, 0.5, 0.0), ctx);
  assert.ok(r.crit);
  assert.equal(r.dmg, Math.round(10 * data.balance.critMult) - 2);
});

test('damage: evasion -> miss; sticky targets cannot evade', () => {
  assert.ok(computeDamage(unit({}), unit({ evasion: 0.5 }), 1, seq(0.1, 0.5, 0.99), ctx).miss);
  const stuck = unit({ evasion: 0.5, statuses: [{ id: 'sticky', turns: 2 }] });
  assert.ok(!computeDamage(unit({}), stuck, 1, seq(0.1, 0.5, 0.99), ctx).miss);
});

test('damage: block absorbs first', () => {
  const r = computeDamage(unit({}), unit({ block: 4 }), 1, seq(0.99, 0.5, 0.99), ctx);
  assert.equal(r.blocked, 4);
  assert.equal(r.dmg, 6);
});

test('statuses: scared lowers attack, strong raises it', () => {
  const base = computeDamage(unit({}), unit({}), 1, seq(0.99, 0.5, 0.99), ctx).dmg;
  const scared = computeDamage(unit({ statuses: [{ id: 'scared', turns: 1 }] }), unit({}), 1, seq(0.99, 0.5, 0.99), ctx).dmg;
  const strong = computeDamage(unit({ statuses: [{ id: 'strong', turns: 1 }] }), unit({}), 1, seq(0.99, 0.5, 0.99), ctx).dmg;
  assert.ok(scared < base && strong > base);
});

function freshCombat(enemyIds, seed = 'c') {
  const cats = ['peposya', 'dudonya'].map((k) => makeCatUnit(k, data.cats[k], { hp: data.cats[k].stats.hp, maxHp: data.cats[k].stats.hp }));
  const enemies = enemyIds.map((id, i) => makeEnemyUnit(data.enemyById[id], 'e' + (i + 1), { balance: data.balance }));
  const c = createCombat({ cats, enemies });
  const rng = Rng.fromSeed(seed);
  planIntents(c, rng, ctx);
  return { c, rng };
}

test('enemies always show an intent before the player acts', () => {
  const { c } = freshCombat(['klobster', 'spider', 'moth']);
  for (const e of c.enemies) assert.ok(e.intent && e.intent.type);
});

test('combat is fully deterministic by seed + actions', () => {
  const play = () => {
    const { c, rng } = freshCombat(['klobster', 'wasp'], 'det');
    const log = [];
    for (let i = 0; i < 30 && !c.over; i++) {
      const t = aliveEnemies(c)[0].uid;
      log.push(...resolveRound(c, { peposya: { action: 'bite', target: t }, dudonya: { action: i % 3 ? 'bite' : 'purr', target: t } }, rng, ctx));
    }
    return { log, c };
  };
  const a = play();
  const b = play();
  assert.deepEqual(a.log, b.log);
  assert.deepEqual(a.c, b.c);
});

test('sleepy skips exactly one action', () => {
  const { c, rng } = freshCombat(['klobster']);
  c.cats[0].statuses.push({ id: 'sleepy', turns: 1 });
  c.enemies[0].intent = { type: 'defend', block: 1 };
  const ev = resolveRound(c, { peposya: { action: 'bite', target: 'e1' }, dudonya: { action: 'purr' } }, rng, ctx);
  assert.ok(ev.some((e) => e.type === 'skip' && e.actor === 'peposya'));
  assert.ok(!c.cats[0].statuses.some((s) => s.id === 'sleepy'));
});

test('boss enters phase 2 at half HP and can summon minions', () => {
  const { c, rng } = freshCombat(['klobster_king'], 'boss');
  const boss = c.enemies[0];
  boss.hp = Math.floor(boss.maxHp * 0.5) + 1;
  boss.intent = { type: 'defend', block: 0 };
  c.cats[0].atk = 40;
  const ev = resolveRound(c, { peposya: { action: 'bite', target: boss.uid }, dudonya: { action: 'purr' } }, rng, ctx);
  if (boss.hp > 0) {
    assert.equal(boss.phase, 1);
    assert.ok(ev.some((e) => e.type === 'phase'));
  }
  // summon check
  const s2 = freshCombat(['klobster_king'], 'sum');
  s2.c.enemies[0].intent = { type: 'summon', enemy: 'klobster', max: 2 };
  resolveRound(s2.c, { peposya: { action: 'purr' }, dudonya: { action: 'purr' } }, s2.rng, ctx);
  assert.equal(s2.c.enemies.length, 2);
  assert.ok(s2.c.enemies[1].summoned);
});

test('the mini-boss is beatable by plain play from a prepared party (gear, grit, a few upgrades)', () => {
  let wins = 0;
  for (let s = 0; s < 40; s++) {
    const { c, rng } = freshCombat(['klobster_king'], 'beat' + s);
    for (const u of c.cats) {
      u.atk += 3;
      u.maxHp += 20;
      u.hp = u.maxHp;
    }
    for (let i = 0; i < 80 && !c.over; i++) {
      const alive = aliveEnemies(c);
      const minion = alive.find((e) => e.summoned);
      const t = (minion || alive[0]).uid;
      const dud = c.cats[1];
      const pep = c.cats[0];
      const lowHp = Math.min(pep.hp / pep.maxHp, dud.hp / dud.maxHp) < 0.5;
      resolveRound(c, {
        peposya: { action: pep.cooldown === 0 && alive.length > 1 ? 'special' : 'bite', target: t },
        dudonya: { action: lowHp ? 'purr' : dud.cooldown === 0 ? 'special' : 'bite', target: t },
      }, rng, ctx);
    }
    if (c.over === 'win') wins++;
  }
  assert.ok(wins >= 20, 'boss wins with a prepared party: ' + wins + '/40');
});

// ---------- run lifecycle ----------
function autoplayRun(seed, strategy = 'smart') {
  const save = newSave(new Date('2026-11-02T10:00:00Z'), seed);
  startRun(save, data);
  const run = save.run;
  let guard = 0;
  while (!run.result && guard++ < 400) {
    if (!run.room) {
      const opts = availableNodes(run.map, run.pos);
      const pick = opts.map((id) => findNode(run.map, id)).sort((a, b) => (a.type === 'rest' ? -1 : 0) - (b.type === 'rest' ? -1 : 0))[0];
      assert.ok(canEnter(run, pick.id));
      enterNode(save, data, pick.id);
      continue;
    }
    const room = run.room;
    if (room.combat && !room.combat.over) {
      const c = room.combat;
      const alive = aliveEnemies(c);
      const t = (alive.find((e) => e.summoned) || alive[0]).uid;
      const pep = c.cats[0], dud = c.cats[1];
      const low = c.cats.some((u) => !u.ko && u.hp / u.maxHp < 0.45);
      const potion = run.backpack.find((b) => { const e = data.itemById[b.id].effect; return e && ['heal', 'heal_all', 'revive'].includes(e.type); });
      const actions = strategy === 'smart'
        ? {
            peposya: { action: pep.cooldown === 0 && alive.length > 1 ? 'special' : 'bite', target: t },
            dudonya: low && potion && c.cats.some((u) => u.ko) ? { action: 'item', itemUid: potion.uid, target: t } : { action: low ? 'purr' : 'bite', target: t },
          }
        : { peposya: { action: 'hiss', target: t }, dudonya: { action: 'hiss' } };
      if (strategy !== 'smart') for (const u of c.cats) if (!u.ko) u.hp = Math.min(u.hp, 2);
      playRound(save, data, actions);
      continue;
    }
    if (room.type === 'rest' && room.phase === 'choose') {
      restChoice(save, data, 'sleep');
      continue;
    }
    if (room.type === 'event' && room.phase === 'choose') {
      if (!chooseEvent(save, data, 0)) chooseEvent(save, data, 1);
      continue;
    }
    if (room.type === 'anomaly' && room.phase === 'play') {
      tapAnomaly(save, data, room.anomaly.cells.findIndex((c) => !c.tapped));
      continue;
    }
    if (room.type === 'shelf' && room.phase === 'play') {
      const i = room.shelf.items.findIndex((x) => !x.placed);
      placeOnShelf(save, data, i, room.shelf.items[i].target);
      continue;
    }
    if (room.phase === 'lost') break;
    if (room.blocks) room.blocks.forEach((b, i) => { const r = openRunBlock(save, data, i); if (r && r.needsSpace) resolveFullBackpack(save, data, i, null); });
    completeRoom(save, data);
  }
  return save;
}

test('a run can be completed end-to-end and rewards land in meta', () => {
  let wins = 0, losses = 0;
  for (let s = 0; s < 30; s++) {
    const save = autoplayRun('auto' + s);
    assert.ok(save.run.result, 'run must end');
    const outcome = save.run.result.outcome;
    const coinsInRun = save.run.coins;
    const keep = save.run.backpack[0] ? save.run.backpack[0].uid : null;
    const sum = finishRun(save, data, { keepUid: keep });
    assert.equal(save.run, null);
    if (outcome === 'win') {
      wins++;
      assert.equal(sum.coins, coinsInRun);
    } else {
      losses++;
      assert.equal(sum.coins, Math.floor(coinsInRun * data.balance.defeatCoinKeep));
      assert.ok(sum.items.length <= 1);
    }
    assert.equal(save.meta.coins, sum.coins);
  }
  assert.ok(wins >= 1 && losses >= 1, `a fresh party can do either: wins ${wins}, losses ${losses}`);
});

test('defeat never dead-ends: next run is affordable or free', () => {
  const save = autoplayRun('lose', 'passive');
  assert.equal(save.run.result.outcome, 'lose');
  finishRun(save, data, {});
  save.meta.coins = 0;
  assert.ok(runIsFree(save, data));
  startRun(save, data);
  assert.ok(save.run);
});

test('fee: first run free, then charged by tier', () => {
  const save = newSave(new Date(), 1);
  assert.ok(runIsFree(save, data));
  save.meta.runsStarted = 1;
  save.meta.coins = 100;
  assert.ok(!runIsFree(save, data));
  const fee = runFee(save, data);
  startRun(save, data);
  assert.equal(save.meta.coins, 100 - fee);
});

test('run RNG state lives in the save: reload mid-combat gives identical outcomes', () => {
  const save = newSave(new Date(), 'reload');
  startRun(save, data);
  enterNode(save, data, availableNodes(save.run.map, null)[0]);
  const snapshot = JSON.stringify(save);
  const act = (s) => {
    const t = aliveEnemies(s.run.room.combat)[0].uid;
    return playRound(s, data, { peposya: { action: 'bite', target: t }, dudonya: { action: 'bite', target: t } });
  };
  const a = act(save);
  const b = act(JSON.parse(snapshot));
  assert.deepEqual(a, b);
});
