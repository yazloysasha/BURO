// Builds data/items.json and data/animals.json from the asset indexes + the naming tables below.
// Deterministic (hash-based), so re-running gives the same content. Usage: node tools/build_content.mjs
import fs from 'node:fs';
import path from 'node:path';
import { decode } from './png.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/items_index.json'), 'utf8'));
const animalsIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/animals_index.json'), 'utf8'));
const flavorGen = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/gen/flavor.json'), 'utf8'));
const files = new Map(index.map((e) => [e.file.split('/').pop().replace('.png', ''), e]));

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
const pickH = (arr, key) => arr[hash(key) % arr.length];

// ---------- Russian adjective agreement ----------
function adj(word, g) {
  if (g === 'm') return word;
  const soft = /ний$/.test(word) && !/[кгхжшщч]ий$/.test(word); // синий
  const velar = /[кгхжшщч]ий$/.test(word); // лёгкий
  const base = word.slice(0, -2);
  if (soft) return base + { f: 'яя', n: 'ее', pl: 'ие' }[g];
  if (velar) return base + { f: 'ая', n: 'ое', pl: 'ие' }[g];
  return base + { f: 'ая', n: 'ое', pl: 'ые' }[g];
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const named = (adjWord, noun, g) => cap(adj(adjWord, g) + ' ' + noun);

// Kyrise tier letters by look (checked on contact sheets, playtest/contact_items.mjs): the palette differs per series.
const TIER = { a: 'бронзовый', b: 'серебряный', c: 'стальной', d: 'позолоченный', e: 'рубиновый' }; // a brown, b silver, c dark steel, d gold, e red
const TIER_WEAR = { a: 'кожаный', b: 'серебряный', c: 'ледяной', d: 'позолоченный', e: 'рубиновый' }; // a leather, c blue
const TIER_METAL = { a: 'бронзовый', b: 'медный', c: 'стальной', d: 'позолоченный', e: 'мифриловый' }; // ingots, keys: b orange, c white, e light blue
const TIER_ROUND = { a: 'деревянный', b: 'серебряный', c: 'стальной', d: 'позолоченный', e: 'рубиновый' };
const TIER_SKULL = { a: 'болотный', b: 'песочный', c: 'ледяной', d: 'огненный', e: 'рубиновый' };
const TIER_RARITY = { a: 'common', b: 'common', c: 'uncommon', d: 'rare', e: 'epic' };
const COLORS10 = { a: 'зелёный', b: 'жёлтый', c: 'синий', d: 'красный', e: 'белый', f: 'розовый', g: 'оранжевый', h: 'коричневый', i: 'чёрный', j: 'фиолетовый' };
const POTION_COLORS = { a: 'красный', b: 'синий', c: 'зелёный', d: 'серый', e: 'фиолетовый', f: 'оранжевый', g: 'розовый', h: 'голубой' };
const PEARL_COLORS = { a: 'серый', b: 'синий', c: 'красный', d: 'зелёный', e: 'жёлтый' };
const CANDY_FLAVORS = { a: 'клубничный', b: 'черничный', c: 'мятный', d: 'виноградный', e: 'апельсиновый', f: 'малиновый', g: 'арбузный' };

const EPITHETS = [
  'ночной смены', 'сомнений', 'Пророчества', 'вечного сна', 'тёплых лап', 'громкого мурчания', 'забытых носков', 'лунного света',
  'последней сардинки', 'хрустящих крошек', 'внезапного укуса', 'тихих шагов', 'семи хвостов', 'бархатных ушек', 'полуночного перекуса',
  'старого дивана', 'клубка судьбы', 'горячего молока', 'пушистой правды', 'бесконечной зевоты', 'кошачьей мудрости', 'мягкой силы',
  'блестящих глаз', 'шуршащего пакета', 'большой коробки', 'утренних тапок', 'солнечного пятна', 'подоконника', 'рыбьего короля',
  'ленивого воскресенья', 'Ночного аукциона', 'вязаного шарфа', 'пятничного вечера', 'весёлых лап', 'пушистого хвоста', 'громкого чиха',
  'серой полоски', 'рыжего пламени', 'розового бантика', 'полной луны', 'маленьких побед', 'сладкого сна', 'мурлыкающего грома',
  'тайного печенья', 'звёздной пыли', 'тёплого пледа', 'вечной весны', 'хитрого прищура', 'мягких подушечек', 'добрых снов',
];

const RARITY_PRICE = { common: [3, 8], uncommon: [10, 18], rare: [25, 45], epic: [60, 100], legendary: [150, 250], slop: [300, 500] };
const EQUIP_VALUE = { common: 1, uncommon: 1, rare: 2, epic: 3, legendary: 4, slop: 5 };
const HEAL_VALUE = { common: 8, uncommon: 12, rare: 16, epic: 22, legendary: 30, slop: 35 };

function hashRarity(key, weights = { common: 35, uncommon: 30, rare: 20, epic: 12, legendary: 3 }) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = (hash(key + ':r') % 10000) / 10000 * total;
  for (const [k, w] of Object.entries(weights)) {
    r -= w;
    if (r < 0) return k;
  }
  return 'common';
}

const items = [];
const usedIds = new Set();
const usedNames = new Set();
const usedFiles = new Set();

function add(file, { id, name, gender = 'm', category, rarity, effect = null, tags = [], flavor = null }) {
  const e = files.get(file);
  if (!e) throw new Error('no icon ' + file);
  id = id || file.replace(/^(kyrise|rpg496|td|food)_/, '').replace(/^\d+_/, '');
  if (usedIds.has(id)) id = id + '_' + (hash(file) % 1000);
  if (usedIds.has(id)) throw new Error('dup id ' + id);
  if (usedNames.has(name)) throw new Error('dup name ' + name + ' (' + file + ')');
  usedIds.add(id);
  usedNames.add(name);
  usedFiles.add(file);
  if (/[Кк]ост/.test(name) && !tags.includes('bone')) tags = [...tags, 'bone'];
  const [pmin, pmax] = RARITY_PRICE[rarity];
  const price = pmin + (hash(id + ':p') % (pmax - pmin + 1));
  items.push({
    id,
    name,
    gender,
    icon: 'assets/' + e.file,
    w: e.w > 16 && e.w < 32 ? e.w : e.w,
    h: e.h,
    category,
    rarity,
    price,
    tags,
    effect,
    color: colorOf(e.file),
    flavor: flavor || makeFlavor(category, id),
  });
}

// Dominant colour family of an icon (for the "sort by colour" shelf rule): saturation-weighted hue.
function colorOf(file) {
  const img = decode(fs.readFileSync(path.join(ROOT, 'assets', file)));
  let x = 0, y = 0, wsum = 0, grey = 0, n = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 128) continue;
    const r = img.data[i] / 255, g = img.data[i + 1] / 255, b = img.data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    n++;
    if (sat < 0.25 || max < 0.2) { grey++; continue; }
    let hue = 0;
    if (max === r) hue = ((g - b) / (max - min) + 6) % 6;
    else if (max === g) hue = (b - r) / (max - min) + 2;
    else hue = (r - g) / (max - min) + 4;
    const ang = (hue / 6) * Math.PI * 2;
    x += Math.cos(ang) * sat; y += Math.sin(ang) * sat; wsum += sat;
  }
  if (!n || grey / n > 0.6 || wsum === 0) return 'grey';
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  if (deg < 20 || deg >= 330) return 'red';
  if (deg < 50) return 'orange';
  if (deg < 70) return 'yellow';
  if (deg < 170) return 'green';
  if (deg < 260) return 'blue';
  return 'purple';
}

function makeFlavor(category, id) {
  if (hash(id + ':gorbodak') % 100 === 0) return pickH(flavorGen.rare, id);
  const tpl = pickH(flavorGen.byCategory[category] || flavorGen.byCategory.junk, id + ':t');
  return tpl.replace(/\{(\w+)\}/g, (m, k) => pickH(flavorGen.fill[k] || [m], id + ':' + k));
}

// rare and better gear often carries a quirk that changes how a fight goes (see js/game/combat.js)
const QUIRKS = ['thorns', 'vampire', 'echo', 'guardian', 'opener', 'coinpaw'];
const QUIRK_CHANCE = { rare: 30, epic: 60, legendary: 100, slop: 100 };
let equipSeq = 0;
const equip = (stat, rarity) => {
  const e = { type: 'stat', stat, value: EQUIP_VALUE[rarity] };
  const n = equipSeq++;
  if (hash('quirk' + n + stat + rarity) % 100 < (QUIRK_CHANCE[rarity] || 0)) e.quirk = QUIRKS[hash('q' + n + stat) % QUIRKS.length];
  return e;
};
let epithetCursor = 0;
const epithet = () => EPITHETS[epithetCursor++ % EPITHETS.length];

// ---------- hand-made consumables & specials (stable ids used by other data) ----------
const SPECIAL = [
  ['td_potion_green', { id: 'valerian', name: 'Валерьянка', gender: 'f', category: 'potion', rarity: 'common', tags: ['consumable', 'liquid'], effect: { type: 'heal', value: 12 }, flavor: 'Пахнет так, что оба кота сразу стали добрее.' }],
  ['kyrise_leaf_01a', { id: 'catnip', name: 'Кошачья мята', gender: 'f', category: 'food', rarity: 'uncommon', tags: ['consumable', 'plant'], effect: { type: 'buff', status: 'sharp', turns: 3 }, flavor: 'Когти сами собой точатся от одного запаха.' }],
  ['food_04_bowl', { id: 'milk_saucer', name: 'Блюдечко молока', gender: 'n', category: 'food', rarity: 'common', tags: ['consumable', 'liquid'], effect: { type: 'heal_all', value: 7 }, flavor: 'Одно блюдечко на двоих. Делят честно, по усам.' }],
  ['kyrise_fish_01a', { id: 'sardine', name: 'Сардинка', gender: 'f', category: 'food', rarity: 'uncommon', tags: ['consumable', 'fish'], effect: { type: 'heal', value: 20 }, flavor: 'Маленькая рыбка — большое счастье.' }],
  ['kyrise_cotton_01a', { id: 'yarn_bomb', name: 'Клубок-бомба', gender: 'm', category: 'weapon_tool', rarity: 'uncommon', tags: ['consumable', 'soft'], effect: { type: 'damage_all', value: 8 }, flavor: 'Разматывается во все стороны сразу. Насекомые в нитках.' }],
  ['rpg496_a_shoes01', { id: 'slipper_justice', name: 'Тапок правосудия', gender: 'm', category: 'clothes', rarity: 'rare', tags: ['consumable', 'smelly'], effect: { type: 'damage', value: 22 }, flavor: 'Древнейшее оружие против клобстеров. Передаётся по наследству.' }],
  ['td_vial_blue', { id: 'spray_bottle', name: 'Брызгалка', gender: 'f', category: 'household', rarity: 'common', tags: ['consumable', 'liquid'], effect: { type: 'status_enemy', status: 'scared', turns: 2, all: true }, flavor: 'Коты её боятся, насекомые — тоже. Это сближает.' }],
  ['kyrise_candle_01a', { id: 'lullaby_lamp', name: 'Ночник-колыбельная', gender: 'm', category: 'household', rarity: 'uncommon', tags: ['consumable', 'light'], effect: { type: 'status_enemy', status: 'sleepy', turns: 1 }, flavor: 'Тихо мурлычет мелодию. Враг зевает.' }],
  ['td_vial_green', { id: 'fish_oil', name: 'Рыбий жир', gender: 'm', category: 'potion', rarity: 'common', tags: ['consumable', 'liquid', 'fish'], effect: { type: 'cleanse', value: 4 }, flavor: 'Невкусно, зато полезно. Так говорят все бабушки.' }],
  ['rpg496_i_feather01', { id: 'lucky_feather', name: 'Счастливое пёрышко', gender: 'n', category: 'material', rarity: 'uncommon', tags: ['consumable', 'soft'], effect: { type: 'buff', status: 'lucky', turns: 2, all: true }, flavor: 'Если пощекотать им нос, удача чихнёт в вашу сторону.' }],
  ['td_chest_wood', { id: 'cardboard_box', name: 'Ящик-укрытие', gender: 'm', category: 'container', rarity: 'common', tags: ['consumable', 'container'], effect: { type: 'block', value: 8, all: true }, flavor: 'Если кот в ящике, его не существует. Удары проходят мимо.' }],
  ['kyrise_potion_03a', { id: 'ninth_life', name: 'Девятая жизнь', gender: 'f', category: 'potion', rarity: 'rare', tags: ['consumable', 'magic'], effect: { type: 'revive', value: 0.5 }, flavor: 'У каждого кота их девять. Это — запасная.' }],
  // combo results & slop
  ['food_82_pizza_dish', { id: 'pizza_suspicion', name: 'Пицца-подозрение', gender: 'f', category: 'food', rarity: 'epic', tags: ['consumable', 'combo'], effect: { type: 'heal_all', value: 18 }, flavor: 'Рыба плюс сыр. Выглядит как пицца. Ведёт себя подозрительно.' }],
  ['kyrise_giftopen_01a', { id: 'empty_box', name: 'Пустая коробка', gender: 'f', category: 'container', rarity: 'slop', tags: ['slop'], effect: { type: 'stat', stat: 'luck', value: 3 }, flavor: 'Лучший подарок для кота. Внутри — бесконечность возможностей.' }],
  ['rpg496_i_cannon01', { id: 'confetti_cannon', name: 'Пушка, стреляющая конфетти', gender: 'f', category: 'weapon_tool', rarity: 'slop', tags: ['slop', 'consumable'], effect: { type: 'damage_all', value: 25 }, flavor: 'Праздник для котов, катастрофа для клобстеров.' }],
  ['rpg496_w_fist003', { id: 'marshmallow_knuckles', name: 'Кастет из зефира', gender: 'm', category: 'weapon_tool', rarity: 'slop', tags: ['slop', 'soft'], effect: { type: 'stat', stat: 'atk', value: 4 }, flavor: 'Бьёт мягко, но обидно. Иногда его съедают прямо в бою.' }],
  ['rpg496_i_bottle03', { id: 'seagull_scream', name: 'Бутылка с криком чайки', gender: 'f', category: 'container', rarity: 'slop', tags: ['slop'], effect: null, flavor: 'Не открывать в помещении. И на улице тоже. Лучше вообще не открывать.' }],
  ['rpg496_e_metal05', { id: 'offended_metal', name: 'Металл, который обиделся', gender: 'm', category: 'material', rarity: 'slop', tags: ['slop'], effect: null, flavor: 'Не звенит из принципа. Извиниться уже пробовали.' }],
  ['rpg496_i_rock03', { id: 'knowing_rock', name: 'Камень, который всё знает', gender: 'm', category: 'material', rarity: 'slop', tags: ['slop'], effect: { type: 'stat', stat: 'luck', value: 4 }, flavor: 'Молчит. Но так многозначительно, что всё понятно.' }],
  ['food_55_hotdog_sauce', { id: 'future_hotdog', name: 'Хот-дог с горчицей из будущего', gender: 'm', category: 'food', rarity: 'slop', tags: ['slop', 'consumable'], effect: { type: 'heal_all', value: 30 }, flavor: 'Горчица ещё не изобретена. Но уже очень вкусная.' }],
  ['td_chest_mimic', { id: 'cat_chest', name: 'Сундук, который тоже кот', gender: 'm', category: 'container', rarity: 'slop', tags: ['slop'], effect: { type: 'stat', stat: 'def', value: 4 }, flavor: 'Мурчит, если погладить крышку. Кусается, если открыть.' }],
  ['rpg496_i_clock', { id: 'meow_clock', name: 'Часы, показывающие «мяу»', gender: 'pl', category: 'household', rarity: 'slop', tags: ['slop'], effect: null, flavor: 'Сейчас без пятнадцати мяу. Самое время для перекуса.' }],
  ['rpg496_w_throw05', { id: 'lazy_boomerang', name: 'Бумеранг, который не возвращается', gender: 'm', category: 'weapon_tool', rarity: 'slop', tags: ['slop'], effect: { type: 'stat', stat: 'spd', value: 3 }, flavor: 'Улетел в 2019 году. Ждём.' }],
  ['rpg496_i_tentacle', { id: 'polite_tentacle', name: 'Щупальце вежливости', gender: 'n', category: 'material', rarity: 'slop', tags: ['slop'], effect: null, flavor: 'Здоровается со всеми. Даже с клобстерами.' }],
  ['rpg496_p_medicine09', { id: 'too_happy_pill', name: 'Таблетка от слишком хорошего настроения', gender: 'f', category: 'potion', rarity: 'slop', tags: ['slop', 'consumable'], effect: { type: 'buff', status: 'lucky', turns: 4, all: true }, flavor: 'Принимать не рекомендуется. Настроение должно быть хорошим.' }],
  // relics: legendaries that change how a run plays (effect.type 'relic', handled in js/game/run.js)
  ['kyrise_flower_01a', { id: 'friend_bouquet', name: 'Букет для зверька', gender: 'm', category: 'household', rarity: 'legendary', tags: ['relic'], effect: { type: 'relic', relic: 'bouquet' }, flavor: 'Зверёк так растроган, что помогает котам каждый ход.' }],
  ['rpg496_i_key05', { id: 'backroom_loupe', name: 'Лупа подсобки', gender: 'f', category: 'household', rarity: 'legendary', tags: ['relic'], effect: { type: 'relic', relic: 'loupe' }, flavor: 'Через неё видно, где комната врёт.' }],
  ['rpg496_ac_necklace06', { id: 'nine_lives_pearls', name: 'Ожерелье девяти жизней', gender: 'n', category: 'jewelry', rarity: 'legendary', tags: ['relic'], effect: { type: 'relic', relic: 'ninelives' }, flavor: 'Девять жемчужин, по одной на каждую жизнь. Одна уже тёплая.' }],
  ['rpg496_i_torch02', { id: 'eternal_torch', name: 'Вечный факел', gender: 'm', category: 'household', rarity: 'legendary', tags: ['relic'], effect: { type: 'relic', relic: 'torch' }, flavor: 'Темнота его побаивается. Гнёзда — тоже.' }],
  ['kyrise_giftopen_01b', { id: 'surprise_box', name: 'Коробка с сюрпризом', gender: 'f', category: 'container', rarity: 'legendary', tags: ['relic'], effect: { type: 'relic', relic: 'purse' }, flavor: 'Сколько ни заглядывай, внутри опять монетки.' }],
  ['food_17_burger_napkin', { id: 'invisible_burger', name: 'Бургер в салфетке-невидимке', gender: 'm', category: 'food', rarity: 'slop', tags: ['slop', 'consumable'], effect: { type: 'heal', value: 40 }, flavor: 'Салфетку не видно. Бургер, кстати, тоже — пока не откусишь.' }],
];
for (const [file, spec] of SPECIAL) add(file, spec);

// ---------- food (Ghostpixxells) ----------
const FOOD = {
  apple_pie: ['Яблочный пирог', 'm'], bread: ['Хлеб', 'm'], baguette: ['Багет', 'm'], bun: ['Булочка', 'f'], bacon: ['Бекон', 'm'],
  burger: ['Бургер', 'm'], burrito: ['Буррито', 'n'], bagel: ['Бублик', 'm'], cheesecake: ['Чизкейк', 'm'], cheesepuff: ['Сырные палочки', 'pl'],
  chocolate: ['Шоколадка', 'f'], cookies: ['Печеньки', 'pl'], chocolatecake: ['Шоколадный торт', 'm'], curry: ['Карри', 'n'], donut: ['Пончик', 'm'],
  dumplings: ['Пельмешки', 'pl'], friedegg: ['Яичница', 'f'], eggsalad: ['Яичный салат', 'm'], eggtart: ['Тарталетка', 'f'], frenchfries: ['Картошка фри', 'f'],
  fruitcake: ['Фруктовый кекс', 'm'], garlicbread: ['Чесночный хлебец', 'm'], giantgummybear: ['Гигантский мармеладный мишка', 'm'],
  gingerbreadman: ['Пряничный человечек', 'm'], hotdog: ['Хот-дог', 'm'], icecream: ['Мороженое', 'n'], jelly: ['Желе', 'n'], jam: ['Варенье', 'n'],
  lemonpie: ['Лимонный пирог', 'm'], loafbread: ['Буханка', 'f'], macncheese: ['Макароны с сыром', 'pl'], meatball: ['Фрикаделька', 'f'],
  nacho: ['Начос', 'pl'], omlet: ['Омлет', 'm'], pudding: ['Пудинг', 'm'], potatochips: ['Чипсы', 'pl'], pancakes: ['Блинчики', 'pl'],
  pizza: ['Пицца', 'f'], popcorn: ['Попкорн', 'm'], roastedchicken: ['Жареная курочка', 'f'], ramen: ['Рамен', 'm'], salmon: ['Лосось', 'm'],
  strawberrycake: ['Клубничный торт', 'm'], sandwich: ['Бутерброд', 'm'], spaghetti: ['Спагетти', 'pl'], steak: ['Стейк', 'm'], sushi: ['Суши', 'pl'],
  taco: ['Тако', 'n'], waffle: ['Вафля', 'f'],
};
const FOOD_RARITY = { giantgummybear: 'epic', strawberrycake: 'rare', chocolatecake: 'rare', salmon: 'rare', sushi: 'epic', roastedchicken: 'rare', cheesecake: 'uncommon', steak: 'uncommon', fruitcake: 'uncommon', ramen: 'uncommon', curry: 'uncommon', lemonpie: 'uncommon' };
let foodIdx = 0;
for (const [file] of files) {
  const m = file.match(/^food_(\d+)_([a-z]+)$/);
  if (!m || usedFiles.has(file)) continue;
  const key = m[2];
  if (!FOOD[key]) continue;
  const [name, g] = FOOD[key];
  const rarity = FOOD_RARITY[key] || (hash(key) % 3 === 0 ? 'uncommon' : 'common');
  const consumable = foodIdx++ % 3 === 0;
  add(file, { id: 'food_' + key, name, gender: g, category: 'food', rarity, tags: consumable ? ['consumable', 'food'] : ['food'], effect: consumable ? { type: 'heal', value: HEAL_VALUE[rarity] } : null });
}
// a few plated dishes
for (const [file, name, g, r] of [
  ['food_86_roastedchicken_dish', 'Курочка на блюде', 'f', 'epic'], ['food_91_strawberrycake_dish', 'Торт на праздничной тарелке', 'm', 'epic'],
  ['food_98_sushi_dish', 'Сет суши «Ночной»', 'm', 'legendary'], ['food_51_giantgummybear_dish', 'Мишка на блюдечке', 'm', 'legendary'],
  ['food_01_dish', 'Тарелка', 'f', 'common'], ['food_58_icecream_bowl', 'Пломбир в вазочке', 'm', 'rare'],
]) add(file, { name, gender: g, category: file.includes('_dish') && !/chicken|cake|sushi|bear/.test(file) || file.includes('bowl') && !file.includes('icecream') ? 'household' : 'food', rarity: r });

// ---------- ingredients (rpg496 i_c_*) ----------
const CROPS = {
  banana: ['Банан', 'm'], bread: ['Каравай', 'm'], carrot: ['Морковка', 'f'], cheese: ['Сыр', 'm'], cherry: ['Вишенка', 'f'], fish: ['Вяленая рыбка', 'f'],
  grapes: ['Виноград', 'm'], green_grapes: ['Зелёный виноград', 'm'], green_pepper: ['Зелёный перчик', 'm'], lemon: ['Лимон', 'm'], meat: ['Горячий бифштекс', 'm'],
  mulberry: ['Шелковица', 'f'], mushroom: ['Гриб', 'm'], nut: ['Жёлудь', 'm'], orange: ['Апельсин', 'm'], pear: ['Груша', 'f'], pie: ['Пирожок', 'm'],
  pineapple: ['Ананас', 'm'], radish: ['Редиска', 'f'], raw_fish: ['Свежая рыба', 'f'], raw_meat: ['Кусок мяса', 'm'], red_pepper: ['Красный перчик', 'm'],
  strawberry: ['Клубника', 'f'], watermellon: ['Арбуз', 'm'], yellow_pepper: ['Жёлтый перчик', 'm'],
};
for (const [k, [name, g]] of Object.entries(CROPS)) {
  const rarity = ['cheese', 'raw_fish', 'pineapple', 'watermellon'].includes(k) ? 'uncommon' : 'common';
  add('rpg496_i_c_' + k, { id: 'crop_' + k, name, gender: g, category: 'food', rarity, tags: k.includes('fish') ? ['food', 'fish'] : k === 'cheese' ? ['food', 'cheese'] : ['food'] });
}
add('kyrise_fruit_01a', { id: 'apple', name: 'Яблоко', gender: 'n', category: 'food', rarity: 'common', tags: ['consumable', 'food'], effect: { type: 'heal', value: 6 } });
add('kyrise_fruit_01b', { id: 'ripe_banana', name: 'Спелый банан', gender: 'm', category: 'food', rarity: 'common' });
add('kyrise_cookie_01a', { id: 'cookie', name: 'Печенька', gender: 'f', category: 'food', rarity: 'common', tags: ['consumable', 'food'], effect: { type: 'heal', value: 6 } });
for (const [l, name, g, r] of [['b', 'Карасик', 'm', 'common'], ['c', 'Жёлтый окунёк', 'm', 'uncommon'], ['d', 'Зелёный лещик', 'm', 'rare'], ['e', 'Синяя рыбка-фугу', 'f', 'epic']]) {
  add('kyrise_fish_01' + l, { name, gender: g, category: 'food', rarity: r, tags: ['food', 'fish'] });
}
for (const s of ['01', '02']) for (const [l, fl] of Object.entries(CANDY_FLAVORS)) {
  const noun = s === '01' ? ['трость', 'f'] : ['конфета', 'f'];
  add(`kyrise_candy_${s}${l}`, { id: `candy_${s}${l}`, name: named(fl, noun[0], noun[1]), gender: noun[1], category: 'food', rarity: l === 'g' ? 'uncommon' : 'common', tags: ['food', 'sweet'] });
}

// ---------- potions ----------
const POTION_EFFECT = {
  a: (s) => ({ type: 'heal', value: [10, 16, 24][s] }), b: (s) => ({ type: 'block', value: [5, 8, 11][s], all: true }),
  c: (s) => ({ type: 'cleanse', value: [4, 7, 10][s] }), d: (s) => ({ type: 'heal_all', value: [6, 9, 13][s] }),
  e: () => ({ type: 'buff', status: 'sharp', turns: 2 }), f: () => ({ type: 'status_enemy', status: 'scared', turns: 2, all: true }),
  g: () => ({ type: 'buff', status: 'cozy', turns: 3, all: true }), h: () => ({ type: 'buff', status: 'lucky', turns: 2, all: true }),
};
const POTION_NOUN = [['зелье', 'n'], ['эликсир', 'm'], ['настойка', 'f']];
for (let s = 0; s < 3; s++) for (const [l, col] of Object.entries(POTION_COLORS)) {
  const file = `kyrise_potion_0${s + 1}${l}`;
  if (usedFiles.has(file)) continue;
  const [noun, g] = POTION_NOUN[s];
  const rarity = ['common', 'uncommon', 'rare'][s];
  add(file, { id: `potion_${s + 1}${l}`, name: named(col, noun, g), gender: g, category: 'potion', rarity, tags: ['consumable', 'liquid'], effect: POTION_EFFECT[l](s) });
}
const MEDICINE = ['Микстура от икоты', 'Микстура от скуки', 'Микстура от понедельников', 'Микстура храбрости', 'Микстура от чихания', 'Микстура для блеска шерсти', 'Микстура от зевоты', 'Микстура хорошего аппетита'];
MEDICINE.forEach((name, i) => add(`rpg496_p_medicine0${i + 1}`, { id: 'medicine_' + (i + 1), name, gender: 'f', category: 'potion', rarity: ['common', 'uncommon', 'rare'][i % 3], tags: ['consumable', 'liquid'], effect: { type: 'heal', value: 8 + (i % 3) * 5 } }));
const VIAL_COLORS = { blue: 'синий', green: 'зелёный', orange: 'оранжевый', pink: 'розовый', red: 'красный', white: 'серебристый', yellow: 'жёлтый' };
for (const [c, col] of Object.entries(VIAL_COLORS)) add(`rpg496_p_${c}01`, { id: 'flask_' + c, name: named(col, 'склянка', 'f'), gender: 'f', category: 'potion', rarity: hashRarity('flask' + c, { common: 3, uncommon: 2, rare: 1 }) });
add('td_potion_blue', { id: 'moon_water', name: 'Бутылочка лунной воды', gender: 'f', category: 'potion', rarity: 'rare', tags: ['consumable', 'liquid'], effect: { type: 'heal_all', value: 12 } });
add('td_potion_red', { id: 'berry_juice', name: 'Ягодный морс', gender: 'm', category: 'potion', rarity: 'common', tags: ['consumable', 'liquid'], effect: { type: 'heal', value: 9 } });
add('td_vial_red', { id: 'jam_tube', name: 'Пробирка с вареньем', gender: 'f', category: 'potion', rarity: 'uncommon' });
add('td_potion_empty', { id: 'empty_bottle', name: 'Пустая бутылка', gender: 'f', category: 'junk', rarity: 'common' });
add('td_vial_empty', { id: 'empty_tube', name: 'Пустая пробирка', gender: 'f', category: 'junk', rarity: 'common' });

// ---------- weapons & tools ----------
const tierSeries = (prefix, series, noun, g, category, stat, palette = TIER) => {
  for (const [l, a] of Object.entries(palette)) {
    const file = `${prefix}_${series}${l}`;
    if (!files.has(file) || usedFiles.has(file)) continue;
    const rarity = TIER_RARITY[l];
    add(file, { id: file.replace(/^kyrise_/, ''), name: named(a, noun, g), gender: g, category, rarity, effect: stat ? equip(stat, rarity) : null });
  }
};
tierSeries('kyrise_sword', '01', 'меч', 'm', 'weapon_tool', 'atk');
tierSeries('kyrise_sword', '02', 'палаш', 'm', 'weapon_tool', 'atk');
tierSeries('kyrise_sword', '03', 'сабля', 'f', 'weapon_tool', 'atk');
tierSeries('kyrise_bow', '01', 'лук', 'm', 'weapon_tool', 'crit');
tierSeries('kyrise_staff', '01', 'посох', 'm', 'weapon_tool', 'luck');
tierSeries('kyrise_staff', '02', 'жезл', 'm', 'weapon_tool', 'luck');
tierSeries('kyrise_shield', '01', 'круглый щит', 'm', 'clothes', 'def', TIER_ROUND);
tierSeries('kyrise_shield', '02', 'рыцарский щит', 'm', 'clothes', 'def');
tierSeries('kyrise_shield', '03', 'щит с черепушкой', 'm', 'clothes', 'def', TIER_SKULL);
tierSeries('kyrise_helmet', '01', 'шлем', 'm', 'clothes', 'def', TIER_WEAR);
tierSeries('kyrise_helmet', '02', 'шлем с забралом', 'm', 'clothes', 'def', TIER_WEAR);
tierSeries('kyrise_gloves', '01', 'перчатки', 'pl', 'clothes', 'atk', TIER_WEAR);
tierSeries('kyrise_boots', '01', 'сапоги', 'pl', 'clothes', 'spd', TIER_WEAR);
tierSeries('kyrise_armor', '01', 'доспех', 'm', 'clothes', 'def', TIER_WEAR);
tierSeries('kyrise_necklace', '01', 'ожерелье', 'n', 'jewelry', 'luck');
tierSeries('kyrise_necklace', '02', 'кулон', 'm', 'jewelry', 'luck');
tierSeries('kyrise_ring', '01', 'кольцо', 'n', 'jewelry', 'luck');
tierSeries('kyrise_ring', '02', 'перстень', 'm', 'jewelry', 'crit');
tierSeries('kyrise_ingot', '01', 'слиток', 'm', 'material', null, TIER_METAL);
tierSeries('kyrise_key', '01', 'ключ', 'm', 'key', null, TIER_METAL);

const EPI_GROUPS = [
  ['rpg496_w_sword00', [1, 2, 3, 4, 5, 6, 7, 8], 'Клинок', 'm', 'atk'],
  ['rpg496_w_axe00', [1, 2, 3, 4, 5], 'Топор', 'm', 'atk'],
  ['rpg496_w_dagger00', [1, 2, 3, 4, 5, 6], 'Кинжал', 'm', 'crit'],
  ['rpg496_w_mace00', [1, 2, 3, 4, 5], 'Булава', 'f', 'atk'],
  ['rpg496_w_spear00', [1, 2, 3, 4], 'Копьё', 'n', 'atk'],
  ['rpg496_w_bow0', [1, 2, 3, 4], 'Лук', 'm', 'crit'],
  ['rpg496_w_staff0', [1, 2, 3, 4], 'Посох', 'm', 'luck'],
  ['rpg496_w_fist00', [1, 2], 'Боксёрская перчатка', 'f', 'atk'],
  ['rpg496_w_throw00', [1, 2, 3], 'Сюрикен', 'm', 'crit'],
];
const SPRITE_NOUN = { rpg496_w_throw001: ['Метательный топорик', 'm'], rpg496_w_throw002: ['Метательный дротик', 'm'] };
for (const [prefix, nums, noun, g, stat] of EPI_GROUPS) {
  for (const n of nums) {
    const file = prefix + n;
    const rarity = hashRarity(file);
    const over = SPRITE_NOUN[file] || [noun, g];
    add(file, { name: over[0] + ' ' + epithet(), gender: over[1], category: 'weapon_tool', rarity, effect: equip(stat, rarity) });
  }
}
for (const [k, noun, g] of [['axe', 'Золотой топор', 'm'], ['bow', 'Золотой лук', 'm'], ['dagger', 'Золотой кинжал', 'm'], ['mace', 'Золотая булава', 'f'], ['spear', 'Золотое копьё', 'n'], ['sword', 'Золотой меч', 'm']]) {
  add('rpg496_w_gold_' + k, { id: 'gold_' + k, name: noun, gender: g, category: 'weapon_tool', rarity: 'legendary', effect: equip(k === 'bow' || k === 'dagger' ? 'crit' : 'atk', 'legendary') });
}
for (const [file, name, g, r, stat] of [
  ['td_axe', 'Топорик', 'm', 'common', 'atk'], ['td_axe_double', 'Секира', 'f', 'uncommon', 'atk'], ['td_dagger', 'Ножик', 'm', 'common', 'crit'],
  ['td_hammer', 'Молоток', 'm', 'common', 'atk'], ['td_spear', 'Пика', 'f', 'common', 'atk'], ['td_staff_wood', 'Посох странника', 'm', 'uncommon', 'luck'],
  ['td_sword_broad', 'Широкий меч', 'm', 'uncommon', 'atk'], ['td_sword_bronze', 'Меч-старичок', 'm', 'common', 'atk'], ['td_sword_long', 'Длинный меч', 'm', 'rare', 'atk'],
  ['td_sword_short', 'Короткий меч', 'm', 'common', 'atk'], ['td_wand_purple', 'Волшебная палочка', 'f', 'rare', 'luck'],
]) add(file, { name, gender: g, category: 'weapon_tool', rarity: r, effect: equip(stat, r) });
for (let n = 1; n <= 7; n++) add('rpg496_w_book0' + n, { id: 'grimoire_' + n, name: 'Гримуар ' + epithet(), gender: 'm', category: 'book', rarity: hashRarity('grim' + n), effect: n % 2 ? equip('luck', hashRarity('grim' + n)) : null });

// ---------- clothes ----------
const HATS = { a: ['Шляпа путника', 'f'], b: ['Белый колпак', 'm'], c: ['Колпак звездочёта', 'm'], d: ['Соломенная шляпа', 'f'], e: ['Красный колпак', 'm'], f: ['Шляпа фокусника', 'f'] };
for (const [l, [name, g]] of Object.entries(HATS)) add('kyrise_hat_01' + l, { name, gender: g, category: 'clothes', rarity: { a: 'common', b: 'common', c: 'rare', d: 'common', e: 'uncommon', f: 'epic' }[l], effect: l === 'c' || l === 'f' ? equip('luck', l === 'f' ? 'epic' : 'rare') : null });
for (const [file, name, g, r, stat] of [
  ['rpg496_a_armor04', 'Белый панцирь', 'm', 'uncommon', 'def'], ['rpg496_a_armor05', 'Чешуйчатый доспех', 'm', 'rare', 'def'], ['rpg496_a_armour01', 'Кожаный жилет', 'm', 'common', 'def'],
  ['rpg496_a_armour02', 'Белые латы', 'pl', 'common', 'def'], ['rpg496_a_armour03', 'Золочёный нагрудник', 'm', 'uncommon', 'def'],
  ['rpg496_a_clothing01', 'Белая рубашка', 'f', 'common', null], ['rpg496_a_clothing02', 'Льняная туника', 'f', 'rare', 'luck'],
  ['rpg496_a_shoes02', 'Зелёные сапожки', 'pl', 'common', 'spd'], ['rpg496_a_shoes03', 'Сандалии', 'pl', 'uncommon', 'spd'], ['rpg496_a_shoes04', 'Лиловые сапожки', 'pl', 'common', 'spd'],
  ['rpg496_a_shoes05', 'Латные сапоги', 'pl', 'rare', 'spd'], ['rpg496_a_shoes06', 'Тёмные башмаки', 'pl', 'common', null], ['rpg496_a_shoes07', 'Ботфорты', 'pl', 'epic', 'spd'],
  ['rpg496_c_elm01', 'Шлем-кастрюля', 'm', 'common', 'def'], ['rpg496_c_elm03', 'Греческий шлем', 'm', 'rare', 'def'], ['rpg496_c_elm04', 'Шлем-ведро', 'm', 'uncommon', 'def'],
  ['rpg496_c_hat01', 'Лиловый колпак', 'm', 'common', null], ['rpg496_c_hat02', 'Ведьмина шляпа', 'f', 'rare', 'luck'],
]) add(file, { name, gender: g, category: 'clothes', rarity: r, effect: stat ? equip(stat, r) : null });

// ---------- jewelry & gems ----------
for (const [l, col] of Object.entries(PEARL_COLORS)) add('kyrise_pearl_01' + l, { id: 'pearl_' + l, name: named(col, 'жемчужина', 'f'), gender: 'f', category: 'jewelry', rarity: l === 'c' ? 'epic' : l === 'e' ? 'rare' : 'uncommon' });
for (const [file, name, g, r] of [
  ['rpg496_ac_medal01', 'Медаль за храбрость', 'f', 'rare'], ['rpg496_ac_medal02', 'Медаль за лучший мурр', 'f', 'epic'],
  ['rpg496_ac_medal03', 'Орден Пушистого Хвоста', 'm', 'legendary'], ['rpg496_ac_medal04', 'Значок ночного сторожа', 'm', 'uncommon'],
]) add(file, { name, gender: g, category: 'jewelry', rarity: r, effect: equip('luck', r) });
for (const n of [1, 2, 3, 4, 5]) add('rpg496_ac_necklace0' + n, { id: 'amulet_' + n, name: 'Амулет ' + epithet(), gender: 'm', category: 'jewelry', rarity: hashRarity('amulet' + n), effect: equip('luck', hashRarity('amulet' + n)) });
for (const n of [1, 2]) add('rpg496_ac_ring0' + n, { id: 'ring_epi_' + n, name: 'Кольцо ' + epithet(), gender: 'n', category: 'jewelry', rarity: n === 1 ? 'epic' : 'legendary', effect: equip('crit', n === 1 ? 'epic' : 'legendary') });
const GEM_NAMES = { a: 'Изумруд', b: 'Цитрин', c: 'Сапфир', d: 'Рубин', e: 'Горный хрусталь', f: 'Розовый кварц', g: 'Топаз', h: 'Дымчатый кварц', i: 'Обсидиан', j: 'Аметист' };
const GEM_R = { a: 'rare', b: 'uncommon', c: 'rare', d: 'epic', e: 'common', f: 'uncommon', g: 'uncommon', h: 'common', i: 'rare', j: 'epic' };
for (const [l, name] of Object.entries(GEM_NAMES)) add('kyrise_gem_01' + l, { id: 'gem_' + l, name, gender: 'm', category: 'gem', rarity: GEM_R[l] });
for (const [l, col] of Object.entries(COLORS10)) add('kyrise_crystal_01' + l, { id: 'crystal_' + l, name: named(col, 'кристалл', 'm'), gender: 'm', category: 'gem', rarity: hashRarity('cr' + l, { common: 3, uncommon: 3, rare: 2, epic: 1 }) });
for (const l of ['a', 'c', 'd', 'f', 'j']) add('kyrise_shard_01' + l, { id: 'shard_' + l, name: named(COLORS10[l], 'осколок', 'm'), gender: 'm', category: 'gem', rarity: 'common' });
for (const [file, name, r] of [
  ['rpg496_i_agate', 'Агат', 'uncommon'], ['rpg496_i_amethist', 'Аметист-великан', 'epic'], ['rpg496_i_diamond', 'Алмаз', 'legendary'], ['rpg496_i_jade', 'Нефрит', 'rare'],
  ['rpg496_i_opal', 'Опал', 'rare'], ['rpg496_i_ruby', 'Королевский рубин', 'legendary'], ['rpg496_i_sapphire', 'Звёздный сапфир', 'epic'],
  ['rpg496_i_crystal01', 'Синяя друза', 'uncommon'], ['rpg496_i_crystal02', 'Розовая друза', 'rare'], ['rpg496_i_crystal03', 'Лунная друза', 'epic'],
]) add(file, { name, gender: name.endsWith('друза') ? 'f' : 'm', category: 'gem', rarity: r });

// ---------- books & scrolls ----------
const BOOKS = [
  ['01a', 'Справочник по коробкам', 'm'], ['01c', 'Сонник для котов', 'm'], ['01e', 'Энциклопедия сардин', 'f'], ['02a', 'Атлас подоконников', 'm'],
  ['02c', 'Учебник мурчания', 'm'], ['02e', 'Сказки на ночь', 'pl'], ['03a', 'Дневник клобстера', 'm'], ['03c', 'Словарь мяуканья', 'm'],
  ['03e', 'Самоучитель прыжков', 'm'], ['04a', 'Роман «Хвост и предубеждение»', 'm'], ['04c', 'Детектив «Кто съел сметану»', 'm'],
  ['04e', 'Сборник стихов о луне', 'm'], ['05b', 'Путеводитель по крышам', 'm'], ['05d', 'Книга рекордов сна', 'f'], ['06b', 'Пособие «Как стать котом»', 'n'],
  ['06d', 'Кулинарная книга рыбака', 'f'],
];
for (const [code, name, g] of BOOKS) add('kyrise_book_' + code, { id: 'book_' + code, name, gender: g, category: 'book', rarity: hashRarity('book' + code, { common: 4, uncommon: 3, rare: 2, epic: 1 }) });
for (const code of ['01a', '01c', '01e', '02b', '02d', '03a', '03c', '03e']) {
  const r = hashRarity('spell' + code, { uncommon: 3, rare: 3, epic: 2, legendary: 1 });
  add('kyrise_spellbook_' + code, { id: 'spellbook_' + code, name: 'Книга чар ' + epithet(), gender: 'f', category: 'book', rarity: r, effect: equip('luck', r) });
}
for (const l of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) add('kyrise_scroll_01' + l, { id: 'scroll_' + l, name: 'Свиток ' + epithet(), gender: 'm', category: 'book', rarity: hashRarity('scroll' + l, { common: 3, uncommon: 3, rare: 2 }) });
add('rpg496_i_map', { id: 'treasure_map', name: 'Карта сокровищ', gender: 'f', category: 'book', rarity: 'epic' });
add('rpg496_i_book', { id: 'old_book', name: 'Старая книга', gender: 'f', category: 'book', rarity: 'common' });
add('rpg496_i_scroll', { id: 'letter', name: 'Письмо без адреса', gender: 'n', category: 'book', rarity: 'uncommon' });
add('rpg496_i_scroll02', { id: 'recipe', name: 'Рецепт бабушкиного пирога', gender: 'm', category: 'book', rarity: 'rare' });
add('rpg496_i_ink', { id: 'ink', name: 'Чернильница', gender: 'f', category: 'household', rarity: 'common' });

// ---------- materials ----------
for (const [file, name, g, r] of [
  ['kyrise_bone01a', 'Косточка', 'f', 'common'], ['kyrise_plank_01a', 'Доска', 'f', 'common'], ['kyrise_wood_01a', 'Полено', 'n', 'common'],
  ['kyrise_stoneblock_01a', 'Камень', 'm', 'common'], ['rpg496_i_bat_wing', 'Крыло нетопыря', 'n', 'uncommon'], ['rpg496_i_birds_beak', 'Птичий клюв', 'm', 'uncommon'],
  ['rpg496_i_bone', 'Большая кость', 'f', 'common'], ['rpg496_i_bronze_bar', 'Бронзовый брусок', 'm', 'common'], ['rpg496_i_coal', 'Уголёк', 'm', 'common'],
  ['rpg496_i_fabric', 'Отрез ткани', 'm', 'common'], ['rpg496_i_fang', 'Клык', 'm', 'uncommon'], ['rpg496_i_feather02', 'Перо', 'n', 'common'],
  ['rpg496_i_fish_tail', 'Рыбий хвост', 'm', 'common'], ['rpg496_i_fox_tail', 'Лисий хвост', 'm', 'rare'], ['rpg496_i_frog_leg', 'Лягушачья лапка', 'f', 'uncommon'],
  ['rpg496_i_gold_bar', 'Золотой брусок', 'm', 'epic'], ['rpg496_i_iron_ball', 'Ядро на цепочке', 'n', 'common'], ['rpg496_i_rabbit_paw', 'Кроличья лапка', 'f', 'rare'],
  ['rpg496_i_rock01', 'Камешек', 'm', 'common'], ['rpg496_i_rock02', 'Галька', 'f', 'common'], ['rpg496_i_scorpion_claw', 'Клешня скорпиона', 'f', 'uncommon'],
  ['rpg496_i_silver_bar', 'Серебряный брусок', 'm', 'rare'], ['rpg496_i_snail_shell', 'Раковина улитки', 'f', 'common'], ['rpg496_i_solid_shell', 'Рыжий панцирь', 'm', 'uncommon'],
  ['rpg496_i_wolf_fur', 'Волчья шерсть', 'f', 'uncommon'], ['rpg496_i_clover', 'Четырёхлистный клевер', 'm', 'epic'], ['rpg496_i_leaf', 'Зелёный листик', 'm', 'common'],
  ['rpg496_e_bones02', 'Рёбрышки скелета', 'pl', 'common'], ['rpg496_e_metal03', 'Стальная катушка', 'f', 'uncommon'],
]) add(file, { name, gender: g, category: 'material', rarity: r, effect: name === 'Четырёхлистный клевер' || name === 'Кроличья лапка' ? equip('luck', r) : null });

// ---------- keys, containers, household, junk ----------
for (const [n, name] of [[1, 'Ключ от холодильника'], [2, 'Ключ от всех дверей'], [3, 'Ключ от коробки'], [4, 'Ключ от лунного чердака']]) {
  add('rpg496_i_key0' + n, { id: 'key_epi_' + n, name, gender: 'm', category: 'key', rarity: ['uncommon', 'legendary', 'common', 'epic'][n - 1] });
}
const GIFT_NAMES = { b: 'Зелёный подарок', c: 'Подарок с лиловым бантом', d: 'Подарок с жёлтым бантом', e: 'Синий подарок', f: 'Золотой подарок' };
for (const [l, name] of Object.entries(GIFT_NAMES)) add('kyrise_gift_01' + l, { id: 'gift_' + l, name, gender: 'm', category: 'container', rarity: l === 'f' ? 'epic' : 'uncommon' });
for (const [file, name, g, r, cat] of [
  ['kyrise_gift_01a', 'Красный подарок', 'm', 'common', 'container'],
  ['rpg496_i_chest01', 'Сундук', 'm', 'uncommon', 'container'], ['rpg496_i_chest02', 'Открытый сундук', 'm', 'common', 'container'],
  ['td_chest_gold', 'Окованный сундучок', 'm', 'epic', 'container'], ['td_chest_wood_b', 'Открытый ящик', 'm', 'common', 'container'], ['td_barrel', 'Бочка', 'f', 'common', 'container'],
  ['rpg496_i_bottle01', 'Пробирка с голубой жижей', 'f', 'rare', 'container'], ['rpg496_i_bottle02', 'Длинная колба', 'f', 'epic', 'container'],
  ['kyrise_candle_01b', 'Свеча', 'f', 'common', 'household'], ['kyrise_cup_01b', 'Стакан молока', 'm', 'common', 'household'],
  ['kyrise_cup_02a', 'Бокал', 'm', 'uncommon', 'household'], ['kyrise_cup_02b', 'Бокал морса', 'm', 'uncommon', 'household'],
  ['td_anvil', 'Наковальня', 'f', 'uncommon', 'household'], ['td_anvil_small', 'Наковаленка', 'f', 'common', 'household'],
  ['td_sign_wood', 'Табличка «Открыто»', 'f', 'common', 'household'], ['td_stool', 'Табуретка', 'f', 'common', 'household'],
  ['rpg496_i_mirror', 'Зеркальце', 'n', 'rare', 'household'], ['rpg496_i_telescope', 'Подзорная труба', 'f', 'epic', 'household'],
  ['rpg496_i_torch01', 'Факел', 'm', 'common', 'household'], ['rpg496_i_water', 'Бутылка воды', 'f', 'common', 'household'], ['kyrise_cup_01a', 'Пустой стакан', 'm', 'common', 'household'],
  ['rpg496_i_eye', 'Глаз-талисман', 'm', 'rare', 'household'],
  ['rpg496_i_bronze_coin', 'Потёртая монетка', 'f', 'common', 'junk'], ['rpg496_i_silver_coin', 'Серебряная монетка', 'f', 'uncommon', 'junk'],
  ['rpg496_i_gold_coin', 'Дублон', 'm', 'rare', 'junk'], ['td_coin_bronze', 'Медяк', 'm', 'common', 'junk'], ['td_coin_silver', 'Серебрушка', 'f', 'common', 'junk'],
  ['rpg496_i_bottle04', 'Бутылочка из-под молока', 'f', 'common', 'junk'], ['rpg496_i_rock04', 'Подозрительный булыжник', 'm', 'common', 'junk'],
  // rpg496 e_* look like ores by name, but these are round shields
  ['rpg496_e_gold01', 'Золотой щиток', 'm', 'rare', 'clothes'], ['rpg496_e_gold02', 'Золотая бляха', 'f', 'epic', 'clothes'],
  ['rpg496_e_metal01', 'Решётчатый щиток', 'm', 'common', 'clothes'], ['rpg496_e_metal02', 'Чёрный баклер', 'm', 'common', 'clothes'],
  ['rpg496_e_wood01', 'Деревянный щит', 'm', 'common', 'clothes'], ['rpg496_e_wood02', 'Окованный щит', 'm', 'common', 'clothes'],
]) add(file, { name, gender: g, category: cat, rarity: r });

// ---------- animals ----------
const ANIMALS = {
  camel: ['Верблюд', 'uncommon', 'savanna'], owl_white: ['Полярная сова', 'rare', 'birds'], owlet: ['Совёнок', 'uncommon', 'birds'], owl_brown: ['Неясыть', 'uncommon', 'birds'],
  hedgehog: ['Ёжик', 'common', 'forest'], eagle: ['Орёл', 'rare', 'birds'], eagle_bald: ['Белоголовый орлан', 'epic', 'birds'], crow: ['Ворона', 'common', 'birds'],
  mole: ['Крот', 'common', 'forest'], bat_brown: ['Бурый нетопырь', 'uncommon', 'night'], flying_beast: ['Летяга', 'rare', 'night'], lizard: ['Ящерка', 'common', 'swamp'],
  frog: ['Лягушка', 'common', 'swamp'], crocodile: ['Крокодил', 'rare', 'swamp'], turtle: ['Черепаха', 'uncommon', 'swamp'], chicken: ['Курочка', 'common', 'farm'],
  cow: ['Корова', 'common', 'farm'], goat: ['Козочка', 'common', 'farm'], sheep: ['Овечка', 'common', 'farm'], emu: ['Эму', 'uncommon', 'savanna'],
  zebra: ['Зебра', 'uncommon', 'savanna'], lion: ['Лев', 'epic', 'savanna'], tiger: ['Тигр', 'epic', 'jungle'], elephant: ['Слон', 'rare', 'savanna'],
  giraffe: ['Жираф', 'rare', 'savanna'], boar: ['Кабанчик', 'common', 'forest'], deer: ['Олень', 'uncommon', 'forest'], elk: ['Лось', 'rare', 'forest'],
  bear_brown: ['Бурый медведь', 'rare', 'forest'], bear_polar: ['Белый медведь', 'epic', 'north'], gorilla_dark: ['Горилла-силач', 'rare', 'jungle'], gorilla: ['Горилла', 'uncommon', 'jungle'],
  chimp: ['Шимпанзе', 'uncommon', 'jungle'], monkey: ['Мартышка', 'common', 'jungle'], fox: ['Лиса', 'uncommon', 'forest'], rhino: ['Носорог', 'rare', 'savanna'],
  hippo: ['Бегемот', 'rare', 'savanna'], shark: ['Акула', 'epic', 'sea'], orca: ['Косатка', 'legendary', 'sea'], dolphin: ['Дельфин', 'rare', 'sea'],
  squirrel: ['Белочка', 'common', 'forest'], otter: ['Выдра', 'uncommon', 'swamp'], rabbit: ['Кролик', 'common', 'farm'], raccoon: ['Енот', 'uncommon', 'night'],
  badger: ['Барсук', 'common', 'forest'], fish_big_green: ['Большой карп', 'uncommon', 'river'], fish_big_pink: ['Розовая рыбина', 'rare', 'river'],
  fish_big_grey: ['Серый сом', 'uncommon', 'river'], fish_big_gold: ['Золотой карп', 'epic', 'river'], fish_big_orange: ['Оранжевый окунь', 'uncommon', 'river'],
  fish_green: ['Зелёная рыбка', 'common', 'river'], fish_pink: ['Розовая рыбка', 'common', 'river'], fish_grey: ['Серая рыбка', 'common', 'river'],
  fish_gold: ['Золотая рыбка', 'rare', 'river'], fish_orange: ['Рыбка-клоун', 'uncommon', 'sea'], snake_green: ['Ужик', 'common', 'swamp'],
  snake_sand: ['Песчаный удав', 'uncommon', 'savanna'], horse: ['Лошадка', 'common', 'farm'], unicorn: ['Единорог', 'legendary', 'fantasy'], pegasus: ['Пегас', 'epic', 'fantasy'],
  unicorn_dark: ['Тёмный единорог', 'legendary', 'fantasy'], cat_beast_dark: ['Чёрная пантера', 'epic', 'jungle'], cat_grey: ['Серый котик', 'rare', 'night'],
  parrot: ['Попугай', 'uncommon', 'jungle'], griffin: ['Грифон', 'epic', 'fantasy'], griffin_brown: ['Бурый грифон', 'epic', 'fantasy'], owl_grey: ['Серая сова', 'uncommon', 'birds'],
  dragon_white: ['Белый дракон', 'legendary', 'dragons'], dragon_blue: ['Синий дракон', 'epic', 'dragons'], dragon_grey: ['Серый дракон', 'epic', 'dragons'],
  dragon_red: ['Красный дракон', 'legendary', 'dragons'], dragon_green: ['Зелёный дракон', 'epic', 'dragons'], wolf_grey: ['Волк', 'rare', 'north'],
  bear_owl: ['Совомедведь', 'legendary', 'fantasy'], bear_standing: ['Медведь-обнимашка', 'rare', 'north'], lion_cub: ['Львёнок', 'rare', 'savanna'],
  bat: ['Летучая мышка', 'common', 'night'], rat_brown: ['Крысёнок', 'common', 'night'], rat_grey: ['Серый крысёнок', 'common', 'night'], crab: ['Крабик', 'uncommon', 'sea'],
  hamster: ['Хомяк', 'uncommon', 'farm'], dog: ['Пёс', 'rare', 'farm'], bug_bee: ['Пчёлка-подружка', 'common', 'garden'], bug_beetle: ['Жучок-толстячок', 'common', 'garden'],
  bug_dragonfly: ['Стрекозка', 'uncommon', 'garden'], bug_firefly: ['Светлячок-ночник', 'uncommon', 'garden'], bug_gnat: ['Мошка Миша', 'common', 'garden'],
  bug_moth: ['Мотылёк', 'common', 'garden'], cat_kitkus: ['Котёнок Киткус', 'legendary', 'night'],
};
const PASSIVES = {
  common: [{ type: 'coin_bonus', value: 0.03 }, { type: 'stat', stat: 'hp', value: 2 }, { type: 'sell_bonus', value: 0.05 }],
  uncommon: [{ type: 'coin_bonus', value: 0.05 }, { type: 'stat', stat: 'luck', value: 1 }, { type: 'stat', stat: 'hp', value: 4 }, { type: 'sell_bonus', value: 0.08 }],
  rare: [{ type: 'stat', stat: 'atk', value: 1 }, { type: 'stat', stat: 'def', value: 1 }, { type: 'coin_bonus', value: 0.08 }, { type: 'fee_discount', value: 0.15 }],
  epic: [{ type: 'stat', stat: 'atk', value: 2 }, { type: 'stat', stat: 'luck', value: 3 }, { type: 'start_consumable', value: 1 }, { type: 'coin_bonus', value: 0.12 }],
  legendary: [{ type: 'backpack_slot', value: 2 }, { type: 'stat', stat: 'crit', value: 0.06 }, { type: 'coin_bonus', value: 0.2 }, { type: 'block_luck', value: 3 }],
};
// what an animal does when it comes along on a run (strength by rarity, see balance.assist)
const ASSIST_BY_ALBUM = { birds: 'peck', farm: 'heal', forest: 'shield', north: 'shield', savanna: 'roar', jungle: 'roar', sea: 'splash', river: 'splash', night: 'sneak', fantasy: 'magic', dragons: 'magic', swamp: 'sticky', garden: 'buzz' };
// the gnat is a 3x2 speck inside its 8x8 cell: crop to it so it shows at a readable size
const ANIMAL_ART = { bug_gnat: { x: 3, y: 3, w: 3, h: 2 } };
const animals = [];
for (const a of animalsIndex) {
  const spec = ANIMALS[a.id];
  if (!spec) continue;
  const [name, rarity, album] = spec;
  const passive = pickH(PASSIVES[rarity], a.id);
  const assist = ASSIST_BY_ALBUM[album] || 'peck';
  animals.push({ id: a.id, name, sprite: 'assets/' + a.file, assist, w: a.w, h: a.h, ...(ANIMAL_ART[a.id] ? { art: ANIMAL_ART[a.id] } : {}), rarity, passive, album });
}

// ---------- album: 24 themed pages of animals, enemy stickers and items ----------
const A = (...ids) => ids.map((id) => ({ kind: 'animal', id }));
const E = (...ids) => ids.map((id) => ({ kind: 'enemy', id }));
const I = (...ids) => ids.map((id) => ({ kind: 'item', id }));
const perm = (type, value, extra = {}) => ({ type: 'perm_bonus', effect: { type, value, ...extra } });
const skin = (id) => ({ type: 'skin', id });
const ALBUM = [
  ['farm', 'Ферма', A('chicken', 'cow', 'goat', 'sheep', 'rabbit', 'horse', 'hamster', 'dog'), skin('skin_ginger')],
  ['forest', 'Лес', A('hedgehog', 'mole', 'boar', 'deer', 'elk', 'bear_brown', 'fox', 'squirrel', 'badger'), perm('stat', 3, { stat: 'hp' })],
  ['savanna', 'Саванна', A('camel', 'emu', 'zebra', 'lion', 'elephant', 'giraffe', 'rhino', 'hippo', 'snake_sand', 'lion_cub'), perm('stat', 1, { stat: 'atk', cat: 'peposya' })],
  ['jungle', 'Джунгли', A('tiger', 'gorilla_dark', 'gorilla', 'chimp', 'monkey', 'cat_beast_dark', 'parrot'), skin('skin_black')],
  ['birds', 'Птицы', A('owlet', 'owl_brown', 'eagle', 'eagle_bald', 'crow', 'owl_grey'), perm('stat', 1, { stat: 'luck' })],
  ['sea', 'Море', A('shark', 'orca', 'dolphin', 'fish_orange', 'crab', 'turtle'), perm('coin_bonus', 0.05)],
  ['river', 'Река', A('fish_big_green', 'fish_big_pink', 'fish_big_grey', 'fish_big_gold', 'fish_big_orange', 'fish_green', 'fish_pink', 'fish_grey', 'fish_gold'), skin('pep_mint')],
  ['swamp', 'Болото', [...A('lizard', 'frog', 'crocodile', 'otter', 'snake_green'), ...E('slime')], perm('stat', 1, { stat: 'def' })],
  ['night', 'Ночные жители', A('bat_brown', 'flying_beast', 'raccoon', 'bat', 'rat_brown', 'rat_grey', 'cat_grey', 'cat_kitkus'), skin('skin_grey_tabby')],
  ['north', 'Север', [...A('bear_polar', 'wolf_grey', 'bear_standing', 'owl_white'), ...I('a_shoes02', 'crystal_c')], perm('stat', 3, { stat: 'hp' })],
  ['fantasy', 'Сказка', A('unicorn', 'pegasus', 'unicorn_dark', 'griffin', 'griffin_brown', 'bear_owl'), skin('skin_white_fluffy')],
  ['dragons', 'Драконье логово', [...A('dragon_white', 'dragon_blue', 'dragon_grey', 'dragon_red', 'dragon_green'), ...I('i_diamond')], perm('backpack_slot', 1)],
  ['garden', 'Сад', A('bug_bee', 'bug_beetle', 'bug_dragonfly', 'bug_firefly', 'bug_gnat', 'bug_moth'), skin('dud_peach')],
  ['klobsters', 'Клобстеры', E('klobster', 'klobster_toxic', 'klobster_glitch', 'klobster_king', 'beetle', 'beetle_small'), perm('stat', 1, { stat: 'atk' })],
  ['insects', 'Насекомые', E('ant_giant', 'ant_red', 'ant_grey', 'wasp', 'fly', 'moth', 'firefly', 'gnat', 'dragonfly', 'bee_small'), perm('stat', 0.03, { stat: 'crit' })],
  ['cellar', 'Подвал', E('spider', 'scorpion', 'worm', 'rat', 'bat', 'ghost', 'mimic'), skin('skin_sphynx')],
  ['sweets', 'Сладости', I('candy_01a', 'candy_01c', 'candy_02b', 'candy_02f', 'cookie', 'food_donut', 'food_icecream', 'food_chocolate', 'food_waffle', 'food_jelly'), perm('sell_bonus', 0.05)],
  ['potions', 'Зелья', I('potion_1a', 'potion_1b', 'potion_1c', 'potion_1d', 'potion_1e', 'potion_1f', 'ninth_life', 'valerian', 'moon_water', 'fish_oil'), perm('start_consumable', 1)],
  ['shiny', 'Блестяшки', I('gem_a', 'gem_b', 'gem_c', 'gem_d', 'gem_e', 'gem_f', 'gem_g', 'gem_h', 'gem_i', 'gem_j'), perm('block_luck', 1)],
  ['armory', 'Арсенал', I('gold_axe', 'gold_bow', 'gold_dagger', 'gold_mace', 'gold_spear', 'gold_sword', 'sword_01e', 'slipper_justice'), perm('stat', 1, { stat: 'atk', cat: 'peposya' })],
  ['library', 'Библиотека', I('book_01a', 'book_01c', 'book_01e', 'book_02a', 'book_02c', 'book_03a', 'book_03c', 'book_04c'), skin('pep_lavender')],
  ['slop', 'Слоп', I('empty_box', 'confetti_cannon', 'marshmallow_knuckles', 'seagull_scream', 'offended_metal', 'knowing_rock', 'future_hotdog', 'cat_chest', 'meow_clock', 'lazy_boomerang', 'polite_tentacle', 'too_happy_pill'), skin('skin_siamese')],
  ['cozy', 'Уют', I('milk_saucer', 'cardboard_box', 'lullaby_lamp', 'food_pancakes', 'food_pudding', 'cup_01b', 'i_mirror'), skin('dud_night')],
  ['kitchen', 'Кухня', I('food_pizza', 'food_burger', 'food_ramen', 'food_steak', 'food_salmon', 'food_taco', 'food_hotdog', 'food_sandwich', 'pizza_suspicion'), perm('stat', 4, { stat: 'hp' })],
];
const album = ALBUM.map(([id, title, slots, reward]) => ({ id, title, slots, reward }));
const itemIds = new Set(items.map((i) => i.id));
const animalIds = new Set(animals.map((a) => a.id));
for (const p of album) for (const s of p.slots) {
  if (s.kind === 'item' && !itemIds.has(s.id)) throw new Error('album item ' + s.id);
  if (s.kind === 'animal' && !animalIds.has(s.id)) throw new Error('album animal ' + s.id);
}

// ---------- write ----------
const order = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, slop: 5 };
items.sort((a, b) => a.category.localeCompare(b.category) || order[a.rarity] - order[b.rarity] || a.id.localeCompare(b.id));
const line = (o) => '  ' + JSON.stringify(o);
fs.writeFileSync(path.join(ROOT, 'data/items.json'), '[\n' + items.map(line).join(',\n') + '\n]\n');
fs.writeFileSync(path.join(ROOT, 'data/animals.json'), '[\n' + animals.map(line).join(',\n') + '\n]\n');
fs.writeFileSync(path.join(ROOT, 'data/album.json'), '[\n' + album.map(line).join(',\n') + '\n]\n');
const tally = (arr, k) => arr.reduce((m, x) => ((m[x[k]] = (m[x[k]] || 0) + 1), m), {});
console.log('items', items.length, tally(items, 'rarity'), tally(items, 'category'));
console.log('consumables', items.filter((i) => i.tags.includes('consumable')).length, 'equipment', items.filter((i) => i.effect && i.effect.type === 'stat').length);
console.log('animals', animals.length, tally(animals, 'rarity'));
console.log('album pages', album.length, 'slots', album.reduce((s, p) => s + p.slots.length, 0));
