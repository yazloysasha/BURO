// Web Audio SFX. The AudioContext is created/resumed on the first user gesture (iOS requirement).
// Prefers .m4a, falls back to .mp3 if decoding fails.
let ctx = null;
let master = null;
let index = {};
let base = "./assets/";
const buffers = new Map();
let volume = 0.8;
let unlocked = false;
let loading = null;
let ignoreMute = true;

export function configure(sfxIndex, assetBase = "./assets/") {
  index = sfxIndex || {};
  base = assetBase;
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = volume;
}

export function setIgnoreMute(on) {
  ignoreMute = !!on;
  applySession();
}

function applySession() {
  try {
    // 'playback' makes iOS play sound even with the silent switch on
    if (navigator.audioSession)
      navigator.audioSession.type = ignoreMute ? "playback" : "ambient";
  } catch {
    /* unsupported */
  }
}

async function decode(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url);
  const ab = await r.arrayBuffer();
  return await new Promise((resolve, reject) => {
    // callback form for older Safari
    const p = ctx.decodeAudioData(ab, resolve, reject);
    if (p && p.then) p.then(resolve, reject);
  });
}

async function loadOne(name) {
  const e = index[name];
  if (!e) return null;
  try {
    return await decode(base + e.m4a);
  } catch {
    try {
      return await decode(base + e.mp3);
    } catch (err) {
      console.warn("sfx failed", name, err);
      return null;
    }
  }
}

function loadAll() {
  if (!loading) {
    loading = Promise.all(
      Object.keys(index).map(async (name) => {
        const b = await loadOne(name);
        if (b) buffers.set(name, b);
      }),
    );
  }
  return loading;
}

export function unlock() {
  if (unlocked && ctx && ctx.state === "running") return;
  try {
    applySession();
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      // a silent buffer kicks iOS into playing state
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(master);
      s.start(0);
      loadAll();
    }
    if (ctx.state !== "running") ctx.resume();
    unlocked = true;
  } catch (e) {
    console.warn("audio unlock failed", e);
  }
}

export function play(name, { vol = 1, rate = 1, delay = 0 } = {}) {
  if (!ctx || volume <= 0) return;
  const b = buffers.get(name);
  if (!b) return;
  try {
    if (ctx.state !== "running") ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(master);
    src.start(ctx.currentTime + delay);
  } catch {
    /* ignore */
  }
}

export function installUnlock(target = window) {
  const handler = () => unlock();
  target.addEventListener("pointerdown", handler, { capture: true });
  target.addEventListener("touchend", handler, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      ctx &&
      ctx.state !== "running"
    )
      ctx.resume().catch(() => {});
  });
}
