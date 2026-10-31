// Combat screen: pixel stage (cats left, enemies right), intents, HP, statuses, action panel, event animations.
import { h, setChildren } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { play } from '../core/audio.js';
import { tween, wait } from '../core/loop.js';
import { CatSprite, enemyCanvas, iconCanvas } from '../core/sprite.js';
import { game, commit } from '../game/state.js';
import { CAT_KEYS, aliveEnemies, aliveCats, catByKey, intentPreview } from '../game/combat.js';
import { combatCtx } from '../game/data.js';
import { playRound } from '../game/run.js';
import { Stage } from './stage.js';
import { button, modal, closeModal, shake, haptic } from './app.js';
import { hpBar, itemRow, effectText } from './runwidgets.js';
import { catSheetKey } from './widgets.js';

const W = 96;
const H = 100;
const CAT_POS = { peposya: [2, 60], dudonya: [12, 22] };
const SLOTS = [[60, 12], [76, 44], [60, 76], [78, 12]];
const BOSS_SLOT = [44, 40];
const MINION_SLOTS = [[78, 10], [80, 76], [78, 44]];


const ACTION_SFX = { bite: 'scratch', hiss: 'meow_sub_2', purr: 'shiny', special: 'hit_medium', item: 'potion' };

export function renderCombat(root, { onEnd }) {
  const run = game.save.run;
  const room = run.room;
  const c = room.combat;
  const ctx = combatCtx(game.data, run);
  const availW = root.clientWidth || 360;
  const stage = new Stage(W, H, availW, (root.clientHeight || 600) * 0.56);
  const u = stage.unit;
  const views = {};
  let busy = false;
  let sel = {};
  let targeting = null; // {cat, action, itemUid}

  const log = h('div.combat-log', { text: room.type === 'boss' ? t('combat.bossIntro') : t('combat.start') });
  const panel = h('div.action-panel');
  const chips = h('div.party-row');
  root.append(stage.el, log, chips, panel);

  // ----- unit views -----
  function enemySlot(e, idx) {
    if (c.enemies.some((x) => x.boss)) {
      if (e.boss) return BOSS_SLOT;
      const minions = c.enemies.filter((x) => !x.boss);
      return MINION_SLOTS[minions.indexOf(e) % MINION_SLOTS.length];
    }
    return SLOTS[idx % SLOTS.length];
  }

  function overlay(x, y, cls) {
    const el = h('div.ov' + (cls ? '.' + cls : ''));
    Object.assign(el.style, { left: x * u + 'px', top: y * u + 'px' });
    stage.el.append(el);
    return el;
  }

  function makeCatView(cat) {
    const sp = new CatSprite(catSheetKey(cat.key), { anim: cat.ko ? 'sleep1' : 'idle', scale: 1 });
    const [x, y] = CAT_POS[cat.key];
    stage.place(sp.el, x, y, 5);
    const bar = overlay(x + 4, y + 31, 'bar');
    const st = overlay(x + 4, y + 2, 'statuses');
    stage.zone(x + 4, y + 12, 24, 20, () => onCatTap(cat.key));
    return { sp, el: sp.el, x, y, bar, st, w: 32, h: 32 };
  }

  function makeEnemyView(e, idx) {
    const [x, y] = enemySlot(e, idx);
    const scale = e.boss ? 2 : 1;
    const cv = enemyCanvas(e.sprite, 1);
    cv.style.transformOrigin = 'center bottom';
    stage.place(cv, x, y, 5);
    if (scale > 1) {
      cv.style.width = 16 * scale * u + 'px';
      cv.style.height = 16 * scale * u + 'px';
    }
    const size = 16 * scale;
    const bar = overlay(x - 2, y + size, 'bar');
    const intent = overlay(x - 2, y - 9, 'intent');
    const st = overlay(x - 2, y + size + 4, 'statuses');
    const zone = stage.zone(x - 2, y - 2, size + 4, size + 4, () => onEnemyTap(e.uid));
    return { el: cv, x, y, bar, intent, st, zone, w: size, h: size };
  }

  function sync() {
    for (const cat of c.cats) {
      if (!views[cat.uid]) views[cat.uid] = makeCatView(cat);
      const v = views[cat.uid];
      setChildren(v.bar, hpBar(cat.hp, cat.maxHp, 'small'), cat.block ? h('span.blk', { text: '+' + cat.block }) : null);
      setChildren(v.st, ...statusIcons(cat));
      if (cat.ko && v.sp.name !== 'sleep1') v.sp.play('sleep1');
      if (!cat.ko && v.sp.name === 'sleep1') v.sp.play('idle');
    }
    c.enemies.forEach((e, idx) => {
      if (e.hp <= 0) {
        if (views[e.uid]) {
          const v = views[e.uid];
          v.el.remove();
          v.bar.remove();
          v.intent.remove();
          v.st.remove();
          v.zone.remove();
          delete views[e.uid];
        }
        return;
      }
      if (!views[e.uid]) views[e.uid] = makeEnemyView(e, idx);
      const v = views[e.uid];
      setChildren(v.bar, hpBar(e.hp, e.maxHp, 'small'), e.block ? h('span.blk', { text: '+' + e.block }) : null);
      setChildren(v.st, ...statusIcons(e));
      setChildren(v.intent, intentBadge(e));
      v.zone.classList.toggle('targetable', !!targeting);
    });
    drawChips();
    drawPanel();
  }

  function statusIcons(unit) {
    return unit.statuses.map((s) => {
      const d = game.data.statusById[s.id];
      const ic = iconCanvas(d.icon, { target: 18 });
      ic.classList.add('status-ic', d.kind);
      return ic;
    });
  }

  function intentBadge(e) {
    const it = e.intent;
    if (!it) return h('span');
    const icon = iconCanvas(game.data.assets.intents[it.type] || game.data.assets.intents.attack, { target: 18 });
    const v = intentPreview(c, e, ctx);
    const tgt = it.target ? t('cats.short.' + it.target) : it.type === 'attack_all' ? t('combat.all') : '';
    return h('span.badge-intent.' + it.type, null, icon, v != null ? h('span', { text: String(v) }) : null, tgt ? h('span.tgt', { text: '→' + tgt }) : null);
  }

  // ----- selection -----
  function activeCat() {
    return CAT_KEYS.find((k) => {
      const cat = catByKey(c, k);
      return cat && !cat.ko && cat.hp > 0 && !sel[k];
    });
  }

  function drawChips() {
    setChildren(chips, 
      ...CAT_KEYS.map((k) => {
        const cat = catByKey(c, k);
        const a = sel[k];
        const ad = a && game.data.cats[k].actions[a.action];
        const chip = h(
          'button.cat-chip' + (activeCat() === k ? '.active' : '') + (cat.ko ? '.ko' : ''),
          { type: 'button' },
          h('div', { text: game.data.cats[k].name }),
          h('div.dim.small', { text: cat.ko ? t('combat.ko') : ad ? '✓ ' + ad.name : t('combat.choosing') }),
        );
        chip.addEventListener('click', () => {
          if (busy || !sel[k]) return;
          delete sel[k];
          targeting = null;
          play('back');
          sync();
        });
        return chip;
      }),
    );
  }

  function drawPanel() {
    setChildren(panel);
    if (c.over || busy) return;
    const k = activeCat();
    if (!k) return;
    if (targeting) {
      panel.append(
        h('div.panel-title', { text: t('combat.pickTarget') }),
        button(t('common.cancel'), () => {
          targeting = null;
          sync();
        }, { cls: 'grey', sound: 'back' }),
      );
      return;
    }
    const cat = catByKey(c, k);
    const defs = game.data.cats[k].actions;
    panel.append(h('div.panel-title', { text: t('combat.turnOf', { name: game.data.cats[k].name }) }));
    const grid = h('div.action-grid');
    for (const id of Object.keys(defs)) {
      const ad = defs[id];
      let disabled = false;
      let sub = null;
      if (id === 'special' && cat.cooldown > 0) {
        disabled = true;
        sub = t('combat.cooldown', { n: cat.cooldown });
      }
      if (id === 'item' && !usableItems().length) disabled = true;
      const isSkill = ad.icon.includes('/skills/');
      const ic = iconCanvas(ad.icon, { w: isSkill ? 34 : 16, h: isSkill ? 34 : 16, target: 34 });
      const b = button(ad.name, () => chooseAction(k, id), { cls: (id === 'special' ? 'green' : '') + ' act', disabled, icon: ic, sub, sound: 'tap' });
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        modal(h('p', { text: ad.desc }), [{ label: t('common.ok'), value: 1, cls: 'green' }]);
      });
      grid.append(b);
    }
    panel.append(grid, h('div.dim.small.center', { text: t('combat.hintLong') }));
  }

  function usableItems() {
    return run.backpack.filter((b) => {
      const it = game.data.itemById[b.id];
      return it && it.effect && !Object.values(sel).some((a) => a.itemUid === b.uid);
    });
  }

  function chooseAction(k, id) {
    const ad = game.data.cats[k].actions[id];
    if (id === 'item') return pickItem(k);
    if (ad.target === 'enemy' && aliveEnemies(c).length > 1) {
      targeting = { cat: k, action: id };
      log.textContent = t('combat.pickTargetFor', { action: ad.name });
      sync();
      return;
    }
    assign(k, { action: id, target: aliveEnemies(c)[0] && aliveEnemies(c)[0].uid });
  }

  function pickItem(k) {
    const list = h('div.col');
    for (const b of usableItems()) {
      const it = game.data.itemById[b.id];
      list.append(
        itemRow(it, {
          mods: b.mods,
          extra: h('div.effect', { text: effectText(it.effect) }),
          onClick: () => {
            play('select');
            closeModal();
            const needsTarget = (it.effect.type === 'damage' || (it.effect.type === 'status_enemy' && !it.effect.all)) && aliveEnemies(c).length > 1;
            if (needsTarget) {
              targeting = { cat: k, action: 'item', itemUid: b.uid };
              log.textContent = t('combat.pickTargetFor', { action: it.name });
              sync();
            } else assign(k, { action: 'item', itemUid: b.uid, target: aliveEnemies(c)[0] && aliveEnemies(c)[0].uid });
          },
        }),
      );
    }
    modal(h('div', null, h('h2', { text: t('combat.pickItem') }), list), [{ label: t('common.cancel'), value: 0, cls: 'grey', sound: 'back' }]);
  }

  function assign(k, a) {
    sel[k] = a;
    targeting = null;
    if (!activeCat()) resolve();
    else sync();
  }

  function onEnemyTap(uid) {
    if (busy) return;
    if (targeting) {
      const tk = targeting;
      play('select');
      assign(tk.cat, { action: tk.action, target: uid, itemUid: tk.itemUid });
      return;
    }
    const e = c.enemies.find((x) => x.uid === uid);
    if (!e) return;
    const def = game.data.enemyById[e.id];
    play('question');
    modal(
      h(
        'div',
        null,
        h('div.row', null, enemyCanvas(e.sprite, 4), h('div', null, h('h2', { text: e.name }), h('div.dim', { text: t('combat.stats', { hp: e.hp, max: e.maxHp, atk: e.atk, def: e.def, spd: e.spd }) }))),
        h('p', { text: def.flavor }),
        e.intent ? h('p', { text: t('combat.intentIs', { what: t('intents.' + e.intent.type) }) }) : null,
        ...e.statuses.map((s) => h('div.dim', { text: game.data.statusById[s.id].name + ' — ' + game.data.statusById[s.id].desc })),
      ),
      [{ label: t('common.ok'), value: 1, cls: 'green' }],
    );
  }

  function onCatTap(k) {
    if (busy) return;
    const cat = catByKey(c, k);
    const lines = cat.statuses.map((s) => h('div.dim', { text: game.data.statusById[s.id].name + ' — ' + game.data.statusById[s.id].desc }));
    play('meow_sub');
    modal(
      h(
        'div',
        null,
        h('h2', { text: game.data.cats[k].name }),
        h('div.dim', { text: t('combat.stats', { hp: cat.hp, max: cat.maxHp, atk: cat.atk, def: cat.def, spd: cat.spd }) }),
        ...lines,
        ...Object.values(game.data.cats[k].actions).map((a) => h('p', null, h('span.accent', { text: a.name + ': ' }), a.desc)),
      ),
      [{ label: t('common.ok'), value: 1, cls: 'green' }],
    );
  }

  // ----- resolution & animation -----
  async function resolve() {
    busy = true;
    sync();
    const actions = sel;
    sel = {};
    const events = playRound(game.save, game.data, actions);
    commit(); // state is safe before any animation plays
    await animate(events);
    busy = false;
    sync();
    if (c.over) {
      await wait(400);
      onEnd(c.over);
    } else log.textContent = t('combat.round', { n: c.round });
  }

  function float(uid, text, cls) {
    const v = views[uid];
    if (!v) return;
    const el = h('div.float.' + cls, { text });
    Object.assign(el.style, { left: (v.x + v.w / 2) * u + 'px', top: (v.y + 4) * u + 'px' });
    stage.el.append(el);
    tween(700, (k) => {
      el.style.transform = `translate(-50%, ${-k * 28}px)`;
      el.style.opacity = String(1 - Math.max(0, k - 0.6) / 0.4);
    }).then(() => el.remove());
  }

  async function lunge(uid, dir) {
    const v = views[uid];
    if (!v) return;
    await tween(110, (k) => (v.el.style.transform = `translateX(${dir * k * 10 * u}px)`));
    await tween(140, (k) => (v.el.style.transform = `translateX(${dir * (1 - k) * 10 * u}px)`));
    v.el.style.transform = '';
  }

  function flash(uid) {
    const v = views[uid];
    if (!v) return;
    if (v.sp) {
      v.sp.play('hurt', { loop: false, then: 'idle' });
      return;
    }
    v.el.style.filter = 'brightness(4)';
    setTimeout(() => (v.el.style.filter = ''), 110);
  }

  function nameOf(uid) {
    const cat = c.cats.find((x) => x.uid === uid);
    if (cat) return game.data.cats[cat.key].name;
    const e = c.enemies.find((x) => x.uid === uid);
    return e ? e.name : '';
  }

  async function animate(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'act': {
          const cat = c.cats.find((x) => x.uid === ev.actor);
          if (cat) {
            const ad = game.data.cats[cat.key].actions[ev.action];
            log.textContent = t('combat.logAct', { who: nameOf(ev.actor), what: ad ? ad.name : '' });
            play(ACTION_SFX[ev.action] || 'tap');
            const v = views[ev.actor];
            if (ev.action === 'bite' || ev.action === 'special') {
              v.sp.play('attack', { loop: false, then: 'idle', fps: 14 });
              await lunge(ev.actor, 1);
            } else if (ev.action === 'hiss' || ev.action === 'purr') {
              v.sp.play('meow', { loop: false, then: 'idle' });
              await wait(260);
            } else await wait(200);
          } else {
            log.textContent = t('combat.logEnemy', { who: nameOf(ev.actor), what: t('intents.' + ev.action) });
            if (ev.action === 'summon') play('ambush');
            else play('step');
            await lunge(ev.actor, -1);
          }
          break;
        }
        case 'damage':
          flash(ev.target);
          if (ev.crit) {
            play('crit');
            shake();
            haptic(30);
            float(ev.target, t('combat.crit', { n: ev.amount }), 'crit');
          } else {
            play(ev.amount >= 8 ? 'hit_medium' : 'hit_soft');
            float(ev.target, '-' + ev.amount, 'dmg');
          }
          if (ev.blocked) float(ev.target, t('combat.blocked', { n: ev.blocked }), 'block');
          syncHp(ev.target, ev.hp);
          await wait(260);
          break;
        case 'dot':
          float(ev.target, '-' + ev.amount, 'dot');
          play('glitch_2');
          syncHp(ev.target, ev.hp);
          await wait(220);
          break;
        case 'miss':
          play('miss');
          float(ev.target, t('combat.miss'), 'miss');
          await wait(240);
          break;
        case 'block':
          play('equip');
          float(ev.target, '+' + ev.amount, 'block');
          await wait(160);
          break;
        case 'heal':
          if (ev.amount > 0) {
            play('potion', { vol: 0.6 });
            float(ev.target, '+' + ev.amount, 'heal');
            syncHp(ev.target, ev.hp);
            await wait(220);
          }
          break;
        case 'status': {
          const d = game.data.statusById[ev.status];
          play(d.kind === 'buff' ? 'shiny' : 'glitch');
          float(ev.target, d.name, d.kind);
          await wait(220);
          break;
        }
        case 'skip':
          float(ev.actor, t('combat.zzz'), 'miss');
          log.textContent = t('combat.logSleep', { who: nameOf(ev.actor) });
          await wait(300);
          break;
        case 'death': {
          const v = views[ev.target];
          play('squish');
          if (v) await tween(260, (k) => {
            v.el.style.transform = `scale(${1 + k * 0.3}, ${1 - k})`;
            v.el.style.opacity = String(1 - k);
          });
          break;
        }
        case 'ko':
          play('fail_small', { vol: 0.5 });
          log.textContent = t('combat.logKo', { who: nameOf(ev.target) });
          if (views[ev.target]) views[ev.target].sp.play('sleep1');
          await wait(400);
          break;
        case 'summon':
          sync();
          float(ev.target, t('combat.summoned'), 'miss');
          await wait(300);
          break;
        case 'phase':
          play('ambush');
          shake();
          log.textContent = t('combat.bossPhase');
          await wait(700);
          break;
        case 'item':
          if (ev.item) float(ev.actor, game.data.itemById[ev.item].name, 'heal');
          await wait(200);
          break;
        case 'revive':
          if (views[ev.target]) views[ev.target].sp.play('idle');
          break;
        case 'win':
          play('jingle_win');
          log.textContent = t('combat.win');
          for (const cat of aliveCats(c)) views[cat.uid].sp.play('victory', { loop: true });
          break;
        case 'lose':
          play('jingle_lose');
          log.textContent = t('combat.lose');
          break;
        default:
          break;
      }
    }
  }

  function syncHp(uid, hp) {
    const v = views[uid];
    const unit = c.cats.find((x) => x.uid === uid) || c.enemies.find((x) => x.uid === uid);
    if (v && unit) setChildren(v.bar, hpBar(hp, unit.maxHp, 'small'));
  }

  sync();
  if (c.over) setTimeout(() => onEnd(c.over), 50);
}
