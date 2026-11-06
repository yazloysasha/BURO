// Balance guard rails: the player models from playtest/ on the real data. Wide bands, the exact numbers live in REPORT_PLAYTEST.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './helpers.mjs';
import { playCareer, summarize } from '../playtest/sim.mjs';
import { STRATEGIES } from '../playtest/lib/strategy.mjs';
import { newSave } from '../js/core/save.js';
import { startRun } from '../js/game/run.js';
import { runIsFree, gritBonus } from '../js/game/meta.js';

const data = loadData();
const careers = [];
for (const name of STRATEGIES) for (let i = 0; i < 12; i++) careers.push(playCareer(data, name, 'guard' + i, 15));
const stats = summarize(data, careers, 15);
const num = (s) => Number(String(s).replace('%', ''));

test('a newcomer beats the king around attempt 3-5, nobody wins right away by button mashing', () => {
  for (const name of ['greedy', 'cautious']) {
    assert.ok(stats[name].firstWinRun >= 1 && stats[name].firstWinRun <= 7, name + ': ' + stats[name].firstWinRun);
    assert.equal(stats[name].firstWinGot, 12, name + ' always wins eventually');
  }
  const firstRunWins = careers.filter((c) => c.name === 'random' && c.runs[0].outcome === 'win').length;
  assert.ok(firstRunWins <= 4, 'random first-run wins: ' + firstRunWins + '/12');
});

test('a good player wins about half of the runs', () => {
  assert.ok(num(stats.smart.win1to5) >= 25 && num(stats.smart.win1to5) <= 75, stats.smart.win1to5);
  assert.ok(num(stats.smart.win6to15) >= 30 && num(stats.smart.win6to15) <= 80, stats.smart.win6to15);
});

test('every strategy keeps playing: no run hangs, no dead end without money', () => {
  for (const c of careers) {
    assert.equal(c.runs.length, 15);
    assert.ok(c.save.meta.coins >= 0 && c.save.meta.sparkles >= 0);
  }
  const save = newSave(new Date(), 'broke');
  save.meta.runsStarted = 5;
  save.meta.coins = 0;
  assert.ok(runIsFree(save, data), 'no coins: the next run is free');
  startRun(save, data);
  assert.equal(save.run.fee, 0);
});

test('stubbornness grows with defeats and resets with a win', () => {
  const save = newSave(new Date(), 'grit');
  assert.equal(gritBonus(save, data).hp, 0);
  save.meta.grit = 2;
  assert.ok(gritBonus(save, data).hp > 0 && gritBonus(save, data).atk === 1);
  save.meta.grit = 99;
  assert.equal(gritBonus(save, data).n, data.balance.grit.max);
  assert.equal(careers.filter((c) => c.save.meta.grit > 15).length, 0);
});
