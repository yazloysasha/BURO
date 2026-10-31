// Turn-based combat engine. Pure and deterministic: state + actions + RNG -> new state + event log.
// The UI only animates the events; the state is persisted before any animation plays.

export const CAT_KEYS = ['peposya', 'dudonya'];

// ---------- stats ----------
function statusDef(ctx, id) {
  return ctx.statuses[id] || {};
}

export function effAtk(u, ctx) {
  let m = 1;
  for (const s of u.statuses) m *= statusDef(ctx, s.id).atkMult || 1;
  return u.atk * m;
}

export function effSpd(u, ctx) {
  let v = u.spd;
  for (const s of u.statuses) v += statusDef(ctx, s.id).spd || 0;
  return v;
}

function effCrit(u, ctx) {
  let v = u.crit || 0;
  v += (u.luck || 0) * (ctx.balance.luckCrit || 0);
  for (const s of u.statuses) v += statusDef(ctx, s.id).critAdd || 0;
  return Math.min(0.9, v);
}

function effEvade(u, ctx) {
  if (u.statuses.some((s) => statusDef(ctx, s.id).noEvade)) return 0;
  let v = u.evasion || 0;
  v += (u.luck || 0) * (ctx.balance.luckEvade || 0);
  for (const s of u.statuses) v += statusDef(ctx, s.id).evadeAdd || 0;
  return Math.min(0.6, v);
}

export function hasStatus(u, id) {
  return u.statuses.some((s) => s.id === id);
}

function addStatus(u, id, turns) {
  const cur = u.statuses.find((s) => s.id === id);
  // statuses applied this round don't tick down at its end, so "turns" counts full rounds after this one
  if (cur) {
    cur.turns = Math.max(cur.turns, turns);
    cur.fresh = true;
  } else u.statuses.push({ id, turns, fresh: true });
}

// Core damage formula (exported for tests).
// power: move multiplier; opts.critMult overrides; opts.noMiss skips evasion; opts.dmgMult extra multiplier
export function computeDamage(att, target, power, rng, ctx, opts = {}) {
  const bal = ctx.balance;
  if (!opts.noMiss && rng.next() < effEvade(target, ctx)) return { miss: true, dmg: 0, crit: false, blocked: 0 };
  const [vmin, vmax] = bal.variance;
  const variance = vmin + rng.next() * (vmax - vmin);
  let raw = effAtk(att, ctx) * power * variance * (opts.dmgMult || 1);
  const crit = rng.next() < effCrit(att, ctx) + (opts.critAdd || 0);
  if (crit) raw *= opts.critMult || bal.critMult;
  let dmg = Math.max(1, Math.round(raw) - (target.def || 0));
  const blocked = Math.min(target.block || 0, dmg);
  return { miss: false, dmg: dmg - blocked, crit, blocked, raw: dmg };
}

function applyDamage(target, res) {
  target.block = Math.max(0, (target.block || 0) - res.blocked);
  target.hp = Math.max(0, target.hp - res.dmg);
}

// ---------- construction ----------
export function makeCatUnit(key, def, runCat, bonus = {}) {
  const s = def.stats;
  return {
    side: 'cat',
    key,
    uid: key,
    name: def.name,
    maxHp: runCat.maxHp,
    hp: runCat.hp,
    atk: s.atk + (bonus.atk || 0),
    def: s.def + (bonus.def || 0),
    spd: s.spd + (bonus.spd || 0),
    luck: s.luck + (bonus.luck || 0),
    crit: s.crit + (bonus.crit || 0),
    evasion: 0.03,
    block: 0,
    statuses: (runCat.statuses || []).map((x) => ({ ...x })),
    cooldown: 0,
    ko: runCat.hp <= 0,
  };
}

export function makeEnemyUnit(def, uid, { floor = 1, tier = 1, elite = false, eliteName = null, balance }) {
  const sc = balance.enemyScale;
  const mult = def.boss ? 1 + sc.perTier * (tier - 1) : 1 + sc.perFloor * (floor - 1) + sc.perTier * (tier - 1);
  const hpMult = mult * (elite ? balance.elite.hp : 1);
  const atkMult = (def.boss ? 1 + 0.12 * (tier - 1) : 1 + (sc.perFloor * (floor - 1)) / 2 + (sc.perTier * (tier - 1)) / 2) * (elite ? balance.elite.atk : 1);
  const hp = Math.round(def.hp * hpMult);
  return {
    side: 'enemy',
    id: def.id,
    uid,
    name: eliteName || def.name,
    sprite: def.sprite,
    elite,
    boss: !!def.boss,
    maxHp: hp,
    hp,
    atk: Math.max(1, Math.round(def.atk * atkMult)),
    def: def.def,
    spd: def.spd,
    luck: 0,
    crit: 0.05,
    evasion: def.evasion || 0,
    block: 0,
    statuses: [],
    phase: 0,
    intent: null,
    lastMove: null,
  };
}

export function createCombat({ cats, enemies, kind = 'combat' }) {
  return { kind, round: 1, cats, enemies, nextUid: enemies.length + 1, over: null, seq: { peposya: [], dudonya: [] }, kills: [] };
}

export const aliveEnemies = (c) => c.enemies.filter((e) => e.hp > 0);
export const aliveCats = (c) => c.cats.filter((u) => !u.ko && u.hp > 0);
export const catByKey = (c, key) => c.cats.find((u) => u.key === key);

// ---------- intents ----------
function movesOf(enemy, ctx) {
  const def = ctx.enemies[enemy.id];
  if (def.phases) return def.phases[enemy.phase].moves;
  return def.moves;
}

function minionCount(c) {
  return c.enemies.filter((e) => e.hp > 0 && e.summoned).length;
}

export function planIntents(c, rng, ctx) {
  for (const e of aliveEnemies(c)) {
    let moves = movesOf(e, ctx).filter((m) => {
      if (m.type === 'summon') return minionCount(c) < (m.max || 2) && aliveEnemies(c).length < 4;
      if (m.type === 'heal') return e.hp < e.maxHp;
      if (m.type === 'defend' && e.lastMove === 'defend') return false;
      return true;
    });
    if (!moves.length) moves = [{ type: 'attack', power: 1, w: 1 }];
    const m = rng.weighted(moves, (x) => x.w || 1);
    const intent = { ...m };
    delete intent.w;
    if (m.type === 'attack' || m.type === 'debuff') {
      const targets = aliveCats(c);
      if (targets.length) intent.target = rng.pick(targets).key;
    }
    e.intent = intent;
  }
}

// Expected damage of an attack intent against its target (for the UI preview).
export function intentPreview(c, e, ctx) {
  const it = e.intent;
  if (!it) return null;
  if (it.type === 'attack' || it.type === 'attack_all' || (it.type === 'debuff' && it.power)) {
    const tgt = it.target ? catByKey(c, it.target) : aliveCats(c)[0];
    const def = tgt ? tgt.def : 0;
    return Math.max(1, Math.round(effAtk(e, ctx) * (it.power || 1)) - def);
  }
  if (it.type === 'defend') return it.block;
  return null;
}

// ---------- round resolution ----------
// actions: { peposya: {action:'bite', target:uid, itemUid?}, dudonya: {...} }
// hooks (optional): { useItem(catKey, itemUid) -> effect|null, onCatAction(catKey, actionId, events), damageMult(catKey, actionId) }
export function resolveRound(c, actions, rng, ctx, hooks = {}) {
  const ev = [];
  if (c.over) return ev;
  const catDefs = ctx.cats;
  if (hooks.onRoundStart) hooks.onRoundStart(c, ev);

  // priority: shields & defend intents happen before anyone moves
  for (const u of aliveCats(c)) {
    const a = actions[u.key];
    const ad = a && catDefs[u.key].actions[a.action];
    if (ad && ad.priority && ad.type === 'shield' && !hasStatus(u, 'sleepy')) {
      u.block += ad.value;
      ev.push({ type: 'act', actor: u.uid, action: a.action });
      ev.push({ type: 'block', target: u.uid, amount: ad.value });
      if (ad.ally) {
        for (const o of aliveCats(c)) if (o !== u) {
          o.block += ad.ally;
          ev.push({ type: 'block', target: o.uid, amount: ad.ally });
        }
      }
      a.done = true;
      recordAction(c, u.key, a.action, ev, hooks);
    }
  }
  for (const e of aliveEnemies(c)) {
    if (e.intent && e.intent.type === 'defend' && !hasStatus(e, 'sleepy')) {
      e.block += e.intent.block;
      ev.push({ type: 'block', target: e.uid, amount: e.intent.block });
      e.intent.done = true;
    }
  }

  const order = [...aliveCats(c), ...aliveEnemies(c)]
    .map((u, idx) => ({ u, idx, spd: effSpd(u, ctx) }))
    .sort((a, b) => b.spd - a.spd || (a.u.side === b.u.side ? a.idx - b.idx : a.u.side === 'cat' ? -1 : 1))
    .map((x) => x.u);

  for (const u of order) {
    if (c.over) break;
    if (u.hp <= 0 || u.ko) continue;
    if (hasStatus(u, 'sleepy')) {
      u.statuses = u.statuses.filter((x) => x.id !== 'sleepy'); // sleeping through one action wakes you up
      ev.push({ type: 'skip', actor: u.uid, reason: 'sleepy' });
      continue;
    }
    if (u.side === 'cat') {
      const a = actions[u.key];
      if (!a || a.done) continue;
      catAct(c, u, a, rng, ctx, ev, hooks);
    } else if (u.intent && !u.intent.done) {
      enemyAct(c, u, rng, ctx, ev);
    }
    checkOver(c, ev);
  }

  if (!c.over) endOfRound(c, rng, ctx, ev);
  return ev;
}

function recordAction(c, key, action, ev, hooks) {
  c.seq[key].push(action);
  if (c.seq[key].length > 6) c.seq[key].shift();
  if (hooks.onCatAction) hooks.onCatAction(key, action, ev, c);
}

function retarget(c, uid) {
  const alive = aliveEnemies(c);
  return alive.find((e) => e.uid === uid) || alive[0];
}

function hit(c, att, target, power, rng, ctx, ev, opts = {}) {
  const res = computeDamage(att, target, power, rng, ctx, opts);
  if (res.miss) {
    ev.push({ type: 'miss', actor: att.uid, target: target.uid });
    return res;
  }
  applyDamage(target, res);
  ev.push({ type: 'damage', actor: att.uid, target: target.uid, amount: res.dmg, crit: res.crit, blocked: res.blocked, hp: target.hp });
  if (target.hp <= 0) onDeath(c, target, ev, ctx);
  else if (target.boss) checkPhase(target, ctx, ev);
  return res;
}

function onDeath(c, u, ev) {
  if (u.side === 'enemy') {
    ev.push({ type: 'death', target: u.uid });
    c.kills.push(u.id);
    // who landed the final blow (for kill combos)
    if (c.cur) (c.killLog = c.killLog || []).push({ enemy: u.id, ...c.cur });
  } else {
    u.ko = true;
    u.statuses = [];
    ev.push({ type: 'ko', target: u.uid });
  }
}

function checkPhase(boss, ctx, ev) {
  const def = ctx.enemies[boss.id];
  if (!def.phases) return;
  const ratio = boss.hp / boss.maxHp;
  for (let p = def.phases.length - 1; p > boss.phase; p--) {
    if (ratio <= def.phases[p].from) {
      boss.phase = p;
      ev.push({ type: 'phase', target: boss.uid, phase: p });
      if (def.phases[p].enterStatus) {
        addStatus(boss, def.phases[p].enterStatus, 99);
        ev.push({ type: 'status', target: boss.uid, status: def.phases[p].enterStatus });
      }
      break;
    }
  }
}

function catAct(c, u, a, rng, ctx, ev, hooks) {
  const ad = ctx.cats[u.key].actions[a.action];
  if (!ad) return;
  if (a.action === 'special') {
    if (u.cooldown > 0) return;
    u.cooldown = ad.cooldown || 3;
  }
  const mult = hooks.damageMult ? hooks.damageMult(u.key, a.action, c) : 1;
  c.actionNo = (c.actionNo || 0) + 1;
  c.cur = { cat: u.key, action: a.action, n: c.actionNo, item: null };
  ev.push({ type: 'act', actor: u.uid, action: a.action });
  if (mult !== 1 && hooks.lastCombo) ev.push({ type: 'combo', id: hooks.lastCombo });
  switch (ad.type) {
    case 'attack': {
      const t = retarget(c, a.target);
      if (t) hit(c, u, t, ad.power, rng, ctx, ev, { dmgMult: mult });
      break;
    }
    case 'attack_all':
      for (const t of aliveEnemies(c)) hit(c, u, t, ad.power, rng, ctx, ev, { dmgMult: mult });
      break;
    case 'debuff': {
      const t = retarget(c, a.target);
      if (t) {
        addStatus(t, ad.status, ad.turns);
        ev.push({ type: 'status', target: t.uid, status: ad.status });
      }
      break;
    }
    case 'debuff_all':
      for (const t of aliveEnemies(c)) {
        addStatus(t, ad.status, ad.turns);
        ev.push({ type: 'status', target: t.uid, status: ad.status });
      }
      break;
    case 'heal': {
      const tgt = aliveCats(c).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
      if (tgt) heal(tgt, Math.round((ad.value + (u.luck || 0) * 0.5) * mult), ev);
      break;
    }
    case 'shield':
      u.block += ad.value;
      ev.push({ type: 'block', target: u.uid, amount: ad.value });
      break;
    case 'buff_party':
      for (const t of aliveCats(c)) {
        if (ad.cleanse) t.statuses = t.statuses.filter((s) => statusDef(ctx, s.id).kind !== 'debuff');
        addStatus(t, ad.status, ad.turns);
        ev.push({ type: 'status', target: t.uid, status: ad.status });
      }
      break;
    case 'item': {
      const eff = hooks.useItem ? hooks.useItem(u.key, a.itemUid) : null;
      if (eff) {
        c.cur.item = eff.itemId || null;
        applyItemEffect(c, u, eff, a, rng, ctx, ev);
      }
      break;
    }
    default:
      break;
  }
  c.cur = null;
  recordAction(c, u.key, a.action, ev, hooks);
}

function heal(t, amount, ev) {
  const before = t.hp;
  t.hp = Math.min(t.maxHp, t.hp + amount);
  ev.push({ type: 'heal', target: t.uid, amount: t.hp - before, hp: t.hp });
}

// Consumable effects: {type:'heal'|'heal_all'|'damage'|'damage_all'|'status_enemy'|'buff'|'cleanse'|'revive'|'block', value, status, turns}
export function applyItemEffect(c, u, eff, a, rng, ctx, ev) {
  ev.push({ type: 'item', actor: u.uid, item: eff.itemId || null });
  if (eff.selfDamage && u.hp > 0) {
    // cursed items bite back, but never knock a cat out
    const dmg = Math.min(eff.selfDamage, u.hp - 1);
    u.hp -= dmg;
    if (dmg > 0) ev.push({ type: 'damage', actor: u.uid, target: u.uid, amount: dmg, crit: false, blocked: 0, hp: u.hp, cursed: true });
  }
  const ally = () => (a.allyTarget ? catByKey(c, a.allyTarget) : null);
  switch (eff.type) {
    case 'heal': {
      const t = ally() && !ally().ko ? ally() : aliveCats(c).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
      if (t) heal(t, eff.value, ev);
      break;
    }
    case 'heal_all':
      for (const t of aliveCats(c)) heal(t, eff.value, ev);
      break;
    case 'revive': {
      const t = c.cats.find((x) => x.ko) || null;
      if (t) {
        t.ko = false;
        t.hp = 0;
        heal(t, Math.max(1, Math.round(t.maxHp * (eff.value || 0.3))), ev);
        ev.push({ type: 'revive', target: t.uid });
      } else {
        for (const x of aliveCats(c)) heal(x, 5, ev);
      }
      break;
    }
    case 'damage': {
      const t = retarget(c, a.target);
      if (t) {
        const res = { miss: false, dmg: Math.max(1, eff.value - Math.floor((t.def || 0) / 2)), crit: false, blocked: 0 };
        res.blocked = Math.min(t.block || 0, res.dmg);
        res.dmg -= res.blocked;
        applyDamage(t, res);
        ev.push({ type: 'damage', actor: u.uid, target: t.uid, amount: res.dmg, crit: false, blocked: res.blocked, hp: t.hp });
        if (t.hp <= 0) onDeath(c, t, ev, ctx);
        else if (t.boss) checkPhase(t, ctx, ev);
      }
      break;
    }
    case 'damage_all':
      for (const t of aliveEnemies(c)) {
        const dmg = Math.max(1, eff.value - Math.floor((t.def || 0) / 2));
        const blocked = Math.min(t.block || 0, dmg);
        applyDamage(t, { dmg: dmg - blocked, blocked });
        ev.push({ type: 'damage', actor: u.uid, target: t.uid, amount: dmg - blocked, crit: false, blocked, hp: t.hp });
        if (t.hp <= 0) onDeath(c, t, ev, ctx);
        else if (t.boss) checkPhase(t, ctx, ev);
      }
      break;
    case 'status_enemy': {
      const targets = eff.all ? aliveEnemies(c) : [retarget(c, a.target)].filter(Boolean);
      for (const t of targets) {
        addStatus(t, eff.status, eff.turns || 2);
        ev.push({ type: 'status', target: t.uid, status: eff.status });
      }
      break;
    }
    case 'buff': {
      const targets = eff.all ? aliveCats(c) : [ally() || u];
      for (const t of targets) {
        addStatus(t, eff.status, eff.turns || 2);
        ev.push({ type: 'status', target: t.uid, status: eff.status });
      }
      break;
    }
    case 'block':
      for (const t of eff.all ? aliveCats(c) : [u]) {
        t.block += eff.value;
        ev.push({ type: 'block', target: t.uid, amount: eff.value });
      }
      break;
    case 'cleanse':
      for (const t of aliveCats(c)) {
        t.statuses = t.statuses.filter((s) => statusDef(ctx, s.id).kind !== 'debuff');
        ev.push({ type: 'cleanse', target: t.uid });
      }
      if (eff.value) for (const t of aliveCats(c)) heal(t, eff.value, ev);
      break;
    default:
      break;
  }
}

function enemyAct(c, e, rng, ctx, ev) {
  const it = e.intent;
  e.lastMove = it.type;
  switch (it.type) {
    case 'attack': {
      let t = catByKey(c, it.target);
      if (!t || t.ko) t = aliveCats(c)[0];
      if (!t) return;
      ev.push({ type: 'act', actor: e.uid, action: 'attack', target: t.uid });
      hit(c, e, t, it.power || 1, rng, ctx, ev);
      break;
    }
    case 'attack_all':
      ev.push({ type: 'act', actor: e.uid, action: 'attack_all' });
      for (const t of aliveCats(c)) hit(c, e, t, it.power || 1, rng, ctx, ev);
      break;
    case 'debuff': {
      let t = catByKey(c, it.target);
      if (!t || t.ko) t = aliveCats(c)[0];
      if (!t) return;
      ev.push({ type: 'act', actor: e.uid, action: 'debuff', target: t.uid });
      let landed = true;
      if (it.power) landed = !hit(c, e, t, it.power, rng, ctx, ev).miss;
      if (landed && !t.ko) {
        addStatus(t, it.status, it.turns || 2);
        ev.push({ type: 'status', target: t.uid, status: it.status });
      }
      break;
    }
    case 'buff':
      ev.push({ type: 'act', actor: e.uid, action: 'buff' });
      addStatus(e, it.status, it.turns || 2);
      ev.push({ type: 'status', target: e.uid, status: it.status });
      break;
    case 'buff_all':
      ev.push({ type: 'act', actor: e.uid, action: 'buff' });
      for (const o of aliveEnemies(c)) {
        addStatus(o, it.status, it.turns || 1);
        ev.push({ type: 'status', target: o.uid, status: it.status });
      }
      break;
    case 'heal':
      ev.push({ type: 'act', actor: e.uid, action: 'heal' });
      heal(e, it.value || 4, ev);
      break;
    case 'summon': {
      const def = ctx.enemies[it.enemy];
      if (!def) break;
      ev.push({ type: 'act', actor: e.uid, action: 'summon' });
      const m = makeEnemyUnit(def, 'e' + c.nextUid++, { floor: ctx.floor || 1, tier: ctx.tier || 1, balance: ctx.balance });
      m.summoned = true;
      c.enemies.push(m);
      ev.push({ type: 'summon', target: m.uid, enemy: m.id });
      break;
    }
    default:
      break;
  }
}

function checkOver(c, ev) {
  if (c.over) return;
  if (!aliveEnemies(c).length) {
    c.over = 'win';
    ev.push({ type: 'win' });
  } else if (!aliveCats(c).length) {
    c.over = 'lose';
    ev.push({ type: 'lose' });
  }
}

function endOfRound(c, rng, ctx, ev) {
  for (const u of [...aliveCats(c), ...aliveEnemies(c)]) {
    for (const s of u.statuses) {
      const d = statusDef(ctx, s.id);
      if (d.dot && u.hp > 0) {
        u.hp = Math.max(0, u.hp - d.dot);
        ev.push({ type: 'dot', target: u.uid, amount: d.dot, status: s.id, hp: u.hp });
        if (u.hp <= 0) onDeath(c, u, ev, ctx);
      }
      if (d.regen && u.hp > 0) heal(u, d.regen, ev);
    }
    u.statuses = u.statuses.map((s) => (s.fresh ? { id: s.id, turns: s.turns } : { id: s.id, turns: s.turns - 1 })).filter((s) => s.turns > 0);
    u.block = 0;
    if (u.side === 'cat' && u.cooldown > 0) u.cooldown--;
  }
  checkOver(c, ev);
  for (const e of c.enemies) e.intent = null;
  c.round++;
  if (!c.over) {
    planIntents(c, rng, ctx);
    ev.push({ type: 'round', round: c.round });
  }
}
