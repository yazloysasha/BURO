// Seeded text generators (cat lines, elite names) built from dictionaries in data/gen/*.json.
import { hashString } from '../core/rng.js';

function pick(arr, seed) {
  return arr[hashString(seed) % arr.length];
}

// A cat line for `who`; seed makes it reproducible. About 1% of lines are the rare Gorbodak flavour.
export function catLine(data, who, seed) {
  const g = data.gen.lines;
  if (hashString(seed + ':rare') % 100 === 0) return pick(g.rare, seed);
  const tpl = pick(g[who], seed + ':t');
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (g.fill[k] ? pick(g.fill[k], seed + ':' + k) : m));
}

export function eliteName(data, baseName, seed) {
  return baseName + '-' + pick(data.gen.elite.titles, seed);
}
