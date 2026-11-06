// Desktop controls: Space/Enter confirm, number keys pick, Esc goes back. Works from what's on screen, so every screen
// is covered without knowing about it.
import { $ } from '../core/dom.js';
import { closeModal } from './app.js';

// What the number keys pick on a screen, in priority order: the first selector with anything visible wins.
const CHOICES = ['.tap-zone.targetable', '.action-grid .btn:not(:disabled)', '.shelf.ready', '.shelf-item', '.anomaly-cell:not(:disabled)', '.lucky:not(.opened)', '.sell-row .sell-toggle', '.map-node.avail', '.event-choice:not(:disabled)'];
const CONFIRM = ['.btn.big:not(:disabled)', '.btn.green:not(:disabled)', '.lucky:not(.opened)'];

const visible = (el) => el.getClientRects().length > 0;
const all = (root, sel) => [...root.querySelectorAll(sel)].filter(visible);

function press(el) {
  if (el.matches('.tap-zone')) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  else el.click();
}

function modalOpen() {
  return $('#overlay').classList.contains('show');
}

function pick(n) {
  if (modalOpen()) {
    const list = all($('#overlay'), '.item-row.clickable, .album-index, .btn:not(:disabled)');
    if (list[n]) press(list[n]);
    return;
  }
  for (const sel of CHOICES) {
    const list = all($('#screen'), sel);
    if (list.length) {
      if (list[n]) press(list[n]);
      return;
    }
  }
  const rest = all($('#screen'), '.btn:not(:disabled)');
  if (rest[n]) press(rest[n]);
}

function confirmKey() {
  if (modalOpen()) {
    const acts = all($('#overlay'), '.actions .btn:not(:disabled)');
    const main = acts.find((b) => b.matches('.green')) || acts[acts.length - 1];
    if (main) press(main);
    return;
  }
  // mid-animation the key works like a tap: it skips ahead
  const panel = $('.action-panel');
  if (panel && panel.querySelector('.skip-hint')) {
    panel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return;
  }
  for (const sel of CONFIRM) {
    const el = all($('#screen'), sel)[0];
    if (el) return press(el);
  }
}

function back() {
  if (modalOpen()) {
    if ($('#overlay').dataset.locked !== '1') closeModal();
    return;
  }
  const b = all($('#screen'), '.btn.back:not(:disabled)')[0];
  if (b) press(b);
}

export function installKeys() {
  document.addEventListener('keydown', (e) => {
    document.body.classList.add('kbd');
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      if (e.key === 'Escape') back();
      return;
    }
    if (e.key === 'Escape') back();
    else if (e.key === ' ' || e.key === 'Enter') {
      // Tab-focused buttons keep their native behaviour
      if (document.activeElement && document.activeElement.matches && document.activeElement.matches('button:focus-visible')) return;
      e.preventDefault();
      confirmKey();
    } else if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      pick(Number(e.key) - 1);
    }
  });
  // number hints appear for anyone with a mouse, not only after the first key press
  if (window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches) document.body.classList.add('kbd');
}
