// UI playtest bot: plays whole careers in a real browser, only through taps/clicks on what is on screen.
// It reads the save from localStorage to decide (like a player reads the screen), it never calls game functions.
// Usage: node playtest/bot.mjs --out playtest/results/ui.json [--profile iphone|desktop] [--careers 3] [--runs 3] [--workers 6]
import fs from 'node:fs';
import path from 'node:path';
import { newSave, serializeSave, sealSave } from '../js/core/save.js';
import { collectionStats } from '../js/game/collection.js';
import { guestSlots } from '../js/game/meta.js';
import { serve, launch, newContext, PROFILES } from './lib/harness.mjs';
import { STRATEGIES } from './lib/strategy.mjs';
import { Bot, data } from './lib/uibot.mjs';

const args = {};
process.argv.slice(2).forEach((v, i, all) => {
  if (v.startsWith('--')) args[v.slice(2)] = all[i + 1] && !all[i + 1].startsWith('--') ? [all[i + 1]] : [true];
});
const OUT = args.out ? args.out[0] : null;
const PROFILE = (args.profile || ['iphone'])[0];
const CAREERS = Number((args.careers || [3])[0]);
const RUNS = Number((args.runs || [3])[0]);
const WORKERS = Number((args.workers || [6])[0]);
const ONLY = args.only ? args.only[0].split(',') : STRATEGIES;

async function career(browser, baseUrl, stratName, seed, runs) {
  const profile = PROFILES[PROFILE];
  const ctx = await newContext(browser, profile);
  // reproducible start: a fresh save with a known seed, as if the game had just created it
  await ctx.addInitScript((text) => {
    if (!localStorage.getItem('buro.save')) localStorage.setItem('buro.save', text);
  }, sealSave(serializeSave(newSave(new Date(), `${stratName}:${seed}`))));
  const page = await ctx.newPage();
  const problems = [];
  const external = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push('console: ' + m.text());
  });
  page.on('request', (r) => {
    if (!r.url().startsWith(baseUrl)) external.push(r.url());
  });
  await page.goto(baseUrl);
  await page.waitForSelector('#app:not([hidden]) .menu-grid', { timeout: 60000 });
  const bot = new Bot(page, stratName, seed, profile.hasTouch);
  const results = [];
  try {
    for (let i = 0; i < runs; i++) {
      const rec = await bot.playRun(i);
      rec.seed = seed;
      await bot.metaPhase(rec);
      const save = await bot.save();
      const st = collectionStats(save, data);
      Object.assign(rec, { totalCoins: save.meta.coins, sparkles: save.meta.sparkles, tierAfter: save.meta.tier, combos: save.combos.discovered.length, itemsSeen: st.itemsSeen, animals: st.animalsOwned, pages: save.album.completed.length, upgrades: Object.values(save.meta.upgrades).reduce((a, b) => a + b, 0), talents: Object.values(save.meta.talents).reduce((a, b) => a + b, 0), guests: save.meta.guests.length, guestSlots: guestSlots(save, data) });
      results.push(rec);
      console.log(`${stratName} #${seed}.${i}: ${rec.outcome} floor ${rec.floor}/${rec.total} ${rec.diedIn || ''} +${rec.earned}c ${rec.taps} taps ${rec.seconds}s`);
    }
  } catch (e) {
    await page.screenshot({ path: path.join(path.dirname(OUT || 'playtest/results/x'), `crash_${stratName}_${seed}.png`) }).catch(() => {});
    const save = await bot.save().catch(() => null);
    problems.push('bot stopped: ' + e.message.split('\n')[0] + ' | ' + (save && save.run && save.run.room ? save.run.room.type + '/' + save.run.room.phase : 'no room'));
    console.error(`${stratName} #${seed} STOPPED: ${problems[problems.length - 1]}`);
  }
  await ctx.close();
  return { strategy: stratName, seed, results, problems, external };
}

const s = await serve();
const browser = await launch();
const jobs = [];
for (const name of ONLY) for (let i = 0; i < CAREERS; i++) jobs.push([name, i]);
const out = [];
await Promise.all(Array.from({ length: WORKERS }, async () => {
  while (jobs.length) {
    const [name, i] = jobs.shift();
    out.push(await career(browser, s.url, name, i, RUNS));
  }
}));
await browser.close();
s.close();
const runs = out.flatMap((c) => c.results);
const problems = out.flatMap((c) => c.problems);
console.log(`runs: ${runs.length}, wins: ${runs.filter((r) => r.outcome === 'win').length}, problems: ${problems.length}, external requests: ${out.flatMap((c) => c.external).length}`);
for (const p of problems) console.log(' -', p);
if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
}
process.exit(0);
