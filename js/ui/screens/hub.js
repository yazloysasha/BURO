// Lavka: the hub screen.
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { button, go, pickLine, setTopbarTitle } from '../app.js';
import { createHubScene } from '../hubscene.js';

export function render(root) {
  setTopbarTitle(t('hub.title'));
  const wrap = h('div.col', { style: { flex: '1', minHeight: '0' } });
  root.append(wrap);
  const availW = root.clientWidth || window.innerWidth - 16;
  const availH = Math.max(160, (root.clientHeight || window.innerHeight) * 0.42);
  const scene = createHubScene(availW, availH);
  const note = h('div.hub-note', { text: pickLine('hub.greeting') });
  scene.onTapCat((who) => {
    note.textContent = t('cats.' + who) + ': ' + pickLine('hub.tapCat');
  });

  const menu = h('div.menu-grid');
  menu.append(button(t('hub.settings'), () => go('settings'), { cls: 'blue' }), button(t('hub.credits'), () => go('credits'), { cls: 'blue' }));

  wrap.append(scene.stage.el, note, h('div.scroll', null, menu));
  return () => scene.destroy();
}
