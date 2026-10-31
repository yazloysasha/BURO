// Boot: load data + assets + save, wire audio and persistence, show the hub.
import { $, h } from './core/dom.js';
import { setStrings, t } from './core/i18n.js';
import { loadJSON, loadSheet, loadImages } from './core/assets.js';
import { configure as configureAudio, installUnlock } from './core/audio.js';
import { loadSave, persist, requestPersistence, flush, writeBackup } from './core/storage.js';
import { game, setPersist, commit } from './game/state.js';
import { registerScreen, go, toast, button, rerender, closeModal } from './ui/app.js';
import { watchLayout } from './ui/layout.js';
import { applySettings } from './ui/screens/settings.js';
import * as hub from './ui/screens/hub.js';
import * as settings from './ui/screens/settings.js';
import * as credits from './ui/screens/credits.js';
import * as map from './ui/screens/map.js';
import * as room from './ui/screens/room.js';
import * as runEnd from './ui/screens/runend.js';
import * as daily from './ui/screens/daily.js';
import * as inventory from './ui/screens/inventory.js';
import * as combos from './ui/screens/combos.js';
import * as album from './ui/screens/album.js';
import * as talents from './ui/screens/talents.js';
import * as upgrades from './ui/screens/upgrades.js';
import * as skins from './ui/screens/skins.js';
import { unplacedCount, talentStatus } from './game/progress.js';
import { sheets } from './core/assets.js';
import { recolorSheet } from './core/sprite.js';
import './ui/rooms.js';
import { play } from './core/audio.js';
import { onChange } from './game/state.js';
import { hubMenu } from './ui/screens/hub.js';
import { dailyAvailable, localDate } from './game/daily.js';
import { DATA_FILES, indexData } from './game/data.js';
import { setModifierDefs } from './game/names.js';

async function loadData() {
  const entries = await Promise.all(DATA_FILES.map(async (n) => [n, await loadJSON(`./data/${n}.json`)]));
  const d = indexData(Object.fromEntries(entries));
  setModifierDefs(d.modifiers);
  return d;
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      const offerUpdate = (w) => {
        const el = $('#toast');
        const box = h('div.toast', null, t('app.updateReady') + ' ');
        box.style.pointerEvents = 'auto';
        box.append(button(t('app.updateApply'), () => w.postMessage('SKIP_WAITING'), { cls: 'green small' }));
        el.append(box);
      };
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
        });
      });
    })
    .catch((e) => console.warn('sw', e));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

async function boot() {
  const data = await loadData();
  setStrings(data.strings);
  $('#boot').textContent = t('app.loading');
  await document.fonts.load('16px Galmuri11').catch(() => {});
  game.data = data;

  const sfxIndex = await loadJSON('./' + data.assets.sfxIndex);
  configureAudio(sfxIndex, './assets/');
  installUnlock();

  await Promise.all(Object.entries(data.assets.sheets).map(([k, url]) => loadSheet(k, './' + url)));
  data.sheetsLoaded = Object.keys(data.assets.sheets);
  // skins: other cats' sheets, and recolours of our own cats built once at boot
  await Promise.all(data.skins.filter((s) => s.sheet).map((s) => loadSheet(s.id, './' + s.sheet)));
  for (const s of data.skins) {
    if (s.recolor && sheets[s.base]) sheets[s.id] = recolorSheet(sheets[s.base], s.recolor);
    if (sheets[s.id]) data.sheetsLoaded.push(s.id);
  }
  await loadImages(Object.values(data.assets.icons).map((p) => './' + p));

  const { save, recovered, corrupted } = await loadSave();
  game.save = save;
  setPersist(persist);
  commit();
  writeBackup(save);
  requestPersistence().then((p) => (game.persisted = p));
  applySettings();

  try {
    const m = await fetch('./precache-manifest.js').then((r) => r.text());
    game.version = Number((m.match(/BURO_VERSION = (\d+)/) || [])[1] || 0);
  } catch {
    /* offline without manifest: fine */
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      persist(game.save);
      flush();
    }
  });
  window.addEventListener('pagehide', () => {
    persist(game.save);
    flush();
  });
  // block pinch/double-tap zoom gestures in standalone mode
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

  registerScreen('hub', hub);
  registerScreen('settings', settings);
  registerScreen('credits', credits);
  registerScreen('map', map);
  registerScreen('room', room);
  registerScreen('runEnd', runEnd);
  registerScreen('daily', daily);
  registerScreen('inventory', inventory);
  registerScreen('combos', combos);
  registerScreen('album', album);
  registerScreen('talents', talents);
  registerScreen('upgrades', upgrades);
  registerScreen('skins', skins);
  hubMenu.push(
    { id: 'daily', label: () => t('hub.daily'), onClick: () => go('daily'), cls: 'yellow', badge: () => (dailyAvailable(game.save, localDate()) ? '!' : null) },
    { id: 'inventory', label: () => t('hub.inventory'), onClick: () => go('inventory'), cls: 'blue' },
    { id: 'album', label: () => t('hub.album'), onClick: () => go('album'), cls: 'blue', badge: () => unplacedCount(game.save, game.data) || null },
    { id: 'combos', label: () => t('hub.combos', { n: game.save.combos.discovered.length, total: game.data.combos.length }), onClick: () => go('combos'), cls: 'blue' },
    { id: 'talents', label: () => t('hub.talents'), onClick: () => go('talents'), cls: 'blue', badge: () => (game.data.talents.some((b) => b.nodes.some((n) => talentStatus(game.save, game.data, n.id).affordable)) ? '!' : null) },
    { id: 'upgrades', label: () => t('hub.upgrades'), onClick: () => go('upgrades'), cls: 'blue' },
    { id: 'skins', label: () => t('hub.skins'), onClick: () => go('skins'), cls: 'blue' },
  );
  // announce newly discovered combos wherever they happen
  onChange((save) => {
    const recent = save.combos.recent || [];
    if (!recent.length) return;
    for (const id of recent) {
      const c = game.data.comboById[id];
      if (c) toast(t('combos.discovered', { name: c.name }), 3000);
    }
    play('level_up', { vol: 0.7 });
    save.combos.recent = [];
  });

  $('#boot').remove();
  $('#app').hidden = false;
  watchLayout(() => rerender());
  // desktop comfort: Esc closes dialogs
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#overlay').classList.contains('show')) closeModal();
  });
  go('hub');
  if (recovered) toast(t('app.saveRecovered'), 3500);
  if (corrupted) toast(t('app.saveCorrupted'), 4000);
  registerSW();
}

boot().catch((e) => {
  console.error(e);
  const b = $('#boot');
  if (b) b.textContent = (game.data.strings ? t('app.bootError') : 'Error') + ' (' + e.message + ')';
});
