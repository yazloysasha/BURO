/* Service worker: versioned precache, cache-first, fully offline after the first load. */
importScripts('./precache-manifest.js');

const CACHE = 'buro-v' + self.BURO_VERSION;

async function cacheWithRetry(cache, url, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error(url + ' ' + res.status);
      await cache.put(url, res);
      return;
    } catch (e) {
      if (i >= tries - 1) throw e; // install fails and is retried on the next launch
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // small batches with retries: gentle on slow connections and tiny dev servers
      const list = [...self.BURO_PRECACHE, "./precache-manifest.js"];
      for (let i = 0; i < list.length; i += 16) {
        await Promise.all(list.slice(i, i + 16).map((u) => cacheWithRetry(cache, u)));
      }
      // the very first install activates at once; later updates wait for the player's tap or the next launch
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('buro-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (req.mode === 'navigate') {
        const hit = (await cache.match('./index.html')) || (await cache.match(req, { ignoreSearch: true }));
        if (hit) return hit;
      }
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      } catch (e) {
        return new Response('', { status: 504, statusText: 'offline' });
      }
    })(),
  );
});
