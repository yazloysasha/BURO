// Night shift: the backroom as its own mode in the Lavka, five loops in a row. The full reward is once per local day,
// after that the walks still count for the anomaly collection. The walk is saved after every call (no reroll by reload).
import { withMetaRng } from './run.js';
import { newBackroom, rollLoop, callLoop, backroomGrade } from './backroom.js';
import { rollBlock } from './loot.js';
import { applyToCollection, blockLuck, wantedStickers } from './blocks.js';

export function currentShift(save) {
  return save.meta.nightShift || null;
}

// Starts a new walk unless one is in progress.
export function startNightShift(save, data, today) {
  const cur = save.meta.nightShift;
  if (cur && !cur.state.done) return cur;
  const firstVisit = !save.meta.backroomVisited;
  save.meta.backroomVisited = true;
  const loops = data.balance.nightShift.loops;
  const state = newBackroom({ loops, maxLevel: 3, firstVisit, maxCalls: loops * 5 + 5 });
  withMetaRng(save, (rng) => rollLoop(state, rng, data, save));
  save.meta.nightShift = { date: today, state, result: null, paid: save.meta.nightPaidDate === today };
  return save.meta.nightShift;
}

export function nightShiftCall(save, data, choice, today) {
  const shift = save.meta.nightShift;
  if (!shift || shift.state.done) return null;
  const r = withMetaRng(save, (rng) => callLoop(shift.state, save, choice, rng, data));
  if (r && r.done) finishShift(save, data, shift, today);
  return r;
}

function finishShift(save, data, shift, today) {
  const grade = backroomGrade(shift.state);
  const res = { grade, coins: 0, sparkles: 0, block: null };
  const pay = save.meta.nightPaidDate !== today && grade !== 'lost';
  if (pay) {
    const ns = data.balance.nightShift;
    res.coins = grade === 'perfect' ? ns.coins : Math.round(ns.coins / 2);
    res.sparkles = ns.sparkles;
    if (grade !== 'rough') {
      const luck = blockLuck(save, data);
      const wanted = wantedStickers(save, data);
      res.block = withMetaRng(save, (rng) => rollBlock(rng, data, save.pity, { luck, wanted, minRarity: grade === 'perfect' ? 'uncommon' : null }));
      applyToCollection(save, data, res.block);
    }
    save.meta.coins += res.coins;
    save.stats.coinsEarned += res.coins;
    save.meta.sparkles += res.sparkles;
    save.meta.nightPaidDate = today;
  }
  res.paid = pay;
  shift.result = res;
  return res;
}
