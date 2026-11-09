// Browser checks that no unit test can do: offline play from the service worker, save migration and damage handling on a
// real page, export/import through files and text, keyboard controls. Usage: node playtest/checks.mjs [--json out.json]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serve, launch, newContext, PROFILES } from './lib/harness.mjs';
import { newSave, sealSave, serializeSave } from '../js/core/save.js';
import { Bot } from './lib/uibot.mjs';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
};
const ready = (page) => page.waitForSelector('#app:not([hidden]) .menu-grid', { timeout: 60000 });
const s = await serve();
const browser = await launch();

// ---------- offline ----------
for (const profile of ['iphone', 'desktop']) {
  const ctx = await newContext(browser, PROFILES[profile]);
  const page = await ctx.newPage();
  const external = [];
  const errors = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(s.url) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(s.url);
  await ready(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => {
    const keys = await caches.keys();
    if (!keys.length) return false;
    const c = await caches.open(keys[0]);
    return (await c.keys()).length >= self.navigator.hardwareConcurrency * 0 + 800 && !!navigator.serviceWorker.controller;
  }, null, { timeout: 120000, polling: 500 });
  const cached = await page.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).length);
  await ctx.setOffline(true);
  await page.reload();
  await ready(page);
  check(`offline ${profile}: reload with no network boots the game`, true, cached + ' files in the cache');
  const bot = new Bot(page, 'smart', 'offline' + profile, PROFILES[profile].hasTouch);
  const rec = await bot.playRun(0);
  check(`offline ${profile}: a full run with no network`, rec.outcome === 'win' || rec.outcome === 'lose', `${rec.outcome} on floor ${rec.floor}/${rec.total}, ${rec.taps} taps`);
  check(`offline ${profile}: no external requests, no page errors`, !external.length && !errors.length, [...external, ...errors].slice(0, 3).join(' | '));
  await page.close();
  const fresh = await ctx.newPage();
  await fresh.goto(s.url);
  await ready(fresh);
  const after = await readSaveText(fresh);
  check(`offline ${profile}: progress survives closing the page while offline`, after.stats.runs === 1);
  await ctx.close();
}

function readSaveText(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('buro.save');
    return JSON.parse(raw.startsWith('BURO1|') ? raw.slice(raw.indexOf('|', 6) + 1) : raw);
  });
}

async function withStorage(seed, fn, profile = PROFILES.desktop) {
  const ctx = await newContext(browser, profile, { acceptDownloads: true });
  await ctx.addInitScript((pairs) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [k, v] of pairs) localStorage.setItem(k, v);
  }, Object.entries(seed));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(s.url);
  await ready(page);
  await fn(page, errors, ctx);
  await ctx.close();
}

// ---------- old and damaged saves ----------
const v1 = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../tests/fixtures/save_v1.json'), 'utf8');
await withStorage({ 'buro.save': v1 }, async (page, errors) => {
  const save = await readSaveText(page);
  check('save v1 migrates on a real page', save.version >= 5 && save.meta.coins === JSON.parse(v1).meta.coins && !errors.length, 'now v' + save.version + ', coins ' + save.meta.coins);
});
const v2 = JSON.parse(v1);
v2.version = 2;
v2.collection = { items: { sardine: 3 }, mods: { 'sardine|shiny': 1 }, animals: {}, stickers: {} };
await withStorage({ 'buro.save': JSON.stringify(v2) }, async (page, errors) => {
  const save = await readSaveText(page);
  check('save v2 migrates on a real page', save.version >= 5 && save.collection.items['sardine|shiny'] === 1 && save.collection.items.sardine === 2 && !errors.length);
});
await withStorage({ 'buro.save': '{"version":4,"meta":{"coins":12' }, async (page, errors) => {
  const text = await page.locator('#toast').innerText();
  check('a corrupted save does not break the game: starts fresh and says so', !errors.length && /повредилось/i.test(text), text.slice(0, 60));
  const keptCopy = await page.evaluate(() => localStorage.getItem('buro.save.corrupt'));
  check('the unreadable save is kept for rescue', !!keptCopy);
});
const good = newSave(new Date(), 'bak');
good.meta.coins = 321;
const sealed = sealSave(serializeSave(good));
await withStorage({ 'buro.save': sealed.slice(0, -40), 'buro.save.bak': sealed }, async (page, errors) => {
  const save = await readSaveText(page);
  const text = await page.locator('#toast').innerText();
  check('a torn save falls back to the backup', save.meta.coins === 321 && !errors.length && /резервной/i.test(text), 'coins ' + save.meta.coins);
});
await withStorage({ 'buro.save': sealed.replace('"coins":321', '"coins":999') }, async (page) => {
  const save = await readSaveText(page);
  check('an edited save fails its checksum and is not trusted', save.meta.coins !== 999);
});

// ---------- export / import ----------
const rich = newSave(new Date(), 'export');
rich.meta.coins = 555;
rich.collection.animals.fox = 1;
let exported = null;
await withStorage({ 'buro.save': sealSave(serializeSave(rich)) }, async (page) => {
  await page.locator('.menu-grid .btn', { hasText: 'Настройки' }).click();
  await page.locator('.btn.blue.grow').first().click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#overlay .btn', { hasText: 'Скачать файл' }).click()]);
  const file = path.join(os.tmpdir(), 'buro-export-' + Date.now() + '.json');
  await download.saveAs(file);
  exported = fs.readFileSync(file, 'utf8');
  check('export: Windows-style file download', /"game":"buro"/.test(exported) && /pepsya-dudonya-/.test(download.suggestedFilename()), download.suggestedFilename());
  const shown = await page.locator('#overlay textarea').inputValue();
  check('export: the same text is available to copy', JSON.parse(shown).save.meta.coins === 555);
  await withStorage({}, async (p2, errs) => {
    await p2.locator('.menu-grid .btn', { hasText: 'Настройки' }).click();
    await p2.locator('.btn.blue.grow').nth(1).click();
    await p2.setInputFiles('#overlay input[type=file]', file);
    await p2.waitForSelector('.menu-grid');
    const after = await readSaveText(p2);
    check('import: from a file on a clean device', after.meta.coins === 555 && after.collection.animals.fox === 1 && !errs.length);
  });
  await withStorage({}, async (p3) => {
    await p3.locator('.menu-grid .btn', { hasText: 'Настройки' }).click();
    await p3.locator('.btn.blue.grow').nth(1).click();
    await p3.locator('#overlay textarea').fill(shown);
    await p3.locator('#overlay .btn', { hasText: 'Загрузить' }).click();
    await p3.waitForSelector('.menu-grid');
    check('import: from pasted text', (await readSaveText(p3)).meta.coins === 555);
  });
  await withStorage({}, async (p4) => {
    await p4.locator('.menu-grid .btn', { hasText: 'Настройки' }).click();
    await p4.locator('.btn.blue.grow').nth(1).click();
    await p4.locator('#overlay textarea').fill('это не сохранение');
    await p4.locator('#overlay .btn', { hasText: 'Загрузить' }).click();
    check('import: garbage is refused, progress untouched', /Не получилось/.test(await p4.locator('#toast').innerText()) && (await readSaveText(p4)).meta.coins === 0);
  });
});
// iPhone: no downloads in standalone mode, the share sheet takes over
{
  const ctx = await newContext(browser, PROFILES.iphone);
  await ctx.addInitScript(() => {
    navigator.share = async (d) => { window.__shared = { n: (d.files || []).length, name: d.files && d.files[0] && d.files[0].name }; };
    navigator.canShare = () => true;
  });
  const page = await ctx.newPage();
  await page.goto(s.url);
  await ready(page);
  await page.locator('.menu-grid .btn', { hasText: 'Настройки' }).tap();
  await page.locator('.btn.blue.grow').first().tap();
  await page.locator('#overlay .btn', { hasText: 'Поделиться' }).tap();
  await page.waitForTimeout(100);
  const shared = await page.evaluate(() => window.__shared);
  check('export: iPhone share sheet gets the save file', shared && shared.n === 1, shared && shared.name);
  await ctx.close();
}

// ---------- keyboard ----------
await withStorage({}, async (page, errors) => {
  const key = async (k) => {
    await page.keyboard.press(k);
    await page.waitForTimeout(80);
  };
  await key('Enter'); // the big button: to the run
  check('keyboard: Enter presses the main button', !!(await page.$('#overlay.show .leader-pick')));
  await key('Escape');
  check('keyboard: Esc closes a dialog', !(await page.$('#overlay.show')));
  await key('Space');
  await key('1'); // Peposya leads
  await page.waitForSelector('.map-area');
  check('keyboard: Space and number keys start a run', !!(await page.$('.map-node.avail')));
  await key('Escape');
  check('keyboard: Esc goes back from the map to the Lavka', !!(await page.$('.menu-grid')));
  await key('Enter');
  await page.waitForSelector('.map-area');
  await key('1'); // a room
  await key('Enter'); // enter it
  await page.waitForSelector('.action-grid');
  check('keyboard: numbers pick a map node, Enter goes in', true);
  for (let i = 0; i < 2; i++) {
    await key('1');
    if (await page.$('.tap-zone.targetable')) await key('1');
  }
  check('keyboard: numbers pick combat actions and targets', !!(await page.$('.skip-hint')) || !!(await page.$('.action-grid')));
  await key('Space'); // skip the animation
  await page.waitForFunction(() => document.querySelector('.action-grid') || document.querySelector('.reward'), null, { timeout: 8000 });
  const before = Date.now();
  check('keyboard: Space skips the round animation', Date.now() - before < 8000);
  check('keyboard: no errors along the way', !errors.length, errors.join(' | '));
});

// ---------- find room lock, album page ----------
await withStorage({}, async (page, errors) => {
  await page.evaluate(async () => {
    const [{ game, commit }, run, app] = await Promise.all(['/js/game/state.js', '/js/game/run.js', '/js/ui/app.js'].map((m) => import(m)));
    run.startRun(game.save, game.data, { leader: 'peposya' });
    const r = game.save.run;
    const node = r.map.floors[3][0];
    node.type = 'loot';
    r.map.floors[0][0].up = [node.id];
    r.pos = r.map.floors[0][0].id;
    run.enterNode(game.save, game.data, node.id);
    commit();
    app.go('room');
  });
  const leave = page.locator('.leave-wrap .btn');
  check('find room: the way out is locked while a block is closed', await leave.isDisabled(), await leave.innerText());
  for (let i = 0; i < 4 && (await page.locator('.lucky:not(.opened)').count()); i++) {
    await page.locator('.lucky:not(.opened)').first().click();
    await page.waitForTimeout(1200);
  }
  check('find room: opening the blocks unlocks it', await leave.isEnabled(), await leave.innerText());
  check('find room: no errors', !errors.length, errors.join(' | '));
});
const almost = newSave(new Date(), 'page');
for (const a of ['bug_bee', 'bug_beetle', 'bug_dragonfly', 'bug_firefly', 'bug_gnat', 'bug_moth']) almost.collection.animals[a] = 1;
await withStorage({ 'buro.save': sealSave(serializeSave(almost)) }, async (page, errors) => {
  await page.locator('.menu-grid .btn', { hasText: 'Альбом' }).click();
  await page.locator('.album-nav .btn.blue').click();
  await page.locator('#overlay .album-index', { hasText: 'Сад' }).click();
  for (let i = 0; i < 6; i++) {
    await page.locator('.sticker.new').first().click();
    await page.waitForTimeout(350);
  }
  await page.waitForSelector('#overlay.show .btn.green');
  const text = await page.locator('#overlay').innerText();
  await page.locator('#overlay .btn.green').click();
  const save = await readSaveText(page);
  check('album: a full page pays its reward through the UI', save.album.completed.includes('garden') && save.meta.ownedSkins.includes('dud_peach') && !errors.length, text.replace(/\s+/g, ' ').slice(0, 70));
});

// ---------- night shift through the UI ----------
await withStorage({}, async (page, errors) => {
  await page.locator('.menu-grid .btn', { hasText: 'Ночная смена' }).click();
  await page.locator('.btn.big.green').click();
  await page.waitForSelector('.br-actions');
  const intro = await page.locator('.br-msg').innerText();
  const plaque0 = await page.locator('.br-plaque').innerText();
  check('night shift: no objective on screen, only the room and two doors', /Запомни/.test(intro) && plaque0 === '0' && (await page.locator('.br-actions .btn').count()) === 2, intro.slice(0, 50));
  let calls = 0;
  let wrongOnce = false;
  for (; calls < 40 && (await page.$('.br-actions')); calls++) {
    const st = await readSaveText(page).then((s) => s.meta.nightShift.state);
    // one deliberate mistake on a normal loop to see the reset
    const choice = !wrongOnce && !st.cur && calls > 0 ? 'back' : st.cur ? 'back' : 'forward';
    if (choice === 'back' && !st.cur) wrongOnce = true;
    await page.locator(choice === 'back' ? '.br-back' : '.br-forward').click();
    await page.waitForTimeout(400);
    if (wrongOnce && choice === 'back' && !st.cur) {
      const msg = await page.locator('.br-msg').innerText();
      check('night shift: a false alarm resets the counter and says so, softly', /как обычно/.test(msg) && (await page.locator('.br-plaque').innerText()) === '0', msg);
    }
  }
  let save = await readSaveText(page);
  // a shift can be all normal loops: walk again (no daily reward then) until something odd shows up
  for (let extra = 0; extra < 6 && !Object.keys(save.collection.anomalies || {}).length; extra++) {
    await page.locator('.btn.big.green').click();
    for (let k = 0; k < 40 && (await page.$('.br-actions')); k++) {
      const st = (await readSaveText(page)).meta.nightShift.state;
      await page.locator(st.cur ? '.br-back' : '.br-forward').click();
      await page.waitForTimeout(300);
    }
    save = await readSaveText(page);
  }
  check('night shift: finishes with a reward once a day', save.meta.nightShift.state.done && save.meta.nightPaidDate && save.meta.coins > 0, `${calls} calls, ${save.meta.coins} coins, grade ${save.meta.nightShift.result.grade}`);
  check('night shift: caught anomalies land in the journal', Object.keys(save.collection.anomalies || {}).length >= 1, Object.keys(save.collection.anomalies || {}).join(', '));
  await page.locator('.btn', { hasText: 'В Лавку' }).click();
  await page.locator('.menu-grid .btn', { hasText: 'Журнал' }).click();
  await page.locator('.seg.tabs .btn').nth(1).click();
  check('journal: the anomaly tab lists what was found', (await page.locator('.combo-row.known').count()) >= 1 && !errors.length, errors.join(' | '));
});

// ---------- tap zones open dialogs that stay open (enemy info in combat, the customer at the counter) ----------
{
  const ctx = await newContext(browser, PROFILES.iphone);
  const page = await ctx.newPage();
  await page.goto(s.url);
  await ready(page);
  await page.evaluate(() => Promise.all([import('/js/game/state.js'), import('/js/ui/app.js'), import('/js/game/run.js')]).then(([{ game, commit }, app, run]) => {
    run.startRun(game.save, game.data, { leader: 'peposya' });
    run.enterNode(game.save, game.data, game.save.run.map.floors[0][0].id);
    commit();
    app.go('room');
  }));
  await page.locator('.tap-zone').nth(2).tap();
  await page.waitForTimeout(500);
  check('combat: tapping an enemy opens its card and it stays open', !!(await page.$('#overlay.show')));
  await page.locator('#overlay .btn.green').tap();
  await page.evaluate(() => Promise.all([import('/js/game/state.js'), import('/js/ui/app.js')]).then(([{ game, commit }, app]) => {
    game.save.run = null;
    game.save.collection.items['book_01a'] = 1;
    game.save.meta.customer = { animal: 'hedgehog', want: { kind: 'category', value: 'book' }, mult: 2 };
    commit();
    app.go('hub');
  }));
  await page.locator('.tap-zone[aria-label="Ёжик"]').tap();
  await page.waitForTimeout(500);
  check('customer: tapping the visitor opens their wish', !!(await page.$('#overlay.show .item-row.clickable')));
  const before = (await readSaveText(page)).meta.coins;
  await page.locator('#overlay .item-row.clickable').first().tap();
  await page.waitForTimeout(200);
  const after = await readSaveText(page);
  check('customer: selling pays a premium and the visitor leaves', after.meta.coins > before && !after.meta.customer, `+${after.meta.coins - before} coins`);
  await ctx.close();
}

// ---------- update ----------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buro-update-'));
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  for (const f of fs.readdirSync(root)) {
    if (['node_modules', '.git', 'playtest', 'tests', 'tools', 'LICENSES'].includes(f)) continue;
    fs.cpSync(path.join(root, f), path.join(dir, f), { recursive: true });
  }
  const s2 = await serve(dir);
  const ctx = await newContext(browser, PROFILES.iphone);
  const page = await ctx.newPage();
  await page.goto(s2.url);
  await ready(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 120000 });
  await page.evaluate(() => import('/js/game/state.js').then(({ game, commit }) => { game.save.meta.coins = 42; commit(); }));
  const cacheBefore = await page.evaluate(() => caches.keys());
  const mf = path.join(dir, 'precache-manifest.js');
  fs.writeFileSync(mf, fs.readFileSync(mf, 'utf8').replace(/BURO_VERSION = (\d+)/, (m, v) => 'BURO_VERSION = ' + (Number(v) + 1)));
  await page.reload();
  await ready(page);
  await page.waitForSelector('#toast .btn.green', { timeout: 120000 });
  check('update: a new version offers "Обновить"', true, await page.locator('#toast').innerText());
  await page.locator('#toast .btn.green').tap();
  await page.waitForFunction((old) => caches.keys().then((k) => k.length === 1 && k[0] !== old[0]), cacheBefore, { timeout: 60000, polling: 300 });
  await page.waitForTimeout(800);
  await ready(page);
  const cacheAfter = await page.evaluate(() => caches.keys());
  const save = await readSaveText(page);
  check('update: new cache replaces the old one, save intact', save.meta.coins === 42, cacheBefore + ' -> ' + cacheAfter);
  await ctx.close();
  s2.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

await browser.close();
s.close();
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
const jsonAt = process.argv.indexOf('--json');
if (jsonAt > 0) fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(results, null, 1));
process.exit(failed.length ? 1 : 0);
