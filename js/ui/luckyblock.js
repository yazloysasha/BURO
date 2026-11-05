// Lucky block reveal: shake -> pause -> flash in the rarity colour -> rarity sound -> the find pops out.
// Rarer = longer and brighter. Tap during the animation to skip.
import { h, setChildren } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { play } from '../core/audio.js';
import { tween, wait, ease } from '../core/loop.js';
import { iconCanvas, animalCanvas } from '../core/sprite.js';
import { game } from '../game/state.js';
import { pityLeft } from '../game/loot.js';
import { displayName } from '../game/names.js';
import { shake, haptic } from './app.js';
import { burstAt } from './particles.js';

export function contentIcon(block, target = 64) {
  if (block.kind === 'animal') {
    return animalCanvas(game.data.animalById[block.id], target);
  }
  const it = game.data.itemById[block.id];
  return iconCanvas(it.icon, { w: it.w, h: it.h, target, mods: block.mods, seed: block.id });
}

export function contentName(block) {
  if (block.kind === 'animal') return game.data.animalById[block.id].name;
  return displayName(game.data.itemById[block.id], block.mods);
}

export function pityLine() {
  const p = pityLeft(game.save.pity);
  return t('loot.pity', { e: p.epic, l: p.legendary });
}

// block: rolled contents; opener(): performs the state change (and commit), returns {block} or null to cancel.
export function blockCard(block, { closedIcon, opener, onRevealed } = {}) {
  const card = h('button.lucky' + (block.opened ? '.opened' : ''), { type: 'button' });
  const label = h('div.lucky-label');
  const holder = h('div.lucky-icon');
  card.append(holder, label);
  // rarity is read lazily: some cards are created before their contents are rolled
  const R = () => game.data.rarityById[block.rarity];
  const showResult = () => {
    const rar = R();
    card.classList.add('opened', 'r-' + block.rarity);
    card.style.setProperty('--rc', rar.color);
    setChildren(holder, contentIcon(block));
    setChildren(
      label,
      h('div', { text: contentName(block) }),
      h('div.small', { text: rar.name, style: { color: rar.color } }),
      block.dupe ? h('div.small.dim', { text: t('loot.dupe', { n: block.sparkles }) }) : null,
      block.kind === 'animal' && !block.dupe ? h('div.small.accent', { text: t('loot.newAnimal') }) : null,
      block.forced ? h('div.small.accent', { text: t('loot.pityHit') }) : null,
      block.soldFor ? h('div.small.dim', { text: t('loot.soldFor', { n: block.soldFor }) }) : null,
    );
  };
  if (block.opened) {
    showResult();
    return card;
  }
  setChildren(holder, iconCanvas(closedIcon, { target: 64 }));
  setChildren(label, h('div.dim', { text: t('loot.tapToOpen') }));
  let running = false;
  card.addEventListener('click', async () => {
    if (running) {
      token.skipped = true;
      return;
    }
    if (block.opened) return;
    running = true;
    const res = await opener();
    if (!res) {
      running = false;
      return;
    }
    await reveal();
    running = false;
    onRevealed && onRevealed(block);
  });
  const token = { skipped: false };

  async function reveal() {
    const rar = R();
    const ic = holder.firstChild;
    const k = Math.max(1, Math.min(4, rar.reveal / 500));
    for (let i = 0; i < 3 && !token.skipped; i++) {
      play('lootbox_shake', { rate: 1 + i * 0.12 });
      await tween(140, (x) => (ic.style.transform = `rotate(${Math.sin(x * Math.PI * 2) * (6 + i * 3)}deg)`), ease.linear);
    }
    ic.style.transform = '';
    if (!token.skipped) await wait(120 * k, token);
    // flash
    play(rar.sfx);
    if (block.rarity === 'slop') play('glitch');
    if (['epic', 'legendary', 'slop'].includes(block.rarity)) {
      shake();
      haptic(40);
      burstAt(card, { n: block.rarity === 'epic' ? 20 : 36, colors: [rar.color, '#ffffff', '#fff4c0'], speed: 200 });
    } else if (block.rarity === 'rare') burstAt(card, { n: 10, colors: [rar.color, '#ffffff'] });
    const flash = h('div.lucky-flash', { style: { background: rar.color } });
    card.append(flash);
    tween(300 * k, (x) => (flash.style.opacity = String(1 - x))).then(() => flash.remove());
    showResult();
    const pop = holder.firstChild;
    if (!token.skipped) await tween(320, (x) => (pop.style.transform = `scale(${x})`), ease.outBack);
    pop.style.transform = '';
    if (block.rarity === 'slop') card.classList.add('slop');
  }
  return card;
}
