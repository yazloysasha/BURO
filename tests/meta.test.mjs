import test from 'node:test';
import assert from 'node:assert/strict';
import { newSave, parseSave, SAVE_VERSION } from '../js/core/save.js';
import { placeSticker, pageState, slotFound, learnTalent, talentStatus, actionMods, buyUpgrade, tierUp, tierUpStatus, buySkin, equipSkin, unplacedCount } from '../js/game/progress.js';
import { startRun, enterNode } from '../js/game/run.js';
import { combatCtx } from '../js/game/data.js';
import { backpackSize, catBonus, runFee, luckBonus } from '../js/game/meta.js';
import { catLine } from '../js/game/namegen.js';
import { addItem, grantAnimal, grantSticker } from '../js/game/collection.js';
import { loadData } from './helpers.mjs';

const data = loadData();

test('album: >= 20 pages, 6-12 slots each, every slot refers to existing content, rewards valid', () => {
  assert.ok(data.album.length >= 20);
  for (const p of data.album) {
    assert.ok(p.slots.length >= 6 && p.slots.length <= 12, p.id + ' ' + p.slots.length);
    for (const s of p.slots) {
      const ok = s.kind === 'animal' ? data.animalById[s.id] : s.kind === 'enemy' ? data.enemyById[s.id] : data.itemById[s.id];
      assert.ok(ok, p.id + ' ' + s.kind + ':' + s.id);
    }
    if (p.reward.type === 'skin') assert.ok(data.skins.some((x) => x.id === p.reward.id), p.reward.id);
    else assert.equal(p.reward.type, 'perm_bonus');
  }
});

test('album: stickers are placed by hand; a full page pays its reward once', () => {
  const s = newSave(new Date(), 1);
  const page = data.album.find((p) => p.reward.type === 'perm_bonus' && p.reward.effect.type === 'backpack_slot');
  assert.equal(placeSticker(s, data, page.id, 0), null, 'not found yet');
  for (const sl of page.slots) {
    if (sl.kind === 'animal') grantAnimal(s, data, sl.id);
    else if (sl.kind === 'enemy') grantSticker(s, data, sl.id);
    else addItem(s, sl.id);
  }
  assert.ok(page.slots.every((sl) => slotFound(s, sl)));
  assert.ok(unplacedCount(s, data) >= page.slots.length);
  const before = backpackSize(s, data);
  let res;
  page.slots.forEach((_, i) => (res = placeSticker(s, data, page.id, i)));
  assert.ok(res.completed);
  assert.equal(pageState(s, page).completed, true);
  assert.equal(backpackSize(s, data), before + 1);
  assert.equal(placeSticker(s, data, page.id, 0), null);
});

test('album skin page unlocks the skin', () => {
  const s = newSave(new Date(), 1);
  const page = data.album.find((p) => p.reward.type === 'skin');
  for (const sl of page.slots) {
    if (sl.kind === 'animal') grantAnimal(s, data, sl.id);
    else if (sl.kind === 'enemy') grantSticker(s, data, sl.id);
    else addItem(s, sl.id);
  }
  page.slots.forEach((_, i) => placeSticker(s, data, page.id, i));
  assert.ok(s.meta.ownedSkins.includes(page.reward.id));
  assert.ok(equipSkin(s, 'peposya', page.reward.id));
});

test('talents: 3 branches of 6-8 nodes; prerequisites and sparkle costs', () => {
  assert.equal(data.talents.length, 3);
  for (const b of data.talents) assert.ok(b.nodes.length >= 6 && b.nodes.length <= 8, b.id);
  const s = newSave(new Date(), 1);
  assert.equal(learnTalent(s, data, 'pep_claws'), false, 'no sparkles');
  s.meta.sparkles = 100;
  assert.equal(learnTalent(s, data, 'pep_fur'), false, 'requires pep_claws');
  assert.ok(learnTalent(s, data, 'pep_claws'));
  assert.equal(s.meta.sparkles, 97);
  assert.equal(catBonus(s, data, 'peposya').atk, 1);
  assert.equal(catBonus(s, data, 'dudonya').atk, 0);
  assert.ok(talentStatus(s, data, 'pep_fur').affordable);
});

test('talents that change actions are snapshotted into the run and used by combat', () => {
  const s = newSave(new Date(), 1);
  s.meta.sparkles = 999;
  for (const id of ['pep_claws', 'pep_eye', 'pep_tornado', 'pep_tornado', 'pep_tireless']) learnTalent(s, data, id);
  const mods = actionMods(s, data);
  assert.equal(mods.peposya.special.cooldown, -1);
  startRun(s, data);
  const ctx = combatCtx(data, s.run);
  assert.equal(ctx.cats.peposya.actions.special.cooldown, data.cats.peposya.actions.special.cooldown - 1);
  assert.ok(Math.abs(ctx.cats.peposya.actions.special.power - (data.cats.peposya.actions.special.power + 0.3)) < 1e-9);
  assert.equal(data.cats.peposya.actions.special.cooldown, 3, 'base data untouched');
});

test('upgrades cost coins and raise limits', () => {
  const s = newSave(new Date(), 1);
  s.meta.coins = 1000;
  const before = backpackSize(s, data);
  assert.ok(buyUpgrade(s, data, 'backpack'));
  assert.equal(backpackSize(s, data), before + 1);
  assert.equal(s.meta.coins, 1000 - data.upgrades.find((u) => u.id === 'backpack').cost[0]);
});

test('tiers 1-5: tier-up needs coins and boss wins; raises fee and luck', () => {
  assert.deepEqual(data.tiers.map((t) => t.tier), [1, 2, 3, 4, 5]);
  const s = newSave(new Date(), 1);
  s.meta.runsStarted = 1;
  s.meta.coins = 10000;
  const fee1 = runFee(s, data);
  const luck1 = luckBonus(s, data);
  assert.equal(tierUpStatus(s, data).winsOk, false);
  assert.equal(tierUp(s, data), false);
  s.stats.wins = 1;
  assert.ok(tierUp(s, data));
  assert.equal(s.meta.tier, 2);
  assert.ok(runFee(s, data) > fee1);
  assert.equal(luckBonus(s, data), luck1 + 1);
});

test('higher tiers unlock room types (shelf/wash from tier 2)', () => {
  const s = newSave(new Date(), 1);
  const types = new Set();
  for (let i = 0; i < 40; i++) {
    s.run = null;
    startRun(s, data);
    for (const row of s.run.map.floors) for (const n of row) types.add(n.type);
  }
  assert.ok(!types.has('shelf') && !types.has('wash'));
  s.meta.tier = 2;
  for (let i = 0; i < 40; i++) {
    s.run = null;
    startRun(s, data);
    for (const row of s.run.map.floors) for (const n of row) types.add(n.type);
  }
  assert.ok(types.has('shelf') && types.has('wash'));
});

test('skins: 6 sheets + recolors; buying with sparkles', () => {
  assert.ok(data.skins.filter((x) => x.sheet).length >= 6);
  assert.ok(data.skins.some((x) => x.recolor));
  const s = newSave(new Date(), 1);
  const sk = data.skins[0];
  assert.equal(equipSkin(s, 'dudonya', sk.id), false);
  s.meta.sparkles = sk.price;
  assert.ok(buySkin(s, data, sk.id));
  assert.ok(equipSkin(s, 'dudonya', sk.id));
  assert.equal(s.meta.sparkles, 0);
});

test('cat line generator is deterministic and Gorbodak stays rare', () => {
  assert.equal(catLine(data, 'peposya', 'x1'), catLine(data, 'peposya', 'x1'));
  let g = 0;
  for (let i = 0; i < 2000; i++) if (/Горбодак/.test(catLine(data, i % 2 ? 'peposya' : 'dudonya', 'seed' + i))) g++;
  assert.ok(g > 0 && g < 60, 'gorbodak lines: ' + g);
  assert.ok(!/\{/.test(catLine(data, 'dudonya', 'y')));
});

test('v3 save migrates to v4 (album.placed)', () => {
  const s = newSave(new Date(), 1);
  s.version = 3;
  delete s.album.placed;
  const m = parseSave(JSON.stringify(s));
  assert.equal(m.version, SAVE_VERSION);
  assert.deepEqual(m.album.placed, {});
});

test('a whole run still works with talents, upgrades and tier 3', () => {
  const s = newSave(new Date(), 'meta-run');
  s.meta.tier = 3;
  s.meta.sparkles = 999;
  s.meta.coins = 9999;
  for (const b of data.talents) for (const n of b.nodes) while (learnTalent(s, data, n.id));
  for (const u of data.upgrades) while (buyUpgrade(s, data, u.id));
  startRun(s, data);
  enterNode(s, data, s.run.map.floors[0][0].id);
  assert.ok(s.run.room.combat);
  assert.ok(s.run.backpack.length >= 3, 'starting consumables');
});
