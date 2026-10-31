import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng, seedState, withRng } from '../js/core/rng.js';

test('same seed -> same sequence', () => {
  const a = Rng.fromSeed('hello');
  const b = Rng.fromSeed('hello');
  for (let i = 0; i < 1000; i++) assert.equal(a.next(), b.next());
});

test('different seeds diverge', () => {
  const a = Rng.fromSeed(1);
  const b = Rng.fromSeed(2);
  let same = 0;
  for (let i = 0; i < 100; i++) if (a.next() === b.next()) same++;
  assert.ok(same < 3);
});

test('state round-trips through JSON (no reroll on restart)', () => {
  const a = Rng.fromSeed('run-42');
  for (let i = 0; i < 37; i++) a.next();
  const saved = JSON.parse(JSON.stringify(a.state()));
  const expected = [a.next(), a.next(), a.next()];
  const b = new Rng(saved);
  assert.deepEqual([b.next(), b.next(), b.next()], expected);
});

test('next() in [0,1), int() inclusive bounds, roughly uniform', () => {
  const r = Rng.fromSeed('u');
  const counts = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 60000; i++) {
    const f = r.next();
    assert.ok(f >= 0 && f < 1);
    counts[r.int(0, 5)]++;
  }
  for (const c of counts) assert.ok(c > 9000 && c < 11000, 'bucket ' + c);
});

test('weighted() respects weights', () => {
  const r = Rng.fromSeed('w');
  const tally = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 20000; i++) tally[r.weighted([['a', 1], ['b', 3], ['c', 0]])[0]]++;
  assert.equal(tally.c, 0);
  assert.ok(tally.b / tally.a > 2.6 && tally.b / tally.a < 3.4);
});

test('withRng writes state back into the holder', () => {
  const holder = { rng: seedState('x') };
  const before = holder.rng.slice();
  const v1 = withRng(holder, 'rng', (r) => r.next());
  assert.notDeepEqual(holder.rng, before);
  const v2 = withRng({ rng: before }, 'rng', (r) => r.next());
  assert.equal(v1, v2);
});

test('shuffle is a permutation', () => {
  const r = Rng.fromSeed('s');
  const arr = [...Array(50).keys()];
  const s = r.shuffle(arr);
  assert.deepEqual([...s].sort((a, b) => a - b), arr);
});
