// Responsive layout: picks font sizes that land on whole device pixels for the 12px pixel font, and switches
// between the portrait column and the wide two-pane layout (landscape phones, tablets, desktop).
const GRID = 12; // Galmuri11 is drawn on a 12px grid

function gridSize(targetCss, dpr, minCss) {
  let n = Math.max(1, Math.round((targetCss * dpr) / GRID));
  while ((GRID * n) / dpr < minCss) n++;
  return { n, css: (GRID * n) / dpr };
}

// Big screens get an integer UI zoom (the whole page scales like a large landscape phone), so pixel art and
// the pixel font stay crisp and nothing becomes tiny on a desktop monitor.
export function uiZoom() {
  return Math.max(1, Math.floor(Math.min(window.innerWidth / 640, window.innerHeight / 540)));
}

// Device pixels per CSS px of the (zoomed) layout. Everything that sizes pixel art must use this.
export function effectiveDpr() {
  return (window.devicePixelRatio || 1) * uiZoom();
}

export function layoutState() {
  const z = uiZoom();
  const w = window.innerWidth / z;
  const h = window.innerHeight / z;
  const dpr = effectiveDpr();
  const wide = w >= 640 && w > h * 1.15;
  const short = h < 560;
  const body = gridSize(short ? 15 : 17, dpr, short ? 12 : 15);
  const head = { css: (GRID * Math.max(body.n + 1, Math.round(body.n * 1.5))) / dpr };
  // at 1 device px per CSS px a smaller grid step would be too tiny to read
  const small = { css: (GRID * Math.max(1, dpr < 1.5 ? body.n : body.n - 1)) / dpr };
  return { z, wide, short, fs: body.css, fsH: head.css, fsS: Math.max(small.css, short ? 10 : 12), key: [z, wide, short, body.css].join('|') };
}

let lastKey = null;
let lastSize = [0, 0];

// Applies classes + CSS variables. Returns true if the layout changed in a way that needs a re-render.
export function applyLayout() {
  const st = layoutState();
  const root = document.documentElement.style;
  root.zoom = st.z > 1 ? String(st.z) : '';
  root.setProperty('--fs', st.fs + 'px');
  root.setProperty('--fs-h', st.fsH + 'px');
  root.setProperty('--fs-s', st.fsS + 'px');
  document.body.classList.toggle('wide', st.wide);
  document.body.classList.toggle('short', st.short);
  const size = [window.innerWidth, window.innerHeight];
  const resized = Math.abs(size[0] - lastSize[0]) > lastSize[0] * 0.08 || Math.abs(size[1] - lastSize[1]) > lastSize[1] * 0.08;
  const changed = st.key !== lastKey || resized;
  lastKey = st.key;
  lastSize = size;
  return changed;
}

export function isWide() {
  return document.body.classList.contains('wide');
}

// Calls onChange (debounced) when orientation/size changes enough to rebuild the current screen.
export function watchLayout(onChange) {
  applyLayout();
  let timer = null;
  const handler = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (applyLayout()) onChange();
    }, 200);
  };
  window.addEventListener('resize', handler);
  window.addEventListener('orientationchange', handler);
}
