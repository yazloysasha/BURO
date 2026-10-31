// Boot: load data + assets + save, wire audio and persistence, show the hub.
import { $, h } from './core/dom.js';
import { setStrings, t } from './core/i18n.js';
import { loadJSON, loadSheet, loadImages } from './core/assets.js';
import { configure as configureAudio, installUnlock } from './core/audio.js';
import { loadSave, persist, requestPersistence, flush, writeBackup } from './core/storage.js';
import { game, setPersist, commit } from './game/state.js';
import { registerScreen, go, toast, button } from './ui/app.js';
import { applySettings } from './ui/screens/settings.js';
import * as hub from './ui/screens/hub.js';
import * as settings from './ui/screens/settings.js';
import * as credits from './ui/screens/credits.js';

const DATA_FILES = ['strings.ru', 'assets', 'credits'];

async function loadData() {
  const entries = await Promise.all(DATA_FILES.map(async (n) => [n, await loadJSON(`./data/${n}.json`)]));
  const d = Object.fromEntries(entries);
  d.strings = d['strings.ru'];
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
  game.data = data;

  const sfxIndex = await loadJSON('./' + data.assets.sfxIndex);
  configureAudio(sfxIndex, './assets/');
  installUnlock();

  await Promise.all(Object.entries(data.assets.sheets).map(([k, url]) => loadSheet(k, './' + url)));
  data.sheetsLoaded = Object.keys(data.assets.sheets);
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

  $('#boot').remove();
  $('#app').hidden = false;
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
