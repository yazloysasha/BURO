// Renders all enemies and animals through the game's own canvas code into one screenshot, for eyeballing.
// Usage: node playtest/contact_enemies.mjs [out.png]
import path from 'node:path';
import { serve, launch, newContext, openGame, PROFILES, OUT } from './lib/harness.mjs';

const s = await serve();
const b = await launch();
const ctx = await newContext(b, { ...PROFILES.desktop, viewport: { width: 1200, height: 1500 } });
const { page } = await openGame(ctx, s.url);
await page.evaluate(async () => {
  const { enemyCanvas, animalCanvas } = await import('/js/core/sprite.js');
  const { game } = await import('/js/game/state.js');
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;background:#2b2442;z-index:99;display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start;padding:6px;overflow:auto;font-size:11px;color:#fff';
  const add = (el, name) => {
    const d = document.createElement('div');
    d.style.cssText = 'width:72px;text-align:center';
    d.append(el, Object.assign(document.createElement('div'), { textContent: name }));
    el.style.margin = '0 auto';
    root.append(d);
  };
  for (const e of game.data.enemies) add(enemyCanvas(e.sprite, 3), e.name);
  for (const a of game.data.animals) add(animalCanvas(a, 48), a.name);
  document.body.append(root);
});
await page.waitForTimeout(800);
await page.screenshot({ path: process.argv[2] || path.join(OUT, 'contact_enemies.png') });
await b.close();
s.close();
process.exit(0);
