// Meta progression actions: album stickers, talents, shop upgrades, Lavka tiers, skins.
import { effectSum } from './meta.js';

// ---------- album ----------
export function slotKey(pageId, idx) {
  return pageId + ':' + idx;
}

export function slotFound(save, slot) {
  if (slot.kind === 'animal') return !!save.collection.animals[slot.id];
  if (slot.kind === 'enemy') return !!save.collection.stickers[slot.id];
  return !!save.collection.seen[slot.id];
}

export function pageState(save, page) {
  const placed = save.album.placed || {};
  let found = 0;
  let stuck = 0;
  page.slots.forEach((s, i) => {
    if (slotFound(save, s)) found++;
    if (placed[slotKey(page.id, i)]) stuck++;
  });
  return { found, placed: stuck, total: page.slots.length, completed: save.album.completed.includes(page.id) };
}

export function unplacedCount(save, data) {
  let n = 0;
  for (const p of data.album) p.slots.forEach((s, i) => {
    if (slotFound(save, s) && !save.album.placed[slotKey(p.id, i)]) n++;
  });
  return n;
}

// Sticks a found sticker into its slot; completing a page pays its reward once.
export function placeSticker(save, data, pageId, idx) {
  const page = data.album.find((p) => p.id === pageId);
  const slot = page && page.slots[idx];
  if (!slot || !slotFound(save, slot)) return null;
  const key = slotKey(pageId, idx);
  if (save.album.placed[key]) return null;
  save.album.placed[key] = true;
  const st = pageState(save, page);
  let completed = false;
  if (st.placed === st.total && !st.completed) {
    save.album.completed.push(pageId);
    save.meta.sparkles += 5;
    if (page.reward.type === 'skin' && !save.meta.ownedSkins.includes(page.reward.id)) save.meta.ownedSkins.push(page.reward.id);
    completed = true;
  }
  return { completed, reward: completed ? page.reward : null };
}

// ---------- talents (cost: sparkles) ----------
export function talentNode(data, id) {
  for (const b of data.talents) for (const n of b.nodes) if (n.id === id) return n;
  return null;
}

export function talentStatus(save, data, id) {
  const n = talentNode(data, id);
  const lvl = save.meta.talents[id] || 0;
  const locked = !!n.requires && !(save.meta.talents[n.requires] > 0);
  const maxed = lvl >= n.max;
  const cost = maxed ? null : n.cost[lvl];
  return { lvl, locked, maxed, cost, affordable: !maxed && !locked && save.meta.sparkles >= cost };
}

export function learnTalent(save, data, id) {
  const st = talentStatus(save, data, id);
  if (!st.affordable) return false;
  save.meta.sparkles -= st.cost;
  save.meta.talents[id] = st.lvl + 1;
  return true;
}

// Talent changes to cat actions, snapshotted into the run at start (keeps runs deterministic).
export function actionMods(save, data) {
  const mods = {};
  for (const b of data.talents || []) for (const n of b.nodes) {
    const lvl = save.meta.talents[n.id] || 0;
    if (!lvl) continue;
    for (const e of n.effects) {
      if (!e.type.startsWith('action_')) continue;
      const m = (((mods[e.cat] = mods[e.cat] || {})[e.action] = mods[e.cat][e.action] || {}));
      const field = { action_value: 'value', action_power: 'power', action_cooldown: 'cooldown', action_turns: 'turns' }[e.type];
      m[field] = (m[field] || 0) + e.value * lvl;
    }
  }
  return mods;
}

export function applyActionMods(cats, mods) {
  if (!mods || !Object.keys(mods).length) return cats;
  const out = {};
  for (const [key, def] of Object.entries(cats)) {
    const actions = {};
    for (const [id, a] of Object.entries(def.actions)) {
      const m = mods[key] && mods[key][id];
      if (!m) {
        actions[id] = a;
        continue;
      }
      const b = { ...a };
      for (const f of Object.keys(m)) if (typeof b[f] === 'number') b[f] = Math.max(f === 'cooldown' ? 1 : 0, Math.round((b[f] + m[f]) * 100) / 100);
      actions[id] = b;
    }
    out[key] = { ...def, actions };
  }
  return out;
}

// ---------- shop upgrades (cost: coins) ----------
export function upgradeStatus(save, up) {
  const lvl = save.meta.upgrades[up.id] || 0;
  const maxed = lvl >= up.max;
  const cost = maxed ? null : up.cost[lvl];
  return { lvl, maxed, cost, affordable: !maxed && save.meta.coins >= cost };
}

export function buyUpgrade(save, data, id) {
  const up = data.upgrades.find((u) => u.id === id);
  const st = up && upgradeStatus(save, up);
  if (!st || !st.affordable) return false;
  save.meta.coins -= st.cost;
  save.meta.upgrades[id] = st.lvl + 1;
  return true;
}

// ---------- tiers ----------
export function nextTier(save, data) {
  return data.tiers.find((t) => t.tier === save.meta.tier + 1) || null;
}

export function tierUpStatus(save, data) {
  const t = nextTier(save, data);
  if (!t) return null;
  return { tier: t, coinsOk: save.meta.coins >= t.cost, winsOk: save.stats.wins >= t.wins };
}

export function tierUp(save, data) {
  const st = tierUpStatus(save, data);
  if (!st || !st.coinsOk || !st.winsOk || save.run) return false;
  save.meta.coins -= st.tier.cost;
  save.meta.tier = st.tier.tier;
  return true;
}

// ---------- skins ----------
export function skinOwned(save, id) {
  return id === 'default' || save.meta.ownedSkins.includes(id);
}

export function buySkin(save, data, id) {
  const s = data.skins.find((x) => x.id === id);
  if (!s || skinOwned(save, id) || save.meta.sparkles < s.price) return false;
  save.meta.sparkles -= s.price;
  save.meta.ownedSkins.push(id);
  return true;
}

export function equipSkin(save, cat, id) {
  if (!skinOwned(save, id)) return false;
  save.meta.skins[cat] = id;
  return true;
}

export function sparkleIncome(save, data) {
  return effectSum(save, data, 'sparkle_bonus');
}

// ---------- what to do next (the "one more run" line) ----------
// Returns {key, params}: the nearest unfinished thing, cheapest first, so there is always a concrete small goal in sight.
export function nextGoal(save, data) {
  const unplaced = unplacedCount(save, data);
  if (unplaced) return { key: 'goal.stickers', params: { n: unplaced } };
  const ups = (data.upgrades || []).map((u) => ({ u, st: upgradeStatus(save, u) })).filter((x) => !x.st.maxed).sort((a, b) => a.st.cost - b.st.cost);
  if (ups.length && ups[0].st.affordable) return { key: 'goal.buy', params: { name: ups[0].u.name } };
  const talent = (data.talents || []).flatMap((b) => b.nodes).find((n) => talentStatus(save, data, n.id).affordable);
  if (talent) return { key: 'goal.talent', params: { name: talent.name } };
  const tier = tierUpStatus(save, data);
  if (tier && tier.coinsOk && tier.winsOk) return { key: 'goal.tierUp', params: { name: tier.tier.name } };
  let page = null;
  for (const p of data.album || []) {
    const st = pageState(save, p);
    if (st.completed || !st.placed) continue;
    const left = st.total - st.placed;
    if (!page || left < page.left) page = { title: p.title, left };
  }
  if (page && page.left <= 3) return { key: 'goal.page', params: { title: page.title, n: page.left } };
  if (tier && !tier.winsOk) return { key: 'goal.wins', params: { n: tier.tier.wins - save.stats.wins, name: tier.tier.name } };
  if (ups.length) return { key: 'goal.save', params: { n: ups[0].st.cost - save.meta.coins, name: ups[0].u.name } };
  if (page) return { key: 'goal.page', params: { title: page.title, n: page.left } };
  return { key: 'goal.combo', params: { n: data.combos.length - save.combos.discovered.length } };
}
