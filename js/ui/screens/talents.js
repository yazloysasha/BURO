// Talents: three branches (Peposya — combat, Dudonya — luck & care, Lavka — economy), paid with sparkles.
import { h, setChildren } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { play } from '../../core/audio.js';
import { iconCanvas } from '../../core/sprite.js';
import { game, commit } from '../../game/state.js';
import { talentStatus, learnTalent, talentNode } from '../../game/progress.js';
import { button, screenHeader, setTopbarTitle, toast } from '../app.js';
import { burstAt } from '../particles.js';

let branch = 0;

export function render(root) {
  setTopbarTitle('');
  const tabs = h('div.seg.tabs');
  const body = h('div.scroll');
  const draw = () => {
    setChildren(tabs, ...game.data.talents.map((b, i) => button(t('talents.tab.' + b.id), () => ((branch = i), draw()), { cls: 'small ' + (branch === i ? 'on' : 'grey'), sound: 'toggle' })));
    const b = game.data.talents[branch];
    const list = h('div.col');
    list.append(h('h2', { text: b.name }), h('div.dim', { text: t('talents.hint') }));
    for (const n of b.nodes) {
      const st = talentStatus(game.save, game.data, n.id);
      const dots = h('div.dots', null, ...Array.from({ length: n.max }, (_, i) => h('span.dot' + (i < st.lvl ? '.on' : ''))));
      const req = st.locked ? h('div.small.dim', { text: t('talents.requires', { name: talentNode(game.data, n.requires).name }) }) : null;
      const btn = st.maxed
        ? h('div.accent', { text: t('talents.maxed') })
        : button(t('talents.learn', { n: st.cost }), (e) => {
            if (!learnTalent(game.save, game.data, n.id)) return;
            commit();
            play('level_up');
            burstAt(e.currentTarget, { n: 14, colors: ['#ff5edc', '#ffcf4a'] });
            toast(t('talents.learned', { name: n.name }));
            draw();
          }, { cls: st.affordable ? 'green small' : 'grey small', disabled: !st.affordable, icon: iconCanvas(game.data.assets.icons.sparkle, { target: 20 }), sound: null });
      list.append(h('div.talent' + (st.locked ? '.locked' : ''), null, h('div.grow', null, h('div', { text: n.name }), h('div.small.dim', { text: n.desc }), dots, req), btn));
    }
    setChildren(body, list);
  };
  draw();
  root.append(screenHeader(t('talents.title')), tabs, body);
}
