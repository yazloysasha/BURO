// Contact sheets of "sprite + name" for all items, for reviewing by eye. Usage: node playtest/contact_items.mjs outDir
import path from 'node:path';
import fs from 'node:fs';
import { serve, launch, newContext, openGame, PROFILES } from './lib/harness.mjs';

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const PER = 70;
const s = await serve();
const b = await launch();
const ctx = await newContext(b, { ...PROFILES.desktop, viewport: { width: 1180, height: 1000 } });
const { page } = await openGame(ctx, s.url);
const n = await page.evaluate(() => import('/js/game/state.js').then(({ game }) => game.data.items.length));
for (let p = 0; p * PER < n; p++) {
  await page.evaluate(async ({ p, PER }) => {
    const { iconCanvas } = await import('/js/core/sprite.js');
    const { game } = await import('/js/game/state.js');
    document.querySelector('#sheet')?.remove();
    const root = document.createElement('div');
    root.id = 'sheet';
    root.style.cssText = 'position:fixed;inset:0;background:#3a3350;z-index:99;display:grid;grid-template-columns:repeat(10,1fr);gap:4px;padding:4px;font:13px/1.1 Arial;color:#fff;align-content:start';
    const items = game.data.items.slice().sort((a, b) => a.icon.localeCompare(b.icon)).slice(p * PER, (p + 1) * PER);
    for (const it of items) {
      const d = document.createElement('div');
      d.style.cssText = 'text-align:center;height:136px;overflow:hidden';
      const c = iconCanvas(it.icon, { w: it.w, h: it.h, target: 64 });
      c.style.margin = '0 auto';
      d.append(c, Object.assign(document.createElement('div'), { textContent: it.name }), Object.assign(document.createElement('div'), { textContent: it.icon.split('/').pop().replace('.png', ''), style: 'color:#b9b;font-size:10px' }));
      root.append(d);
    }
    document.body.append(root);
  }, { p, PER });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, `items_${String(p).padStart(2, '0')}.png`) });
}
await b.close();
s.close();
process.exit(0);
