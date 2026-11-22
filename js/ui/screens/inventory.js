// Inventory: the Lavka's shelves (items with modifiers, selling, showcase) and the animal stickers (guests).
import { h, setChildren } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { play } from '../../core/audio.js';
import { iconCanvas, animalCanvas } from '../../core/sprite.js';
import { game, commit } from '../../game/state.js';
import { parseKey, sellPrice, sellItem, toggleShowcase, toggleGuest, collectionStats, SHOWCASE_MAX, availableCopies, equipItem } from '../../game/collection.js';
import { CAT_KEYS } from '../../game/combat.js';
import { guestSlots } from '../../game/meta.js';
import { rank } from '../../game/loot.js';
import { guestCombos } from '../../game/combos.js';
import { displayName } from '../../game/names.js';
import { button, modal, closeModal, screenHeader, setTopbarTitle, confirm, toast } from '../app.js';
import { effectText, passiveText, assistText } from '../runwidgets.js';
import { companionUnit } from '../../game/run.js';

let tab = 'items';

export function render(root, params = {}) {
  if (params.tab) tab = params.tab;
  setTopbarTitle('');
  const tabs = h('div.seg.tabs');
  const body = h('div.scroll');
  const draw = () => {
    setChildren(
      tabs,
      button(t('inv.items'), () => ((tab = 'items'), draw()), { cls: 'small ' + (tab === 'items' ? 'on' : 'grey'), sound: 'toggle' }),
      button(t('inv.animals'), () => ((tab = 'animals'), draw()), { cls: 'small ' + (tab === 'animals' ? 'on' : 'grey'), sound: 'toggle' }),
    );
    setChildren(body, tab === 'items' ? itemsTab(draw) : animalsTab(draw));
  };
  draw();
  root.append(screenHeader(t('inv.title')), tabs, body);
}

function itemsTab(redraw) {
  const save = game.save;
  const st = collectionStats(save, game.data);
  const entries = Object.entries(save.collection.items)
    .map(([key, n]) => ({ key, n, ...parseKey(key) }))
    .filter((e) => game.data.itemById[e.id])
    .sort((a, b) => {
      const ia = game.data.itemById[a.id], ib = game.data.itemById[b.id];
      return rank(ib.rarity) - rank(ia.rarity) || ia.name.localeCompare(ib.name, 'ru') || a.key.localeCompare(b.key);
    });
  const wrap = h('div.col');
  wrap.append(equipmentSlots(entries, redraw), h('div.dim', { text: t('inv.codex', { n: st.itemsSeen, total: st.itemsTotal }) }));
  if (!entries.length) {
    wrap.append(h('p.center', { text: t('inv.empty') }));
    return wrap;
  }
  const grid = h('div.inv-grid');
  for (const e of entries) {
    const item = game.data.itemById[e.id];
    const showcased = (save.meta.showcase || []).includes(e.key);
    const cell = h(
      'button.inv-cell.r-' + item.rarity + (showcased ? '.showcased' : ''),
      { type: 'button', 'aria-label': displayName(item, e.mods) },
      iconCanvas(item.icon, { w: item.w, h: item.h, target: 44, mods: e.mods, seed: e.key }),
      e.n > 1 ? h('span.count', { text: '×' + e.n }) : null,
    );
    cell.addEventListener('click', () => {
      play('select');
      itemDetails(e.key, redraw);
    });
    grid.append(cell);
  }
  const commons = entries
    .filter((e) => game.data.itemById[e.id].rarity === 'common' && !e.mods.length && !(save.meta.showcase || []).includes(e.key))
    .map((e) => ({ ...e, n: availableCopies(save, e.key) }))
    .filter((e) => e.n > 0);
  wrap.append(grid);
  if (commons.length) {
    const total = commons.reduce((s, e) => s + sellPrice(save, game.data, e.key) * e.n, 0);
    wrap.append(
      button(t('inv.sellCommons', { n: total }), async () => {
        if (!(await confirm(t('inv.sellCommonsConfirm', { n: total })))) return;
        let coins = 0;
        for (const e of commons) coins += sellItem(save, game.data, e.key, e.n);
        commit();
        play('coin');
        toast(t('inv.sold', { n: coins }));
        redraw();
      }, { cls: 'blue block' }),
    );
  }
  return wrap;
}

function equipmentSlots(entries, redraw) {
  const { save, data } = game;
  const slots = CAT_KEYS.map((cat) => {
    const key = save.meta.equipment[cat];
    const entry = entries.find((e) => e.key === key);
    const item = entry && data.itemById[entry.id];
    const name = t('cats.' + cat);
    const label = item ? displayName(item, entry.mods) : t('inv.emptySlot');

    function pickGear() {
      const options = entries.filter((e) => data.itemById[e.id].effect?.type === 'stat' && e.key !== key && availableCopies(save, e.key));
      const change = (next) => {
        if (!equipItem(save, data, cat, next)) return;
        commit();
        play(next ? 'equip' : 'shelf_place');
        closeModal();
        redraw();
      };
      modal(h('div.col', null,
        h('h2', { text: t('inv.chooseGear', { cat: name }) }),
        item ? button(t('inv.unequip', { name: label }), () => change(null), { cls: 'grey block', sound: null }) : null,
        options.length ? options.map((e) => {
          const gear = data.itemById[e.id];
          return button(displayName(gear, e.mods), () => change(e.key), {
            cls: 'blue block small',
            sound: null,
            icon: iconCanvas(gear.icon, { w: gear.w, h: gear.h, target: 32, mods: e.mods, seed: e.key }),
            sub: effectText(gear.effect),
          });
        }) : h('p.dim', { text: t('inv.noGear') }),
      ), [{ label: t('common.close'), value: 0, cls: 'grey', sound: 'back' }]);
    }

    return button(name, pickGear, {
      cls: (item ? 'green' : 'blue') + ' small',
      sub: label,
      icon: item ? iconCanvas(item.icon, { w: item.w, h: item.h, target: 30, mods: entry.mods, seed: key }) : null,
    });
  });
  return h('section.col.equipment', null,
    h('h2', { text: t('inv.equipment') }),
    h('p.dim', { text: t('inv.equipmentHint') }),
    h('div.equipment-slots', null, slots),
  );
}

function itemDetails(key, redraw) {
  const save = game.save;
  const { id, mods } = parseKey(key);
  const item = game.data.itemById[id];
  const n = save.collection.items[key] || 0;
  const available = availableCopies(save, key);
  const wearers = CAT_KEYS.filter((cat) => save.meta.equipment[cat] === key);
  const rar = game.data.rarityById[item.rarity];
  const price = sellPrice(save, game.data, key);
  const showcased = (save.meta.showcase || []).includes(key);
  const content = h(
    'div.col',
    null,
    h('div.row', null, h('div.item-icon.big.r-' + item.rarity, null, iconCanvas(item.icon, { w: item.w, h: item.h, target: 80, mods, seed: key })), h('div', null, h('h2', { text: displayName(item, mods) }), h('div', { text: rar.name, style: { color: rar.color } }), h('div.dim', { text: t('categories.' + item.category) + ' · ×' + n }))),
    item.effect ? h('div.effect', { text: effectText(item.effect) }) : null,
    ...mods.map((m) => {
      const d = game.data.modifiers.find((x) => x.id === m);
      return h('div.small', null, h('span.accent', { text: d.name + ': ' }), d.desc);
    }),
    h('p', { text: item.flavor }),
    wearers.length ? h('p.accent', { text: t('inv.equippedBy', { cats: wearers.map((cat) => t('cats.' + cat)).join(', ') }) }) : null,
    h('div', { text: t('inv.price', { n: price }) }),
  );
  modal(content, [{ label: t('common.close'), value: 0, cls: 'grey', sound: 'back' }]);
  const acts = document.querySelector('#overlay .actions');
  const extra = [
    available ? button(t('inv.sell', { n: price }), () => {
      const c = sellItem(save, game.data, key, 1);
      commit();
      play('coin_small');
      toast(t('inv.sold', { n: c }));
      closeModal();
      redraw();
    }, { cls: 'green', sound: null }) : null,
    available > 1
      ? button(t('inv.sellAll', { n: price * available }), () => {
          const c = sellItem(save, game.data, key, available);
          commit();
          play('coin');
          toast(t('inv.sold', { n: c }));
          closeModal();
          redraw();
        }, { cls: 'green', sound: null })
      : null,
    item.w !== 16 || item.h !== 16 ? null : button(showcased ? t('inv.unshowcase') : t('inv.showcase'), () => {
      const on = toggleShowcase(save, key);
      if (!showcased && !on) toast(t('inv.showcaseFull', { n: SHOWCASE_MAX }));
      commit();
      play('shelf_place');
      closeModal();
      redraw();
    }, { cls: 'blue', sound: null }),
  ];
  acts.prepend(...extra.filter(Boolean));
}

function animalsTab(redraw) {
  const save = game.save;
  const st = collectionStats(save, game.data);
  const slots = guestSlots(save, game.data);
  const wrap = h('div.col');
  wrap.append(h('div.dim', { text: t('inv.animalsCount', { n: st.animalsOwned, total: st.animalsTotal }) }), h('div', { text: t('inv.guests', { n: save.meta.guests.length, max: slots }) }));
  const owned = game.data.animals.filter((a) => save.collection.animals[a.id]).sort((a, b) => rank(b.rarity) - rank(a.rarity) || a.name.localeCompare(b.name, 'ru'));
  if (!owned.length) {
    wrap.append(h('p.center', { text: t('inv.noAnimals') }));
    return wrap;
  }
  const grid = h('div.inv-grid');
  for (const a of owned) {
    const guest = save.meta.guests.includes(a.id);
    const cell = h('button.inv-cell.r-' + a.rarity + (guest ? '.showcased' : '') + (save.meta.companion === a.id ? '.companion' : ''), { type: 'button', 'aria-label': a.name }, animalCanvas(a, 44), save.collection.animals[a.id] > 1 ? h('span.count', { text: '×' + save.collection.animals[a.id] }) : null);
    cell.addEventListener('click', () => {
      play('select');
      const rar = game.data.rarityById[a.rarity];
      modal(
        h('div.col', null, h('div.row', null, h('div.item-icon.big.r-' + a.rarity, null, animalCanvas(a, 80)), h('div', null, h('h2', { text: a.name }), h('div', { text: rar.name, style: { color: rar.color } }))), h('p', { text: t('inv.passive') + ' ' + passiveText(a.passive) }), h('p', { text: t('inv.inRuns') + ' ' + assistText(companionUnit(game.data, { companion: a.id, backpack: [] }).assist) }), ...guestCombos(game.data, a.id).map((c) => h('div.goal-line', { text: t('combos.hint', { hint: c.hint }) })), h('p.dim', { text: t('inv.guestHint') })),
        [{ label: t('common.close'), value: 0, cls: 'grey', sound: 'back' }],
      );
      const along = save.meta.companion === a.id;
      document.querySelector('#overlay .actions').prepend(
        button(guest ? t('inv.unguest') : t('inv.guest'), () => {
          toggleGuest(save, game.data, a.id, slots);
          commit();
          play(guest ? 'door_close' : 'door_open');
          closeModal();
          redraw();
        }, { cls: 'green', sound: null }),
        button(along ? t('inv.stayHome') : t('inv.takeAlong'), () => {
          save.meta.companion = along ? null : a.id;
          commit();
          play(along ? 'door_close' : 'confirm');
          closeModal();
          redraw();
        }, { cls: 'blue companion-btn', sound: null }),
      );
    });
    grid.append(cell);
  }
  wrap.append(grid);
  return wrap;
}
