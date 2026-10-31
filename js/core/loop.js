// The one requestAnimationFrame loop. Subscribers get (dt seconds, now ms). Tweens and waits respect animSpeed.
const subs = new Set();
let last = 0;
let running = false;
let speed = 1;

export function setAnimSpeed(s) {
  speed = s > 0 ? s : 1;
}

export function animSpeed() {
  return speed;
}

function frame(now) {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  for (const fn of Array.from(subs)) {
    try {
      if (fn(dt, now) === false) subs.delete(fn);
    } catch (e) {
      console.error(e);
      subs.delete(fn);
    }
  }
  if (subs.size) requestAnimationFrame(frame);
  else {
    running = false;
    last = 0;
  }
}

// fn returns false to unsubscribe. Returns an unsubscribe function.
export function onFrame(fn) {
  subs.add(fn);
  if (!running) {
    running = true;
    requestAnimationFrame(frame);
  }
  return () => subs.delete(fn);
}

export const ease = {
  linear: (t) => t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inQuad: (t) => t * t,
  outBack: (t) => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

// Promise-based tween; dur in ms (scaled by animSpeed). onUpdate(k) gets eased progress 0..1.
export function tween(dur, onUpdate, easing = ease.outQuad) {
  return new Promise((resolve) => {
    const total = dur / speed;
    let t = 0;
    if (total <= 0) {
      onUpdate(1);
      return resolve();
    }
    onFrame((dt) => {
      t += dt * 1000;
      const k = Math.min(1, t / total);
      onUpdate(easing(k));
      if (k >= 1) {
        resolve();
        return false;
      }
      return true;
    });
  });
}

// Wait that can be cut short by a skip token: { skipped: bool }
export function wait(ms, token) {
  return new Promise((resolve) => {
    let t = 0;
    const total = ms / speed;
    onFrame((dt) => {
      t += dt * 1000;
      if (t >= total || (token && token.skipped)) {
        resolve();
        return false;
      }
      return true;
    });
  });
}
