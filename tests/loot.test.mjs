import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../js/core/rng.js';
import { newSave } from '../js/core/save.js';
import { rollRarity, rollBlock, rollMods, rank, PITY_EPIC, PITY_LEGENDARY, pityLeft } from '../js/game/loot.js';
import { dayDiff, claimDaily, dailyAvailable, localDate } from '../js/game/daily.js';
import { openDailyGift } from '../js/game/blocks.js';
import { addItem, sellItem, sellPrice, itemKey, grantAnimal, toggleShowcase } from '../js/game/collection.js';
import { loadData } from './helpers.mjs';

const data = loadData();

test('pity: an epic+ is guaranteed on the 10th block without one', () => {
  const rng = Rng.fromSeed('p');
  for (let trial = 0; trial < 200; trial++) {
    const pity = { sinceEpic: 0, sinceLegendary: 0 };
    let since = 0;
    for (let i = 0; i < 60; i++) {
      const { rarity } = rollRarity(rng, data, pity, {});
      if (rank(rarity) >= rank('epic')) since = 0;
      else since++;
      assert.ok(since < PITY_EPIC, 'went ' + since + ' blocks without epic');
    }
  }
});

test('pity: legendary guaranteed by the 40th block', () => {
  const pity = { sinceEpic: 0, sinceLegendary: PITY_LEGENDARY - 1 };
  const { rarity, forced } = rollRarity(Rng.fromSeed('l'), data, pity, {});
  assert.ok(rank(rarity) >= rank('legendary'));
  assert.equal(forced, 'legendary');
  assert.equal(pity.sinceLegendary, 0);
  assert.equal(pity.sinceEpic, 0);
});

test('pity counter visible values', () => {
  assert.deepEqual(pityLeft({ sinceEpic: 7, sinceLegendary: 10 }), { epic: 3, legendary: 30 });
});

test('rarity distribution follows weights (common most, slop rarest)', () => {
  const rng = Rng.fromSeed('dist');
  const tally = {};
  for (let i = 0; i < 20000; i++) {
    const r = rollRarity(rng, data, { sinceEpic: -1e9, sinceLegendary: -1e9 }).rarity; // pity disabled
    tally[r] = (tally[r] || 0) + 1;
  }
  assert.ok(tally.common > tally.uncommon && tally.uncommon > tally.rare && tally.rare > tally.epic);
  assert.ok((tally.slop || 0) < (tally.legendary || 1) * 0.5 + 5);
});

test('luck raises the share of rare+', () => {
  const share = (luck) => {
    const rng = Rng.fromSeed('luck');
    let n = 0;
    for (let i = 0; i < 10000; i++) if (rank(rollRarity(rng, data, { sinceEpic: -1e9, sinceLegendary: -1e9 }, { luck }).rarity) >= 2) n++;
    return n;
  };
  assert.ok(share(10) > share(0) * 1.2);
});

test('blocks hold existing items/animals of the rolled rarity; mods <= 2 and compatible', () => {
  const rng = Rng.fromSeed('blocks');
  const pity = { sinceEpic: 0, sinceLegendary: 0 };
  for (let i = 0; i < 3000; i++) {
    const b = rollBlock(rng, data, pity);
    const thing = b.kind === 'animal' ? data.animalById[b.id] : data.itemById[b.id];
    assert.ok(thing, b.id);
    assert.equal(thing.rarity, b.rarity);
    assert.ok(b.mods.length <= 2);
    assert.ok(!(b.mods.includes('golden') && b.mods.includes('rainbow')));
  }
  const m = rollMods(Rng.fromSeed('m'), data);
  assert.ok(Array.isArray(m));
});

test('dates: dayDiff and localDate', () => {
  assert.equal(dayDiff('2026-11-01', '2026-11-02'), 1);
  assert.equal(dayDiff('2026-02-28', '2026-03-01'), 1);
  assert.equal(dayDiff('2026-12-31', '2027-01-01'), 1);
  assert.equal(dayDiff('2026-11-02', '2026-11-02'), 0);
  assert.match(localDate(new Date(2026, 10, 2, 23, 59)), /^2026-11-02$/);
});

test('daily: once per calendar day; streak grows, gaps lower it gently, never to zero', () => {
  const s = newSave(new Date(), 1);
  assert.ok(dailyAvailable(s, '2026-11-01'));
  assert.equal(claimDaily(s, '2026-11-01').streak, 1);
  assert.equal(claimDaily(s, '2026-11-01'), null, 'second claim same day');
  assert.ok(!dailyAvailable(s, '2026-11-01'));
  assert.equal(claimDaily(s, '2026-11-02').streak, 2);
  const r3 = claimDaily(s, '2026-11-03');
  assert.equal(r3.streak, 3);
  assert.deepEqual(r3.bonuses, [3]);
  // miss one day -> -1
  assert.equal(claimDaily(s, '2026-11-05').streak, 2);
  // long absence -> floor at 1
  assert.equal(claimDaily(s, '2026-12-25').streak, 1);
  assert.equal(s.daily.bestStreak, 3);
  // clock moved back: no extra gift
  assert.equal(claimDaily(s, '2026-12-20'), null);
});

test('daily: 7 and 14 day bonuses', () => {
  const s = newSave(new Date(), 1);
  const all = [];
  for (let d = 1; d <= 14; d++) all.push(...claimDaily(s, `2026-11-${String(d).padStart(2, '0')}`).bonuses);
  assert.deepEqual(all, [3, 7, 14]);
});

test('daily gift goes straight into the collection and advances pity', () => {
  const s = newSave(new Date(), 'gift');
  const g = openDailyGift(s, data, '2026-11-02');
  assert.equal(g.blocks.length, 1);
  const b = g.blocks[0];
  if (b.kind === 'item') assert.equal(s.collection.items[itemKey(b.id, b.mods)], 1);
  else assert.equal(s.collection.animals[b.id], 1);
  assert.equal(s.pity.sinceEpic + s.pity.sinceLegendary > 0 || rank(b.rarity) >= rank('epic'), true);
  assert.equal(openDailyGift(s, data, '2026-11-02'), null);
});

test('selling uses modifier multipliers and removes the item', () => {
  const s = newSave(new Date(), 1);
  const id = data.items.find((i) => i.rarity === 'rare').id;
  const plain = addItem(s, id, []);
  const golden = addItem(s, id, ['golden']);
  const pPlain = sellPrice(s, data, plain);
  assert.equal(sellPrice(s, data, golden), Math.round(data.itemById[id].price * 5));
  toggleShowcase(s, plain);
  assert.equal(sellItem(s, data, plain), pPlain);
  assert.equal(s.collection.items[plain], undefined);
  assert.ok(!s.meta.showcase.includes(plain));
  assert.ok(s.collection.seen[id]);
});

test('duplicate animals turn into sparkles', () => {
  const s = newSave(new Date(), 1);
  const id = data.animals[0].id;
  assert.equal(grantAnimal(s, data, id).dupe, false);
  const r = grantAnimal(s, data, id);
  assert.ok(r.dupe && r.sparkles > 0);
  assert.equal(s.meta.sparkles, r.sparkles);
});
