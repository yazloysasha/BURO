// Times combat rounds through the real UI in a mid-run 3-enemy fight (setup via game modules, rounds via taps):
// from the last cat's action tap until the action panel is back.
// Usage: node playtest/measure_round.mjs [animSpeed|0=default] [--skip]   (--skip taps during the animation)
import { serve, launch, newContext, openGame, PROFILES } from './lib/harness.mjs';

const speed = Number(process.argv[2] || 0);
const skip = process.argv.includes('--skip');
const s = await serve();
const b = await launch();
const ctx = await newContext(b, PROFILES.iphone);
const { page } = await openGame(ctx, s.url);
const all = [];
for (let fight = 0; fight < 5; fight++) {
  await page.evaluate(async ({ speed, fight }) => {
    const [{ game, commit }, { setAnimSpeed }, run, { go }] = await Promise.all([import('/js/game/state.js'), import('/js/core/loop.js'), import('/js/game/run.js'), import('/js/ui/app.js')]);
    if (speed) {
      game.save.settings.animSpeed = speed;
      setAnimSpeed(speed);
    }
    game.save.run = null;
    run.startRun(game.save, game.data);
    const r = game.save.run;
    for (const k of Object.keys(r.party)) r.party[k].hp = r.party[k].maxHp = 400; // long fight, nobody dies mid-sample
    const node = r.map.floors[5 + (fight % 2)][0];
    node.type = 'combat';
    r.map.floors[0][0].up = [node.id];
    r.pos = r.map.floors[0][0].id;
    run.enterNode(game.save, game.data, node.id);
    commit();
    go('room');
  }, { speed, fight });
  const times = [];
  const idle = () => page.waitForFunction(() => document.querySelector('.action-grid') || document.querySelector('.reward') || !document.querySelector('.action-panel'), null, { timeout: 60000 });
  while (times.length < 6) {
    await idle();
    if (!(await page.$('.action-grid'))) break;
    await page.locator('.action-grid .btn').nth(times.length % 3 === 2 ? 1 : 0).tap();
    const zone = page.locator('.tap-zone.targetable').first();
    if (await zone.count()) await zone.dispatchEvent('pointerdown');
    const t0 = Date.now();
    if (await page.$('.action-grid')) continue;
    if (skip) {
      await page.waitForTimeout(150);
      await page.touchscreen.tap(200, 700).catch(() => {});
    }
    await idle();
    times.push(Date.now() - t0);
  }
  all.push(...times);
}
all.sort((x, y) => x - y);
const avg = all.reduce((a, t) => a + t, 0) / (all.length || 1);
console.log(`speed ${speed || 'default'}${skip ? ' +skip' : ''}: rounds ${all.length}, avg ${Math.round(avg)} ms, median ${all[all.length >> 1]} ms, max ${all[all.length - 1]} ms`);
await b.close();
s.close();
process.exit(0);
