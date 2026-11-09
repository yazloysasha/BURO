// Customers of the Lavka: after a run an animal may come in asking for a kind of item and pays a premium for it.
// This is what makes hoarding a decision: the right thing on the shelf can sell for much more than the usual price.
import { parseKey, sellPrice, removeItem } from './collection.js';

const WANTS = ['category', 'category', 'category', 'rarity', 'mod'];

export function wantMatches(data, want, key) {
  const { id, mods } = parseKey(key);
  const it = data.itemById[id];
  if (!it) return false;
  if (want.kind === 'category') return it.category === want.value;
  if (want.kind === 'rarity') return ['rare', 'epic', 'legendary', 'slop'].indexOf(it.rarity) >= ['rare', 'epic', 'legendary'].indexOf(want.value);
  if (want.kind === 'mod') return mods.includes(want.value);
  return false;
}

// Rolls the next visitor (or nobody). Prefers wishes the shelves can answer, so a visit is rarely a tease.
export function rollCustomer(save, data, rng) {
  if (!rng.chance(data.balance.customers.chance)) return null;
  const keys = Object.keys(save.collection.items);
  const kind = rng.pick(WANTS);
  let value;
  if (kind === 'category') {
    const have = [...new Set(keys.map((k) => data.itemById[parseKey(k).id]).filter(Boolean).map((i) => i.category))];
    value = have.length && rng.chance(0.75) ? rng.pick(have) : rng.pick([...new Set(data.items.map((i) => i.category))]);
  } else if (kind === 'rarity') value = rng.pick(['rare', 'rare', 'epic']);
  else value = rng.pick(['shiny', 'shiny', 'golden', 'glitchy', 'dirty']);
  const visitors = data.animals.filter((a) => a.rarity !== 'legendary');
  const mult = Math.round((data.balance.customers.mult[0] + rng.next() * (data.balance.customers.mult[1] - data.balance.customers.mult[0])) * 10) / 10;
  save.meta.customer = { animal: rng.pick(visitors).id, want: { kind, value }, mult };
  return save.meta.customer;
}

export function customerOffer(save, data, key) {
  const c = save.meta.customer;
  if (!c || !save.collection.items[key] || !wantMatches(data, c.want, key)) return 0;
  return Math.round(sellPrice(save, data, key) * c.mult);
}

export function sellToCustomer(save, data, key) {
  const coins = customerOffer(save, data, key);
  if (!coins) return 0;
  removeItem(save, key, 1);
  save.meta.coins += coins;
  save.stats.coinsEarned += coins;
  save.stats.customers = (save.stats.customers || 0) + 1;
  save.meta.customer = null;
  return coins;
}

export function dismissCustomer(save) {
  save.meta.customer = null;
}
