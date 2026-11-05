// Browser persistence: localStorage (synchronous, primary) + IndexedDB mirror + rolling backup.
// Every game action calls persist(). Browsers buffer localStorage on its way to disk (Chromium rate-limits those
// commits to about once a minute under load), so a hard kill can lose it; the IndexedDB mirror is written at once and
// load takes whichever copy is newest. Every copy carries a checksum (see sealSave).
import { parseSave, serializeSave, sealSave, unsealSave, newerSave, validateSave, newSave } from './save.js';

const KEY = 'buro.save';
const BAK = 'buro.save.bak';
const DB_NAME = 'buro';
const STORE = 'save';

let dbPromise = null;
let writeCount = 0;
let idbBusy = false;
let pendingIdb = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (!('indexedDB' in self)) return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function idbGet(key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(key, value, durability = 'relaxed') {
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite', { durability });
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function tryParse(stored) {
  if (!stored) return null;
  try {
    const text = unsealSave(stored);
    if (text === null) throw new Error('checksum mismatch');
    return parseSave(text);
  } catch (e) {
    console.warn('save parse failed', e);
    return null;
  }
}

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch {
    /* not supported */
  }
  return false;
}

// Load the newest valid save among localStorage, IndexedDB and the backup. Never throws.
export async function loadSave() {
  const lsRaw = lsGet(KEY);
  const idbRaw = await idbGet(KEY);
  const primary = tryParse(lsRaw);
  const mirror = tryParse(idbRaw);
  let damaged = (lsRaw && !primary) || (idbRaw && !mirror);
  let best = primary && mirror ? newerSave(primary, mirror) : primary || mirror;
  let recovered = !!(damaged && best);
  if (!best) {
    best = tryParse(lsGet(BAK)) || tryParse(await idbGet(BAK));
    recovered = !!(best && damaged);
  }
  if (!best) {
    const raw = lsRaw || idbRaw || lsGet(BAK);
    // keep the unreadable save around so it can still be rescued by hand
    if (raw) lsSet('buro.save.corrupt', raw);
    return { save: newSave(), fresh: !raw, recovered: false, corrupted: !!raw };
  }
  return { save: best, fresh: false, recovered, corrupted: false };
}

// One write in flight at a time, always the latest state: nothing waits on a timer, bursts collapse naturally.
function mirror(sealed) {
  pendingIdb = sealed;
  if (idbBusy) return;
  idbBusy = true;
  (async () => {
    while (pendingIdb) {
      const t = pendingIdb;
      pendingIdb = null;
      await idbPut(KEY, t);
    }
    idbBusy = false;
  })();
}

// Synchronous for localStorage, immediate for IndexedDB. Returns false if nothing could be stored.
export function persist(save) {
  // a save that fails validation must never overwrite a good one
  const problems = validateSave(save);
  if (problems.length) {
    console.error('refusing to store a broken save', problems);
    return false;
  }
  save.seq = (save.seq || 0) + 1;
  save.updatedAt = new Date().toISOString();
  const sealed = sealSave(serializeSave(save));
  let ok = lsSet(KEY, sealed) && lsGet(KEY) === sealed;
  if (!ok) {
    // storage full: drop the rescue copy and try once more
    try {
      localStorage.removeItem('buro.save.corrupt');
    } catch {
      /* ignore */
    }
    ok = lsSet(KEY, sealed);
  }
  writeCount++;
  if (writeCount % 10 === 1) {
    lsSet(BAK, sealed);
    idbPut(BAK, sealed);
  }
  mirror(sealed);
  return ok;
}

// Page is going away: store everything once more and ask for a durable IndexedDB commit.
export function flush(save) {
  if (!save) return;
  persist(save);
  pendingIdb = null;
  idbPut(KEY, lsGet(KEY) || sealSave(serializeSave(save)), 'strict');
}

export function writeBackup(save) {
  const sealed = sealSave(serializeSave(save));
  lsSet(BAK, sealed);
  idbPut(BAK, sealed);
}

export async function wipe() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(BAK);
    localStorage.removeItem('buro.save.corrupt');
  } catch {
    /* ignore */
  }
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
