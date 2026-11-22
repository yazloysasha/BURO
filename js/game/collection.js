// The Lavka's collection: items (with modifiers) by key, animals, guests, showcase, selling.
import { effectSum } from './meta.js';
import { CAT_KEYS } from './combat.js';

export function itemKey(id, mods = []) {
  return mods && mods.length ? id + '|' + mods.slice().sort().join('+') : id;
}

export function parseKey(key) {
  const [id, m] = key.split('|');
  return { id, mods: m ? m.split('+') : [] };
}

export function availableCopies(save, key) {
  const equipped = CAT_KEYS.filter((cat) => save.meta.equipment?.[cat] === key).length;
  return Math.max(0, (save.collection.items[key] || 0) - equipped);
}

export function equipItem(save, data, cat, key) {
  if (!CAT_KEYS.includes(cat)) return false;
  if (key !== null && (!availableCopies(save, key) || data.itemById[parseKey(key).id]?.effect?.type !== 'stat')) return false;
  save.meta.equipment ||= {};
  save.meta.equipment[cat] = key;
  return true;
}

export function addItem(save, id, mods = []) {
  const key = itemKey(id, mods);
  const col = save.collection.items;
  col[key] = (col[key] || 0) + 1;
  save.collection.seen[id] = true;
  return key;
}

export function removeItem(save, key, n = 1) {
  const col = save.collection.items;
  if (!col[key]) return 0;
  const k = Math.min(n, availableCopies(save, key));
  col[key] -= k;
  if (col[key] <= 0) {
    delete col[key];
    save.meta.showcase = (save.meta.showcase || []).filter((s) => s !== key);
  }
  return k;
}

export function modMultiplier(data, mods) {
  let m = 1;
  for (const id of mods || []) {
    const d = data.modifiers.find((x) => x.id === id);
    if (d) m *= d.price;
  }
  return m;
}

export function sellPrice(save, data, key) {
  const { id, mods } = parseKey(key);
  const item = data.itemById[id];
  if (!item) return 0;
  const bonus = 1 + effectSum(save, data, 'sell_bonus');
  return Math.max(1, Math.round(item.price * modMultiplier(data, mods) * bonus));
}

export function sellItem(save, data, key, n = 1) {
  const price = sellPrice(save, data, key);
  const sold = removeItem(save, key, n);
  const coins = price * sold;
  save.meta.coins += coins;
  save.stats.coinsEarned += coins;
  save.stats.sold = (save.stats.sold || 0) + sold;
  return coins;
}

const DUPE_SPARKLES = { common: 1, uncommon: 2, rare: 4, epic: 8, legendary: 15, slop: 25 };

// Animals are stickers: first copy joins the collection, duplicates turn into sparkles.
export function grantAnimal(save, data, id) {
  const a = data.animalById[id];
  if (!a) return { dupe: false, sparkles: 0 };
  const col = save.collection.animals;
  if (col[id]) {
    col[id]++;
    const sparkles = DUPE_SPARKLES[a.rarity] || 1;
    save.meta.sparkles += sparkles;
    return { dupe: true, sparkles };
  }
  col[id] = 1;
  return { dupe: false, sparkles: 0 };
}

export function grantSticker(save, data, enemyId) {
  const st = save.collection.stickers;
  if (st[enemyId]) {
    st[enemyId]++;
    save.meta.sparkles += 2;
    return { dupe: true, sparkles: 2 };
  }
  st[enemyId] = 1;
  return { dupe: false, sparkles: 0 };
}

export const SHOWCASE_MAX = 8;

export function toggleShowcase(save, key) {
  const sc = (save.meta.showcase = save.meta.showcase || []);
  const i = sc.indexOf(key);
  if (i >= 0) sc.splice(i, 1);
  else if (sc.length < SHOWCASE_MAX && save.collection.items[key]) sc.push(key);
  return sc.includes(key);
}

export function toggleGuest(save, data, id, slots) {
  const g = save.meta.guests;
  const i = g.indexOf(id);
  if (i >= 0) {
    g.splice(i, 1);
    return false;
  }
  if (!save.collection.animals[id]) return false;
  if (g.length >= slots) g.shift();
  g.push(id);
  return true;
}

export function collectionStats(save, data) {
  return {
    itemsSeen: Object.keys(save.collection.seen).filter((id) => data.itemById[id]).length,
    itemsTotal: data.items.length,
    animalsOwned: Object.keys(save.collection.animals).filter((id) => data.animalById[id]).length,
    animalsTotal: data.animals.length,
  };
}
