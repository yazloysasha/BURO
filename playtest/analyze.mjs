// Numbers for REPORT_PLAYTEST.md: long simulated careers, 1000-block rarity table, event repetition, combos within reach.
// Usage: node playtest/analyze.mjs > playtest/results/after_sim.json
import { Rng } from '../js/core/rng.js';
import { rollBlock, pityLeft, PITY_EPIC, PITY_LEGENDARY } from '../js/game/loot.js';
import { loadData } from '../tests/helpers.mjs';
import { playCareer, summarize } from './sim.mjs';
import { STRATEGIES } from './lib/strategy.mjs';

const CAREERS = Number(process.argv[2] || 200);
const RUNS = 30;
const data = loadData();
const careers = [];
for (const name of STRATEGIES) for (let i = 0; i < CAREERS; i++) careers.push(playCareer(data, name, i, RUNS));
const out = { careersPerStrategy: CAREERS, runsPerCareer: RUNS, sim: summarize(data, careers, RUNS) };

// --- win rate by stretch of a career (smart = the "good player" target) ---
out.winBySegment = {};
for (const name of STRATEGIES) {
  const list = careers.filter((c) => c.name === name);
  const seg = (a, b) => {
    const runs = list.flatMap((c) => c.runs.slice(a, b));
    return Math.round((runs.filter((r) => r.outcome === 'win').length / runs.length) * 100) + '%';
  };
  out.winBySegment[name] = { 'run 1': seg(0, 1), 'runs 2-5': seg(1, 5), 'runs 6-10': seg(5, 10), 'runs 11-20': seg(10, 20), 'runs 21-30': seg(20, 30) };
}

// --- first time each milestone shows up, for the "first 30 minutes" question ---
out.milestones = {};
for (const name of STRATEGIES) {
  const list = careers.filter((c) => c.name === name);
  const m = {};
  for (const k of ['win', 'upgrade', 'talent', 'guest', 'page', 'tier', 'half']) {
    const hits = list.map((c) => c.firsts[k]).filter(Boolean);
    const within30 = hits.filter((f) => f.minutes <= 30).length;
    const med = (f) => (hits.length ? hits.map(f).sort((a, b) => a - b)[hits.length >> 1] : null);
    m[k] = { medianRun: med((x) => x.run + 1), medianMinutes: hits.length ? Math.round(med((x) => x.minutes)) : null, reached: Math.round((hits.length / list.length) * 100) + '%', within30min: Math.round((within30 / list.length) * 100) + '%' };
  }
  out.milestones[name] = m;
}

// --- rooms over 30 runs ---
out.roomsPer30Runs = {};
for (const name of STRATEGIES) {
  const rooms = {};
  const list = careers.filter((c) => c.name === name);
  for (const c of list) for (const r of c.runs) for (const [t, n] of Object.entries(r.rooms)) rooms[t] = (rooms[t] || 0) + n;
  out.roomsPer30Runs[name] = Object.fromEntries(Object.entries(rooms).map(([k, v]) => [k, +(v / list.length).toFixed(1)]));
}

// --- combos ---
const after = (name, n) => {
  const list = careers.filter((c) => c.name === name);
  const per = [];
  for (let i = 0; i < CAREERS; i++) per.push(playCareer(data, name, 'c' + i, n).save.combos.discovered.length);
  return { avg: +(per.reduce((a, b) => a + b, 0) / per.length).toFixed(1), max: Math.max(...per), careers: list.length };
};
out.combosAfter10Runs = Object.fromEntries(STRATEGIES.map((n) => [n, after(n, 10)]));
const everFound = {};
for (const c of careers) for (const id of c.save.combos.discovered) everFound[id] = (everFound[id] || 0) + 1;
out.combosPctOfCareersBy30 = Object.fromEntries(data.combos.map((c) => [c.id, Math.round(((everFound[c.id] || 0) / careers.length) * 100)]).sort((a, b) => a[1] - b[1]));
out.combosNeverFound = data.combos.filter((c) => !everFound[c.id]).map((c) => c.id);

// --- 1000 lucky blocks, fresh save, no luck bonuses (and a lucky player) ---
function blocks(luck, n = 1000, seed = 'blocks') {
  const rng = Rng.fromSeed(seed + luck);
  const pity = { sinceEpic: 0, sinceLegendary: 0 };
  const tally = { rarity: {}, mods: {}, animals: 0, forced: 0, longestNoEpic: 0 };
  let dry = 0;
  for (let i = 0; i < n; i++) {
    const b = rollBlock(rng, data, pity, { luck });
    tally.rarity[b.rarity] = (tally.rarity[b.rarity] || 0) + 1;
    if (b.kind === 'animal') tally.animals++;
    for (const m of b.mods || []) tally.mods[m] = (tally.mods[m] || 0) + 1;
    if (b.forced) tally.forced++;
    dry = ['epic', 'legendary', 'slop'].includes(b.rarity) ? 0 : dry + 1;
    tally.longestNoEpic = Math.max(tally.longestNoEpic, dry);
  }
  return tally;
}
out.blocks1000 = { luck0: blocks(0), luck5: blocks(5), pity: { epicEvery: PITY_EPIC, legendaryEvery: PITY_LEGENDARY, example: pityLeft({ sinceEpic: 7, sinceLegendary: 30 }) } };

// --- events: how often the same one comes back within a 30-run career ---
{
  const list = careers.filter((c) => c.name === 'smart');
  const stats = list.map((c) => {
    const seq = c.runs.flatMap((r) => r.events);
    const count = {};
    for (const id of seq) count[id] = (count[id] || 0) + 1;
    let gap = Infinity;
    const last = {};
    seq.forEach((id, i) => {
      if (last[id] !== undefined) gap = Math.min(gap, i - last[id]);
      last[id] = i;
    });
    return { total: seq.length, distinct: Object.keys(count).length, max: Math.max(...Object.values(count)), gap };
  });
  const mean = (f) => +(stats.reduce((s, x) => s + f(x), 0) / stats.length).toFixed(1);
  out.events = { total: data.events.length, perCareer: mean((x) => x.total), distinct: mean((x) => x.distinct), maxRepeats: mean((x) => x.max), minGap: Math.min(...stats.map((x) => x.gap)) };
}
console.log(JSON.stringify(out, null, 1));
