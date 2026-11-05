import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newSave, migrate, parseSave, exportSave, importSave, validateSave, serializeSave, sealSave, unsealSave, newerSave, SAVE_VERSION } from '../js/core/save.js';

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

test('v2 save (M2 format with collection.mods) migrates to v3 keys + seen codex', () => {
  const v2 = newSave(new Date(), 1);
  v2.version = 2;
  delete v2.collection.seen;
  delete v2.meta.showcase;
  v2.collection.items = { sardine: 3, valerian: 1 };
  v2.collection.mods = { 'sardine|shiny': 1 };
  const s = parseSave(JSON.stringify(v2));
  assert.equal(s.version, SAVE_VERSION);
  assert.deepEqual(s.collection.items, { sardine: 2, valerian: 1, 'sardine|shiny': 1 });
  assert.ok(s.collection.seen.sardine && s.collection.seen.valerian);
  assert.equal(s.collection.mods, undefined);
});

test('x2 animations are the default and old x1 saves move to it, other choices stay', () => {
  assert.equal(newSave().settings.animSpeed, 2);
  const m = (v) => {
    const s = newSave();
    s.version = 4;
    s.settings.animSpeed = v;
    return migrate(s).settings.animSpeed;
  };
  assert.equal(m(1), 2);
  assert.equal(m(1.5), 1.5);
  assert.equal(m(3), 3);
});

test('sealed saves round-trip and any damage is detected', () => {
  const text = serializeSave(newSave());
  const sealed = sealSave(text);
  assert.equal(unsealSave(sealed), text);
  assert.equal(unsealSave(sealed.slice(0, -5)), null, 'torn write');
  assert.equal(unsealSave(sealed.replace('"coins":0', '"coins":9')), null, 'edited write');
  assert.equal(unsealSave(text), text, 'old unsealed saves still load');
  assert.equal(parseSave(unsealSave(sealed)).version, SAVE_VERSION);
});

test('the write counter decides which copy is newer, even with a wrong clock', () => {
  const a = { seq: 5, updatedAt: '2030-01-01' };
  const b = { seq: 6, updatedAt: '2020-01-01' };
  assert.equal(newerSave(a, b), b);
  assert.equal(newerSave({ updatedAt: '2026-02-01' }, { updatedAt: '2026-01-01' }).updatedAt, '2026-02-01');
});

test('every player-facing code path commits after mutating the save', () => {
  const files = ['album', 'daily', 'hub', 'inventory', 'map', 'room', 'runend', 'settings', 'skins', 'talents', 'upgrades'];
  for (const f of files) assert.match(fs.readFileSync(new URL(`../js/ui/screens/${f}.js`, import.meta.url), 'utf8'), /commit\(\)/, f);
});
