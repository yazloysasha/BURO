// Derived meta-progression values: run fee, backpack size, party stat bonuses, coin multipliers.
// Sources: Lavka tier, shop upgrades, talents, completed album pages, invited animal guests.

function talentEffects(save, data) {
  const out = [];
  const talents = data.talents || [];
  for (const branch of talents) {
    for (const node of branch.nodes || []) {
      const lvl = save.meta.talents[node.id] || 0;
      if (lvl > 0) for (const e of node.effects || []) out.push({ ...e, value: e.value * lvl });
    }
  }
  return out;
}

function upgradeEffects(save, data) {
  const out = [];
  for (const up of data.upgrades || []) {
    const lvl = save.meta.upgrades[up.id] || 0;
    if (lvl > 0) for (const e of up.effects || []) out.push({ ...e, value: e.value * lvl });
  }
  return out;
}

function albumEffects(save, data) {
  const out = [];
  for (const page of data.album || []) {
    if (save.album.completed.includes(page.id) && page.reward && page.reward.type === 'perm_bonus') out.push(page.reward.effect);
  }
  return out;
}

function guestEffects(save, data) {
  const out = [];
  const byId = data.animalById || {};
  for (const id of save.meta.guests || []) {
    const a = byId[id];
    if (a && a.passive) out.push(a.passive);
  }
  return out;
}

export function allEffects(save, data) {
  return [...talentEffects(save, data), ...upgradeEffects(save, data), ...albumEffects(save, data), ...guestEffects(save, data)];
}

// Sum of a numeric effect type, optionally filtered by cat/stat.
export function effectSum(save, data, type, filter = {}) {
  let v = 0;
  for (const e of allEffects(save, data)) {
    if (e.type !== type) continue;
    if (filter.stat && e.stat !== filter.stat) continue;
    if (filter.cat && e.cat && e.cat !== filter.cat) continue;
    if (filter.action && e.action !== filter.action) continue;
    v += e.value;
  }
  return v;
}

export function tierInfo(save, data) {
  const tiers = data.tiers || [];
  return tiers.find((t) => t.tier === save.meta.tier) || { tier: save.meta.tier, fee: data.balance.fees[save.meta.tier] || 0 };
}

export function runFee(save, data) {
  const base = tierInfo(save, data).fee ?? data.balance.fees[save.meta.tier] ?? 0;
  const disc = Math.min(0.5, effectSum(save, data, 'fee_discount'));
  return Math.round(base * (1 - disc));
}

// The run is free on the very first run and whenever the player can't afford the fee (never stuck).
export function runIsFree(save, data) {
  return save.meta.runsStarted === 0 || save.meta.coins < runFee(save, data);
}

export function backpackSize(save, data) {
  return data.balance.backpackBase + effectSum(save, data, 'backpack_slot');
}

export function guestSlots(save, data) {
  return 1 + effectSum(save, data, 'guest_slot');
}

export function coinMult(save, data) {
  return 1 + effectSum(save, data, 'coin_bonus') + 0.1 * (save.meta.tier - 1);
}

// Luck for lucky blocks: talents/guests/album luck + one point per Lavka tier above the first.
export function luckBonus(save, data) {
  return effectSum(save, data, 'stat', { stat: 'luck' }) + (save.meta.tier - 1);
}

// Per-cat stat bonuses: {atk, def, spd, luck, crit, hp}
export function catBonus(save, data, cat) {
  const b = { atk: 0, def: 0, spd: 0, luck: 0, crit: 0, hp: 0 };
  for (const e of allEffects(save, data)) {
    if (e.type !== 'stat') continue;
    if (e.cat && e.cat !== cat) continue;
    if (b[e.stat] !== undefined) b[e.stat] += e.value;
  }
  return b;
}

export function startingConsumables(save, data) {
  return Math.floor(effectSum(save, data, 'start_consumable'));
}
