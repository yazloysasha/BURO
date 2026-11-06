// Combo journal: discovered combos with descriptions, the rest as "???" with a hint.
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { game } from '../../game/state.js';
import { screenHeader, setTopbarTitle } from '../app.js';

export function render(root) {
  setTopbarTitle('');
  const found = new Set(game.save.combos.discovered);
  const list = h('div.col');
  list.append(h('div.accent', { text: t('combos.count', { n: found.size, total: game.data.combos.length }) }));
  // the next easy one to try: combat combos are always within reach
  const next = game.data.combos.find((c) => !found.has(c.id) && (c.trigger.type === 'action_sequence' || c.trigger.type === 'party_round'));
  if (next) list.append(h('div.goal-line', { text: t('combos.tryNext', { hint: next.hint }) }));
  const groups = {};
  for (const c of game.data.combos) (groups[c.trigger.type] = groups[c.trigger.type] || []).push(c);
  for (const [type, combos] of Object.entries(groups)) {
    list.append(h('h2', { text: t('combos.group.' + type) }));
    for (const c of combos) {
      const known = found.has(c.id);
      list.append(
        h(
          'div.combo-row' + (known ? '.known' : ''),
          null,
          h('div', { text: known ? c.name : t('combos.unknown') }),
          h('div.small' + (known ? '' : '.dim'), { text: known ? c.desc : t('combos.hint', { hint: c.hint }) }),
        ),
      );
    }
  }
  root.append(screenHeader(t('combos.title')), h('div.scroll', null, list));
}
