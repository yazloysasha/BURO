// Companions, gear quirks, relics, elite traits, floor moods, the second mini-boss, customers, combo milestones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../js/core/rng.js';
import { newSave, parseSave, serializeSave } from '../js/core/save.js';
import { makeCatUnit, makeEnemyUnit, createCombat, planIntents, resolveRound, computeDamage } from '../js/game/combat.js';
import { combatCtx } from '../js/game/data.js';
import { startRun, startCombat, enterNode, playRound, addToBackpack, finishRun, gearQuirks, companionUnit, hasRelic, completeRoom } from '../js/game/run.js';
import { addItem, equipItem, sellItem } from '../js/game/collection.js';
import { rollCustomer, customerOffer, sellToCustomer, wantMatches } from '../js/game/customers.js';
import { openMilestones, comboQuests } from '../js/game/combos.js';
import { claimComboMilestone } from '../js/game/blocks.js';
import { loadData } from './helpers.mjs';

const data = loadData();
const ctx = combatCtx(data, null);

function fight(enemyIds, { companion = null, quirks = {} } = {}, seed = 'f') {
  const cats = ['peposya', 'dudonya'].map((k) => makeCatUnit(k, data.cats[k], { hp: data.cats[k].stats.hp, maxHp: data.cats[k].stats.hp }));
  const enemies = enemyIds.map((id, i) => makeEnemyUnit(data.enemyById[id], 'e' + (i + 1), { balance: data.balance }));
  const c = createCombat({ cats, enemies, companion, quirks });
  const rng = Rng.fromSeed(seed);
  planIntents(c, rng, ctx);
  return { c, rng };
}

const guard = { peposya: { action: 'purr' }, dudonya: { action: 'purr' } };

test('every animal has a companion move and the engine plays it on its schedule', () => {
  for (const a of data.animals) assert.ok(data.balance.assist.value[a.rarity] && a.assist, a.id);
  const unit = companionUnit(data, { companion: 'owl_grey', backpack: [] });
  assert.equal(unit.assist.type, 'peck');
  const { c, rng } = fight(['fly'], { companion: unit });
  let assists = 0;
  for (let r = 0; r < 6 && !c.over; r++) assists += resolveRound(c, guard, rng, ctx).filter((e) => e.type === 'assist').length;
  assert.equal(assists, 2, 'every 3 rounds: round 1 and round 4');
  assert.ok(c.enemies[0].hp < c.enemies[0].maxHp, 'it pecked while the cats only defended');
  assert.ok(!c.cats.some((u) => u.uid === 'companion'), 'not a target for the enemies');
});

test('a relic bouquet makes the companion act every round', () => {
  const run = { companion: 'cow', backpack: [{ uid: 'x', id: 'friend_bouquet', mods: [] }] };
  assert.ok(hasRelic(run, data, 'bouquet'));
  assert.equal(companionUnit(data, run).assist.every, 1);
});

test('gear quirks: thorns prick back, guardian saves a knock-out once, glitchy gear mirrors moves', () => {
  const { c, rng } = fight(['klobster'], { quirks: { thorns: 2 } }, 'thorns');
  let pricked = 0;
  for (let r = 0; r < 6 && !c.over; r++) pricked += resolveRound(c, guard, rng, ctx).filter((e) => e.source === 'thorns').length;
  assert.ok(pricked > 0);
  const g = fight(['klobster'], { quirks: { guardian: 1 } }, 'guard');
  g.c.cats[0].hp = 1;
  g.c.cats[1].hp = 1;
  g.c.cats[0].def = g.c.cats[1].def = 0;
  g.c.enemies[0].atk = 50;
  let saves = 0;
  for (let r = 0; r < 4 && !g.c.over; r++) saves += resolveRound(g.c, guard, g.rng, ctx).filter((e) => e.quirk === 'guardian').length;
  assert.equal(saves, 1, 'once per fight per charm');
  const save = newSave(new Date(), 'q');
  startRun(save, data);
  const gear = data.items.find((i) => i.effect && i.effect.type === 'stat' && i.effect.quirk === 'echo');
  addToBackpack(save, data, save.run, gear.id, ['glitchy']);
  assert.deepEqual(gearQuirks(data, save.run), { echo: 1, mirror: 1 });
  assert.ok(data.items.filter((i) => i.effect && i.effect.quirk).length >= 30, 'rare+ gear often has a quirk');
});

test('shelled elites shrug off hits until scared; a hiss cracks the shell', () => {
  const { c, rng } = fight(['mimic']);
  const m = c.enemies[0];
  m.statuses.push({ id: 'shell', turns: 99 });
  const hit = computeDamage(c.cats[0], m, 3, rng, ctx, { noMiss: true });
  assert.equal(hit.dmg, 1);
  resolveRound(c, { peposya: { action: 'hiss', target: m.uid }, dudonya: { action: 'purr' } }, rng, ctx);
  assert.ok(!m.statuses.some((s) => s.id === 'shell'), 'scared → no shell');
  assert.ok(computeDamage(c.cats[0], m, 3, rng, ctx, { noMiss: true }).dmg > 1);
});

test('webbed cats lose a turn, blinded ones miss more', () => {
  const { c, rng } = fight(['klobster']);
  c.cats[0].statuses.push({ id: 'webbed', turns: 2 });
  const ev = resolveRound(c, { peposya: { action: 'bite', target: 'e1' }, dudonya: { action: 'purr' } }, rng, ctx);
  assert.ok(ev.some((e) => e.type === 'skip' && e.actor === 'peposya' && e.reason === 'webbed'));
  let miss = 0;
  const t = fight(['beetle'], {}, 'blind');
  t.c.cats[0].statuses.push({ id: 'blinded', turns: 99 });
  for (let i = 0; i < 400; i++) if (computeDamage(t.c.cats[0], t.c.enemies[0], 1, t.rng, ctx).miss) miss++;
  assert.ok(miss > 120, 'misses: ' + miss);
});

test('nests always have a trick; floors can carry a mood; the second mini-boss shows up from run 3', () => {
  for (const e of data.enemies.filter((x) => x.eliteTrait)) assert.ok(data.balance.eliteTraits[e.eliteTrait], e.id);
  const save = newSave(new Date(), 'elite');
  startRun(save, data);
  const node = save.run.map.floors[3][0];
  node.type = 'elite';
  save.run.map.floors[0][0].up = [node.id];
  save.run.pos = save.run.map.floors[0][0].id;
  enterNode(save, data, node.id);
  assert.ok(save.run.room.combat.enemies[0].trait, 'elite with a trait');
  let moods = 0;
  const bosses = new Set();
  for (let i = 0; i < 40; i++) {
    const s = newSave(new Date(), 'm' + i);
    s.meta.runsStarted = i < 2 ? i : 5;
    startRun(s, data);
    moods += Object.keys(s.run.map.floorMods).length;
    if (i < 2) assert.equal(s.run.boss, 'klobster_king');
    else bosses.add(s.run.boss);
  }
  assert.ok(moods > 10 && moods < 80, 'moods ' + moods);
  assert.deepEqual([...bosses].sort(), ['klobster_king', 'moth_queen']);
});

test('the purse relic pays for every room; the torch adds a block to nests', () => {
  const save = newSave(new Date(), 'purse');
  startRun(save, data);
  addToBackpack(save, data, save.run, 'surprise_box');
  const node = save.run.map.floors[0][0];
  node.type = 'rest';
  enterNode(save, data, node.id);
  const before = save.run.coins;
  completeRoom(save, data);
  assert.equal(save.run.coins, before + 3);
});

test('each cat takes its own gear into the run and equipped copies cannot be sold', () => {
  const fresh = newSave(new Date(), 'equipment');
  const bow = addItem(fresh, 'gold_bow');
  const shield = addItem(fresh, 'shield_01a');
  assert.equal(equipItem(fresh, data, 'peposya', bow), true);
  assert.equal(equipItem(fresh, data, 'dudonya', bow), false);
  assert.equal(equipItem(fresh, data, 'dudonya', shield), true);

  const save = parseSave(serializeSave(fresh));
  save.meta.customer = { want: { kind: 'category', value: 'weapon_tool' }, mult: 2 };
  assert.equal(customerOffer(save, data, bow), 0);
  assert.equal(sellToCustomer(save, data, bow), 0);
  addItem(save, 'shield_01a');
  const price = sellItem(save, data, shield, 2);
  assert.ok(price > 0);
  assert.equal(save.collection.items[shield], 1);

  const run = startRun(save, data);
  run.floorNo = 1;
  assert.equal(equipItem(save, data, 'dudonya', null), true);
  const { cats: [pep, dud] } = startCombat(save, data, run, 'combat');
  assert.equal(pep.crit, data.cats.peposya.stats.crit + 0.04);
  assert.equal(dud.crit, data.cats.dudonya.stats.crit);
  assert.equal(pep.def, data.cats.peposya.stats.def);
  assert.equal(dud.def, data.cats.dudonya.stats.def + 1);
});

test('customers want something specific, pay a premium once, and only for a match', () => {
  const save = newSave(new Date(), 'cust');
  const rng = Rng.fromSeed('cust');
  addItem(save, 'valerian', ['shiny']);
  addItem(save, 'sword_01a');
  let c = null;
  for (let i = 0; i < 50 && !(c && c.want.kind === 'category' && c.want.value === 'potion'); i++) {
    save.meta.customer = null;
    c = rollCustomer(save, data, rng);
  }
  assert.equal(c.want.value, 'potion');
  assert.ok(c.mult >= data.balance.customers.mult[0] && c.mult <= data.balance.customers.mult[1]);
  assert.ok(wantMatches(data, c.want, 'valerian|shiny'));
  assert.equal(customerOffer(save, data, 'sword_01a'), 0);
  const offer = customerOffer(save, data, 'valerian|shiny');
  const coins = save.meta.coins;
  assert.equal(sellToCustomer(save, data, 'valerian|shiny'), offer);
  assert.equal(save.meta.coins, coins + offer);
  assert.equal(save.meta.customer, null);
  assert.ok(save.collection.seen.valerian, 'the find stays in the codex');
});

test('a finished run may bring a customer to the Lavka', () => {
  let visits = 0;
  for (let i = 0; i < 30; i++) {
    const save = newSave(new Date(), 'visit' + i);
    startRun(save, data);
    save.run.result = { outcome: 'win' };
    finishRun(save, data, {});
    if (save.meta.customer) visits++;
  }
  assert.ok(visits > 12 && visits < 30, 'visits ' + visits);
});

test('journal: a reward every 10 combos, claimed once; quests list unfinished puzzles', () => {
  const save = newSave(new Date(), 'mile');
  save.combos.discovered = data.combos.slice(0, 21).map((c) => c.id);
  assert.deepEqual(openMilestones(save), [10, 20]);
  const s0 = save.meta.sparkles;
  const r = claimComboMilestone(save, data, 10);
  assert.ok(r && ['rare', 'epic', 'legendary'].includes(r.block.rarity));
  assert.equal(save.meta.sparkles, s0 + 10);
  assert.equal(claimComboMilestone(save, data, 10), null);
  assert.deepEqual(openMilestones(save), [20]);
  const q = comboQuests(save, data);
  assert.ok(q.length === 3 && q.every((c) => !save.combos.discovered.includes(c.id)));
});

test('a whole run with a companion, quirky gear and a relic plays through', () => {
  const save = newSave(new Date(), 'whole');
  save.collection.animals.dragon_red = 1;
  save.meta.companion = 'dragon_red';
  startRun(save, data);
  assert.equal(save.run.companion, 'dragon_red');
  addToBackpack(save, data, save.run, 'nine_lives_pearls');
  const node = save.run.map.floors[0][0];
  enterNode(save, data, node.id);
  for (let i = 0; i < 80 && save.run.room.combat && !save.run.room.combat.over; i++) playRound(save, data, { peposya: { action: 'bite', target: save.run.room.combat.enemies.find((e) => e.hp > 0).uid }, dudonya: { action: 'bite', target: save.run.room.combat.enemies.find((e) => e.hp > 0).uid } });
  assert.ok(save.run.room.combat.over);
  assert.ok(save.run.room.combat.companion.id === 'dragon_red');
});
