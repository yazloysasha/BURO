// Upgrade shop in the Lavka: permanent upgrades for coins and the Lavka tier ladder.
import { h, setChildren } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { play } from '../../core/audio.js';
import { iconCanvas } from '../../core/sprite.js';
import { game, commit } from '../../game/state.js';
import { upgradeStatus, buyUpgrade, tierUpStatus, tierUp } from '../../game/progress.js';
import { tierInfo } from '../../game/meta.js';
import { button, screenHeader, setTopbarTitle, toast, confirm } from '../app.js';
import { burstAt } from '../particles.js';

function sizeOf(src) {
  if (src.includes('/rpg496_')) return 34;
  if (src.includes('/food_')) return 32;
  return 16;
}

export function render(root) {
  setTopbarTitle('');
  const body = h('div.scroll');
  const draw = () => {
    const save = game.save;
    const box = h('div.col');
    const cur = tierInfo(save, game.data);
    const next = tierUpStatus(save, game.data);
    const tierBox = h('div.panel.tier-box', null, h('h2', { text: t('shop2.tier', { n: save.meta.tier, name: cur.name }) }), h('div.small', { text: cur.desc }));
    if (next) {
      tierBox.append(
        h('div', { text: t('shop2.nextTier', { n: next.tier.tier, name: next.tier.name }) }),
        h('div.small', { text: next.tier.desc }),
        h('div.small' + (next.coinsOk ? '.good' : '.bad'), { text: t('shop2.needCoins', { n: next.tier.cost }) }),
        h('div.small' + (next.winsOk ? '.good' : '.bad'), { text: t('shop2.needWins', { n: next.tier.wins, have: save.stats.wins }) }),
        button(t('shop2.tierUp'), async (e) => {
          const el = e.currentTarget;
          if (save.run) return toast(t('shop2.finishRun'));
          if (!(await confirm(t('shop2.tierConfirm', { n: next.tier.tier, cost: next.tier.cost })))) return;
          if (!tierUp(save, game.data)) return;
          commit();
          play('jingle_legendary');
          burstAt(el, { n: 40, colors: ['#ffcf4a', '#fff4c0', '#ff5edc'] });
          toast(t('shop2.tierDone', { name: next.tier.name }), 3500);
          draw();
        }, { cls: next.coinsOk && next.winsOk ? 'green block' : 'grey block', disabled: !(next.coinsOk && next.winsOk) || !!save.run, sound: null }),
      );
    } else tierBox.append(h('div.accent', { text: t('shop2.maxTier') }));
    box.append(tierBox, h('h2', { text: t('shop2.upgrades') }));
    for (const up of game.data.upgrades) {
      const st = upgradeStatus(save, up);
      const btn = st.maxed
        ? h('div.accent', { text: t('talents.maxed') })
        : button(t('shop2.buy', { n: st.cost }), (e) => {
            if (!buyUpgrade(save, game.data, up.id)) return;
            commit();
            play('coin');
            burstAt(e.currentTarget, { n: 12, colors: ['#ffcf4a'] });
            draw();
          }, { cls: st.affordable ? 'green small' : 'grey small', disabled: !st.affordable, sound: null });
      box.append(
        h(
          'div.item-row',
          null,
          h('div.item-icon', null, iconCanvas(up.icon, { w: sizeOf(up.icon), h: sizeOf(up.icon), target: 40 })),
          h('div.grow', null, h('div', { text: up.name }), h('div.small.dim', { text: up.desc }), h('div.dots', null, ...Array.from({ length: up.max }, (_, i) => h('span.dot' + (i < st.lvl ? '.on' : ''))))),
          btn,
        ),
      );
    }
    setChildren(body, box);
  };
  draw();
  root.append(screenHeader(t('shop2.title')), body);
}
