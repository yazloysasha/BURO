// Room screen: dispatches to the view for the current room type and handles "continue" back to the map.
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { play } from '../../core/audio.js';
import { game, commit } from '../../game/state.js';
import { completeRoom, restChoice } from '../../game/run.js';
import { button, go, setTopbarTitle } from '../app.js';
import { renderCombat } from '../combatview.js';
import { itemRow, partyBar } from '../runwidgets.js';
import { createCatPair } from '../widgets.js';

// type -> (root, room) => cleanup?   Later milestones register more room types here.
export const roomViews = {};

export function leaveRoom() {
  completeRoom(game.save, game.data);
  commit();
  play('door_close');
  go(game.save.run && game.save.run.result ? 'runEnd' : 'map');
}

export function rewardView(root, reward, { title = t('reward.title'), text = null } = {}) {
  const box = h('div.col.reward');
  box.append(h('h1.center', { text: title }));
  if (text) box.append(h('p.center', { text }));
  if (reward && reward.coins) box.append(h('p.center.coins-line', { text: t('reward.coins', { n: reward.coins }) }));
  for (const r of (reward && reward.items) || []) {
    const item = game.data.itemById[r.entry ? r.entry.id : r.itemId];
    if (!item) continue;
    box.append(itemRow(item, { mods: r.entry ? r.entry.mods : [], extra: r.converted ? h('div.dim', { text: t('reward.converted', { n: r.coins }) }) : null }));
  }
  for (const extra of (reward && reward.extraRows) || []) box.append(extra);
  box.append(button(t('common.continue'), leaveRoom, { cls: 'green big block', sound: 'confirm' }));
  root.append(h('div.scroll', null, box));
}

function combatRoom(root, room) {
  if (room.phase === 'reward') return rewardView(root, room.reward, { title: room.type === 'boss' ? t('reward.bossTitle') : t('reward.title') });
  if (room.phase === 'lost') return go('runEnd');
  renderCombat(root, {
    onEnd: (outcome) => {
      if (outcome === 'lose') go('runEnd');
      else go('room');
    },
  });
}

roomViews.combat = combatRoom;
roomViews.elite = combatRoom;
roomViews.boss = combatRoom;

roomViews.rest = (root, room) => {
  const wrap = h('div.col.scroll');
  wrap.append(h('h1.center', { text: t('rest.title') }), createCatPair('sleep1', 'sleep2', 4));
  if (room.phase === 'choose') {
    wrap.append(
      h('p.center', { text: t('rest.text') }),
      partyBar(game.save.run),
      button(t('rest.sleep'), () => pick('sleep'), { cls: 'green block', sub: t('rest.sleepSub', { p: Math.round(game.data.balance.restHeal * 100) }) }),
      button(t('rest.purr'), () => pick('purr'), { cls: 'blue block', sub: t('rest.purrSub') }),
    );
  } else {
    wrap.append(h('p.center', { text: room.result.choice === 'sleep' ? t('rest.slept') : t('rest.purred') }), partyBar(game.save.run), button(t('common.continue'), leaveRoom, { cls: 'green big block', sound: 'confirm' }));
  }
  root.append(wrap);
  function pick(choice) {
    restChoice(game.save, game.data, choice);
    commit();
    play(choice === 'sleep' ? 'potion' : 'shiny');
    go('room');
  }
};

roomViews.loot = (root, room) => rewardView(root, room.reward, { title: t('reward.lootTitle') });

export function render(root) {
  const run = game.save.run;
  if (!run) return go('hub');
  if (!run.room) return go(run.result ? 'runEnd' : 'map');
  const room = run.room;
  const r = game.data.roomById[room.type];
  setTopbarTitle(r ? r.name : '');
  const view = roomViews[room.type] || roomViews.loot;
  return view(root, room);
}
