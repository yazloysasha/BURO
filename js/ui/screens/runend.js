// Run end: victory or soft defeat (keep 50% coins, all stickers, one backpack item of choice).
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { play } from '../../core/audio.js';
import { game, commit } from '../../game/state.js';
import { finishRun } from '../../game/run.js';
import { button, go, setTopbarTitle } from '../app.js';
import { itemRow } from '../runwidgets.js';
import { createCatPair } from '../widgets.js';

export function render(root) {
  const run = game.save.run;
  if (!run || !run.result) return go('hub');
  const win = run.result.outcome === 'win';
  setTopbarTitle('');
  const box = h('div.col');
  box.append(h('h1.center', { text: win ? t('runEnd.winTitle') : t('runEnd.loseTitle') }), createCatPair(win ? 'victory' : 'sleep1', win ? 'victory' : 'sleep2', 4));
  box.append(h('p.center', { text: win ? t('runEnd.winText') : t('runEnd.loseText') }));
  const coins = win ? run.coins : Math.floor(run.coins * game.data.balance.defeatCoinKeep);
  box.append(h('p.center.coins-line', { text: t('runEnd.coins', { n: coins }) }));
  box.append(h('div.dim.center', { text: t('runEnd.stats', { rooms: run.stats.rooms, kills: run.stats.kills }) }));

  let keepUid = null;
  const list = h('div.col');
  const drawList = () => {
    list.replaceChildren();
    if (!run.backpack.length) return;
    list.append(h('h2', { text: win ? t('runEnd.allItems') : t('runEnd.pickOne') }));
    for (const b of run.backpack) {
      const item = game.data.itemById[b.id];
      if (!item) continue;
      list.append(
        itemRow(item, {
          mods: b.mods,
          selected: win || keepUid === b.uid,
          onClick: win
            ? null
            : () => {
                keepUid = keepUid === b.uid ? null : b.uid;
                play('select');
                drawList();
              },
        }),
      );
    }
  };
  drawList();
  box.append(list);
  box.append(
    button(t('runEnd.toShop'), () => {
      if (!win && run.backpack.length && !keepUid) {
        play('error');
        list.classList.add('shake');
        setTimeout(() => list.classList.remove('shake'), 320);
        return;
      }
      finishRun(game.save, game.data, { keepUid });
      commit();
      play('coin');
      go('hub');
    }, { cls: 'green big block', sound: null }),
  );
  root.append(h('div.scroll', null, box));
  play(win ? 'level_up' : 'fail_small');
}
