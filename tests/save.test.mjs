import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newSave, migrate, parseSave, exportSave, importSave, validateSave, SAVE_VERSION } from '../js/core/save.js';

const fixture = (name) => fs.readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8');

test('new save is valid and current', () => {
  const s = newSave(new Date('2026-11-02T10:00:00Z'), 1);
  assert.equal(s.version, SAVE_VERSION);
  assert.deepEqual(validateSave(s), []);
});

test('export -> import round-trips exactly', () => {
  const s = newSave(new Date('2026-11-02T10:00:00Z'), 7);
  s.meta.coins = 123;
  s.collection.items.sock_prophecy = 2;
  s.combos.discovered.push('sudden_bite');
  s.pity.sinceEpic = 4;
  s.daily = { ...s.daily, lastOpenDate: '2026-11-01', streak: 3 };
  const back = importSave(exportSave(s));
  assert.deepEqual(back, s);
});

test('import accepts a raw save JSON as well as the export wrapper', () => {
  const s = newSave(new Date(), 3);
  s.meta.coins = 9;
  assert.equal(importSave(JSON.stringify(s)).meta.coins, 9);
});

test('v1 save (SPEC §13 schema) migrates to current without losing progress', () => {
  const v1 = JSON.parse(fixture('save_v1.json'));
  const s = parseSave(JSON.stringify(v1));
  assert.equal(s.version, SAVE_VERSION);
  assert.equal(s.meta.coins, v1.meta.coins);
  assert.equal(s.meta.tier, v1.meta.tier);
  assert.deepEqual(s.collection.items, v1.collection.items);
  assert.deepEqual(s.combos.discovered, v1.combos.discovered);
  assert.equal(s.pity.sinceEpic, v1.pity.sinceEpic);
  assert.equal(s.daily.streak, v1.daily.streak);
  assert.equal(s.settings.sfx, v1.settings.sfx);
  assert.equal(s.meta.rng.length, 4);
  assert.deepEqual(validateSave(s), []);
});

test('migrate is idempotent on current saves', () => {
  const s = newSave(new Date(), 5);
  const copy = JSON.parse(JSON.stringify(s));
  assert.deepEqual(migrate(copy), s);
});

test('corrupted / foreign input is rejected, never half-loaded', () => {
  for (const bad of ['', '   ', '{', 'null', '[]', '"text"', '{"meta":{"coins":-5}}', '{"version":2,"meta":"x"}']) {
    assert.throws(() => importSave(bad), 'should reject ' + bad);
  }
});

test('save from a newer game version is rejected with "newer"', () => {
  const s = newSave(new Date(), 1);
  s.version = SAVE_VERSION + 1;
  assert.throws(() => importSave(JSON.stringify(s)), /newer/);
});

test('partially damaged save is repaired with defaults', () => {
  const s = newSave(new Date(), 1);
  delete s.settings;
  delete s.pity;
  s.meta.coins = 50;
  const back = parseSave(JSON.stringify(s));
  assert.equal(back.meta.coins, 50);
  assert.equal(back.pity.sinceEpic, 0);
  assert.equal(typeof back.settings.sfx, 'number');
});
