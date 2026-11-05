// Hard-close test: a real Chromium process is SIGKILLed right after a player action, then the game is reopened
// from the same profile. Reports how much progress rolled back. Usage: node playtest/hardkill.mjs [rounds]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { serve } from './lib/harness.mjs';

const ROUNDS = Number(process.argv[2] || 5);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buro-kill-'));
const s = await serve();
let port = 9400 + Math.floor(Math.random() * 400);

async function start() {
  port++;
  const proc = spawn(chromium.executablePath(), ['--headless=new', `--user-data-dir=${dir}`, `--remote-debugging-port=${port}`, '--no-first-run', '--window-size=414,896', 'about:blank'], { stdio: 'ignore', detached: true });
  let browser;
  for (let i = 0; i < 60 && !browser; i++) {
    await new Promise((r) => setTimeout(r, 250));
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => null);
  }
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(s.url);
  await page.waitForSelector('#app:not([hidden]) .menu-grid', { timeout: 60000 });
  return { proc, browser, page };
}

const volume = (page) => page.evaluate(() => import('/js/game/state.js').then(({ game }) => game.save.meta.coins));
const results = [];
for (let round = 0; round < ROUNDS; round++) {
  const { proc, page } = await start();
  const before = await volume(page);
  // the action: 7 quick commits that add coins through the app's own commit path, then an immediate kill
  const added = 7;
  for (let i = 0; i < added; i++) {
    await page.evaluate(() => import('/js/game/state.js').then(({ game, commit }) => { game.save.meta.coins += 1; commit(); }));
    await page.waitForTimeout(150);
  }
  const expected = before + added;
  process.kill(-proc.pid, 'SIGKILL');
  await new Promise((r) => setTimeout(r, 600));
  const again = await start();
  const after = await volume(again.page);
  results.push({ expected, after, lost: expected - after });
  console.log(`round ${round + 1}: expected ${expected} coins, after reopen ${after}, lost ${expected - after}`);
  process.kill(-again.proc.pid, 'SIGKILL');
  await new Promise((r) => setTimeout(r, 600));
}
const lost = results.reduce((a, r) => a + r.lost, 0);
console.log(lost ? `FAIL: lost ${lost} actions` : 'OK: nothing lost in ' + ROUNDS + ' hard kills');
s.close();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(lost ? 1 : 0);
