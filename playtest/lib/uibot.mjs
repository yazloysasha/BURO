// The UI bot itself: plays through taps/clicks on what is on screen. Reads the save from localStorage to decide (like a
// player reads the screen), never calls game functions.
import { Rng } from '../../js/core/rng.js';
import { findNode, availableNodes } from '../../js/game/map.js';
import { aliveEnemies, catByKey, CAT_KEYS } from '../../js/game/combat.js';
import { dailyAvailable, localDate } from '../../js/game/daily.js';
import { pageState } from '../../js/game/progress.js';
import { loadData } from '../../tests/helpers.mjs';
import { makeStrategy, usableItems, ACTION_ORDER } from './strategy.mjs';

export const data = loadData();
const SKIP = process.argv.includes('--skip'); // tap through animations

export class Bot {
  constructor(page, stratName, seed, touch) {
    this.page = page;
    this.touch = touch;
    this.strat = makeStrategy(stratName, Rng.fromSeed('ui:' + stratName + ':' + seed));
    this.taps = 0;
    this.seenRooms = new Set();
  }

  async save() {
    return this.page.evaluate(() => {
      const raw = localStorage.getItem('buro.save');
      return raw ? raw.slice(raw.indexOf('|', 6) + 1) : null;
    }).then((t) => JSON.parse(t));
  }

  async tapEl(loc, opts = {}) {
    this.taps++;
    if (this.touch) await loc.tap({ timeout: 15000, ...opts });
    else await loc.click({ timeout: 15000, ...opts });
  }

  tapSel(sel, opts) {
    return this.tapEl(this.page.locator(sel).first(), opts);
  }

  async modalGreen() {
    await this.tapSel('#overlay.show .actions .btn.green');
  }

  // Waits for the combat view or whatever follows it, tapping through animations if asked.
  async waitCombatIdle() {
    const done = () => document.querySelector('.action-grid') || document.querySelector('.reward') || document.querySelector('.run-end-marker') || (!document.querySelector('.action-panel') && document.querySelector('#screen').children.length);
    if (SKIP) await this.page.touchscreen?.tap?.(200, 700).catch(() => {});
    await this.page.waitForFunction(done, null, { timeout: 30000 });
  }

  async playCombat() {
    for (let guard = 0; guard < 400; guard++) {
      await this.waitCombatIdle();
      if (!(await this.page.$('.action-grid'))) return;
      const save = await this.save();
      const c = save.run.room.combat;
      const plan = this.strat.combatActions(save, data);
      for (const key of CAT_KEYS) {
        const cat = catByKey(c, key);
        if (!cat || cat.ko || cat.hp <= 0 || !plan[key]) continue;
        await this.page.waitForSelector('.action-grid', { timeout: 10000 });
        const a = plan[key];
        // the special may be on cooldown and items may be spent: the buttons are always in the same order
        await this.tapEl(this.page.locator('.action-grid .btn').nth(ACTION_ORDER.indexOf(a.action)));
        if (a.action === 'item') {
          const list = usableItems(save.run, data).filter((b) => b.uid !== (plan.peposya && key === 'dudonya' ? plan.peposya.itemUid : null));
          const idx = list.findIndex((b) => b.uid === a.itemUid);
          await this.tapEl(this.page.locator('#overlay.show .item-row.clickable').nth(Math.max(0, idx)));
        }
        // when several enemies are alive the game asks for a target
        await this.page.waitForTimeout(20);
        const zones = this.page.locator('.tap-zone.targetable');
        if (await zones.count()) {
          const alive = aliveEnemies(c);
          const i = Math.max(0, alive.findIndex((e) => e.uid === a.target));
          await this.tapEl(zones.nth(i));
        }
      }
    }
    throw new Error('combat never ended');
  }

  // Opens every closed lucky block on screen; answers the full-backpack dialog through the strategy.
  async openBlocks(rec) {
    for (let guard = 0; guard < 12; guard++) {
      const cards = this.page.locator('.lucky:not(.opened)');
      if (!(await cards.count())) break;
      const save = await this.save();
      const blocks = (save.run.room.blocks || []).filter((b) => !b.opened);
      await this.tapEl(cards.first());
      rec.blocks++;
      if (blocks[0]) rec.rarity[blocks[0].rarity] = (rec.rarity[blocks[0].rarity] || 0) + 1;
      await this.page.waitForTimeout(40);
      if (await this.page.$('#overlay.show')) {
        const fresh = await this.save();
        const b = (fresh.run.room.blocks || []).find((x) => !x.opened);
        const drop = this.strat.fullBackpack(fresh, data, b);
        if (drop) await this.tapEl(this.page.locator('#overlay.show .item-row.clickable').nth(fresh.run.backpack.findIndex((e) => e.uid === drop)));
        else await this.tapSel('#overlay.show .actions .btn');
      }
      await this.page.waitForFunction(() => {
        const running = [...document.querySelectorAll('.lucky')].some((l) => !l.classList.contains('opened'));
        return !running || document.querySelectorAll('.lucky:not(.opened)').length >= 0;
      });
      await this.page.waitForTimeout(SKIP ? 60 : 700);
    }
  }

  async leave() {
    await this.page.waitForFunction(() => {
      const list = [...document.querySelectorAll('.btn.big')].filter((b) => b.getClientRects().length);
      return list.length && !list[list.length - 1].disabled;
    }, null, { timeout: 15000 });
    await this.tapEl(this.page.locator('.btn.big:not(:disabled)').last());
  }

  async playRoom(save, rec) {
    const run = save.run;
    const type = run.room.type;
    rec.rooms[type] = (rec.rooms[type] || 0) + 1;
    if (['combat', 'elite', 'boss'].includes(type)) {
      await this.playCombat();
      const after = await this.save();
      if (!after.run || after.run.result) return;
      await this.page.waitForSelector('.reward', { timeout: 15000 });
    } else if (type === 'anomaly') {
      for (let g = 0; g < 30; g++) {
        const s = await this.save();
        if (s.run.room.phase !== 'play') break;
        await this.page.waitForSelector('.anomaly-cell');
        await this.tapEl(this.page.locator('.anomaly-cell').nth(this.strat.anomalyPick(s.run.room)));
      }
      await this.page.waitForSelector('.reward');
    } else if (type === 'shelf') {
      for (let g = 0; g < 60; g++) {
        const s = await this.save();
        if (s.run.room.phase !== 'play') break;
        const [itemIdx, shelfIdx] = this.strat.shelfPick(s.run.room);
        const domIdx = s.run.room.shelf.items.slice(0, itemIdx).filter((x) => !x.placed).length;
        await this.tapEl(this.page.locator('.shelf-item').nth(domIdx));
        await this.tapEl(this.page.locator('.shelf.ready').nth(shelfIdx));
      }
      await this.page.waitForSelector('.reward');
    } else if (type === 'rest') {
      const choice = this.strat.restChoice(await this.save());
      await this.tapEl(this.page.locator(choice === 'sleep' ? '.btn.green.block' : '.btn.blue.block').first());
      await this.page.waitForSelector('.btn.big');
    } else if (type === 'wash') {
      for (let g = 0; g < 12; g++) {
        const wash = this.page.locator('.item-row .btn.blue.small');
        if (!(await wash.count())) break;
        await this.tapEl(wash.first());
      }
      if (this.strat.washCats(await this.save())) {
        const cats = this.page.locator('.btn.blue.block');
        if (await cats.count()) await this.tapEl(cats.first());
      }
    } else if (type === 'event') {
      const s = await this.save();
      const idx = this.strat.eventChoice(s, data, data.eventById[s.run.room.event.id]);
      await this.tapEl(this.page.locator('.event-choice').nth(idx));
      await this.page.waitForSelector('.reward');
    } else if (type === 'shop') {
      for (let g = 0; g < 10; g++) {
        const s = await this.save();
        const n = this.strat.shopNext(s, data);
        if (n === null) break;
        const before = s.run.coins;
        await this.tapEl(this.page.locator('.item-row').nth(n).locator('.btn'));
        const s2 = await this.save();
        if (s2.run.coins === before) break;
        await this.openBlocks(rec);
      }
    }
    await this.openBlocks(rec);
    await this.leave();
  }

  async finishRun(rec) {
    const save = await this.save();
    const win = save.run.result.outcome === 'win';
    rec.outcome = save.run.result.outcome;
    rec.floor = save.run.floorNo;
    rec.total = save.run.map.floors.length;
    rec.diedIn = win ? null : save.run.room ? save.run.room.type : null;
    rec.reachedBoss = win || rec.diedIn === 'boss';
    rec.killedBy = win ? null : (save.run.room && save.run.room.combat && save.run.room.combat.enemies.filter((e) => e.hp > 0).map((e) => e.id).join('+')) || null;
    rec.coinsFound = save.run.stats.coinsFound;
    await this.page.waitForSelector('.btn.big');
    if (win) {
      const plan = this.strat.sellPlan(save, data);
      for (const uid of plan) {
        const idx = save.run.backpack.findIndex((b) => b.uid === uid);
        if (idx >= 0) await this.tapEl(this.page.locator('.sell-row .sell-toggle').nth(idx));
      }
    } else if (save.run.backpack.length) {
      const uid = this.strat.keepOne(save, data);
      await this.tapEl(this.page.locator('.item-row.clickable').nth(save.run.backpack.findIndex((b) => b.uid === uid)));
    }
    const coinsBefore = save.meta.coins;
    await this.tapEl(this.page.locator('.btn.big'));
    await this.page.waitForSelector('.menu-grid');
    const s = await this.save();
    rec.earned = s.meta.coins - coinsBefore;
    rec.sold = s.lastRun.soldFor || 0;
  }

  async playRun(index) {
    const rec = { strategy: this.strat.name, index, blocks: 0, rarity: {}, rooms: {}, taps: 0, roomOrder: [], events: [] };
    const t0 = Date.now();
    const tapsAt0 = this.taps;
    const before = await this.save();
    rec.coinsBefore = before.meta.coins;
    rec.tier = before.meta.tier;
    await this.tapEl(this.page.locator('.btn.big'));
    const leader = this.strat.chooseLeader();
    await this.tapEl(this.page.locator('#overlay.show .leader-pick').nth(leader === 'peposya' ? 0 : 1));
    await this.page.waitForSelector('.map-area');
    const started = await this.save();
    rec.fee = started.run.fee;
    for (let guard = 0; guard < 40; guard++) {
      const save = await this.save();
      if (save.run.result) break;
      const id = this.strat.chooseNode(save, data);
      const list = availableNodes(save.run.map, save.run.pos);
      const row = findNode(save.run.map, list[0]).f;
      const domIndex = save.run.map.floors[row].filter((n) => list.includes(n.id)).findIndex((n) => n.id === id);
      await this.page.waitForSelector('.map-node.avail');
      await this.tapEl(this.page.locator('.map-node.avail').nth(domIndex));
      await this.modalGreen();
      await this.page.waitForFunction(() => !document.querySelector('.map-area'));
      const inRoom = await this.save();
      rec.roomOrder.push(inRoom.run.room.type);
      if (inRoom.run.room.type === 'event') rec.events.push(inRoom.run.room.event.id);
      await this.playRoom(inRoom, rec);
    }
    await this.finishRun(rec);
    rec.taps = this.taps - tapsAt0;
    rec.seconds = Math.round((Date.now() - t0) / 100) / 10;
    return rec;
  }

  // Between runs, through the real screens.
  async metaPhase(rec) {
    const open = async (label) => {
      await this.tapEl(this.page.locator('.menu-grid .btn', { hasText: label }));
    };
    const back = async () => {
      await this.tapEl(this.page.locator('.btn.back').first());
      await this.page.waitForSelector('.menu-grid');
    };
    const s0 = await this.save();
    if (dailyAvailable(s0, localDate())) {
      await open('Подарок дня');
      await this.tapSel('.lucky');
      await this.page.waitForTimeout(SKIP ? 100 : 900);
      await back();
      rec.daily = true;
    }
    rec.bought = [];
    for (let guard = 0; guard < 120; guard++) {
      const save = await this.save();
      const m = this.strat.metaNext(save, data);
      if (!m) break;
      rec.bought.push(m.type);
      if (m.type === 'sticker') {
        await open('Альбом');
        const pageIdx = data.album.findIndex((p) => p.id === m.page);
        await this.tapSel('.album-nav .btn.blue');
        await this.tapEl(this.page.locator('#overlay.show .album-index').nth(pageIdx));
        await this.page.waitForSelector('.album-grid');
        for (let g = 0; g < 16; g++) {
          const cell = this.page.locator('.sticker.new');
          if (!(await cell.count())) break;
          await this.tapEl(cell.first());
          await this.page.waitForTimeout(160);
          const cur = await this.save();
          if (pageState(cur, data.album[pageIdx]).completed) {
            await this.page.waitForSelector('#overlay.show .btn.green', { timeout: 3000 }).catch(() => {});
            if (await this.page.$('#overlay.show .btn.green')) await this.modalGreen();
            rec.pageCompleted = (rec.pageCompleted || 0) + 1;
          }
        }
        await back();
      } else if (m.type === 'upgrade' || m.type === 'tier') {
        await open('Улучшения');
        await this.page.waitForSelector('.tier-box');
        if (m.type === 'tier') {
          await this.tapEl(this.page.locator('.tier-box .btn.green'));
          await this.modalGreen();
          await this.page.waitForTimeout(40);
        } else {
          const i = data.upgrades.findIndex((u) => u.id === m.id);
          await this.tapEl(this.page.locator('.item-row').nth(i).locator('.btn'));
        }
        await back();
      } else if (m.type === 'talent') {
        await open('Таланты');
        const bi = data.talents.findIndex((b) => b.nodes.some((n) => n.id === m.id));
        await this.tapEl(this.page.locator('.seg.tabs .btn').nth(bi));
        const ni = data.talents[bi].nodes.findIndex((n) => n.id === m.id);
        await this.tapEl(this.page.locator('.talent').nth(ni).locator('.btn'));
        await back();
      } else if (m.type === 'guest') {
        await open('Полки');
        await this.tapEl(this.page.locator('.seg.tabs .btn').nth(1));
        await this.tapEl(this.page.locator(`.inv-cell[aria-label="${data.animalById[m.id].name}"]`));
        await this.modalGreen();
        await back();
      } else if (m.type === 'sellCommons') {
        await open('Полки');
        await this.tapEl(this.page.locator('.seg.tabs .btn').nth(0));
        const btn = this.page.locator('.btn.blue.block');
        if (await btn.count()) {
          await this.tapEl(btn);
          await this.modalGreen();
        }
        await back();
        const after = await this.save();
        if (after.meta.coins === save.meta.coins) break;
      }
    }
  }
}

