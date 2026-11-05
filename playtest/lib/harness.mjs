// Shared Playwright plumbing: a static server for the game, the two device profiles, boot helpers.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const OUT = path.join(ROOT, 'playtest');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ttf': 'font/ttf', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg' };

export function serve(root = ROOT) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.join(root, rel);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() }));
  });
}

// The two target profiles. The iPhone safe areas can't be emulated, they are simulated with CSS in addSafeArea().
export const PROFILES = {
  iphone: { name: 'iphone', viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, safe: { top: 44, bottom: 34 } },
  desktop: { name: 'desktop', viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false, safe: { top: 0, bottom: 0 } },
};

export async function launch(engine = 'chromium') {
  return (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
}

export async function newContext(browser, profile, extra = {}) {
  const { name, safe, ...ctxOpts } = profile;
  if (browser.browserType().name() === 'webkit') delete ctxOpts.isMobile;
  const ctx = await browser.newContext({ ...ctxOpts, locale: 'ru-RU', ...extra });
  if (safe.top || safe.bottom) {
    await ctx.addInitScript((s) => {
      addEventListener('DOMContentLoaded', () => {
        const st = document.createElement('style');
        st.textContent = `:root{--safe-t:${s.top}px!important;--safe-b:${s.bottom}px!important}`;
        document.head.append(st);
      });
    }, safe);
  }
  return ctx;
}

// Opens the game and waits for the hub. Collects console errors and every request that leaves the local server.
export async function openGame(ctx, baseUrl) {
  const page = await ctx.newPage();
  const problems = [];
  const external = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push('console: ' + m.text());
  });
  page.on('request', (r) => {
    if (!r.url().startsWith(baseUrl) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url());
  });
  await page.goto(baseUrl);
  await page.waitForSelector('#app:not([hidden]) .menu-grid', { timeout: 60000 });
  return { page, problems, external };
}

export const readSave = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('buro.save')));
