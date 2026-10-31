import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../js/core/rng.js';
import { generateMap, findNode, availableNodes } from '../js/game/map.js';
import { loadData } from './helpers.mjs';

const data = loadData();

// rooms.json may keep some types at weight 0; for the invariants test every type on
const allRooms = data.rooms.map((r) => (r.id === 'boss' ? r : { ...r, w: r.w || 8 }));

function check(map, tier) {
  const [fmin, fmax] = data.balance.floorsByTier[String(tier)];
  assert.ok(map.floors.length >= fmin && map.floors.length <= fmax, 'floor count ' + map.floors.length);
  assert.ok(map.floors.length >= 8 && map.floors.length <= 12);
  const last = map.floors[map.floors.length - 1];
  assert.equal(last.length, 1);
  assert.equal(last[0].type, 'boss');
  const ids = new Set();
  map.floors.forEach((row, f) => {
    if (f < map.floors.length - 1) assert.ok(row.length >= 2 && row.length <= 4, 'nodes per floor');
    for (const n of row) {
      assert.ok(!ids.has(n.id));
      ids.add(n.id);
      if (n.type !== 'boss') {
        assert.ok(n.up.length >= 1 && n.up.length <= 3, 'up-links ' + n.up.length);
        for (const u of n.up) assert.equal(findNode(map, u).f, f + 1);
      }
      if (f > 0) assert.ok(map.floors[f - 1].some((p) => p.up.includes(n.id)), 'unreachable node');
      if (f < 2) assert.notEqual(n.type, 'elite', 'elite on floors 1-2');
    }
  });
  // no crossing edges between consecutive floors
  for (let f = 0; f < map.floors.length - 2; f++) {
    const edges = [];
    for (const n of map.floors[f]) for (const u of n.up) edges.push([n.i, findNode(map, u).i]);
    for (const a of edges) for (const b of edges) assert.ok((a[0] - b[0]) * (a[1] - b[1]) >= 0, 'crossing edges');
  }
  // shop/rest never follow each other directly
  for (const row of map.floors) for (const n of row) {
    for (const u of n.up) {
      const c = findNode(map, u);
      const cozy = (t) => t === 'shop' || t === 'rest';
      assert.ok(!(cozy(n.type) && cozy(c.type)), `${n.type} -> ${c.type}`);
    }
  }
  // every path to the boss has >= 1 loot and >= 1 rest  (DP: can we reach the boss avoiding type X?)
  for (const type of ['loot', 'rest']) {
    const avoid = new Map(); // node id -> can reach boss while never visiting `type`
    for (let f = map.floors.length - 1; f >= 0; f--) {
      for (const n of map.floors[f]) {
        if (n.type === type) avoid.set(n.id, false);
        else if (n.type === 'boss') avoid.set(n.id, true);
        else avoid.set(n.id, n.up.some((u) => avoid.get(u)));
      }
    }
    for (const n of map.floors[0]) assert.equal(avoid.get(n.id), false, 'a path without ' + type);
  }
}

test('map invariants hold on 1000 seeds (all tiers)', () => {
  for (let s = 0; s < 1000; s++) {
    const tier = (s % 5) + 1;
    const map = generateMap(Rng.fromSeed('map' + s), { tier, rooms: allRooms, balance: data.balance });
    check(map, tier);
  }
});

test('map invariants hold with the shipped room weights', () => {
  for (let s = 0; s < 300; s++) check(generateMap(Rng.fromSeed('ship' + s), { tier: 1, rooms: data.rooms, balance: data.balance }), 1);
});

test('map generation is deterministic', () => {
  const a = generateMap(Rng.fromSeed('same'), { tier: 2, rooms: allRooms, balance: data.balance });
  const b = generateMap(Rng.fromSeed('same'), { tier: 2, rooms: allRooms, balance: data.balance });
  assert.deepEqual(a, b);
});

test('availableNodes: start = floor 0, then only up-links', () => {
  const map = generateMap(Rng.fromSeed('nav'), { tier: 1, rooms: allRooms, balance: data.balance });
  assert.deepEqual(availableNodes(map, null), map.floors[0].map((n) => n.id));
  const n = map.floors[0][0];
  assert.deepEqual(availableNodes(map, n.id), n.up);
});
