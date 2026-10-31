// Item display names: modifier prefixes agree with the noun's grammatical gender (m/f/n/pl).
let modDefs = {};

export function setModifierDefs(list) {
  modDefs = Object.fromEntries((list || []).map((m) => [m.id, m]));
}

export function modPrefix(id, gender = 'm') {
  const m = modDefs[id];
  if (!m) return '';
  return (m.forms && (m.forms[gender] || m.forms.m)) || m.name || id;
}

export function displayName(item, mods = []) {
  if (!mods || !mods.length) return item.name;
  const prefix = mods.map((m) => modPrefix(m, item.gender)).filter(Boolean);
  if (!prefix.length) return item.name;
  // lower-case the first letter of the base name after a prefix unless it is a proper name
  const base = item.properName ? item.name : item.name.charAt(0).toLowerCase() + item.name.slice(1);
  const first = prefix[0];
  return [first.charAt(0).toUpperCase() + first.slice(1), ...prefix.slice(1).map((p) => p.toLowerCase()), base].join(' ');
}
