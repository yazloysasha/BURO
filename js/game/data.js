// Content file list and lookup indexes. Shared by the browser boot and node tests.
export const DATA_FILES = ['strings.ru', 'assets', 'credits', 'cats', 'enemies', 'statuses', 'rooms', 'balance', 'items', 'animals', 'rarities', 'modifiers', 'gen/elite', 'gen/flavor'];

const byId = (arr) => Object.fromEntries((arr || []).map((x) => [x.id, x]));

export function indexData(d) {
  d.strings = d['strings.ru'];
  d.enemyById = byId(d.enemies);
  d.statusById = byId(d.statuses);
  d.roomById = byId(d.rooms);
  d.itemById = byId(d.items);
  d.animalById = byId(d.animals);
  d.gen = { elite: d['gen/elite'], flavor: d['gen/flavor'] };
  d.rarityById = byId(d.rarities);
  return d;
}

// Context object the combat engine needs.
export function combatCtx(data, run) {
  return {
    cats: data.cats,
    enemies: data.enemyById,
    statuses: data.statusById,
    balance: data.balance,
    floor: run ? run.floorNo : 1,
    tier: run ? run.tier : 1,
  };
}
