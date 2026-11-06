// The backroom: a familiar room in loops, an anomaly or not, the player calls it. Data, rolls, calls, rewards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng, hashString } from '../js/core/rng.js';
import { newSave } from '../js/core/save.js';
import { startRun, enterNode } from '../js/game/run.js';
import { backroomCall } from '../js/game/rooms.js';
import { newBackroom, rollLoop, callLoop, sceneWith, backroomGrade, hubAnomaly, catchHubAnomaly } from '../js/game/backroom.js';
import { startNightShift, nightShiftCall } from '../js/game/nightshift.js';
import { loadData } from './helpers.mjs';

const data = loadData();
const scene = data.anomalies.filter((a) => !a.where);

test('anomaly data: ids unique, every op points at a real object, a spread of subtlety', () => {
  const ids = data.anomalies.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  const objects = new Set(data.backroom.objects.map((o) => o.id));
  for (const a of scene) {
    assert.ok([1, 2, 3].includes(a.level), a.id);
    assert.ok(a.ops.length, a.id);
    for (const op of a.ops) if (op.op === 'set') assert.ok(objects.has(op.target), a.id + ' -> ' + op.target);
    assert.ok(a.name && a.desc, a.id);
  }
  for (const lvl of [1, 2, 3]) assert.ok(scene.filter((a) => a.level === lvl).length >= 8, 'level ' + lvl);
  assert.ok(scene.length >= 30);
  for (const a of data.anomalies.filter((x) => x.where)) assert.equal(a.where, 'hub');
});

test('every anomaly actually changes the scene, and the normal scene never does', () => {
  const base = JSON.stringify(sceneWith(data, null));
  assert.equal(base, JSON.stringify(data.backroom.objects));
  for (const a of scene) assert.notEqual(JSON.stringify(sceneWith(data, a.id)), base, a.id);
});

test('the first loop of the first visit is the normal room; later loops are mixed and never repeat within a walk', () => {
  const st = newBackroom({ loops: 3, maxLevel: 3, firstVisit: true });
  rollLoop(st, Rng.fromSeed('first'), data, newSave());
  assert.equal(st.cur, null);
  let anomalies = 0;
  let total = 0;
  for (let s = 0; s < 300; s++) {
    const rng = Rng.fromSeed('mix' + s);
    const w = newBackroom({ loops: 5, maxLevel: 2 });
    rollLoop(w, rng, data, newSave());
    for (let i = 0; i < 6 && !w.done; i++) {
      total++;
      if (w.cur) {
        anomalies++;
        assert.ok(data.anomalies.find((a) => a.id === w.cur).level <= 2);
      }
      callLoop(w, newSave(), w.cur ? 'back' : 'forward', rng, data);
    }
    assert.equal(new Set(w.used).size, w.used.length);
  }
  assert.ok(anomalies / total > 0.4 && anomalies / total < 0.7, anomalies / total);
});

test('right calls advance, a wrong call resets the counter; caught anomalies go to the collection', () => {
  const save = newSave();
  const st = newBackroom({ loops: 3 });
  const rng = Rng.fromSeed('calls');
  st.cur = 'moon_red';
  assert.deepEqual(callLoop(st, save, 'back', rng, data), { correct: true, anomaly: 'moon_red', caught: true, done: false });
  assert.equal(st.at, 1);
  assert.equal(save.collection.anomalies.moon_red, 1);
  st.cur = null;
  const wrong = callLoop(st, save, 'back', rng, data);
  assert.equal(wrong.correct, false);
  assert.equal(st.at, 0);
  assert.ok(st.last.falseAlarm);
  st.cur = 'clock_no_hands';
  callLoop(st, save, 'forward', rng, data);
  assert.ok(st.last.missed);
  assert.ok(!save.collection.anomalies.clock_no_hands, 'missed anomalies are not collected');
});

test('a walk always ends: perfect, or after too many calls; grades', () => {
  const st = newBackroom({ loops: 3 });
  const rng = Rng.fromSeed('end');
  rollLoop(st, rng, data, newSave());
  for (let i = 0; i < 3; i++) callLoop(st, newSave(), st.cur ? 'back' : 'forward', rng, data);
  assert.ok(st.done);
  assert.equal(backroomGrade(st), 'perfect');
  const bad = newBackroom({ loops: 3 });
  rollLoop(bad, rng, data, newSave());
  for (let i = 0; i < 100 && !bad.done; i++) callLoop(bad, newSave(), bad.cur ? 'forward' : 'back', rng, data);
  assert.ok(bad.done && bad.calls === bad.maxCalls);
  assert.equal(backroomGrade(bad), 'lost');
});

test('the map room pays by grade and is saved between calls', () => {
  const save = newSave(new Date(), 'room');
  startRun(save, data);
  const node = save.run.map.floors[0][0];
  node.type = 'anomaly';
  enterNode(save, data, node.id);
  const st = save.run.room.backroom;
  assert.ok(st && st.loops >= 3 && save.run.room.phase === 'play');
  const copy = JSON.parse(JSON.stringify(save));
  for (let i = 0; i < 20 && save.run.room.phase === 'play'; i++) backroomCall(save, data, save.run.room.backroom.cur ? 'back' : 'forward');
  assert.equal(save.run.room.phase, 'reward');
  assert.equal(save.run.room.grade, 'perfect');
  assert.ok(save.run.room.reward.coins > 0 && save.run.room.blocks.length === 1);
  // replaying from the saved copy gives the same loops: no reroll by reloading
  for (let i = 0; i < 20 && copy.run.room.phase === 'play'; i++) backroomCall(copy, data, copy.run.room.backroom.cur ? 'back' : 'forward');
  assert.deepEqual(copy.run.room.backroom.used, save.run.room.backroom.used);
});

test('night shift: five loops, full reward once a day, the collection always', () => {
  const save = newSave(new Date(), 'night');
  const day = '2026-11-06';
  const play = () => {
    startNightShift(save, data, day);
    for (let i = 0; i < 30 && !save.meta.nightShift.state.done; i++) nightShiftCall(save, data, save.meta.nightShift.state.cur ? 'back' : 'forward', day);
    return save.meta.nightShift.result;
  };
  const coins0 = save.meta.coins;
  const r1 = play();
  assert.equal(r1.grade, 'perfect');
  assert.ok(r1.paid && r1.coins > 0 && r1.block);
  assert.equal(save.meta.coins, coins0 + r1.coins);
  const r2 = play();
  assert.ok(!r2.paid && r2.coins === 0, 'second shift the same day pays nothing');
  assert.ok(Object.keys(save.collection.anomalies).length >= 1);
});

test('hub anomalies are rare, fixed per day, and pay once when noticed', () => {
  const save = newSave(new Date(), 'hub');
  save.meta.runsStarted = 5;
  let shows = 0;
  for (let d = 1; d <= 400; d++) if (hubAnomaly(save, data, '2027-01-' + d, hashString)) shows++;
  assert.ok(shows > 5 && shows < 60, 'shows ' + shows + '/400');
  let day = null;
  for (let d = 1; d <= 400 && !day; d++) if (hubAnomaly(save, data, 'd' + d, hashString)) day = 'd' + d;
  const a = hubAnomaly(save, data, day, hashString);
  assert.equal(hubAnomaly(save, data, day, hashString).id, a.id, 'same day, same anomaly');
  const s0 = save.meta.sparkles;
  assert.ok(catchHubAnomaly(save, data, a.id, day).first);
  assert.ok(save.meta.sparkles > s0);
  assert.equal(hubAnomaly(save, data, day, hashString), null, 'gone once noticed');
  const fresh = newSave();
  assert.equal(hubAnomaly(fresh, data, day, hashString), null, 'not for brand-new players');
});
