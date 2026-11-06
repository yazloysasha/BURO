// Contact sheet of the backroom: the normal room first, then every anomaly, rendered by the game's own painter.
// Usage: node playtest/contact_backroom.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, newContext, openGame, PROFILES, OUT } from './lib/harness.mjs';

const out = process.argv[2] || path.join(OUT, 'contact');
fs.mkdirSync(out, { recursive: true });
const s = await serve();
const b = await launch();
const ctx = await newContext(b, { ...PROFILES.desktop, viewport: { width: 1200, height: 1000 } });
const { page } = await openGame(ctx, s.url);
const ids = await page.evaluate(() => import('/js/game/state.js').then(({ game }) => [null, ...game.data.anomalies.filter((a) => !a.where).map((a) => a.id)]));
const PER = 16;
for (let p = 0; p * PER < ids.length; p++) {
  await page.evaluate(async ({ list }) => {
    const [{ game }, { createBackroomScene }, { sceneWith }] = await Promise.all(['/js/game/state.js', '/js/ui/backroom.js', '/js/game/backroom.js'].map((m) => import(m)));
    document.querySelector('#sheet')?.remove();
    const root = document.createElement('div');
    root.id = 'sheet';
    root.style.cssText = 'position:fixed;inset:0;background:#120e22;z-index:99;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px;font:13px Arial;color:#fff;align-content:start';
    document.body.append(root);
    for (const id of list) {
      const cell = document.createElement('div');
      root.append(cell);
      const sc = createBackroomScene(290, 200);
      cell.append(sc.stage.el, Object.assign(document.createElement('div'), { textContent: id ? `${game.data.anomalies.find((a) => a.id === id).level} · ${game.data.anomalies.find((a) => a.id === id).name}` : 'НОРМА' }));
      await sc.ready;
      sc.set(sceneWith(game.data, id));
    }
  }, { list: ids.slice(p * PER, (p + 1) * PER) });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, `backroom_${p}.png`) });
}
await b.close();
s.close();
process.exit(0);
