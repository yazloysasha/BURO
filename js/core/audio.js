// Web Audio needs a user gesture before it can start on mobile browsers.
let ctx = null;
let effects = null;
let music = null;
let musicSource = null;
let index = {};
let base = './assets/';
let voices = {};
let voiceBase = './assets/cats/';
let musicPath = '';
let volume = 0.8;
let musicVolume = 0.35;
let ignoreMute = true;
const buffers = new Map();
const lastVoice = new Map();

export function configure(sfxIndex, assetBase, soundtrack) {
  index = sfxIndex || {};
  base = assetBase;
  musicPath = soundtrack;
}

export function configureCats(index, assetBase) {
  voices = index.groups || {};
  voiceBase = assetBase;
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (effects) effects.gain.value = volume;
}

export function setMusicVolume(v) {
  musicVolume = Math.max(0, Math.min(1, v));
  if (music) music.gain.value = musicVolume;
  if (musicVolume) startMusic();
  else stopMusic();
}

export function setIgnoreMute(on) {
  ignoreMute = !!on;
  applySession();
}

function applySession() {
  try {
    if (navigator.audioSession) {
      navigator.audioSession.type = ignoreMute ? 'playback' : 'ambient';
    }
  } catch {
    // Audio Session API is optional.
  }
}

function load(paths) {
  if (!buffers.has(paths[0])) {
    const context = ctx;
    const pending = (async () => {
      for (const path of paths) {
        try {
          const response = await fetch(path);
          if (response.ok) return await context.decodeAudioData(await response.arrayBuffer());
        } catch {
          // Try the alternate encoding.
        }
      }
      if (buffers.get(paths[0]) === pending) buffers.delete(paths[0]);
      return null;
    })();
    buffers.set(paths[0], pending);
  }
  return buffers.get(paths[0]);
}

function startMusic() {
  if (!ctx || !musicPath || !musicVolume || document.hidden || musicSource || ctx.state !== 'running') return;
  const context = ctx;
  load([musicPath]).then((buffer) => {
    if (!buffer || ctx !== context || musicSource || document.hidden || !musicVolume || context.state !== 'running') return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(music);
    source.start();
    musicSource = source;
  });
}

function stopMusic() {
  if (!musicSource) return;
  musicSource.stop();
  musicSource.disconnect();
  musicSource = null;
}

function resume() {
  if (!ctx || ctx.state === 'closed' || document.hidden) return;
  if (ctx.state === 'running') {
    startMusic();
    return;
  }
  applySession();
  return ctx.resume().then(startMusic).catch(() => {});
}

export function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx || ctx.state === 'closed') {
    const isFirstContext = !ctx;
    applySession();
    ctx = new AC();
    if (!isFirstContext) {
      buffers.clear();
      musicSource = null;
    }
    effects = ctx.createGain();
    effects.gain.value = volume;
    effects.connect(ctx.destination);
    music = ctx.createGain();
    music.gain.value = musicVolume;
    music.connect(ctx.destination);

    // A silent source helps older iOS versions unlock output on the first tap.
    const silent = ctx.createBufferSource();
    silent.buffer = ctx.createBuffer(1, 1, 22050);
    silent.connect(effects);
    silent.start();
  }
  resume();
}

export function play(name, options = {}) {
  const entry = index[name];
  if (!entry || !ctx || !volume) return;
  playWhenReady([base + entry.m4a, base + entry.mp3], options);
}

export function playCat(group, options = {}) {
  const clips = voices[group];
  if (!clips?.length || !ctx || !volume) return;
  const choices = clips.length === 1 ? clips : clips.filter((name) => name !== lastVoice.get(group));
  const name = choices[Math.floor(Math.random() * choices.length)];
  lastVoice.set(group, name);
  playWhenReady([voiceBase + name], { ...options, maxWait: 1500 });
}

function playWhenReady(paths, { vol = 1, rate = 1, delay = 0, maxWait = 500 } = {}) {
  const context = ctx;
  const started = performance.now();
  const ready = context.state === 'running' ? null : resume();
  Promise.all([load(paths), ready]).then(([buffer]) => {
    if (!buffer || ctx !== context || document.hidden || context.state !== 'running' || !volume) return;
    if (performance.now() - started > maxWait) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = context.createGain();
    gain.gain.value = vol;
    source.connect(gain);
    gain.connect(effects);
    source.start(context.currentTime + delay);
  });
}

export function installUnlock(target = window) {
  for (const event of ['pointerdown', 'touchend', 'click', 'keydown']) {
    target.addEventListener(event, unlock, { capture: true });
  }
  target.addEventListener('pageshow', resume);
  target.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (ctx?.state === 'running') {
        ctx.suspend().then(() => {
          if (!document.hidden) resume();
        }).catch(() => {});
      }
    } else resume();
  });
}
