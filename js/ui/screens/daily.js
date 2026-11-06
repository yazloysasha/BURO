// Daily gift: one free lucky block per calendar day. No timers, no countdowns. Gentle streak.
import { h, setChildren } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { play } from '../../core/audio.js';
import { game, commit } from '../../game/state.js';
import { dailyAvailable, localDate, STREAK_BONUSES } from '../../game/daily.js';
import { openDailyGift } from '../../game/blocks.js';
import { screenHeader, setTopbarTitle } from '../app.js';
import { blockCard, pityLine } from '../luckyblock.js';
import { createCatPair } from '../widgets.js';

export function render(root) {
  setTopbarTitle('');
  const today = localDate();
  const save = game.save;
  const box = h('div.col.center');
  const available = dailyAvailable(save, today);
  box.append(createCatPair('sit', 'sit', 3));

  const streak = h('div.streak');
  const drawStreak = () => {
    const s = save.daily.streak || 0;
    setChildren(streak, 
      h('div', { text: t('daily.streak', { n: s }) }),
      h(
        'div.row',
        { style: { justifyContent: 'center' } },
        ...STREAK_BONUSES.map((b) => h('span.streak-mark' + (s >= b ? '.on' : ''), { text: t('daily.bonus' + b) })),
      ),
      h('div.dim.small', { text: t('daily.streakHint') }),
    );
  };
  drawStreak();

  const cards = h('div.lucky-row');
  const pity = h('div.dim', { text: pityLine() });
  const note = h('p');
  const gift = save.daily.lastGift;

  if (available) {
    note.textContent = t('daily.available');
    // a placeholder block; contents are rolled (and saved) on tap
    const placeholder = { rarity: 'common', opened: false };
    const card = blockCard(placeholder, {
      closedIcon: game.data.assets.blocks.daily,
      opener: async () => {
        const g = openDailyGift(save, game.data, today);
        commit();
        if (!g) return null;
        Object.assign(placeholder, g.blocks[0]);
        // the card shows the first block; streak bonus blocks get cards of their own
        for (const extra of g.blocks.slice(1)) cards.append(blockCard({ ...extra, opened: false }, { closedIcon: game.data.assets.blocks.bonus, opener: async () => ({ block: extra }) }));
        drawStreak();
        pity.textContent = pityLine();
        note.textContent = g.coins ? t('daily.bonusCoins', { n: g.coins }) : t('daily.opened');
        play('daily_gift');
        return { block: placeholder };
      },
    });
    cards.append(card);
  } else {
    note.textContent = t('daily.alreadyOpened');
    if (gift && gift.date === today) for (const b of gift.blocks) cards.append(blockCard({ ...b, opened: true }, {}));
  }
  box.append(cards, note, pity, streak);
  root.append(screenHeader(t('daily.title')), h('div.scroll', null, box));
}
