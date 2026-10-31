// A pixel stage: fixed logical resolution, scaled by an integer number of *device* pixels so every sprite pixel
// maps to whole screen pixels. Child sprite canvases are positioned in logical pixels.
import { h } from '../core/dom.js';
import { effectiveDpr } from './layout.js';

export function stageScale(logicalW, logicalH, availW, availH = Infinity) {
  const dpr = Math.max(1, Math.round(effectiveDpr()));
  const k = Math.max(1, Math.floor(Math.min((availW * dpr) / logicalW, (availH * dpr) / logicalH)));
  return { k, dpr, css: k / dpr };
}

export class Stage {
  constructor(logicalW, logicalH, availW, availH) {
    this.w = logicalW;
    this.h = logicalH;
    const s = stageScale(logicalW, logicalH, availW, availH);
    this.k = s.k;
    this.dpr = s.dpr;
    this.unit = s.css; // CSS px per logical px
    this.el = h('div.stage', { style: { width: logicalW * this.unit + 'px', height: logicalH * this.unit + 'px' } });
    this.bg = document.createElement('canvas');
    this.bg.className = 'px';
    this.bg.width = logicalW * this.k;
    this.bg.height = logicalH * this.k;
    Object.assign(this.bg.style, { left: '0', top: '0', width: logicalW * this.unit + 'px', height: logicalH * this.unit + 'px' });
    this.ctx = this.bg.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    this.el.append(this.bg);
  }

  // place a sprite canvas (native res) at logical x,y (top-left), scaled by the stage unit
  place(canvas, x, y, z = 1) {
    canvas.style.width = canvas.width * this.unit + 'px';
    canvas.style.height = canvas.height * this.unit + 'px';
    canvas.style.left = x * this.unit + 'px';
    canvas.style.top = y * this.unit + 'px';
    canvas.style.zIndex = z;
    if (canvas.parentNode !== this.el) this.el.append(canvas);
    return canvas;
  }

  move(canvas, x, y) {
    canvas.style.left = Math.round(x) * this.unit + 'px';
    canvas.style.top = Math.round(y) * this.unit + 'px';
  }

  zone(x, y, w, hh, onTap) {
    const z = h('div.tap-zone', {
      style: { left: x * this.unit + 'px', top: y * this.unit + 'px', width: w * this.unit + 'px', height: hh * this.unit + 'px', zIndex: 20 },
    });
    z.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onTap(e);
    });
    this.el.append(z);
    return z;
  }
}
