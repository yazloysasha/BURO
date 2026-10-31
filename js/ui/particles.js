// Tiny pixel particles (DOM squares) for bursts of joy: coins, sparkles, page completions, crits.
import { onFrame } from '../core/loop.js';

export function burst(container, x, y, { n = 16, colors = ['#ffcf4a'], size = 4, speed = 160, life = 0.8, gravity = 320 } = {}) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'particle';
    el.style.width = el.style.height = size + 'px';
    el.style.background = colors[i % colors.length];
    container.append(el);
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.8);
    parts.push({ el, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.6, t: 0 });
  }
  onFrame((dt) => {
    let alive = 0;
    for (const p of parts) {
      if (!p.el) continue;
      p.t += dt;
      if (p.t >= life) {
        p.el.remove();
        p.el = null;
        continue;
      }
      alive++;
      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // snap to whole pixels: particles stay crisp
      p.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      p.el.style.opacity = String(1 - p.t / life);
    }
    return alive > 0;
  });
}

// burst centred on an element
export function burstAt(el, opts) {
  const r = el.getBoundingClientRect();
  burst(document.body, r.left + r.width / 2, r.top + r.height / 2, opts);
}
