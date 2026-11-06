import { applyActionMods } from './progress.js';

// Content file list and lookup indexes. Shared by the browser boot and node tests.
export const DATA_FILES = ['strings.ru', 'assets', 'credits', 'cats', 'enemies', 'statuses', 'rooms', 'balance', 'items', 'animals', 'rarities', 'modifiers', 'events', 'combos', 'album', 'talents', 'upgrades', 'tiers', 'skins', 'backroom', 'anomalies', 'gen/elite', 'gen/flavor', 'gen/lines'];

const byId = (arr) => Object.fromEntries((arr || []).map((x) => [x.id, x]));

export function indexData(d) {
  d.strings = d['strings.ru'];
  d.enemyById = byId(d.enemies);
  d.statusById = byId(d.statuses);
  d.roomById = byId(d.rooms);
  d.itemById = byId(d.items);
  d.animalById = byId(d.animals);
  d.gen = { elite: d['gen/elite'], flavor: d['gen/flavor'], lines: d['gen/lines'] };
  d.rarityById = byId(d.rarities);
  d.comboById = byId(d.combos);
  d.eventById = byId(d.events);
  return d;
}

// Context object the combat engine needs (cat actions include the talents snapshotted into the run).
export function combatCtx(data, run) {
  return {
    cats: applyActionMods(data.cats, run && run.actionMods),
    enemies: data.enemyById,
    statuses: data.statusById,
    balance: data.balance,
    floor: run ? run.floorNo : 1,
    tier: run ? run.tier : 1,
  };
}
