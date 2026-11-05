// Room screen: dispatches to the view for the current room type and handles "continue" back to the map.
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { play } from '../../core/audio.js';
import { game, commit } from '../../game/state.js';
import { completeRoom, restChoice } from '../../game/run.js';
import { button, go, setTopbarTitle, modal, closeModal } from '../app.js';
import { renderCombat } from '../combatview.js';
import { itemRow, partyBar } from '../runwidgets.js';
import { blockCard, pityLine } from '../luckyblock.js';
import { openRunBlock, resolveFullBackpack, unopenedBlocks } from '../../game/blocks.js';
import { enemyCanvas } from '../../core/sprite.js';
import { createCatPair } from '../widgets.js';
import { burstAt } from '../particles.js';

// type -> (root, room) => cleanup?   Later milestones register more room types here.
export const roomViews = {};

export function leaveRoom() {
  if (unopenedBlocks(game.save.run.room)) return;
  completeRoom(game.save, game.data);
  commit();
  play('door_close');
  go(game.save.run && game.save.run.result ? 'runEnd' : 'map');
}

// "Continue" that stays locked until every block in the room has been opened; refresh() re-checks.
export function leaveButton(label = t('common.continue'), { cls = 'green big block', sound = 'confirm' } = {}) {
  const wrap = h('div.leave-wrap');
  const refresh = () => {
    const left = unopenedBlocks(game.save.run.room);
    wrap.replaceChildren(button(left ? t('loot.openFirst') : label, leaveRoom, { cls: left ? 'grey big block' : cls, sound, disabled: !!left }));
  };
  refresh();
  wrap.refresh = refresh;
  return wrap;
}

export function rewardView(root, reward, { title = t('reward.title'), text = null, scroll = true } = {}) {
  const box = h('div.col.reward');
  if (title) box.append(h('h1.center', { text: title }));
  if (text) box.append(h('p.center', { text }));
  if (reward && reward.coins) {
    const line = h('p.center.coins-line', { text: t('reward.coins', { n: reward.coins }) });
    box.append(line);
    requestAnimationFrame(() => line.isConnected && burstAt(line, { n: 14, colors: ['#ffcf4a', '#fff4c0', '#c98a1a'] }));
  }
  for (const r of (reward && reward.items) || []) {
    const item = game.data.itemById[r.entry ? r.entry.id : r.itemId];
    if (!item) continue;
    box.append(itemRow(item, { mods: r.entry ? r.entry.mods : [], extra: r.converted ? h('div.dim', { text: t('reward.converted', { n: r.coins }) }) : null }));
  }
  for (const id of (reward && reward.stickers) || []) {
    const e = game.data.enemyById[id];
    box.append(h('div.item-row', null, h('div.item-icon', null, enemyCanvas(e.sprite, 3)), h('div', null, h('div', { text: t('reward.sticker') }), h('div.dim', { text: e.name }))));
  }
  for (const extra of (reward && reward.extraRows) || []) box.append(extra);
  const room = game.save.run.room;
  const leave = leaveButton();
  if (room && room.blocks && room.blocks.length) {
    const kind = room.type === 'boss' ? 'boss' : room.type === 'elite' ? 'elite' : 'run';
    const row = h('div.lucky-row');
    room.blocks.forEach((b, i) => row.append(blockCard(b, { closedIcon: game.data.assets.blocks[kind], opener: () => openBlockAt(i), onRevealed: () => leave.refresh() })));
    box.append(h('h2.center', { text: t('loot.blocksTitle') }), row, h('div.dim.center', { text: pityLine() }));
  }
  for (const id of (reward && reward.combos) || []) box.append(h('div.accent.center', { text: t('reward.combo', { name: game.data.comboById[id].name }) }));
  box.append(leave);
  root.append(scroll ? h('div.scroll', null, box) : box);
}

// Opens run block i; when the backpack is full the player picks what to drop (or sells the find).
export async function openBlockAt(i) {
  const res = openRunBlock(game.save, game.data, i);
  if (!res) return null;
  if (res.needsSpace) {
    const run = game.save.run;
    const b = res.block;
    const list = h('div.col');
    let drop = null;
    for (const e of run.backpack) {
      const it = game.data.itemById[e.id];
      list.append(itemRow(it, { mods: e.mods, onClick: () => { drop = e.uid; closeModal('drop'); } }));
    }
    const choice = await modal(h('div', null, h('h2', { text: t('loot.fullTitle') }), h('p', { text: t('loot.fullText') }), list), [
      { label: t('loot.sellNew'), value: 'sell', cls: 'blue' },
    ], { dismissable: false });
    resolveFullBackpack(game.save, game.data, i, choice === 'drop' ? drop : null);
    commit();
    play('coin_small');
    return { block: b };
  }
  commit();
  return res;
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
