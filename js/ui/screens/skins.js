// Skins: dress Peposya and Dudonya in any unlocked cat look (album rewards or sparkles).
import { h, setChildren } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { play } from '../../core/audio.js';
import { CatSprite, iconCanvas } from '../../core/sprite.js';
import { game, commit } from '../../game/state.js';
import { skinOwned, buySkin, equipSkin } from '../../game/progress.js';
import { button, screenHeader, setTopbarTitle, confirm } from '../app.js';

let cat = 'peposya';

export function render(root) {
  setTopbarTitle('');
  const tabs = h('div.seg.tabs');
  const body = h('div.scroll');
  const draw = () => {
    const save = game.save;
    setChildren(tabs, ...['peposya', 'dudonya'].map((k) => button(game.data.cats[k].name, () => ((cat = k), draw()), { cls: 'small ' + (cat === k ? 'on' : 'grey'), sound: 'toggle' })));
    const grid = h('div.skin-grid');
    const all = [{ id: 'default', name: t('skins.default'), sheetKey: cat }, ...game.data.skins.map((s) => ({ ...s, sheetKey: s.id }))];
    for (const s of all) {
      const owned = skinOwned(save, s.id);
      const worn = (save.meta.skins[cat] || 'default') === s.id;
      const sp = new CatSprite(s.sheetKey, { anim: worn ? 'idle' : 'sit', scale: 2, flip: cat === 'dudonya' });
      if (!owned) sp.el.style.filter = 'brightness(0.25)';
      const page = game.data.album.find((p) => p.reward.type === 'skin' && p.reward.id === s.id);
      const action = worn
        ? h('div.accent.small', { text: t('skins.worn') })
        : owned
          ? button(t('skins.wear'), () => {
              equipSkin(save, cat, s.id);
              commit();
              play('equip');
              draw();
            }, { cls: 'green small', sound: null })
          : button(t('skins.buy', { n: s.price }), async () => {
              if (!(await confirm(t('skins.buyConfirm', { name: s.name, n: s.price })))) return;
              if (!buySkin(save, game.data, s.id)) return;
              equipSkin(save, cat, s.id);
              commit();
              play('level_up');
              draw();
            }, { cls: save.meta.sparkles >= s.price ? 'blue small' : 'grey small', disabled: save.meta.sparkles < s.price, icon: iconCanvas(game.data.assets.icons.sparkle, { target: 18 }), sound: null });
      grid.append(h('div.skin-card' + (worn ? '.worn' : ''), null, sp.el, h('div.small', { text: s.name }), !owned && page ? h('div.small.dim', { text: t('skins.fromAlbum', { page: page.title }) }) : null, action));
    }
    setChildren(body, grid);
  };
  draw();
  root.append(screenHeader(t('skins.title')), tabs, body);
}
