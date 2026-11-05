// Opening lucky blocks in the Lavka (daily gift) and during runs. Contents are rolled before any animation and
// stored in the save, so closing the app mid-reveal can never reroll them.
import { rollBlock } from './loot.js';
import { addItem, grantAnimal } from './collection.js';
import { claimDaily } from './daily.js';
import { effectSum, luckBonus } from './meta.js';
import { withMetaRng, withRunRng, addToBackpack, removeFromBackpack } from './run.js';

export function blockLuck(save, data, run = null) {
  let luck = luckBonus(save, data) + effectSum(save, data, 'block_luck');
  if (run) {
    for (const b of run.backpack) {
      if (b.mods.includes('rainbow')) luck += 2;
      const it = data.itemById[b.id];
      if (it && it.effect && it.effect.type === 'stat' && it.effect.stat === 'luck') luck += it.effect.value;
    }
  }
  return luck;
}

// Apply one block's contents to the collection (outside runs).
function applyToCollection(save, data, block) {
  if (block.kind === 'animal') Object.assign(block, grantAnimal(save, data, block.id));
  else addItem(save, block.id, block.mods);
  block.opened = true;
  save.stats.blocksOpened++;
}

export function openDailyGift(save, data, today) {
  const claim = claimDaily(save, today);
  if (!claim) return null;
  const luck = blockLuck(save, data);
  const gift = { date: today, streak: claim.streak, bonuses: claim.bonuses, blocks: [], coins: 0, sparkles: 0 };
  withMetaRng(save, (rng) => {
    gift.blocks.push(rollBlock(rng, data, save.pity, { luck }));
    for (const b of claim.bonuses) {
      if (b === 3) gift.coins += 30;
      if (b === 7) gift.blocks.push(rollBlock(rng, data, save.pity, { luck, minRarity: 'rare' }));
      if (b === 14) {
        gift.blocks.push(rollBlock(rng, data, save.pity, { luck, minRarity: 'epic' }));
        gift.sparkles += 10;
      }
      if (b === 'week') gift.blocks.push(rollBlock(rng, data, save.pity, { luck, minRarity: 'rare' }));
    }
  });
  for (const bl of gift.blocks) applyToCollection(save, data, bl);
  save.meta.coins += gift.coins;
  save.meta.sparkles += gift.sparkles;
  save.daily.lastGift = gift;
  return gift;
}

// ---------- in-run blocks ----------
export function rollRunBlocks(save, data, run, n, opts = {}) {
  const luck = blockLuck(save, data, run);
  return withRunRng(run, (rng) => Array.from({ length: n }, () => ({ ...rollBlock(rng, data, save.pity, { luck, ...opts }), opened: false })));
}

// Reveal block idx of the current room. Returns {needsSpace} when the backpack is full (player decides).
export function openRunBlock(save, data, idx) {
  const run = save.run;
  const b = run.room && run.room.blocks && run.room.blocks[idx];
  if (!b || b.opened) return null;
  if (b.kind === 'animal') {
    Object.assign(b, grantAnimal(save, data, b.id));
  } else {
    const r = addToBackpack(save, data, run, b.id, b.mods, { noConvert: true });
    if (r.full) return { needsSpace: true, block: b };
    b.uid = r.entry.uid;
  }
  b.opened = true;
  run.stats.blocks++;
  save.stats.blocksOpened++;
  return { block: b };
}

// Backpack full: drop (sell) an old item to make room, or sell the new find. Both give half price in run coins.
export function resolveFullBackpack(save, data, idx, dropUid = null) {
  const run = save.run;
  const b = run.room.blocks[idx];
  if (!b || b.opened) return null;
  const half = (id, mods) => Math.max(1, Math.floor((data.itemById[id].price * (mods.includes('golden') ? 5 : mods.includes('rainbow') ? 10 : 1)) / 2));
  let coins = 0;
  if (dropUid) {
    const old = removeFromBackpack(run, dropUid);
    if (old) coins = half(old.id, old.mods);
    const r = addToBackpack(save, data, run, b.id, b.mods, { noConvert: true });
    if (r.entry) b.uid = r.entry.uid;
  } else coins = half(b.id, b.mods);
  run.coins += coins;
  run.stats.coinsFound += coins;
  b.opened = true;
  b.soldFor = dropUid ? 0 : coins;
  run.stats.blocks++;
  save.stats.blocksOpened++;
  return { coins };
}

// A room can't be left while a found block is still closed: the find is the whole point of the room.
export function unopenedBlocks(room) {
  return room && room.blocks ? room.blocks.filter((b) => !b.opened).length : 0;
}

// Leaving a room with unopened blocks opens them silently (selling what doesn't fit).
export function settleRoomBlocks(save, data) {
  const room = save.run && save.run.room;
  if (!room || !room.blocks) return;
  room.blocks.forEach((b, i) => {
    if (b.opened) return;
    const r = openRunBlock(save, data, i);
    if (r && r.needsSpace) resolveFullBackpack(save, data, i, null);
  });
}
