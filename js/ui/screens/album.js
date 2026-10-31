// Sticker album: themed pages; found stickers are placed by tap; full pages give permanent bonuses or skins.
import { h, setChildren } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { play } from '../../core/audio.js';
import { tween, ease } from '../../core/loop.js';
import { loadImage } from '../../core/assets.js';
import { pixelCanvas, iconCanvas, enemyCanvas } from '../../core/sprite.js';
import { game, commit } from '../../game/state.js';
import { pageState, placeSticker, slotFound, slotKey } from '../../game/progress.js';
import { button, modal, closeModal, screenHeader, setTopbarTitle } from '../app.js';
import { passiveText } from '../runwidgets.js';
import { burst } from '../particles.js';
import { uiZoom } from '../layout.js';

let pageIdx = 0;

function slotInfo(slot) {
  if (slot.kind === 'animal') {
    const a = game.data.animalById[slot.id];
    return { name: a.name, src: a.sprite, w: 16, h: 16 };
  }
  if (slot.kind === 'enemy') return { name: game.data.enemyById[slot.id].name, enemy: game.data.enemyById[slot.id].sprite };
  const it = game.data.itemById[slot.id];
  return { name: it.name, src: it.icon, w: it.w, h: it.h };
}

function stickerIcon(info, target) {
  if (info.enemy) return enemyCanvas(info.enemy, Math.max(2, Math.round(target / 18)), { flip: false });
  return iconCanvas(info.src, { w: info.w, h: info.h, target });
}

// dark silhouette of an unfound sticker (keeps the pixel shape, hides the colours)
function silhouette(info, target) {
  if (info.enemy) {
    const c = enemyCanvas(info.enemy, Math.max(2, Math.round(target / 18)), { flip: false, animate: false });
    c.style.filter = 'brightness(0) opacity(0.35)';
    return c;
  }
  const scale = Math.max(1, Math.round(target / (Math.max(info.w, info.h) + 2)));
  const c = pixelCanvas(info.w, info.h, scale);
  loadImage(info.src).then((img) => {
    if (!img) return;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, Math.floor((info.w - img.naturalWidth) / 2), info.h - img.naturalHeight);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#3a3058';
    ctx.fillRect(0, 0, info.w, info.h);
  });
  return c;
}

export function rewardText(reward) {
  if (reward.type === 'skin') return t('album.rewardSkin', { name: game.data.skins.find((s) => s.id === reward.id).name });
  return passiveText(reward.effect);
}

export function render(root) {
  setTopbarTitle('');
  const pages = game.data.album;
  pageIdx = Math.max(0, Math.min(pageIdx, pages.length - 1));
  const head = h('div.row.album-nav');
  const body = h('div.scroll');
  root.append(screenHeader(t('album.title')), head, body);

  const draw = (flip = 0) => {
    const page = pages[pageIdx];
    const st = pageState(game.save, page);
    setChildren(
      head,
      button('◀', () => turn(-1), { cls: 'grey small', sound: null }),
      button(t('album.pageN', { n: pageIdx + 1, total: pages.length }), openIndex, { cls: 'blue small grow', sound: 'open' }),
      button('▶', () => turn(1), { cls: 'grey small', sound: null }),
    );
    const grid = h('div.album-grid');
    page.slots.forEach((slot, i) => {
      const info = slotInfo(slot);
      const found = slotFound(game.save, slot);
      const placed = !!game.save.album.placed[slotKey(page.id, i)];
      const cell = h('button.sticker' + (placed ? '.placed' : found ? '.new' : '.empty'), { type: 'button' });
      cell.style.setProperty('--tilt', ((i * 37) % 7) - 3 + 'deg');
      if (placed) cell.append(stickerIcon(info, 44));
      else if (found) cell.append(stickerIcon(info, 44), h('span.sticker-tag', { text: t('album.place') }));
      else cell.append(silhouette(info, 44));
      cell.addEventListener('click', () => onSlot(page, i, cell, info, found, placed));
      grid.append(cell);
    });
    const box = h(
      'div.col.album-page',
      null,
      h('h1.center', { text: page.title }),
      h('div.center.dim', { text: t('album.progress', { n: st.placed, total: st.total }) }),
      grid,
      h('div.center' + (st.completed ? '.accent' : '.dim'), { text: (st.completed ? t('album.rewardGot') : t('album.reward')) + ' ' + rewardText(page.reward) }),
    );
    setChildren(body, box);
    if (flip) tween(220, (k) => (box.style.transform = `translateX(${(1 - k) * flip * 40}px)`), ease.outQuad).then(() => (box.style.transform = ''));
  };

  function turn(d) {
    pageIdx = (pageIdx + d + pages.length) % pages.length;
    play('page_flip');
    draw(d);
  }

  function onSlot(page, i, cell, info, found, placed) {
    if (!found) {
      play('tap');
      modal(h('p', { text: t('album.unknown') }), [{ label: t('common.ok'), value: 1, cls: 'green' }]);
      return;
    }
    if (placed) {
      play('select');
      modal(h('div.col.center', null, stickerIcon(info, 80), h('h2', { text: info.name })), [{ label: t('common.ok'), value: 1, cls: 'green' }]);
      return;
    }
    const res = placeSticker(game.save, game.data, page.id, i);
    if (!res) return;
    commit();
    play('sticker_place');
    cell.className = 'sticker placed';
    setChildren(cell, stickerIcon(info, 44));
    tween(260, (k) => (cell.style.transform = `scale(${1.5 - 0.5 * k}) rotate(var(--tilt))`), ease.outBack).then(() => {
      cell.style.transform = '';
      if (!res.completed) draw();
    });
    if (res.completed) {
      setTimeout(() => {
        play('album_page');
        burst(document.body, window.innerWidth / 2 / uiZoom(), window.innerHeight / 2 / uiZoom(), { n: 40, colors: ['#ffcf4a', '#ff5edc', '#6fd36f', '#4aa3ff'] });
        modal(h('div.col.center', null, h('h1', { text: t('album.pageDone') }), h('p', { text: page.title }), h('p.accent', { text: rewardText(page.reward) }), h('p.dim', { text: t('album.sparkles') })), [
          { label: t('common.ok'), value: 1, cls: 'green' },
        ]).then(() => draw());
      }, 300);
    }
  }

  function openIndex() {
    const list = h('div.col');
    pages.forEach((p, i) => {
      const st = pageState(game.save, p);
      const row = h('button.album-index' + (st.completed ? '.done' : ''), { type: 'button' }, h('span.grow', { text: p.title }), h('span', { text: `${st.placed}/${st.total}` }));
      row.addEventListener('click', () => {
        pageIdx = i;
        closeModal();
        play('page_flip');
        draw();
      });
      list.append(row);
    });
    modal(h('div', null, h('h2', { text: t('album.index') }), list), [{ label: t('common.close'), value: 0, cls: 'grey', sound: 'back' }]);
  }

  draw();
}
