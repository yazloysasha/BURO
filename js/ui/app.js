// App shell: screen router, top bar, modals, toasts, buttons, screen shake, haptics.
import { h, clear, $ } from '../core/dom.js';
import { t, tn } from '../core/i18n.js';
import { play } from '../core/audio.js';
import { iconCanvas } from '../core/sprite.js';
import { game, onChange } from '../game/state.js';

const screens = {};
let current = null;
let cleanup = null;

export function registerScreen(name, mod) {
  screens[name] = mod;
}

export function currentScreen() {
  return current;
}

export function go(name, params = {}) {
  const root = $('#screen');
  if (cleanup) {
    try {
      cleanup();
    } catch (e) {
      console.error(e);
    }
  }
  cleanup = null;
  closeModal();
  clear(root);
  current = name;
  const mod = screens[name];
  if (!mod) throw new Error('no screen ' + name);
  const res = mod.render(root, params);
  if (typeof res === 'function') cleanup = res;
  renderTopbar();
}

// ---------- top bar ----------
let topbarExtra = null;

export function setTopbarTitle(text) {
  topbarExtra = text;
  renderTopbar();
}

export function renderTopbar() {
  const bar = $('#topbar');
  if (!bar || !game.save) return;
  clear(bar);
  const icons = game.data.assets.icons;
  bar.append(
    h('div.cur', null, iconCanvas(icons.coin, { target: 24 }), h('span#coins', { text: String(game.save.meta.coins) })),
    h('div.cur', null, iconCanvas(icons.sparkle, { target: 24 }), h('span#sparkles', { text: String(game.save.meta.sparkles) })),
    h('div.spacer'),
  );
  if (topbarExtra) bar.append(h('div.title-small', { text: topbarExtra }));
}

onChange(() => {
  const c = $('#coins');
  const s = $('#sparkles');
  if (c) c.textContent = String(game.save.meta.coins);
  if (s) s.textContent = String(game.save.meta.sparkles);
});

// ---------- buttons ----------
export function button(label, onClick, { cls = '', sound = 'click', disabled = false, icon = null, sub = null } = {}) {
  const b = h(
    'button.btn' + (cls ? '.' + cls.split(' ').join('.') : ''),
    { type: 'button', disabled },
    icon,
    h('span', null, label, sub ? h('div.sub', { text: sub }) : null),
  );
  b.addEventListener('click', (e) => {
    if (b.disabled) return;
    if (sound) play(sound);
    haptic(8);
    onClick && onClick(e);
  });
  return b;
}

export function backButton(to = 'hub', params) {
  return button(t('common.back'), () => go(to, params), { cls: 'grey small', sound: 'back' });
}

export function screenHeader(title, backTo = 'hub') {
  return h('div.row', { style: { marginBottom: '4px' } }, backButton(backTo), h('h1.grow', { text: title, style: { margin: 0 } }));
}

// ---------- modal ----------
let modalResolve = null;

export function modal(content, actions = [], { cls = '', dismissable = true } = {}) {
  const ov = $('#overlay');
  clear(ov);
  return new Promise((resolve) => {
    modalResolve = resolve;
    const acts = h('div.actions');
    for (const a of actions) {
      acts.append(
        button(a.label, () => {
          closeModal(a.value);
        }, { cls: a.cls || '', sound: a.sound || 'click' }),
      );
    }
    const box = h('div.modal.panel' + (cls ? '.' + cls : ''), null, h('div.body', null, content), actions.length ? acts : null);
    ov.append(box);
    ov.classList.add('show');
    ov.onclick = (e) => {
      if (dismissable && e.target === ov) closeModal(undefined);
    };
  });
}

export function closeModal(value) {
  const ov = $('#overlay');
  if (!ov) return;
  ov.classList.remove('show');
  ov.onclick = null;
  clear(ov);
  const r = modalResolve;
  modalResolve = null;
  if (r) r(value);
}

export function confirm(text, yesLabel = t('common.yes'), noLabel = t('common.cancel'), yesCls = 'green') {
  return modal(h('p', { text }), [
    { label: noLabel, value: false, cls: 'grey', sound: 'back' },
    { label: yesLabel, value: true, cls: yesCls, sound: 'confirm' },
  ]).then((v) => v === true);
}

export function alertBox(content, label = t('common.ok')) {
  return modal(typeof content === 'string' ? h('p', { text: content }) : content, [{ label, value: true, cls: 'green' }]);
}

// ---------- toast ----------
export function toast(text, ms = 2200) {
  const box = $('#toast');
  const el = h('div.toast', { text });
  box.append(el);
  setTimeout(() => el.classList.add('fade'), ms);
  setTimeout(() => el.remove(), ms + 450);
  while (box.children.length > 3) box.firstChild.remove();
}

// ---------- juice ----------
export function shake(el = $('#app')) {
  if (!game.save.settings.shake) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 320);
}

export function haptic(ms = 15) {
  if (!game.save || !game.save.settings.vibration) return;
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    /* unsupported */
  }
}

export function coinsText(n) {
  return n + ' ' + tn('currency.coins', n);
}

export function pickLine(key) {
  const lines = (key.split('.').reduce((o, k) => o && o[k], game.data.strings) || []);
  if (!Array.isArray(lines) || !lines.length) return t(key);
  return lines[Math.floor(Math.random() * lines.length)];
}
