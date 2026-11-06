// Settings: sound, vibration, shake, animation speed, save export/import/reset.
import { h } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { play, setVolume, setIgnoreMute } from '../../core/audio.js';
import { setAnimSpeed } from '../../core/loop.js';
import { exportSave, importSave, newSave } from '../../core/save.js';
import { wipe, writeBackup } from '../../core/storage.js';
import { game, commit } from '../../game/state.js';
import { button, confirm, go, modal, screenHeader, setTopbarTitle, toast, closeModal } from '../app.js';

function toggle(key, label, hint) {
  const s = game.save.settings;
  const b = button(s[key] ? t('common.on') : t('common.off'), () => {
    s[key] = !s[key];
    b.querySelector('span').textContent = s[key] ? t('common.on') : t('common.off');
    b.classList.toggle('green', s[key]);
    b.classList.toggle('grey', !s[key]);
    if (key === 'ignoreMute') setIgnoreMute(s[key]);
    commit();
  }, { cls: (s[key] ? 'green' : 'grey') + ' small', sound: 'toggle' });
  return h('div', null, h('div.setting', null, h('span', { text: label }), b), hint ? h('div.dim', { text: hint }) : null);
}

export function render(root) {
  setTopbarTitle('');
  const s = game.save.settings;
  const vol = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(s.sfx * 100)) });
  vol.addEventListener('input', () => {
    s.sfx = Number(vol.value) / 100;
    setVolume(s.sfx);
  });
  vol.addEventListener('change', () => {
    commit();
    play('tap');
  });

  const speeds = [1, 1.5, 2, 3];
  const seg = h('div.seg');
  const drawSeg = () => {
    seg.replaceChildren(
      ...speeds.map((v) =>
        button('×' + v, () => {
          s.animSpeed = v;
          setAnimSpeed(v);
          commit();
          drawSeg();
        }, { cls: 'small ' + (s.animSpeed === v ? 'on' : 'grey'), sound: 'toggle' }),
      ),
    );
  };
  drawSeg();

  const list = h(
    'div.col',
    null,
    h('div.setting', null, h('span', { text: t('settings.sound') }), vol),
    toggle('ignoreMute', t('settings.ignoreMute'), t('settings.ignoreMuteHint')),
    'vibrate' in navigator ? toggle('vibration', t('settings.vibration')) : null,
    toggle('shake', t('settings.shake')),
    h('div.setting', null, h('span', { text: t('settings.animSpeed') }), seg),
    h('h2', { text: t('settings.saveTitle') }),
    h('div.row', null, button(t('settings.export'), doExport, { cls: 'blue grow' }), button(t('settings.import'), doImport, { cls: 'blue grow' })),
    button(t('settings.reset'), doReset, { cls: 'red block' }),
    h('p.dim', { text: t('settings.storage') + ': ' + (game.persisted ? t('settings.persistOn') : t('settings.persistOff')) }),
    h('p.dim', { text: t('settings.version', { v: game.version || '—' }) }),
  );
  root.append(screenHeader(t('settings.title')), h('div.scroll', null, list));
}

async function copyText(text, ta) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('settings.copied'));
  } catch {
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      toast(t('settings.copied'));
    } catch {
      toast(t('settings.copyFailed'));
    }
  }
}

function saveFileName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `pepsya-dudonya-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

function downloadFile(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: saveFileName() });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// iOS: the share sheet can save to Files, AirDrop or send to yourself. Falls back to copying the text.
async function shareFile(text, ta) {
  const file = new File([text], saveFileName(), { type: 'application/json' });
  try {
    await navigator.share(navigator.canShare && navigator.canShare({ files: [file] }) ? { files: [file] } : { text });
  } catch (e) {
    if (e.name !== 'AbortError') copyText(text, ta);
  }
}

function doExport() {
  const text = exportSave(game.save);
  const ta = h('textarea', { readOnly: true, value: text });
  modal(
    h('div', null, h('h2', { text: t('settings.export') }), h('p', { text: t('settings.exportHint') }), ta),
    [{ label: t('common.close'), value: false, cls: 'grey', sound: 'back' }],
  );
  const acts = document.querySelector('#overlay .actions');
  acts.prepend(
    button(t('settings.copy'), () => copyText(text, ta), { cls: 'green' }),
    navigator.share ? button(t('settings.share'), () => shareFile(text, ta), { cls: 'green' }) : button(t('settings.download'), () => downloadFile(text), { cls: 'green' }),
  );
}

function applyImport(text) {
  try {
    const s = importSave(text);
    writeBackup(game.save); // keep the replaced progress as backup, just in case
    game.save = s;
    commit();
    closeModal();
    applySettings();
    toast(t('settings.importOk'));
    play('confirm_big');
    go('hub');
  } catch (e) {
    play('error');
    toast(String(e.message) === 'newer' ? t('settings.importNewer') : t('settings.importBad'), 3500);
  }
}

function doImport() {
  const ta = h('textarea', { placeholder: '{"game":"buro", …}' });
  const file = h('input.file-pick', { type: 'file', accept: '.json,application/json,text/plain' });
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    try {
      applyImport(await f.text());
    } catch {
      toast(t('settings.fileReadError'), 3500);
    }
  });
  modal(h('div', null, h('h2', { text: t('settings.import') }), h('p', { text: t('settings.importHint') }), ta, file), [
    { label: t('common.cancel'), value: false, cls: 'grey', sound: 'back' },
  ]);
  const acts = document.querySelector('#overlay .actions');
  acts.prepend(button(t('settings.pickFile'), () => file.click(), { cls: 'blue' }));
  acts.append(button(t('settings.importDo'), () => applyImport(ta.value), { cls: 'green' }));
}

async function doReset() {
  if (!(await confirm(t('settings.resetConfirm1'), t('settings.resetYes'), t('common.cancel'), 'red'))) return;
  if (!(await confirm(t('settings.resetConfirm2'), t('settings.resetYes'), t('common.cancel'), 'red'))) return;
  const keep = game.save.settings;
  await wipe();
  game.save = newSave();
  game.save.settings = keep;
  commit();
  toast(t('settings.resetDone'));
  go('hub');
}

export function applySettings() {
  const s = game.save.settings;
  setVolume(s.sfx);
  setAnimSpeed(s.animSpeed);
  setIgnoreMute(s.ignoreMute);
}
