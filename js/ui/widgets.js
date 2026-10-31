// Small shared UI widgets.
import { h } from '../core/dom.js';
import { CatSprite } from '../core/sprite.js';
import { game } from '../game/state.js';

export function catSheetKey(who) {
  const skin = game.save.meta.skins[who];
  return skin && skin !== 'default' && game.data.sheetsLoaded && game.data.sheetsLoaded.includes(skin) ? skin : who;
}

export function createCatPair(animA = 'sit', animB = 'sit', scale = 3) {
  const a = new CatSprite(catSheetKey('peposya'), { anim: animA, scale });
  const b = new CatSprite(catSheetKey('dudonya'), { anim: animB, scale, flip: true });
  return h('div.row', { style: { justifyContent: 'center', gap: '0' } }, a.el, b.el);
}
