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
      warmCats();
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
  playBuffer(b, { vol, rate, delay });
}

// ---- Cat voices: a big pool of real recordings (assets/cats/index.json, built by tools/prep/fetch_cat_sfx.py).
// Only a small rotating set per group is decoded at a time (iOS memory); every play swaps one clip for a
// fresh random one, so over a session the player hears the whole pool. Missing pool -> fallback sfx.
const CAT_WARM = 6; // decoded clips kept per group
let cats = { groups: {}, core: 0 };
let catBase = './assets/cats/';
const catWarm = new Map(); // group -> [{ name, buf }]
const catLoading = new Set();
const catLast = new Map(); // group -> last played name

export function configureCats(index, base = './assets/cats/') {
  cats = index && index.groups ? index : { groups: {}, core: 0 };
  catBase = base;
  if (ctx) warmCats();
}

export function hasCats(group) {
  return !!(cats.groups[group] && cats.groups[group].length);
}

async function loadCat(group, name) {
  if (!ctx || catLoading.has(name)) return;
  catLoading.add(name);
  try {
    const buf = await decode(catBase + name);
    const warm = catWarm.get(group) || [];
    if (!warm.some((w) => w.name === name)) warm.push({ name, buf });
    while (warm.length > CAT_WARM) warm.splice(warm.findIndex((w) => w.name !== catLast.get(group)), 1);
    catWarm.set(group, warm);
  } catch {
    /* offline and not cached yet: fine, keep what we have */
  } finally {
    catLoading.delete(name);
  }
}

function freshCat(group, preferCore) {
  const list = cats.groups[group] || [];
  if (!list.length) return null;
  const warm = catWarm.get(group) || [];
  const n = preferCore ? Math.min(list.length, cats.core || list.length) : list.length;
  for (let i = 0; i < 8; i++) {
    const [name] = list[Math.floor(Math.random() * n)];
    if (!warm.some((w) => w.name === name) && !catLoading.has(name)) return name;
  }
  return null;
}

function warmCats() {
  for (const group of Object.keys(cats.groups)) {
    // core clips are precached, so the first few always work offline
    for (let i = 0; i < Math.min(3, CAT_WARM); i++) {
      const name = freshCat(group, true);
      if (name) loadCat(group, name);
    }
    for (let i = 3; i < CAT_WARM; i++) {
      const name = freshCat(group, false);
      if (name) loadCat(group, name);
    }
  }
}

// Plays a random clip of a group ('meow', 'kitten', 'trill', 'purr', 'hiss'); falls back to `fallback` sfx.
export function playCat(group, { fallback, vol = 1, rate = 1, delay = 0 } = {}) {
  if (!ctx || volume <= 0) return;
  const warm = (catWarm.get(group) || []).filter((w) => w.name !== catLast.get(group) || catWarm.get(group).length === 1);
  if (!warm.length) {
    if (fallback) play(fallback, { vol, rate, delay });
    if (hasCats(group)) {
      const name = freshCat(group, true);
      if (name) loadCat(group, name);
    }
    return;
  }
  const pick = warm[Math.floor(Math.random() * warm.length)];
  catLast.set(group, pick.name);
  playBuffer(pick.buf, { vol, rate, delay });
  // rotate: drop the clip just played once a new one arrives
  const name = freshCat(group, false);
  if (name) loadCat(group, name);
}

function playBuffer(b, { vol = 1, rate = 1, delay = 0 }) {
  try {
    if (ctx.state !== 'running') ctx.resume();
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
