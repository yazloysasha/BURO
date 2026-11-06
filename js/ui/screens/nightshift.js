// Night shift: five loops of the backroom from the Lavka. Full reward once a day; the anomalies always count.
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { play } from '../../core/audio.js';
import { game, commit } from '../../game/state.js';
import { localDate } from '../../game/daily.js';
import { currentShift, startNightShift, nightShiftCall } from '../../game/nightshift.js';
import { anomaliesFound } from '../../game/backroom.js';
import { button, go, screenHeader, setTopbarTitle } from '../app.js';
import { renderBackroomLoop } from '../backroom.js';
import { blockCard } from '../luckyblock.js';
import { burstAt } from '../particles.js';

export function render(root) {
  setTopbarTitle('');
  const today = localDate();
  const shift = currentShift(game.save);
  root.append(screenHeader(t('night.title')));
  if (!shift || (shift.state.done && !shift.result)) {
    const box = h('div.col.room-center');
    box.append(
      h('p.center', { text: t('night.text') }),
      h('div.dim.center', { text: game.save.meta.nightPaidDate === today ? t('night.paidToday') : t('night.reward') }),
      h('div.dim.center', { text: t('backroom.found', { n: anomaliesFound(game.save, game.data), total: game.data.anomalies.length }) }),
      button(t('night.start'), () => {
        startNightShift(game.save, game.data, today);
        commit();
        play('door_open');
        go('nightshift');
      }, { cls: 'green big block', sound: null }),
    );
    root.append(h('div.scroll', null, box));
    return;
  }
  if (shift.state.done) return renderResult(root, shift, today);
  const body = h('div.col.grow-fill');
  root.append(body);
  renderBackroomLoop(body, {
    getState: () => game.save.meta.nightShift.state,
    onCall: (choice) => {
      const r = nightShiftCall(game.save, game.data, choice, today);
      commit();
      return r;
    },
    onDone: () => go('nightshift'),
  });
}

function renderResult(root, shift, today) {
  const res = shift.result;
  const box = h('div.col.room-center');
  box.append(h('h1.center', { text: t('backroom.done') }), h('p.center', { text: t('backroom.grade.' + res.grade) }));
  if (res.coins) {
    const line = h('p.center.coins-line', { text: t('reward.coins', { n: res.coins }) + (res.sparkles ? ' · ' + t('night.sparkles', { n: res.sparkles }) : '') });
    box.append(line);
    requestAnimationFrame(() => line.isConnected && burstAt(line, { n: 14, colors: ['#ffcf4a', '#fff4c0'] }));
  }
  if (res.block) {
    // already rolled and stored: the card only plays the reveal
    const b = { ...res.block, opened: false };
    box.append(h('div.lucky-row', null, blockCard(b, { closedIcon: game.data.assets.blocks.bonus, opener: async () => ({ block: b }) })));
  }
  if (!res.paid) box.append(h('div.dim.center', { text: res.grade === 'lost' ? t('night.retry') : t('night.paidToday') }));
  box.append(
    h('div.dim.center', { text: t('backroom.found', { n: anomaliesFound(game.save, game.data), total: game.data.anomalies.length }) }),
    button(t('night.again'), () => {
      startNightShift(game.save, game.data, today);
      commit();
      play('door_open');
      go('nightshift');
    }, { cls: 'green big block', sound: null }),
    button(t('night.toHub'), () => go('hub'), { cls: 'grey block back', sound: 'back' }),
  );
  root.append(h('div.scroll', null, box));
}
