// Fast balance simulator: same player models as the UI bot, but calling the game's functions directly, so thousands of
// careers run in seconds. It tunes numbers; the UI bot (playtest/bot.mjs) proves them in a real browser.
// Usage: node playtest/sim.mjs [careers=200] [runsPerCareer=30]
import { Rng } from '../js/core/rng.js';
import { newSave } from '../js/core/save.js';
import { startRun, enterNode, playRound, completeRoom, finishRun, restChoice, runPayout } from '../js/game/run.js';
import { tapAnomaly, placeOnShelf, washItem, washCats, chooseEvent, buyShop } from '../js/game/rooms.js';
import { openRunBlock, resolveFullBackpack, openDailyGift } from '../js/game/blocks.js';
import { placeSticker, buyUpgrade, learnTalent, tierUp } from '../js/game/progress.js';
import { sellItem, toggleGuest, collectionStats } from '../js/game/collection.js';
import { guestSlots, runFee, runIsFree } from '../js/game/meta.js';
import { findNode } from '../js/game/map.js';
import { loadData } from '../tests/helpers.mjs';
import { makeStrategy, STRATEGIES } from './lib/strategy.mjs';

// Rough human pacing used for minutes estimates (seconds): measured animation times at x2 + reading/thinking.
export const PACE = { round: 1.2 + 4.5, room: 3, event: 9, puzzleMove: 1.6, block: 2.2, shopVisit: 8, runEnd: 8, hub: 12, reward: 2 };

function openAllBlocks(save, data, strat, tally) {
  const blocks = save.run.room.blocks || [];
  blocks.forEach((b, i) => {
    if (b.opened) return;
    const r = openRunBlock(save, data, i);
    if (r && r.needsSpace) resolveFullBackpack(save, data, i, strat.fullBackpack(save, data, b));
    tally.time += PACE.block;
    tally.rarity[b.rarity] = (tally.rarity[b.rarity] || 0) + 1;
    tally.blocks++;
  });
}

// Plays one run to the end, returns its record. Pure function of (save, strategy).
export function playRun(save, data, strat) {
  const tally = { time: PACE.hub, blocks: 0, rarity: {}, rounds: 0, decisions: 0, rooms: {}, events: [] };
  const fee = runIsFree(save, data) ? 0 : runFee(save, data);
  const startCoins = save.meta.coins;
  startRun(save, data, { leader: strat.chooseLeader() });
  tally.decisions++;
  const run = save.run;
  let diedIn = null;
  while (!run.result) {
    tally.decisions++;
    const id = strat.chooseNode(save, data);
    const type = findNode(run.map, id).type;
    tally.rooms[type] = (tally.rooms[type] || 0) + 1;
    enterNode(save, data, id);
    tally.time += PACE.room;
    const room = run.room;
    if (['combat', 'elite', 'boss'].includes(type)) {
      let guard = 0;
      while (!room.combat.over && guard++ < 200) {
        playRound(save, data, strat.combatActions(save, data));
        tally.rounds++;
        tally.time += PACE.round;
      }
      if (!room.combat.over) throw new Error('combat stuck');
      if (room.combat.over === 'lose') {
        diedIn = type;
        break;
      }
    } else if (type === 'rest') {
      restChoice(save, data, strat.restChoice(save));
      tally.decisions++;
    } else if (type === 'anomaly') {
      while (room.phase === 'play') {
        tapAnomaly(save, data, strat.anomalyPick(room));
        tally.time += PACE.puzzleMove;
      }
    } else if (type === 'shelf') {
      while (room.phase === 'play') {
        const [i, s] = strat.shelfPick(room);
        placeOnShelf(save, data, i, s);
        tally.time += PACE.puzzleMove;
      }
    } else if (type === 'wash') {
      for (const b of run.backpack.filter((x) => x.mods.includes('dirty'))) washItem(save, data, b.uid);
      if (strat.washCats(save)) washCats(save, data);
    } else if (type === 'event') {
      tally.events.push(room.event.id);
      chooseEvent(save, data, strat.eventChoice(save, data, data.eventById[room.event.id]));
      tally.time += PACE.event;
      tally.decisions++;
    } else if (type === 'shop') {
      tally.time += PACE.shopVisit;
      for (let n = strat.shopNext(save, data); n !== null; n = strat.shopNext(save, data)) {
        const r = buyShop(save, data, n);
        tally.decisions++;
        if (!r.ok) break;
        openAllBlocks(save, data, strat, tally);
      }
    }
    openAllBlocks(save, data, strat, tally);
    tally.time += PACE.reward;
    completeRoom(save, data);
    if (run.result) break;
  }
  const outcome = run.result.outcome;
  const floor = run.floorNo;
  const total = run.map.floors.length;
  const reachedBoss = run.room ? run.room.type === 'boss' || floor >= total : outcome === 'win';
  const payout = runPayout(run, data);
  const summary = finishRun(save, data, outcome === 'win' ? { sellUids: strat.sellPlan(save, data) } : { keepUid: strat.keepOne(save, data) });
  tally.time += PACE.runEnd;
  return {
    outcome,
    floor,
    total,
    reachedBoss,
    diedIn,
    fee,
    payout,
    sold: summary.soldFor,
    net: save.meta.coins - startCoins,
    startCoins,
    rounds: tally.rounds,
    decisions: tally.decisions,
    blocks: tally.blocks,
    rarity: tally.rarity,
    rooms: tally.rooms,
    events: tally.events,
    minutes: tally.time / 60,
  };
}

export function metaPhase(save, data, strat) {
  const log = [];
  for (let guard = 0; guard < 200; guard++) {
    const m = strat.metaNext(save, data);
    if (!m) break;
    if (m.type === 'sticker') {
      const r = placeSticker(save, data, m.page, m.i);
      if (r && r.completed) log.push('page');
    } else if (m.type === 'upgrade') {
      if (!buyUpgrade(save, data, m.id)) break;
      log.push('upgrade');
    } else if (m.type === 'talent') {
      if (!learnTalent(save, data, m.id)) break;
      log.push('talent');
    } else if (m.type === 'tier') {
      if (!tierUp(save, data)) break;
      log.push('tier');
    } else if (m.type === 'guest') {
      toggleGuest(save, data, m.id, guestSlots(save, data));
      log.push('guest');
    } else if (m.type === 'sellCommons') {
      for (const k of m.keys) sellItem(save, data, k, save.collection.items[k]);
    }
  }
  return log;
}

// A whole career: runs in a row on one save, a new calendar day every `runsPerDay` runs.
export function playCareer(data, name, seed, nRuns, runsPerDay = 3) {
  const rng = Rng.fromSeed('strategy:' + name + ':' + seed);
  const strat = makeStrategy(name, rng);
  const save = newSave(new Date('2026-11-01T20:00:00Z'), name + ':' + seed);
  const runs = [];
  let clock = 0;
  const firsts = {};
  const mark = (k) => {
    if (firsts[k] === undefined) firsts[k] = { run: runs.length, minutes: clock };
  };
  const day = (n) => `2026-${String(11 + Math.floor(n / 30)).padStart(2, '0')}-${String(1 + (n % 30)).padStart(2, '0')}`;
  for (let i = 0; i < nRuns; i++) {
    if (i % runsPerDay === 0) openDailyGift(save, data, day(i / runsPerDay));
    const r = playRun(save, data, strat);
    clock += r.minutes;
    runs.push(r);
    if (r.outcome === 'win') mark('win');
    if (r.fee > 0 && r.net > 0) mark('feePaidOff');
    const log = metaPhase(save, data, strat);
    for (const k of log) mark(k);
    if (log.includes('tier')) mark('tier2');
    const st = collectionStats(save, data);
    if (st.itemsSeen >= st.itemsTotal / 2) mark('half');
  }
  return { name, seed, runs, firsts, save };
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '-');
const avg = (list) => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : 0);
const median = (list) => {
  if (!list.length) return null;
  const s = list.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
};

export function summarize(data, careers, nRuns) {
  const out = {};
  for (const name of STRATEGIES) {
    const list = careers.filter((c) => c.name === name);
    const runs = list.flatMap((c) => c.runs);
    const stat = (k) => {
      const v = list.map((c) => (c.firsts[k] ? c.firsts[k].run : null)).filter((x) => x !== null);
      return { median: median(v), got: v.length, of: list.length, minutes: median(list.map((c) => (c.firsts[k] ? c.firsts[k].minutes : null)).filter((x) => x !== null)) };
    };
    const lastSave = list.map((c) => c.save);
    const firstThree = (lo, hi) => runs.filter((_, i) => i % nRuns >= lo && i % nRuns < hi);
    out[name] = {
      careers: list.length,
      winAll: pct(runs.filter((r) => r.outcome === 'win').length, runs.length),
      win1to5: pct(firstThree(0, 5).filter((r) => r.outcome === 'win').length, firstThree(0, 5).length),
      win6to15: pct(firstThree(5, 15).filter((r) => r.outcome === 'win').length, firstThree(5, 15).length),
      firstWinRun: stat('win').median,
      firstWinGot: stat('win').got,
      reachedBoss: pct(runs.filter((r) => r.reachedBoss).length, runs.length),
      firstRunMinutes: +avg(list.map((c) => c.runs[0].minutes)).toFixed(1),
      avgRunMinutes: +avg(runs.map((r) => r.minutes)).toFixed(1),
      avgPayout: Math.round(avg(runs.map((r) => r.payout + r.sold))),
      freeRuns: pct(runs.filter((r, i) => r.fee === 0 && i % nRuns !== 0).length, runs.length),
      feePaidOffRun: stat('feePaidOff').median,
      firstUpgradeRun: stat('upgrade').median,
      firstTalentRun: stat('talent').median,
      firstPageRun: stat('page').median,
      firstPageGot: stat('page').got,
      firstTierRun: stat('tier').median,
      firstTierGot: stat('tier').got,
      halfItemsRun: stat('half').median,
      halfItemsGot: stat('half').got,
      combosAfter10: 0,
      combosEnd: Math.round(avg(lastSave.map((s) => s.combos.discovered.length))),
      itemsEnd: Math.round(avg(lastSave.map((s) => collectionStats(s, data).itemsSeen))),
      animalsEnd: Math.round(avg(lastSave.map((s) => collectionStats(s, data).animalsOwned))),
      pagesEnd: +avg(lastSave.map((s) => s.album.completed.length)).toFixed(1),
      tierEnd: +avg(lastSave.map((s) => s.meta.tier)).toFixed(1),
      deaths: Object.fromEntries(['combat', 'elite', 'boss'].map((t) => [t, pct(runs.filter((r) => r.diedIn === t).length, runs.length)])),
      meanRounds: Math.round(avg(runs.map((r) => r.rounds))),
      meanDecisions: Math.round(avg(runs.map((r) => r.decisions))),
    };
  }
  return out;
}

if (process.argv[1] && import.meta.url.endsWith('sim.mjs') && process.argv[1].endsWith('sim.mjs')) {
  const nCareers = Number(process.argv[2] || 200);
  const nRuns = Number(process.argv[3] || 30);
  const data = loadData();
  const careers = [];
  for (const name of STRATEGIES) for (let i = 0; i < nCareers; i++) careers.push(playCareer(data, name, i, nRuns));
  console.log(JSON.stringify(summarize(data, careers, nRuns), null, 1));
}
