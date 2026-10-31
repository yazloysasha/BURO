// Widgets shared by run screens: party HP chips, item icons/names, backpack modal.
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { play } from '../core/audio.js';
import { CatSprite, iconCanvas } from '../core/sprite.js';
import { game, commit } from '../game/state.js';
import { CAT_KEYS } from '../game/combat.js';
import { useItemOutside, MAP_USABLE } from '../game/run.js';
import { backpackSize } from '../game/meta.js';
import { modal, button, toast } from './app.js';
import { displayName } from '../game/names.js';

export function hpBar(hp, max, cls = '') {
  const pct = Math.max(0, Math.min(100, Math.round((hp / max) * 100)));
  return h('div.hpbar' + (cls ? '.' + cls : ''), null, h('div.fill', { style: { width: pct + '%' } }), h('span', { text: `${Math.max(0, hp)}/${max}` }));
}

export function partyBar(run) {
  const wrap = h('div.party');
  for (const k of CAT_KEYS) {
    const p = run.party[k];
    const mini = new CatSprite(k === 'peposya' ? 'mini_peposya' : 'mini_dudonya', { anim: p.hp > 0 ? 'idle' : 'death', scale: 2 });
    wrap.append(h('div.party-chip', null, mini.el, hpBar(p.hp, p.maxHp)));
  }
  return wrap;
}

export function itemIcon(item, { mods = [], target = 40, seed = '' } = {}) {
  return iconCanvas(item.icon, { mods, target, w: item.w || 16, h: item.h || 16, seed: seed || item.id });
}

export function rarityName(r) {
  const rr = game.data.rarities && game.data.rarities.find((x) => x.id === r);
  return rr ? rr.name : r;
}

export function itemRow(item, { mods = [], extra = null, onClick = null, selected = false } = {}) {
  const row = h(
    'div.item-row.r-' + item.rarity + (selected ? '.selected' : '') + (onClick ? '.clickable' : ''),
    null,
    h('div.item-icon.r-' + item.rarity, null, itemIcon(item, { mods })),
    h('div.grow', null, h('div.item-name', { text: displayName(item, mods) }), h('div.dim.small', { text: item.flavor || '' }), extra),
  );
  if (onClick) row.addEventListener('click', onClick);
  return row;
}

export function effectText(eff) {
  if (!eff) return '';
  const st = eff.status && game.data.statusById[eff.status];
  return t('effects.' + eff.type, { v: eff.value, s: st ? st.name : '', n: eff.turns || 0, p: Math.round((eff.value || 0) * 100) });
}

export function openBackpack(onChange) {
  const run = game.save.run;
  const list = h('div.col');
  const draw = () => {
    list.replaceChildren();
    if (!run.backpack.length) list.append(h('p.dim', { text: t('map.backpackEmpty') }));
    for (const b of run.backpack) {
      const item = game.data.itemById[b.id];
      if (!item) continue;
      const usable = item.effect && MAP_USABLE.includes(item.effect.type);
      list.append(
        itemRow(item, {
          mods: b.mods,
          extra: h(
            'div',
            null,
            item.effect ? h('div.effect', { text: effectText(item.effect) }) : null,
            usable
              ? button(t('map.use'), () => {
                  const r = useItemOutside(game.save, game.data, b.uid);
                  if (r) {
                    commit();
                    play('potion');
                    toast(t('map.used', { item: item.name }));
                    draw();
                  }
                }, { cls: 'green small', sound: null })
              : null,
          ),
        }),
      );
    }
  };
  draw();
  modal(h('div', null, h('h2', { text: t('map.backpackTitle', { n: run.backpack.length, max: backpackSize(game.save, game.data) }) }), list), [
    { label: t('common.close'), value: true, cls: 'grey', sound: 'back' },
  ]).then(() => onChange && onChange());
}
