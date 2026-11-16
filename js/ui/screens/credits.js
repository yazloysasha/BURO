// Credits: every author from CREDITS.md, with the mandatory Kyrise CC BY 4.0 line.
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { game } from '../../game/state.js';
import { loadJSON } from '../../core/assets.js';
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
  // real cat voices: one line per Freesound recording (filled in once the index arrives)
  const voices = h('div');
  list.append(voices);
  if (game.data.assets.catIndex) {
    loadJSON('./' + game.data.assets.catIndex)
      .then((idx) => {
        if (!idx.credits || !idx.credits.length) return;
        voices.append(
          h('div.credit', null, h('div.name', { text: t('credits.catVoices') }), h('div.meta', { text: 'freesound.org' })),
          ...idx.credits.map(([name, author, lic, url]) => h('div.meta', { text: `"${name}" by ${author}, ${lic} · ${url}` })),
        );
      })
      .catch(() => {});
  }
  list.append(h('p.dim', { text: t('credits.changes') }), createCatPair(), h('p.center', { text: t('credits.made') }));
  root.append(screenHeader(t('credits.title')), h('div.scroll', null, list));
}
