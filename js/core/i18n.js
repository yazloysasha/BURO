// UI strings live in data/strings.ru.json. t('a.b', {n}) with {placeholders}; arrays of 3 = Russian plural forms.
let strings = {};

export function setStrings(s) {
  strings = s || {};
}

export function pluralIndex(n) {
  const a = Math.abs(Math.trunc(n)) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 2;
  if (b > 1 && b < 5) return 1;
  if (b === 1) return 0;
  return 2;
}

export function plural(n, forms) {
  return forms[pluralIndex(n)];
}

export function lookup(key) {
  return key
    .split(".")
    .reduce((o, k) => (o == null ? undefined : o[k]), strings);
}

export function has(key) {
  return lookup(key) !== undefined;
}

function fill(s, params) {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => {
    if (params[k] === undefined) return m;
    return String(params[k]);
  });
}

export function t(key, params) {
  let v = lookup(key);
  if (v === undefined) return key;
  if (Array.isArray(v)) {
    if (v.length === 3 && params && typeof params.n === "number")
      v = plural(params.n, v);
    else v = v.join("\n");
  }
  if (typeof v !== "string") return key;
  return fill(v, params);
}

// "5 coins" using a plural triple stored under key
export function tn(key, n, params) {
  return t(key, { ...params, n });
}
