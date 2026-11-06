import test from 'node:test';
import assert from 'node:assert/strict';
import { newSave } from '../js/core/save.js';
import { startRun, enterNode, playRound, addToBackpack, equipmentBonus } from '../js/game/run.js';
import { backroomCall, placeOnShelf, washItem, chooseEvent, buyShop } from '../js/game/rooms.js';
import { backpackMatch, activeCombos, nearCombos, guestCombos } from '../js/game/combos.js';
import { aliveEnemies } from '../js/game/combat.js';
import { unopenedBlocks } from '../js/game/blocks.js';
import { loadData } from './helpers.mjs';

const data = loadData();

function runInRoom(type, seed = type) {
  const save = newSave(new Date(), seed);
  startRun(save, data);
  const node = save.run.map.floors[0][0];
  node.type = type;
  enterNode(save, data, node.id);
  return save;
}

test('every room type of SPEC §2 exists in data', () => {
  for (const id of ['combat', 'elite', 'loot', 'anomaly', 'shelf', 'wash', 'rest', 'event', 'shop', 'boss']) assert.ok(data.roomById[id], id);
});

test('shelf: correct placements stick, wrong ones cost moves', () => {
  const save = runInRoom('shelf');
  const s = save.run.room.shelf;
  assert.equal(s.items.length, 6);
  assert.equal(s.shelves.length, 3);
  const before = s.movesLeft;
  const wrong = (s.items[0].target + 1) % 3;
  assert.equal(placeOnShelf(save, data, 0, wrong).ok, false);
  assert.equal(s.movesLeft, before - 1);
  for (let i = 0; i < s.items.length; i++) placeOnShelf(save, data, i, s.items[i].target);
  assert.equal(save.run.room.phase, 'reward');
  assert.equal(save.run.room.grade, 'good');
});

test('wash removes dirty and can make items shiny', () => {
  const save = runInRoom('wash');
  const run = save.run;
  const id = data.items.find((i) => !i.effect).id;
  const r = addToBackpack(save, data, run, id, ['dirty']);
  const res = washItem(save, data, r.entry.uid);
  assert.ok(res);
  assert.ok(!r.entry.mods.includes('dirty'));
  assert.equal(r.entry.mods.includes('shiny'), res.shiny);
});

test('events: >= 30, every choice resolvable, every referenced item/status/enemy exists', () => {
  assert.ok(data.events.length >= 30);
  for (const ev of data.events) {
    assert.ok(ev.title && ev.text && ev.choices.length >= 2 && ev.choices.length <= 3, ev.id);
    for (const ch of ev.choices) {
      const total = ch.outcomes.reduce((s, o) => s + o.p, 0);
      assert.ok(Math.abs(total - 1) < 1e-9, ev.id + ' p sum ' + total);
      for (const o of ch.outcomes) {
        assert.ok(o.text, ev.id);
        for (const e of o.effects) {
          if (e.item) assert.ok(data.itemById[e.item], ev.id + ' item ' + e.item);
          if (e.status) assert.ok(data.statusById[e.status], ev.id + ' status ' + e.status);
          if (e.sticker) assert.ok(data.enemyById[e.sticker], ev.id + ' sticker ' + e.sticker);
          if (e.block) assert.ok(data.rarityById[e.block], ev.id + ' block ' + e.block);
        }
      }
    }
  }
  // play every choice of every event once
  for (const ev of data.events) {
    ev.choices.forEach((ch, i) => {
      const save = runInRoom('event', ev.id + i);
      save.run.room.event.id = ev.id;
      save.run.coins = 100;
      save.meta.sparkles = 100;
      const r = chooseEvent(save, data, i);
      assert.ok(r, ev.id + ' choice ' + i);
      assert.equal(save.run.room.phase, 'done');
      for (const p of Object.values(save.run.party)) assert.ok(p.hp >= 1);
    });
  }
});

test('shop: buying needs run coins and fills the backpack', () => {
  const save = runInRoom('shop');
  const run = save.run;
  run.coins = 0;
  assert.equal(buyShop(save, data, 0).reason, 'coins');
  run.coins = 500;
  const n = run.backpack.length;
  assert.ok(buyShop(save, data, 0).ok);
  assert.equal(run.backpack.length, n + 1);
  assert.equal(buyShop(save, data, 0).reason, 'sold');
});

test('combos: >= 40, unique, with hint + desc', () => {
  assert.ok(data.combos.length >= 40);
  assert.equal(new Set(data.combos.map((c) => c.id)).size, data.combos.length);
  for (const c of data.combos) {
    assert.ok(c.name && c.hint && c.desc && c.trigger && c.effect, c.id);
    if (c.effect.item) assert.ok(data.itemById[c.effect.item], c.id);
    if (c.effect.status) assert.ok(data.statusById[c.effect.status], c.id);
  }
});

function combatRoom(seed) {
  const save = runInRoom('combat', seed);
  return save;
}

test('combo: hiss -> bite = "Внезапный кусь" (x1.5) and gets discovered', () => {
  const save = combatRoom('combo1');
  const c = save.run.room.combat;
  c.enemies.forEach((e) => (e.hp = e.maxHp = 999));
  const t = c.enemies[0].uid;
  playRound(save, data, { peposya: { action: 'hiss', target: t }, dudonya: { action: 'purr' } });
  const ev = playRound(save, data, { peposya: { action: 'bite', target: t }, dudonya: { action: 'purr' } });
  assert.ok(ev.some((e) => e.type === 'combo' && e.id === 'sudden_bite'));
  assert.ok(save.combos.discovered.includes('sudden_bite'));
  assert.ok(save.combos.recent.includes('sudden_bite'));
});

test('combo: both cats bite in one round = "Двойной кусь"', () => {
  const save = combatRoom('combo2');
  const c = save.run.room.combat;
  c.enemies.forEach((e) => (e.hp = e.maxHp = 999));
  const t = aliveEnemies(c)[0].uid;
  const ev = playRound(save, data, { peposya: { action: 'bite', target: t }, dudonya: { action: 'bite', target: t } });
  assert.ok(ev.some((e) => e.type === 'combo' && e.id === 'twin_bite'));
});

test('combo: fish + cheese in the backpack become Пицца-подозрение', () => {
  const save = combatRoom('pizza');
  const run = save.run;
  addToBackpack(save, data, run, 'sardine');
  addToBackpack(save, data, run, 'crop_cheese');
  assert.ok(run.backpack.some((b) => b.id === 'pizza_suspicion'));
  assert.ok(!run.backpack.some((b) => b.id === 'sardine' || b.id === 'crop_cheese'));
  assert.ok(save.combos.discovered.includes('pizza_suspicion'));
});

test('combo: passive set bonus applies while held', () => {
  const save = combatRoom('knight');
  const run = save.run;
  const w = data.items.find((i) => i.category === 'weapon_tool' && !i.effect);
  const cl = data.items.find((i) => i.category === 'clothes' && !i.effect);
  const base = equipmentBonus(save, data, run).def;
  addToBackpack(save, data, run, (w || data.items.find((i) => i.category === 'weapon_tool')).id);
  addToBackpack(save, data, run, (cl || data.items.find((i) => i.category === 'clothes')).id);
  assert.ok(activeCombos(save, data, run).some((c) => c.id === 'knight_kit'));
  assert.ok(equipmentBonus(save, data, run).def >= base + 1);
  assert.ok(backpackMatch({ all: ['cat:weapon_tool', 'cat:clothes'] }, run.backpack, data));
});

test('combo: rest then combat = "Тихий час" (room sequence)', () => {
  const save = newSave(new Date(), 'seq');
  startRun(save, data);
  const run = save.run;
  const a = run.map.floors[0][0];
  const b = run.map.floors[1].find((n) => a.up.includes(n.id));
  a.type = 'rest';
  b.type = 'combat';
  enterNode(save, data, a.id);
  run.room = null;
  run.visited.push(a.id);
  run.pos = a.id;
  enterNode(save, data, b.id);
  assert.ok(save.combos.discovered.includes('power_nap'));
  assert.ok(run.room.combat.cats.every((u) => u.statuses.some((s) => s.id === 'lucky')));
});

test('combo: kill a klobster with the slipper = "Классика жанра"', () => {
  const save = combatRoom('classic');
  const run = save.run;
  const c = run.room.combat;
  c.enemies.length = 1;
  Object.assign(c.enemies[0], { id: 'klobster', hp: 1, maxHp: 10, def: 0, block: 0, evasion: 0 });
  c.enemies[0].intent = { type: 'defend', block: 0 };
  const r = addToBackpack(save, data, run, 'slipper_justice');
  playRound(save, data, { peposya: { action: 'item', itemUid: r.entry.uid, target: c.enemies[0].uid }, dudonya: { action: 'purr' } });
  assert.equal(c.over, 'win');
  assert.ok(save.combos.discovered.includes('classic'));
});

test('a found block keeps the room locked until it is opened', () => {
  const save = newSave(new Date('2026-11-01T10:00:00Z'), 'locked');
  startRun(save, data);
  const room = { type: 'loot', blocks: [{ opened: false }, { opened: true }] };
  assert.equal(unopenedBlocks(room), 1);
  room.blocks[0].opened = true;
  assert.equal(unopenedBlocks(room), 0);
  assert.equal(unopenedBlocks({ type: 'rest' }), 0);
  assert.equal(unopenedBlocks(null), 0);
});


test('near-combo hint appears one item before a backpack set, not after it', () => {
  const save = runInRoom('rest', 'near');
  const run = save.run;
  const ids = () => nearCombos(save, data, run).map((c) => c.id);
  assert.ok(!ids().includes('treasury'));
  addToBackpack(save, data, run, 'gem_a');
  assert.ok(ids().includes('treasury'), 'one gem of two');
  addToBackpack(save, data, run, 'gem_b');
  assert.ok(!ids().includes('treasury'), 'the set is complete');
});

test('guest combos can be found from the animal side', () => {
  assert.deepEqual(guestCombos(data, 'owl_grey').map((c) => c.id), ['wise_owl']);
  assert.ok(guestCombos(data, 'dragon_red').some((c) => c.id === 'dragon_gold'));
  assert.deepEqual(guestCombos(data, 'cow'), []);
});
