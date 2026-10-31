// Browser persistence: localStorage (synchronous, primary) + IndexedDB mirror + rolling backup.
// Every game action calls persist(); localStorage.setItem is synchronous, so a kill right after an action keeps it.
import { parseSave, serializeSave, newSave } from './save.js';

const KEY = 'buro.save';
const BAK = 'buro.save.bak';
const DB_NAME = 'buro';
const STORE = 'save';

let dbPromise = null;
let writeCount = 0;
let idbTimer = null;
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

async function idbPut(key, value) {
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
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

function tryParse(text) {
  if (!text) return null;
  try {
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
  const candidates = [];
  const primary = tryParse(lsGet(KEY));
  if (primary) candidates.push(primary);
  const mirror = tryParse(await idbGet(KEY));
  if (mirror) candidates.push(mirror);
  let recovered = false;
  if (!candidates.length) {
    const bak = tryParse(lsGet(BAK)) || tryParse(await idbGet(BAK));
    if (bak) {
      candidates.push(bak);
      recovered = !!(lsGet(KEY) || (await idbGet(KEY)));
    }
  }
  if (!candidates.length) {
    const raw = lsGet(KEY) || lsGet(BAK);
    const hadData = !!raw;
    // keep the unreadable save around so it can still be rescued by hand
    if (hadData) lsSet('buro.save.corrupt', raw);
    return { save: newSave(), fresh: !hadData, recovered: false, corrupted: hadData };
  }
  candidates.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return { save: candidates[0], fresh: false, recovered, corrupted: false };
}

export function persist(save) {
  save.updatedAt = new Date().toISOString();
  const text = serializeSave(save);
  const ok = lsSet(KEY, text);
  writeCount++;
  if (writeCount % 10 === 1) {
    lsSet(BAK, text);
    idbPut(BAK, text);
  }
  // IndexedDB mirror is async; coalesce bursts of actions into one write
  pendingIdb = text;
  if (!idbTimer) {
    idbTimer = setTimeout(() => {
      idbTimer = null;
      const t = pendingIdb;
      pendingIdb = null;
      if (t) idbPut(KEY, t);
    }, 150);
  }
  return ok;
}

// Called when the page is hidden: flush the IDB mirror immediately.
export function flush() {
  if (pendingIdb) {
    const t = pendingIdb;
    pendingIdb = null;
    clearTimeout(idbTimer);
    idbTimer = null;
    idbPut(KEY, t);
  }
}

export function writeBackup(save) {
  const text = serializeSave(save);
  lsSet(BAK, text);
  idbPut(BAK, text);
}

export async function wipe() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(BAK);
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
