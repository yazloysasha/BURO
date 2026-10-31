// Save format, migrations, validation, export/import. Pure: no browser APIs (storage lives in storage.js).
import { seedState } from './rng.js';

export const SAVE_VERSION = 3;
export const EXPORT_TAG = 'buro';

export function defaultSettings() {
  return { sfx: 0.8, shake: true, animSpeed: 1, vibration: true, ignoreMute: true };
}

export function newSave(now = new Date(), seed = Date.now()) {
  const iso = now.toISOString();
  return {
    version: SAVE_VERSION,
    createdAt: iso,
    updatedAt: iso,
    meta: {
      coins: 0,
      sparkles: 0,
      tier: 1,
      talents: {},
      upgrades: {},
      skins: { peposya: 'default', dudonya: 'default' },
      ownedSkins: [],
      guests: [],
      showcase: [],
      rng: seedState('meta:' + seed),
      runsStarted: 0,
    },
    collection: { items: {}, animals: {}, stickers: {}, seen: {} },
    combos: { discovered: [] },
    pity: { sinceEpic: 0, sinceLegendary: 0 },
    daily: { lastOpenDate: null, streak: 0, bestStreak: 0, claimedBonuses: [], lastGift: null },
    album: { completed: [] },
    run: null,
    lastRun: null,
    settings: defaultSettings(),
    stats: { runs: 0, wins: 0, losses: 0, blocksOpened: 0, kills: 0, coinsEarned: 0 },
  };
}

// migrations[v] turns a save of version v into version v+1
export const migrations = {
  // v1 = schema from SPEC §13. v2 adds meta RNG, guests, stats, album progress, richer daily/settings.
  1: (s) => {
    const d = newSave(new Date(s.createdAt || Date.now()), s.createdAt || 'v1');
    s.meta = { ...d.meta, ...(s.meta || {}) };
    if (!Array.isArray(s.meta.rng)) s.meta.rng = d.meta.rng;
    s.daily = { ...d.daily, ...(s.daily || {}) };
    s.settings = { ...d.settings, ...(s.settings || {}) };
    s.stats = { ...d.stats, ...(s.stats || {}) };
    s.album = s.album || d.album;
    // v1 runs had no stable format we can resume safely: drop the run but keep everything collected
    s.run = null;
    s.version = 2;
    return s;
  },
};

// v3: collection items keyed by "id|mod+mod", a "seen" codex, showcase.
migrations[2] = (s) => {
  const col = s.collection || (s.collection = { items: {}, animals: {}, stickers: {} });
  col.items = col.items || {};
  if (col.mods) {
    for (const [key, n] of Object.entries(col.mods)) {
      const id = key.split('|')[0];
      col.items[key] = (col.items[key] || 0) + n;
      col.items[id] = Math.max(0, (col.items[id] || 0) - n);
      if (!col.items[id]) delete col.items[id];
    }
    delete col.mods;
  }
  col.seen = col.seen || {};
  for (const key of Object.keys(col.items)) col.seen[key.split('|')[0]] = true;
  s.meta = s.meta || {};
  s.meta.showcase = s.meta.showcase || [];
  if (s.daily) s.daily.lastGift = s.daily.lastGift || null;
  s.version = 3;
  return s;
};

export function migrate(save) {
  let s = save;
  if (typeof s.version !== 'number' || s.version < 1) s.version = 1;
  while (s.version < SAVE_VERSION) {
    const m = migrations[s.version];
    if (!m) throw new Error('no migration from v' + s.version);
    s = m(s);
  }
  return s;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Structural check of a (migrated) save. Returns list of problems; empty = ok.
export function validateSave(s) {
  const errs = [];
  if (!isObj(s)) return ['not an object'];
  if (!isNum(s.version)) errs.push('version');
  if (!isObj(s.meta)) errs.push('meta');
  else {
    for (const k of ['coins', 'sparkles', 'tier']) if (!isNum(s.meta[k]) || s.meta[k] < 0) errs.push('meta.' + k);
  }
  if (!isObj(s.collection)) errs.push('collection');
  if (!isObj(s.pity)) errs.push('pity');
  if (!isObj(s.daily)) errs.push('daily');
  if (!isObj(s.settings)) errs.push('settings');
  if (s.run !== null && s.run !== undefined && !isObj(s.run)) errs.push('run');
  return errs;
}

// Fill missing fields with defaults (repairs partially damaged or older saves without losing data).
export function normalizeSave(s) {
  const d = newSave(new Date(s.createdAt || Date.now()), s.createdAt || 'norm');
  const fill = (target, def) => {
    for (const k of Object.keys(def)) {
      if (target[k] === undefined || (isObj(def[k]) && !isObj(target[k]) && k !== 'run')) target[k] = structuredCloneSafe(def[k]);
      else if (isObj(def[k]) && isObj(target[k]) && k !== 'run' && k !== 'lastRun') fill(target[k], def[k]);
    }
  };
  fill(s, d);
  if (!Array.isArray(s.meta.rng) || s.meta.rng.length !== 4) s.meta.rng = d.meta.rng;
  if (!Array.isArray(s.combos.discovered)) s.combos.discovered = [];
  if (!Array.isArray(s.meta.ownedSkins)) s.meta.ownedSkins = [];
  if (!Array.isArray(s.meta.guests)) s.meta.guests = [];
  if (!Array.isArray(s.album.completed)) s.album.completed = [];
  if (!Array.isArray(s.daily.claimedBonuses)) s.daily.claimedBonuses = [];
  if (!Array.isArray(s.meta.showcase)) s.meta.showcase = [];
  return s;
}

function structuredCloneSafe(v) {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

// Parse a stored/imported string into a usable save. Throws on anything unusable.
export function parseSave(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('empty');
  let obj = JSON.parse(text.trim());
  if (isObj(obj) && obj.game === EXPORT_TAG && isObj(obj.save)) obj = obj.save;
  if (!isObj(obj) || !isObj(obj.meta)) throw new Error('not a save');
  if (isNum(obj.version) && obj.version > SAVE_VERSION) throw new Error('newer');
  const s = normalizeSave(migrate(obj));
  const errs = validateSave(s);
  if (errs.length) throw new Error('invalid: ' + errs.join(','));
  return s;
}

export function serializeSave(s) {
  return JSON.stringify(s);
}

export function exportSave(s) {
  return JSON.stringify({ game: EXPORT_TAG, v: s.version, exportedAt: new Date().toISOString(), save: s });
}

export const importSave = parseSave;
