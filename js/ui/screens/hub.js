// Lavka: the hub screen.
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { play } from '../../core/audio.js';
import { game, commit } from '../../game/state.js';
import { startRun } from '../../game/run.js';
import { runFee, runIsFree, gritBonus } from '../../game/meta.js';
import { button, go, pickLine, setTopbarTitle, modal, closeModal, toast } from '../app.js';
import { nextGoal } from '../../game/progress.js';
import { customerOffer, sellToCustomer, dismissCustomer } from '../../game/customers.js';
import { parseKey, sellPrice } from '../../game/collection.js';
import { itemRow } from '../runwidgets.js';
import { createHubScene } from '../hubscene.js';
import { isWide } from '../layout.js';
import { catLine } from '../../game/namegen.js';
import { localDate } from '../../game/daily.js';
import { hubAnomaly, catchHubAnomaly } from '../../game/backroom.js';
import { hashString } from '../../core/rng.js';

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
    const leader = await chooseLeader(text);
    if (!leader) return;
    startRun(save, game.data, { leader });
    commit();
    play('door_open');
    go('map');
  }, { cls: 'green big block', sub, sound: 'select' });
}

// The first decision of every run: who leads changes both the fights and the haul.
function chooseLeader(text) {
  const pick = (key, sub) => button(t(key), () => closeModal(sub), { cls: 'blue block leader-pick', sub: t(key + 'Sub'), sound: 'confirm' });
  const comp = game.save.meta.companion && game.data.animalById[game.save.meta.companion];
  const along = comp && game.save.collection.animals[comp.id] ? h('div.goal-line', { text: t('hub.companion', { name: comp.name }) }) : h('div.dim.small', { text: t('hub.noCompanion') });
  return modal(h('div.col', null, h('p', { text }), along, h('h2', { text: t('hub.chooseLeader') }), pick('hub.leaderPeposya', 'peposya'), pick('hub.leaderDudonya', 'dudonya')), [
    { label: t('common.cancel'), value: null, cls: 'grey', sound: 'back' },
  ]);
}

// A visitor with a wish: shows what on the shelves fits and what it would fetch, or lets them go.
function openCustomer(after) {
  const save = game.save;
  const c = save.meta.customer;
  if (!c) return;
  const a = game.data.animalById[c.animal];
  const fits = Object.keys(save.collection.items).filter((k) => customerOffer(save, game.data, k) > 0).sort((x, y) => customerOffer(save, game.data, y) - customerOffer(save, game.data, x));
  const list = h('div.col');
  for (const key of fits) {
    const { id, mods } = parseKey(key);
    const it = game.data.itemById[id];
    list.append(itemRow(it, { mods, extra: h('div.small.accent', { text: t('customer.offer', { n: customerOffer(save, game.data, key), base: sellPrice(save, game.data, key) }) }), onClick: () => {
      const coins = sellToCustomer(save, game.data, key);
      if (!coins) return;
      commit();
      closeModal();
      play('coin');
      toast(t('customer.sold', { name: a.name, n: coins }), 3000);
      after();
    } }));
  }
  if (!fits.length) list.append(h('p.dim', { text: t('customer.nothing') }));
  play('door_open');
  modal(h('div.col', null, h('h2', { text: t('customer.title', { name: a.name }) }), h('p', { text: t('customer.wants', { what: t('customer.want.' + c.want.kind + '.' + c.want.value), x: c.mult }) }), list), [
    { label: t('customer.later'), value: 0, cls: 'grey', sound: 'back' },
    { label: t('customer.bye'), value: 'bye', cls: 'red', sound: 'door_close' },
  ]).then((v) => {
    if (v !== 'bye' || save.meta.customer !== c) return;
    dismissCustomer(save);
    commit();
    after();
  });
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
  const anomaly = hubAnomaly(game.save, game.data, localDate(), hashString);
  const note = h('div.hub-note', { text: lastRunNote() || pickLine('hub.greeting') });

  const menu = h('div.menu-grid');
  for (const m of hubMenu) {
    if (m.visible && !m.visible()) continue;
    const b = button(m.label(), m.onClick, { cls: m.cls || 'blue' });
    const badge = m.badge && m.badge();
    if (badge) b.append(h('span.badge', { text: String(badge) }));
    menu.append(b);
  }
  menu.append(button(t('hub.settings'), () => go('settings'), { cls: 'grey' }), button(t('hub.credits'), () => go('credits'), { cls: 'grey' }));

  const goal = nextGoal(game.save, game.data);
  const grit = gritBonus(game.save, game.data);
  const openOffer = () => openCustomer(() => go('hub'));
  const customer = game.save.meta.customer;
  const offer = customer && button(t('customer.openOffer'), openOffer, { cls: 'yellow block small', sound: null });
  const scroll = h('div.scroll', null, h('div.col', null, h('div.goal-line', { text: t(goal.key, goal.params) }), grit.n ? h('div.center.dim', { text: t(grit.atk ? 'runEnd.gritAtk' : 'runEnd.grit', { hp: grit.hp, atk: grit.atk }) }) : null, offer, runButton(), menu));
  a.append(note);
  b.append(scroll);

  // Portrait: the menu is laid out first and the scene gets what is left (at most 40% of the screen), so every
  // button, Settings and Credits included, stays above the home indicator without scrolling.
  let sceneH = Math.max(160, H * 0.4);
  if (!wide) {
    const gap = parseFloat(getComputedStyle(root.firstChild).rowGap) || 0;
    // the scroll area stretches to fill the column, so measure what is inside it, not the area itself
    const st = getComputedStyle(scroll);
    const need = scroll.firstChild.offsetHeight + parseFloat(st.paddingTop) + parseFloat(st.paddingBottom);
    const left = H - need - note.offsetHeight - gap;
    sceneH = Math.max(120, Math.min(H * 0.4, left));
  }
  const scene = createHubScene(wide ? W * 0.52 : W, wide ? H - 40 : sceneH, {
    customer,
    onCustomer: openOffer,
    anomaly: anomaly && anomaly.id,
    onAnomaly: (id) => {
      const r = catchHubAnomaly(game.save, game.data, id, localDate());
      commit();
      if (!r) return;
      play('glitch');
      toast(t(r.first ? 'hubAnomaly.caught' : 'hubAnomaly.again'), 3000);
    },
  });
  a.prepend(scene.stage.el);
  scene.onTapCat((who) => {
    taps++;
    note.textContent = t('cats.' + who) + ': ' + catLine(game.data, who, localDate() + ':' + who + ':' + taps);
  });
  return () => scene.destroy();
}
