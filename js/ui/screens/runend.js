// Run end: victory or soft defeat (keep 50% coins, all stickers, one backpack item of choice).
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { play } from '../../core/audio.js';
import { game, commit } from '../../game/state.js';
import { finishRun, runPayout } from '../../game/run.js';
import { sellPrice, itemKey } from '../../game/collection.js';
import { nextGoal } from '../../game/progress.js';
import { gritBonus } from '../../game/meta.js';
import { displayName } from '../../game/names.js';
import { button, go, setTopbarTitle } from '../app.js';
import { itemRow, itemIcon } from '../runwidgets.js';
import { createCatPair } from '../widgets.js';

export function render(root) {
  const run = game.save.run;
  if (!run || !run.result) return go('hub');
  const win = run.result.outcome === 'win';
  setTopbarTitle('');
  const box = h('div.col');
  box.append(h('h1.center', { text: win ? t('runEnd.winTitle') : t('runEnd.loseTitle') }), createCatPair(win ? 'victory' : 'sleep1', win ? 'victory' : 'sleep2', 4));
  box.append(h('p.center', { text: win ? t('runEnd.winText') : t('runEnd.loseText') }));
  if (!win) {
    const next = gritBonus({ meta: { grit: (game.save.meta.grit || 0) + 1 } }, game.data);
    box.append(h('div.accent.center', { text: t(next.atk ? 'runEnd.gritAtk' : 'runEnd.grit', { hp: next.hp, atk: next.atk }) }));
  }
  const coins = runPayout(run, game.data);
  box.append(h('p.center.coins-line', { text: t('runEnd.coins', { n: coins }) }));
  if (run.leader === 'dudonya') box.append(h('div.dim.center', { text: t('runEnd.leaderBonus') }));
  box.append(h('div.dim.center', { text: t('runEnd.stats', { rooms: run.stats.rooms, kills: run.stats.kills }) }));

  let keepUid = null;
  const sell = new Set();
  const list = h('div.col');
  const total = h('div.center.accent');
  const priceOf = (b) => sellPrice(game.save, game.data, itemKey(b.id, b.mods));
  const inAlbum = (b) => game.data.album.some((p) => p.slots.some((s) => s.kind === 'item' && s.id === b.id));

  const modLines = (b) => b.mods.map((m) => {
    const d = game.data.modifiers.find((x) => x.id === m);
    return h('div.small', null, h('span.accent', { text: d.name + ': ' }), d.desc);
  });

  const tags = (b) => {
    const isNew = !game.save.collection.seen[b.id];
    return h('div.row.sell-tags', null, isNew ? h('span.tag.good', { text: t('runEnd.tagNew') }) : null, isNew && inAlbum(b) ? h('span.tag', { text: t('runEnd.tagAlbum') }) : null);
  };

  const drawTotal = () => {
    const sold = [...sell].reduce((s, uid) => s + priceOf(run.backpack.find((b) => b.uid === uid)), 0);
    total.textContent = win ? t('runEnd.total', { coins, sold }) : '';
  };

  const drawList = () => {
    list.replaceChildren();
    if (!run.backpack.length) return;
    list.append(h('h2', { text: win ? t('runEnd.allItems') : t('runEnd.pickOne') }));
    if (win) {
      list.append(
        h(
          'div.row',
          null,
          button(t('runEnd.sellAll'), () => {
            sell.clear();
            for (const b of run.backpack) if (game.save.collection.seen[b.id]) sell.add(b.uid);
            drawList();
          }, { cls: 'blue small grow', sound: 'coin_small' }),
          button(t('runEnd.keepAll'), () => {
            sell.clear();
            drawList();
          }, { cls: 'grey small grow', sound: 'toggle' }),
        ),
      );
    }
    for (const b of run.backpack) {
      const item = game.data.itemById[b.id];
      if (!item) continue;
      if (win) {
        const selling = sell.has(b.uid);
        const toggle = button(selling ? t('runEnd.sell', { n: priceOf(b) }) : t('runEnd.keep'), () => {
          if (selling) sell.delete(b.uid);
          else sell.add(b.uid);
          drawList();
        }, { cls: 'small sell-toggle ' + (selling ? 'green' : 'blue'), sound: selling ? 'toggle' : 'coin_small' });
        list.append(h('div.sell-row.r-' + item.rarity, null, h('div.item-icon.r-' + item.rarity, null, itemIcon(item, { mods: b.mods })), h('div.grow', null, h('div.item-name', { text: displayName(item, b.mods) }), h('div.small.dim', { text: t('inv.price', { n: priceOf(b) }) }), tags(b), ...modLines(b)), toggle));
      } else {
        list.append(
          itemRow(item, {
            mods: b.mods,
            selected: keepUid === b.uid,
            extra: h('div', null, h('div.small', { text: t('inv.price', { n: priceOf(b) }) }), tags(b), ...modLines(b)),
            onClick: () => {
              keepUid = keepUid === b.uid ? null : b.uid;
              play('select');
              drawList();
            },
          }),
        );
      }
    }
    drawTotal();
  };
  drawList();
  box.append(list, total);
  const goal = nextGoal(game.save, game.data);
  box.append(
    button(t('runEnd.toShop'), () => {
      if (!win && run.backpack.length && !keepUid) {
        play('error');
        list.classList.add('shake');
        setTimeout(() => list.classList.remove('shake'), 320);
        return;
      }
      finishRun(game.save, game.data, { keepUid, sellUids: [...sell] });
      commit();
      play('coin');
      go('hub');
    }, { cls: 'green big block', sound: null, sub: goal ? t(goal.key, goal.params) : null }),
  );
  root.append(h('div.scroll', null, box));
  play(win ? 'level_up' : 'fail_small');
}
