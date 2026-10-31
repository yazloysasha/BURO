// Lucky blocks: rarity rolls (luck + pity), modifiers, contents. Pure and seeded.

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'slop'];
export const rank = (r) => RARITY_ORDER.indexOf(r);

export const PITY_EPIC = 10;
export const PITY_LEGENDARY = 40;

// Luck shifts weight from common towards rare+ (each point ~ +4% to rare, +5% to epic and above).
export function rarityWeights(data, luck = 0) {
  const out = {};
  for (const r of data.rarities) {
    const k = rank(r.id);
    let w = r.w;
    if (k >= 2) w *= 1 + 0.04 * luck * (k - 1);
    if (k === 0) w = Math.max(5, w - luck * 1.5);
    out[r.id] = w;
  }
  return out;
}

// Rolls a rarity and advances the pity counters in place.
// pity = {sinceEpic, sinceLegendary}; guaranteed epic on the 10th block without epic+, legendary on the 40th.
export function rollRarity(rng, data, pity, { luck = 0, minRarity = null } = {}) {
  let floor = minRarity ? rank(minRarity) : 0;
  let forced = null;
  if (pity.sinceLegendary + 1 >= PITY_LEGENDARY) forced = 'legendary';
  else if (pity.sinceEpic + 1 >= PITY_EPIC) forced = 'epic';
  if (forced) floor = Math.max(floor, rank(forced));
  const w = rarityWeights(data, luck);
  const cand = RARITY_ORDER.filter((r) => rank(r) >= floor && w[r] > 0).map((r) => [r, w[r]]);
  const rarity = rng.weighted(cand)[0];
  pity.sinceEpic = rank(rarity) >= rank('epic') ? 0 : pity.sinceEpic + 1;
  pity.sinceLegendary = rank(rarity) >= rank('legendary') ? 0 : pity.sinceLegendary + 1;
  return { rarity, forced: forced && (!minRarity || rank(forced) > rank(minRarity)) ? forced : null };
}

export function rollMods(rng, data, { allowDirty = true } = {}) {
  const mods = [];
  for (const m of data.modifiers) {
    if (mods.length >= 2) break;
    if (m.id === 'dirty' && !allowDirty) continue;
    if (m.id === 'rainbow' && mods.includes('golden')) continue;
    if (m.id === 'golden' && mods.includes('rainbow')) continue;
    if (m.id === 'shiny' && mods.includes('dirty')) continue;
    if (rng.next() < m.chance) mods.push(m.id);
  }
  return mods;
}

export function lootPool(data, rarity) {
  return data.items.filter((i) => i.rarity === rarity && !(i.tags || []).includes('combo'));
}

// Contents of one block. animalChance: share of blocks that hold an animal sticker instead of an item.
export function rollBlock(rng, data, pity, { luck = 0, minRarity = null, animalChance = 0.18 } = {}) {
  const { rarity, forced } = rollRarity(rng, data, pity, { luck, minRarity });
  const animals = (data.animals || []).filter((a) => a.rarity === rarity);
  if (rarity !== 'slop' && animals.length && rng.next() < animalChance) {
    return { rarity, forced, kind: 'animal', id: rng.pick(animals).id, mods: [] };
  }
  let pool = lootPool(data, rarity);
  if (!pool.length) pool = lootPool(data, 'common');
  const item = rng.pick(pool);
  return { rarity, forced, kind: 'item', id: item.id, mods: rarity === 'slop' ? [] : rollMods(rng, data) };
}

export function pityLeft(pity) {
  return { epic: Math.max(1, PITY_EPIC - pity.sinceEpic), legendary: Math.max(1, PITY_LEGENDARY - pity.sinceLegendary) };
}
