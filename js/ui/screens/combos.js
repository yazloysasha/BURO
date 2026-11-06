// Journal: combos (discovered ones with descriptions, the rest as "???" with a hint) and the anomaly collection.
import { h, setChildren } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { game } from '../../game/state.js';
import { anomaliesFound } from '../../game/backroom.js';
import { button, screenHeader, setTopbarTitle } from '../app.js';

let tab = 'combos';

function combosTab() {
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
  return list;
}

function anomaliesTab() {
  const col = game.save.collection.anomalies || {};
  const list = h('div.col');
  list.append(h('div.accent', { text: t('backroom.found', { n: anomaliesFound(game.save, game.data), total: game.data.anomalies.length }) }));
  for (const key of ['1', '2', '3', 'hub']) {
    const group = game.data.anomalies.filter((a) => String(a.where || a.level) === key);
    list.append(h('h2', { text: t('journal.level.' + key) }));
    for (const a of group) {
      const known = !!col[a.id];
      list.append(h('div.combo-row' + (known ? '.known' : ''), null, h('div', { text: known ? a.name : t('combos.unknown') }), known ? h('div.small', { text: a.desc }) : null));
    }
  }
  return list;
}

export function render(root) {
  setTopbarTitle('');
  const tabs = h('div.seg.tabs');
  const body = h('div.scroll');
  const draw = () => {
    setChildren(
      tabs,
      button(t('journal.combos'), () => ((tab = 'combos'), draw()), { cls: 'small ' + (tab === 'combos' ? 'on' : 'grey'), sound: 'toggle' }),
      button(t('journal.anomalies'), () => ((tab = 'anomalies'), draw()), { cls: 'small ' + (tab === 'anomalies' ? 'on' : 'grey'), sound: 'toggle' }),
    );
    setChildren(body, tab === 'combos' ? combosTab() : anomaliesTab());
  };
  draw();
  root.append(screenHeader(t('combos.title')), tabs, body);
}
