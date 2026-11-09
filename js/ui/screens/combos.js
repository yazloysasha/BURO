// Journal: combos (discovered ones with descriptions, the rest as "???" with a hint) and the anomaly collection.
import { h, setChildren } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { game } from '../../game/state.js';
import { anomaliesFound } from '../../game/backroom.js';
import { openMilestones, comboQuests, MILESTONE_STEP } from '../../game/combos.js';
import { claimComboMilestone } from '../../game/blocks.js';
import { play } from '../../core/audio.js';
import { commit } from '../../game/state.js';
import { blockCard } from '../luckyblock.js';
import { button, screenHeader, setTopbarTitle } from '../app.js';

let tab = 'combos';

function combosTab() {
  const found = new Set(game.save.combos.discovered);
  const list = h('div.col');
  list.append(h('div.accent', { text: t('combos.count', { n: found.size, total: game.data.combos.length }) }));
  // the next easy one to try: combat combos are always within reach
  const next = game.data.combos.find((c) => !found.has(c.id) && (c.trigger.type === 'action_sequence' || c.trigger.type === 'party_round'));
  if (next) list.append(h('div.goal-line', { text: t('combos.tryNext', { hint: next.hint }) }));
  for (const m of openMilestones(game.save)) {
    const holder = h('div.lucky-row');
    list.append(h('div.combo-row.known.milestone', null, h('div', { text: t('combos.milestone', { n: m }) }), holder));
    holder.append(button(t('combos.claim'), () => {
      const r = claimComboMilestone(game.save, game.data, m);
      commit();
      if (!r) return;
      play('daily_gift');
      const b = { ...r.block, opened: false };
      setChildren(holder, blockCard(b, { closedIcon: game.data.assets.blocks.bonus, opener: async () => ({ block: b }) }), h('div.accent', { text: t('night.sparkles', { n: r.sparkles }) }));
    }, { cls: 'green', sound: null }));
  }
  const quests = comboQuests(game.save, game.data);
  if (quests.length) {
    list.append(h('h2', { text: t('combos.quests') }));
    for (const q of quests) list.append(h('div.combo-row.quest', null, h('div', { text: t('combos.quest.' + q.trigger.type) }), h('div.small', { text: q.hint })));
  }
  const nextM = Math.ceil((found.size + 1) / MILESTONE_STEP) * MILESTONE_STEP;
  if (nextM <= game.data.combos.length) list.append(h('div.dim.small', { text: t('combos.nextMilestone', { n: nextM - found.size, m: nextM }) }));
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
