// Project-wide checks: data references, precache, strings, credits, PWA files, size, no Russian in code.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, computeList, computeHash, readManifest, dataAssetRefs, cssAssetRefs } from '../tools/precache-lib.mjs';
import { readHeader } from '../tools/png.mjs';

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));

function walk(dir, filter, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) walk(rel, filter, out);
    else if (filter(rel)) out.push(rel);
  }
  return out;
}

test('every data/*.json parses', () => {
  for (const f of walk('data', (p) => p.endsWith('.json'))) assert.doesNotThrow(() => json(f), f);
});

test('every asset referenced by data/ and css/ exists', () => {
  const missing = [...dataAssetRefs(), ...cssAssetRefs()].filter((p) => !fs.existsSync(path.join(ROOT, p)));
  assert.deepEqual(missing, []);
});

test('sfx index files exist (m4a + mp3)', () => {
  const sfx = json('assets/sfx_index.json');
  for (const [k, e] of Object.entries(sfx)) {
    assert.ok(fs.existsSync(path.join(ROOT, 'assets', e.m4a)), k);
    assert.ok(fs.existsSync(path.join(ROOT, 'assets', e.mp3)), k);
  }
});

test('precache manifest is up to date and complete', () => {
  const m = readManifest();
  assert.ok(m, 'precache-manifest.js missing: run node tools/gen_precache.mjs');
  const list = computeList();
  assert.deepEqual(m.list, list.map((f) => './' + f), 'precache list stale: run node tools/gen_precache.mjs');
  assert.equal(m.hash, computeHash(list), 'precached files changed: run node tools/gen_precache.mjs');
  for (const f of list) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const sw = read('sw.js');
  assert.match(sw, /'buro-v' \+ self\.BURO_VERSION/);
});

test('every sound name played in code exists in sfx index', () => {
  const sfx = json('assets/sfx_index.json');
  const names = new Set();
  for (const f of walk('js', (p) => p.endsWith('.js'))) {
    for (const m of read(f).matchAll(/(?<![.\w])play\(\s*'([a-z0-9_]+)'/g)) names.add(m[1]);
    for (const m of read(f).matchAll(/sound:\s*'([a-z0-9_]+)'/g)) names.add(m[1]);
  }
  for (const n of names) assert.ok(sfx[n], 'unknown sfx ' + n);
});

test('every string key used in code exists in strings.ru.json', () => {
  const strings = json('data/strings.ru.json');
  const get = (k) => k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), strings);
  const missing = [];
  for (const f of walk('js', (p) => p.endsWith('.js'))) {
    const src = read(f)
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    for (const m of src.matchAll(/(?<![.\w])(?:t|tn|pickLine)\(\s*'([a-zA-Z0-9_.]+)'(\s*\+)?/g)) {
      if (m[2]) continue; // dynamic key: literal prefix + expression
      if (get(m[1]) === undefined) missing.push(f + ': ' + m[1]);
    }
  }
  assert.deepEqual(missing, []);
});

test('code never references asset files directly (they live in data/ so they get precached)', () => {
  const offenders = [];
  for (const f of walk('js', (p) => p.endsWith('.js'))) {
    if (/['"`]assets\/[^'"`]*\.(png|m4a|mp3|json)/.test(read(f))) offenders.push(f);
  }
  assert.deepEqual(offenders, []);
});

test('no hardcoded Russian in code', () => {
  const offenders = [];
  for (const f of walk('js', (p) => p.endsWith('.js'))) {
    read(f)
      .split('\n')
      .forEach((line, i) => {
        if (/[А-Яа-яЁё]/.test(line)) offenders.push(`${f}:${i + 1}`);
      });
  }
  assert.deepEqual(offenders, []);
});

test('credits screen data covers every author in CREDITS.md + Kyrise CC BY line', () => {
  const md = read('CREDITS.md');
  const credits = json('data/credits.json');
  assert.equal(credits.required, `Icons: "Kyrise's Free 16x16 RPG Icon Pack" by Kyrise (kyrise.itch.io), CC BY 4.0`);
  const authors = new Set(credits.packs.map((p) => p.author));
  const rows = md.split('\n').filter((l) => l.startsWith('| ') && !l.includes('---') && !l.startsWith('| Пак'));
  assert.ok(rows.length >= 10);
  for (const r of rows) {
    const cells = r.split('|').map((c) => c.trim());
    const [pack, author] = [cells[1], cells[2]];
    const short = author.split(' (')[0];
    assert.ok([...authors].some((a) => a.startsWith(short)), 'author missing: ' + author);
    assert.ok(credits.packs.some((p) => p.name.startsWith(pack.split(' (')[0])), 'pack missing: ' + pack);
  }
});

test('PWA: manifest, icons, meta tags', () => {
  const m = json('manifest.webmanifest');
  assert.equal(m.display, 'standalone');
  assert.ok(['any', 'portrait'].includes(m.orientation));
  assert.ok(m.name && m.short_name && m.theme_color && m.background_color);
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  for (const s of [180, 192, 512]) {
    const hdr = readHeader(fs.readFileSync(path.join(ROOT, `icons/icon-${s}.png`)));
    assert.equal(hdr.width, s);
    assert.equal(hdr.height, s);
  }
  const html = read('index.html');
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /apple-touch-icon" sizes="180x180" href="\.\/icons\/icon-180\.png/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.ok(fs.existsSync(path.join(ROOT, '.nojekyll')));
});

test('no absolute or network URLs in shipped code/markup', () => {
  const files = ['index.html', 'manifest.webmanifest', 'sw.js', ...walk('js', (p) => p.endsWith('.js')), ...walk('css', () => true)];
  for (const f of files) {
    const src = read(f);
    assert.ok(!/https?:\/\//.test(src), 'network url in ' + f);
    assert.ok(!/(src|href)="\//.test(src), 'absolute path in ' + f);
  }
});

test('repo size < 25 MB (excluding .git)', () => {
  let total = 0;
  const skip = new Set(['.git', 'node_modules']);
  const rec = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) rec(p);
      else total += fs.statSync(p).size;
    }
  };
  rec(ROOT);
  assert.ok(total < 25 * 1024 * 1024, (total / 1048576).toFixed(1) + ' MB');
});

test('content minimums and data integrity', async () => {
  const { loadData } = await import('./helpers.mjs');
  const d = loadData();
  assert.ok(d.items.length >= 300, 'items ' + d.items.length);
  assert.ok(d.animals.length >= 60, 'animals ' + d.animals.length);
  assert.ok(d.enemies.filter((e) => !e.boss).length >= 8);
  assert.ok(d.enemyById.klobster_king && d.enemyById.klobster_king.boss);
  const enemySheet = JSON.parse(read('assets/sprites/enemies/enemies.json')).enemies;
  for (const [name, list] of Object.entries({ items: d.items, animals: d.animals, enemies: d.enemies, statuses: d.statuses, rooms: d.rooms })) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate ids in ' + name);
  }
  const names = d.items.map((i) => i.name);
  assert.equal(new Set(names).size, names.length, 'duplicate item names');
  const rar = new Set(d.rarities.map((r) => r.id));
  for (const i of d.items) {
    assert.ok(rar.has(i.rarity), i.id);
    assert.ok(['m', 'f', 'n', 'pl'].includes(i.gender), i.id);
    assert.ok(i.price > 0 && i.name && i.flavor && i.category, i.id);
    if (i.effect && i.effect.status) assert.ok(d.statusById[i.effect.status], i.id);
  }
  for (const a of d.animals) assert.ok(rar.has(a.rarity) && a.passive && a.album, a.id);
  for (const e of d.enemies) {
    assert.ok(enemySheet[e.sprite], 'enemy sprite ' + e.sprite);
    for (const m of e.moves || e.phases.flatMap((p) => p.moves)) {
      if (m.status) assert.ok(d.statusById[m.status], e.id + ' status ' + m.status);
      if (m.enemy) assert.ok(d.enemyById[m.enemy], e.id + ' summons ' + m.enemy);
    }
  }
  for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'slop']) assert.ok(d.items.some((i) => i.rarity === r), 'no items of ' + r);
  const mods = d.modifiers.map((m) => m.id).sort();
  assert.deepEqual(mods, ['cursed', 'dirty', 'glitchy', 'golden', 'rainbow', 'shiny']);
  for (const m of d.modifiers) for (const g of ['m', 'f', 'n', 'pl']) assert.ok(m.forms[g], m.id + ' ' + g);
  const gorbodak = d.items.filter((i) => /Горбодак/.test(i.flavor)).length;
  assert.ok(gorbodak / d.items.length < 0.03, 'Gorbodak must stay rare flavor');
});

test('long unbreakable strings wrap on the credits screen', () => {
  const css = read('css/style.css');
  assert.match(css, /\.credit,\s*\.required\s*\{\s*overflow-wrap:\s*anywhere/);
});

test('texts have no slash-gender stubs, cut-off words or broken genitives', () => {
  const blob = ['data/strings.ru.json', 'data/events.json', 'data/combos.json', 'data/items.json', 'data/gen/flavor.json', 'data/gen/lines.json'].map(read).join('\n');
  for (const bad of [/\(а\)/, /\(ла\)/, /неправильн\./, /[а-яё]+ого кусь/i, /Подозревают самой/, /Принадлежало самой/]) assert.doesNotMatch(blob, bad);
});

test('flavour templates only use dictionary words that exist', () => {
  const flavor = json('data/gen/flavor.json');
  for (const list of Object.values(flavor.byCategory)) for (const line of list) for (const m of line.matchAll(/\{(\w+)\}/g)) assert.ok(flavor.fill[m[1]], m[1]);
});

test('macOS "._*" metadata files are ignored: not in git, not precached, and they do not break the build', () => {
  const junk = path.join(ROOT, 'data', '._junk.json');
  fs.writeFileSync(junk, Buffer.from([0, 5, 22, 7, 0, 2, 0, 0]));
  try {
    const list = computeList();
    assert.ok(!list.some((f) => path.basename(f).startsWith('.')), 'dotfile in precache list');
    assert.doesNotThrow(() => dataAssetRefs());
  } finally {
    fs.rmSync(junk);
  }
  assert.match(read('.gitignore'), /^\._\*$/m);
});

// Reads the Unicode characters a TrueType font covers (cmap format 4 + 12).
function fontChars(file) {
  const b = fs.readFileSync(path.join(ROOT, file));
  const n = b.readUInt16BE(4);
  let cmap = 0;
  for (let i = 0; i < n; i++) if (b.toString('latin1', 12 + i * 16, 16 + i * 16) === 'cmap') cmap = b.readUInt32BE(12 + i * 16 + 8);
  const chars = new Set();
  const tables = b.readUInt16BE(cmap + 2);
  for (let i = 0; i < tables; i++) {
    const off = cmap + b.readUInt32BE(cmap + 4 + i * 8 + 4);
    const fmt = b.readUInt16BE(off);
    if (fmt === 4) {
      const seg = b.readUInt16BE(off + 6) / 2;
      for (let s = 0; s < seg; s++) {
        const end = b.readUInt16BE(off + 14 + s * 2);
        const start = b.readUInt16BE(off + 16 + seg * 2 + s * 2);
        if (start === 0xffff) continue;
        for (let c = start; c <= end; c++) chars.add(c);
      }
    } else if (fmt === 12) {
      const groups = b.readUInt32BE(off + 12);
      for (let g = 0; g < groups; g++) {
        const start = b.readUInt32BE(off + 16 + g * 12);
        const end = b.readUInt32BE(off + 20 + g * 12);
        for (let c = start; c <= end; c++) chars.add(c);
      }
    }
  }
  return chars;
}

test('the bundled font covers every character the game shows (no fallback fonts, no tofu)', () => {
  const faces = [...read('css/style.css').matchAll(/url\('\.\.\/(fonts\/[^']+\.ttf)'\)/g)].map((m) => m[1]);
  assert.ok(faces.length >= 1);
  const texts = ['data/strings.ru.json', 'data/events.json', 'data/combos.json', 'data/items.json', 'data/animals.json', 'data/enemies.json', 'data/album.json', 'data/talents.json', 'data/upgrades.json', 'data/tiers.json', 'data/skins.json', 'data/rooms.json', 'data/rarities.json', 'data/modifiers.json', 'data/statuses.json', 'data/cats.json', 'data/gen/flavor.json', 'data/gen/lines.json'];
  const used = new Set();
  const collect = (v) => {
    if (typeof v === 'string') {
      if (v.startsWith('assets/') || v.startsWith('#')) return;
      for (const ch of v) used.add(ch.codePointAt(0));
    } else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  };
  for (const f of texts) collect(json(f));
  for (const f of walk('js', (p) => p.endsWith('.js'))) for (const m of read(f).matchAll(/'([◀▶×·→…]+)'/g)) for (const ch of m[1]) used.add(ch.codePointAt(0));
  for (const face of faces) {
    const chars = fontChars(face);
    const missing = [...used].filter((c) => c > 32 && !chars.has(c)).map((c) => String.fromCodePoint(c));
    assert.deepEqual(missing, [], face + ' lacks these characters');
  }
});
