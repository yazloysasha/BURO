// Inventory: the Lavka's shelves (items with modifiers, selling, showcase) and the animal stickers (guests).
import { h, setChildren } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { play } from '../../core/audio.js';
import { iconCanvas } from '../../core/sprite.js';
import { game, commit } from '../../game/state.js';
import { parseKey, sellPrice, sellItem, toggleShowcase, toggleGuest, collectionStats, SHOWCASE_MAX } from '../../game/collection.js';
import { guestSlots } from '../../game/meta.js';
import { rank } from '../../game/loot.js';
import { displayName } from '../../game/names.js';
import { button, modal, closeModal, screenHeader, setTopbarTitle, confirm, toast } from '../app.js';
import { effectText, passiveText } from '../runwidgets.js';

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
  wrap.append(h('div.dim', { text: t('inv.codex', { n: st.itemsSeen, total: st.itemsTotal }) }));
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
      { type: 'button' },
      iconCanvas(item.icon, { w: item.w, h: item.h, target: 44, mods: e.mods, seed: e.key }),
      e.n > 1 ? h('span.count', { text: '×' + e.n }) : null,
    );
    cell.addEventListener('click', () => {
      play('select');
      itemDetails(e.key, redraw);
    });
    grid.append(cell);
  }
  const commons = entries.filter((e) => game.data.itemById[e.id].rarity === 'common' && !e.mods.length && !(save.meta.showcase || []).includes(e.key));
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

function itemDetails(key, redraw) {
  const save = game.save;
  const { id, mods } = parseKey(key);
  const item = game.data.itemById[id];
  const n = save.collection.items[key] || 0;
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
    h('div', { text: t('inv.price', { n: price }) }),
  );
  modal(content, [{ label: t('common.close'), value: 0, cls: 'grey', sound: 'back' }]);
  const acts = document.querySelector('#overlay .actions');
  acts.prepend(
    button(t('inv.sell', { n: price }), () => {
      const c = sellItem(save, game.data, key, 1);
      commit();
      play('coin_small');
      toast(t('inv.sold', { n: c }));
      closeModal();
      redraw();
    }, { cls: 'green', sound: null }),
    n > 1
      ? button(t('inv.sellAll', { n: price * n }), () => {
          const c = sellItem(save, game.data, key, n);
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
  );
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
    const cell = h('button.inv-cell.r-' + a.rarity + (guest ? '.showcased' : ''), { type: 'button' }, iconCanvas(a.sprite, { w: 16, h: 16, target: 44 }), save.collection.animals[a.id] > 1 ? h('span.count', { text: '×' + save.collection.animals[a.id] }) : null);
    cell.addEventListener('click', () => {
      play('select');
      const rar = game.data.rarityById[a.rarity];
      modal(
        h('div.col', null, h('div.row', null, h('div.item-icon.big.r-' + a.rarity, null, iconCanvas(a.sprite, { w: 16, h: 16, target: 80 })), h('div', null, h('h2', { text: a.name }), h('div', { text: rar.name, style: { color: rar.color } }))), h('p', { text: t('inv.passive') + ' ' + passiveText(a.passive) }), h('p.dim', { text: t('inv.guestHint') })),
        [{ label: t('common.close'), value: 0, cls: 'grey', sound: 'back' }],
      );
      document.querySelector('#overlay .actions').prepend(
        button(guest ? t('inv.unguest') : t('inv.guest'), () => {
          toggleGuest(save, game.data, a.id, slots);
          commit();
          play(guest ? 'door_close' : 'door_open');
          closeModal();
          redraw();
        }, { cls: 'green', sound: null }),
      );
    });
    grid.append(cell);
  }
  wrap.append(grid);
  return wrap;
}
