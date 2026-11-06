// The backroom: one familiar room walked through in loops. Each loop it is either exactly as always or has one anomaly.
// Nothing on screen says which; the player decides: go on ("forward") or turn back ("back"). A right call advances the
// loop counter, a wrong one resets it. Pure; randomness through the given Rng. Used by the map room and the night shift.

export const ANOMALY_CHANCE = 0.55;

const sceneAnomalies = (data) => data.anomalies.filter((a) => !a.where);

// Scene objects with an anomaly's ops applied (props override, extra objects appended).
export function sceneWith(data, anomalyId) {
  const objs = data.backroom.objects.map((o) => ({ ...o }));
  const a = anomalyId && data.anomalies.find((x) => x.id === anomalyId);
  if (!a) return objs;
  for (const op of a.ops) {
    if (op.op === 'set') {
      const o = objs.find((x) => x.id === op.target);
      if (o) Object.assign(o, op.props);
    } else if (op.op === 'add') objs.push({ ...op.object });
  }
  return objs;
}

// loops: right calls needed in a row; maxLevel: subtlety allowed (1 obvious .. 3 subtle).
export function newBackroom({ loops = 3, maxLevel = 3, firstVisit = false, hints = 0, maxCalls = loops * 3 + 2 } = {}) {
  return { loops, maxLevel, at: 0, mistakes: 0, calls: 0, maxCalls, cur: null, used: [], last: null, done: false, firstVisit, hints };
}

// Rolls what the next loop holds. The very first loop of the very first visit is always the normal room, to learn it.
export function rollLoop(state, rng, data, save) {
  if (state.firstVisit && state.calls === 0) {
    state.cur = null;
    return state;
  }
  if (!rng.chance(ANOMALY_CHANCE)) {
    state.cur = null;
    return state;
  }
  const found = (save && save.collection.anomalies) || {};
  const pool = sceneAnomalies(data).filter((a) => a.level <= state.maxLevel && !state.used.includes(a.id));
  if (!pool.length) {
    state.cur = null;
    return state;
  }
  // unseen ones a little more often, so the collection keeps moving
  const a = rng.weighted(pool, (x) => (found[x.id] ? 1 : 1.6));
  state.cur = a.id;
  state.used.push(a.id);
  return state;
}

// choice: 'forward' | 'back'. Returns {correct, anomaly, caught, done}.
export function callLoop(state, save, choice, rng, data) {
  if (state.done) return null;
  const anomaly = state.cur;
  const correct = (choice === 'back') === !!anomaly;
  state.calls++;
  if (correct) state.at++;
  else {
    state.at = 0;
    state.mistakes++;
  }
  const caught = correct && !!anomaly;
  if (caught) {
    const col = (save.collection.anomalies = save.collection.anomalies || {});
    col[anomaly] = (col[anomaly] || 0) + 1;
  }
  state.last = { correct, anomaly: caught ? anomaly : null, missed: !correct && !!anomaly, falseAlarm: !correct && !anomaly };
  if (state.hints && anomaly) state.hints--;
  state.done = state.at >= state.loops || state.calls >= state.maxCalls;
  if (!state.done) rollLoop(state, rng, data, save);
  else state.cur = null;
  return { correct, anomaly, caught, done: state.done };
}

// How the walk went: 'perfect' (no mistakes), 'good' (a couple), 'rough' (finished, many), 'lost' (ran out of calls).
export function backroomGrade(state) {
  if (state.at < state.loops) return 'lost';
  if (!state.mistakes) return 'perfect';
  return state.mistakes <= 2 ? 'good' : 'rough';
}

export function anomaliesFound(save, data) {
  const col = save.collection.anomalies || {};
  return data.anomalies.filter((a) => col[a.id]).length;
}

// ---------- the Lavka itself, rarely ----------
// Some nights one of the hub anomalies quietly shows up in the Lavka. Fixed per day and per run count, so reloading
// doesn't reroll it; nothing announces it, the player has to notice.
export function hubAnomaly(save, data, today, hash) {
  if (save.meta.runsStarted < 2) return null;
  const list = data.anomalies.filter((a) => a.where === 'hub');
  const seed = hash(today + ':' + save.meta.runsStarted + ':hub');
  if (seed % 100 >= data.balance.hubAnomalyPct) return null;
  const a = list[seed % list.length];
  const seen = save.meta.hubAnomalyDay || {};
  return seen[a.id] === today ? null : a;
}

export function catchHubAnomaly(save, data, id, today) {
  const a = data.anomalies.find((x) => x.id === id && x.where === 'hub');
  if (!a) return null;
  save.meta.hubAnomalyDay = { ...(save.meta.hubAnomalyDay || {}), [id]: today };
  const col = (save.collection.anomalies = save.collection.anomalies || {});
  const first = !col[id];
  col[id] = (col[id] || 0) + 1;
  const sparkles = first ? 5 : 1;
  save.meta.sparkles += sparkles;
  return { first, sparkles };
}
