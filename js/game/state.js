// Global game state: the save object, loaded data and the commit() that persists after every action.
export const game = {
  save: null,
  data: {},
  persisted: false,
  version: 0,
};

let persistFn = () => {};
const listeners = new Set();

export function setPersist(fn) {
  persistFn = fn;
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Persist synchronously and notify UI. Call after every state-changing action.
export function commit() {
  for (const fn of listeners) {
    try {
      fn(game.save);
    } catch (e) {
      console.error(e);
    }
  }
  persistFn(game.save);
}
