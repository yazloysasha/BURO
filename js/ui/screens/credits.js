// Credits: every author from CREDITS.md, with the mandatory Kyrise CC BY 4.0 line.
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { game } from '../../game/state.js';
import { screenHeader, setTopbarTitle } from '../app.js';
import { createCatPair } from '../widgets.js';

export function render(root) {
  setTopbarTitle('');
  const c = game.data.credits;
  const list = h('div');
  list.append(
    h('p', { text: t('credits.intro') }),
    h('div.required', null, h('div.dim', { text: t('credits.required') }), h('div', { text: c.required }), h('div.dim', { text: c.requiredUrl })),
  );
  for (const p of c.packs) {
    list.append(
      h(
        'div.credit',
        null,
        h('div.name', { text: p.name }),
        h('div', { text: p.author }),
        h('div.meta', { text: t('credits.license', { l: p.license }) + ' · ' + t('credits.use.' + p.use) }),
        h('div.meta', { text: p.url }),
      ),
    );
  }
  list.append(h('p.dim', { text: t('credits.changes') }), createCatPair(), h('p.center', { text: t('credits.made') }));
  root.append(screenHeader(t('credits.title')), h('div.scroll', null, list));
}
