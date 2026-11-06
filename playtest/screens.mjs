// Visits every screen in a given profile, screenshots it and audits the layout:
// clipped text, sideways overflow, tap targets under 44 px, controls under the home indicator, broken images.
// Usage: node playtest/screens.mjs [iphone|desktop] [outDir] [--only name,name]
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, newContext, PROFILES, OUT } from './lib/harness.mjs';

const profileName = process.argv[2] || 'iphone';
const outDir = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : path.join(OUT, 'screens', profileName);
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
fs.mkdirSync(outDir, { recursive: true });

const profile = PROFILES[profileName];
const s = await serve();
const b = await launch(engine);
const ctx = await newContext(b, profile, { acceptDownloads: true });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push({ screen: current, kind: 'pageerror', detail: e.message }));
page.on('console', (m) => {
  if (m.type() === 'error') problems.push({ screen: current, kind: 'console', detail: m.text() });
});
let current = 'boot';
await page.addInitScript(() => {
  window.__richMeta = (env) => {
    const { game, collection } = env;
    const save = game.save;
    save.meta.coins = 777;
    save.meta.sparkles = 40;
    save.stats.wins = 2;
    save.combos.discovered = game.data.combos.slice(0, 12).map((c) => c.id);
    game.data.items.slice(0, 60).forEach((it, i) => collection.addItem(save, it.id, i % 7 === 0 ? ['shiny'] : i % 11 === 0 ? ['golden', 'dirty'] : []));
    game.data.animals.slice(0, 25).forEach((a) => (save.collection.animals[a.id] = 1));
    for (const e of ['klobster', 'fly', 'beetle']) save.collection.stickers[e] = 1;
    save.meta.guests = [game.data.animals[0].id];
  };
});
await page.goto(s.url);
await page.waitForSelector('#app:not([hidden]) .menu-grid', { timeout: 60000 });

// Scene setup goes straight through game modules: this script checks how screens look, the bot checks they can be reached.
const setup = (fn, arg) =>
  page.evaluate(
    async ([src, arg]) => {
      const [{ game, commit }, run, app, rooms, meta, collection, combos] = await Promise.all(['/js/game/state.js', '/js/game/run.js', '/js/ui/app.js', '/js/game/rooms.js', '/js/game/meta.js', '/js/game/collection.js', '/js/game/combos.js'].map((m) => import(m)));
      const f = new Function('env', 'arg', 'return (' + src + ')(env, arg)');
      await f({ game, commit, run, app, rooms, meta, collection, combos }, arg);
      commit();
    },
    [fn.toString(), arg],
  );

// Runs in the page: force a room of the given type at the given floor.
const enterRoom = async (type, floor = 3, extra = null) => {
  await setup((env, { type, floor }) => {
    const { game, run, app } = env;
    game.save.run = null;
    run.startRun(game.save, game.data, { leader: 'peposya' });
    const r = game.save.run;
    const f = Math.min(floor, r.map.floors.length - 2);
    const node = type === 'boss' ? r.map.floors[r.map.floors.length - 1][0] : r.map.floors[f][0];
    node.type = type;
    r.map.floors[0][0].up = [node.id];
    r.pos = r.map.floors[0][0].id;
    run.enterNode(game.save, game.data, node.id);
    app.go('room');
  }, { type, floor });
  if (extra) await setup(extra);
};

const fill = (env) => {
  const { game, run } = env;
  const r = game.save.run;
  const ids = ['slipper_justice', 'valerian', 'yarn_bomb', 'catnip', 'ninth_life', 'sword_01e'];
  ids.forEach((id, i) => run.addToBackpack(game.save, game.data, r, id, [['dirty'], ['shiny'], ['golden'], ['cursed'], ['rainbow'], ['glitchy']][i]));
};

// Layout audit in the page: returns problems with what is on screen right now.
async function audit(name) {
  const res = await page.evaluate(({ safeBottom }) => {
    const out = [];
    const vw = innerWidth;
    const vh = innerHeight;
    const z = parseFloat(document.documentElement.style.zoom) || 1;
    const seen = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
    };
    const desc = (el) => (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).join('.') : '') + ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30) + '"');
    const scope = document.querySelector('#overlay.show') ? [document.querySelector('#overlay'), document.querySelector('#topbar')] : [document.querySelector('#screen'), document.querySelector('#topbar')];
    for (const root of scope) {
      for (const el of root.querySelectorAll('*')) {
        if (!seen(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 || r.left < -1) {
          if (!el.closest('.map-area') && !el.closest('.scroll, .map-scroll')?.matches?.('.x-scroll')) out.push({ kind: 'offscreen-x', detail: desc(el), x: [Math.round(r.left), Math.round(r.right)] });
        }
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (hasText && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') out.push({ kind: 'text-clipped', detail: desc(el) });
        if (hasText && r.width > 0) {
          const parent = el.parentElement.getBoundingClientRect();
          if (r.right > parent.right + 2 && getComputedStyle(el.parentElement).overflow !== 'visible') out.push({ kind: 'text-over-parent', detail: desc(el) });
        }
        const fs = parseFloat(getComputedStyle(el).fontSize) * z;
        if (hasText && fs < 12) out.push({ kind: 'small-font', detail: desc(el) + ' ' + fs + 'px' });
      }
      for (const el of root.querySelectorAll('button, [role=button], input, a')) {
        if (!seen(el) || el.classList.contains('file-pick')) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 44 - 0.5 || r.height < 44 - 0.5) out.push({ kind: 'tap<44', detail: desc(el), size: [Math.round(r.width), Math.round(r.height)] });
        if (r.bottom > vh - safeBottom + 1 && !el.closest('.scroll, .map-scroll, .body, .modal, .split-b')) out.push({ kind: 'under-indicator', detail: desc(el), bottom: Math.round(r.bottom) });
      }
    }
    return out;
  }, { safeBottom: profile.safe.bottom });
  const uniq = new Map();
  for (const p of res) uniq.set(p.kind + p.detail, p);
  for (const p of uniq.values()) problems.push({ screen: name, ...p });
}

async function shot(name, { wait = 250, full = false } = {}) {
  current = name;
  await page.waitForTimeout(wait);
  await audit(name);
  await page.screenshot({ path: path.join(outDir, name + '.png'), fullPage: full });
}

const tap = (sel) => (profile.hasTouch ? page.locator(sel).first().tap({ timeout: 8000 }) : page.locator(sel).first().click({ timeout: 8000 }));
const SCREENS = {
  hub_new: async () => {},
  hub_leader: async () => {
    await tap('.btn.big');
    await page.waitForSelector('.leader-pick');
  },
  map: async () => {
    await setup((env) => {
      const { game, run, app } = env;
      game.save.run = null;
      run.startRun(game.save, game.data, { leader: 'peposya' });
      app.closeModal();
      app.go('map');
    });
  },
  map_node: async () => tap('.map-node.avail'),
  backpack: async () => {
    await setup((env) => {
      env.app.closeModal();
      const { game, run } = env;
      ['slipper_justice', 'valerian', 'yarn_bomb', 'catnip', 'ninth_life', 'sword_01e'].forEach((id, i) => run.addToBackpack(game.save, game.data, game.save.run, id, [['dirty'], ['shiny'], ['golden'], ['cursed'], ['rainbow'], ['glitchy']][i]));
      env.app.go('map');
    });
    await tap('.btn.blue.small');
  },
  combat: async () => enterRoom('combat', 6),
  combat_item: async () => {
    await enterRoom('combat', 4, fill);
    await setup((env) => env.app.go('room'));
    await page.locator('.action-grid .btn').nth(3).click();
    await page.waitForSelector('#overlay.show');
  },
  combat_target: async () => {
    await enterRoom('combat', 8);
    await setup((env) => env.app.closeModal());
    await page.locator('.action-grid .btn').first().click();
  },
  combat_enemy: async () => {
    await enterRoom('elite', 7);
    await page.locator('.tap-zone').nth(2).dispatchEvent('pointerdown');
    await page.waitForSelector('#overlay.show');
  },
  combat_boss: async () => {
    await enterRoom('boss');
    await setup((env) => {
      const c = env.game.save.run.room.combat;
      c.enemies[0].hp = Math.floor(c.enemies[0].maxHp * 0.4);
      env.app.go('room');
    });
  },
  reward_loot: async () => {
    await enterRoom('loot', 4);
  },
  reward_full: async () => {
    await enterRoom('loot', 4);
    await setup((env) => {
      const { game, run } = env;
      const r = game.save.run;
      while (r.backpack.length < env.meta.backpackSize(game.save, game.data)) run.addToBackpack(game.save, game.data, r, 'valerian');
      r.room.blocks = [{ rarity: 'rare', forced: null, kind: 'item', id: 'slipper_justice', mods: ['shiny'], opened: false }];
      env.app.go('room');
    });
    await tap('.lucky:not(.opened)');
    await page.waitForSelector('#overlay.show');
  },
  reward_opened: async () => {
    if (await page.$('#overlay.show')) await tap('#overlay.show .actions .btn');
    await page.waitForTimeout(100);
    await enterRoom('loot', 4);
    for (let i = 0; i < 3; i++) {
      const c = page.locator('.lucky:not(.opened)');
      if (!(await c.count())) break;
      await tap('.lucky:not(.opened)');
      await page.waitForTimeout(900);
    }
  },
  anomaly_3x3: async () => enterRoom('anomaly', 2),
  anomaly_4x4: async () => enterRoom('anomaly', 6),
  anomaly_done: async () => {
    await enterRoom('anomaly', 2);
    const n = await page.locator('.anomaly-cell').count();
    for (let i = 0; i < n; i++) {
      const left = page.locator('.anomaly-cell:not(:disabled)');
      if (!(await page.$('.anomaly-grid')) || (await page.$('.reward'))) break;
      await left.first().click({ timeout: 2000 }).catch(() => {});
    }
  },
  shelf: async () => enterRoom('shelf', 8),
  shelf_selected: async () => {
    await enterRoom('shelf', 2);
    await tap('.shelf-item');
  },
  wash: async () => {
    await enterRoom('wash', 3, fill);
    await setup((env) => env.app.go('room'));
  },
  event: async () => enterRoom('event', 3),
  event_done: async () => {
    await enterRoom('event', 3);
    await tap('.event-choice:not(:disabled)');
  },
  shop: async () => enterRoom('shop', 4, (env) => { env.game.save.run.coins = 120; env.app.go('room'); }),
  rest: async () => enterRoom('rest', 4),
  rest_done: async () => {
    await enterRoom('rest', 4);
    await tap('.btn.green.block');
  },
  run_win: async () => {
    await enterRoom('rest', 4, fill);
    await setup((env) => {
      const r = env.game.save.run;
      r.coins = 180;
      r.room = null;
      r.result = { outcome: 'win' };
      env.app.go('runEnd');
    });
  },
  run_lose: async () => {
    await enterRoom('rest', 4, fill);
    await setup((env) => {
      const r = env.game.save.run;
      r.coins = 44;
      r.room = null;
      r.result = { outcome: 'lose' };
      env.app.go('runEnd');
    });
  },
  hub_rich: async () => {
    await setup((env) => {
      env.game.save.run = null;
      window.__richMeta(env);
      env.game.save.lastRun = { outcome: 'win', coins: 120 };
      env.app.go('hub');
    });
  },
  daily: async () => setup((env) => env.app.go('daily')),
  daily_opened: async () => {
    await tap('.lucky');
    await page.waitForTimeout(1000);
  },
  inventory: async () => setup((env) => env.app.go('inventory', { tab: 'items' })),
  inventory_item: async () => tap('.inv-cell'),
  inventory_animals: async () => setup((env) => { env.app.closeModal(); env.app.go('inventory', { tab: 'animals' }); }),
  inventory_animal: async () => tap('.inv-cell'),
  album: async () => setup((env) => { env.app.closeModal(); env.app.go('album'); }),
  album_index: async () => tap('.album-nav .btn.blue'),
  combos: async () => setup((env) => { env.app.closeModal(); env.app.go('combos'); }),
  talents: async () => setup((env) => env.app.go('talents')),
  upgrades: async () => setup((env) => env.app.go('upgrades')),
  skins: async () => setup((env) => env.app.go('skins')),
  settings: async () => setup((env) => env.app.go('settings')),
  settings_export: async () => tap('.btn.blue.grow'),
  settings_import: async () => {
    await setup((env) => env.app.closeModal());
    await page.locator('.btn.blue.grow').nth(1).click();
  },
  credits: async () => setup((env) => { env.app.closeModal(); env.app.go('credits'); }),
};

const needRich = ['inventory', 'album', 'combos', 'talents', 'upgrades', 'skins'];
for (const [name, fn] of Object.entries(SCREENS)) {
  if (only && !only.includes(name)) continue;
  current = name;
  try {
    if (only && needRich.some((n) => name.startsWith(n))) await setup((env) => { env.game.save.run = null; window.__richMeta(env); });
    await fn();
    await shot(name);
  } catch (e) {
    problems.push({ screen: name, kind: 'script', detail: e.message.split('\n')[0] });
  }
}
await b.close();
s.close();
const byKind = {};
for (const p of problems) byKind[p.kind] = (byKind[p.kind] || 0) + 1;
console.log(profileName, 'screens:', fs.readdirSync(outDir).filter((f) => f.endsWith('.png')).length, 'problems:', JSON.stringify(byKind));
fs.writeFileSync(path.join(outDir, 'audit.json'), JSON.stringify(problems, null, 1));
for (const p of problems) console.log(`[${p.screen}] ${p.kind}: ${p.detail}${p.size ? ' ' + p.size.join('x') : ''}${p.x ? ' x=' + p.x : ''}`);
process.exit(0);
