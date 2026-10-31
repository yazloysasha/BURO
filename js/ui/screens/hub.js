// Lavka: the hub screen.
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { play } from '../../core/audio.js';
import { game, commit } from '../../game/state.js';
import { startRun } from '../../game/run.js';
import { runFee, runIsFree } from '../../game/meta.js';
import { button, go, pickLine, setTopbarTitle, confirm } from '../app.js';
import { createHubScene } from '../hubscene.js';
import { isWide } from '../layout.js';
import { catLine } from '../../game/namegen.js';
import { localDate } from '../../game/daily.js';

let taps = 0;

// Extra hub menu entries registered by feature modules: {id, label(), onClick, cls, badge()}
export const hubMenu = [];

function runButton() {
  const save = game.save;
  if (save.run) {
    return button(t('hub.continueRun'), () => go(save.run.result ? 'runEnd' : save.run.room ? 'room' : 'map'), { cls: 'green big block', sound: 'door_open' });
  }
  const free = runIsFree(save, game.data);
  const fee = runFee(save, game.data);
  const sub = free ? t('hub.runFree') : t('hub.runFee', { n: fee });
  return button(t('hub.startRun'), async () => {
    const text = free ? (save.meta.runsStarted === 0 ? t('hub.firstRunText') : t('hub.freeRunText')) : t('hub.feeText', { n: fee });
    if (!(await confirm(text, t('hub.go'), t('common.cancel')))) return;
    startRun(save, game.data);
    commit();
    play('door_open');
    go('map');
  }, { cls: 'green big block', sub, sound: 'select' });
}

function lastRunNote() {
  const lr = game.save.lastRun;
  if (!lr) return null;
  return lr.outcome === 'win' ? t('hub.lastWin', { n: lr.coins }) : t('hub.lastLose', { n: lr.coins });
}

export function render(root) {
  setTopbarTitle(t('hub.title') + ' · ' + t('hub.tier', { n: game.save.meta.tier }));
  const a = h('div.split-a');
  const b = h('div.split-b');
  root.append(h('div.split', null, a, b));
  const wide = isWide();
  const W = root.clientWidth || window.innerWidth - 16;
  const H = root.clientHeight || window.innerHeight;
  const scene = createHubScene(wide ? W * 0.52 : W, wide ? H - 40 : Math.max(160, H * 0.4));
  const note = h('div.hub-note', { text: lastRunNote() || pickLine('hub.greeting') });
  scene.onTapCat((who) => {
    taps++;
    note.textContent = t('cats.' + who) + ': ' + catLine(game.data, who, localDate() + ':' + who + ':' + taps);
  });

  const menu = h('div.menu-grid');
  for (const m of hubMenu) {
    if (m.visible && !m.visible()) continue;
    const b = button(m.label(), m.onClick, { cls: m.cls || 'blue' });
    const badge = m.badge && m.badge();
    if (badge) b.append(h('span.badge', { text: String(badge) }));
    menu.append(b);
  }
  menu.append(button(t('hub.settings'), () => go('settings'), { cls: 'grey' }), button(t('hub.credits'), () => go('credits'), { cls: 'grey' }));

  a.append(scene.stage.el, note);
  b.append(h('div.scroll', null, h('div.col', null, runButton(), menu)));
  return () => scene.destroy();
}
