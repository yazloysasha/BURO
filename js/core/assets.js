// Asset loading: JSON, images (cached), sprite sheet metadata.
const images = new Map();
const json = new Map();

async function fetchRetry(url, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(url + " " + r.status);
      return r;
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((res) => setTimeout(res, 300 * (i + 1)));
    }
  }
}

export function loadJSON(url) {
  if (!json.has(url))
    json.set(
      url,
      fetchRetry(url).then((r) => r.json()),
    );
  return json.get(url);
}

export function loadImage(src) {
  let e = images.get(src);
  if (!e) {
    const img = new Image();
    e = { img, ready: false, promise: null };
    e.promise = new Promise((resolve) => {
      img.onload = () => {
        e.ready = true;
        resolve(img);
      };
      img.onerror = () => {
        console.warn("image failed", src);
        resolve(null);
      };
    });
    img.decoding = "async";
    img.src = src;
    images.set(src, e);
  }
  return e.promise;
}

// Returns the image if already loaded, otherwise starts loading and returns null.
export function getImage(src) {
  const e = images.get(src);
  if (e && e.ready) return e.img;
  if (!e) loadImage(src);
  return null;
}

export function loadImages(srcs) {
  return Promise.all(srcs.map(loadImage));
}

// Sheets: { key: { meta, img } } loaded at boot.
export const sheets = {};

export async function loadSheet(key, jsonUrl) {
  const meta = await loadJSON(jsonUrl);
  const base = jsonUrl.slice(0, jsonUrl.lastIndexOf("/") + 1);
  const img = await loadImage(base + meta.image);
  sheets[key] = { meta, img, src: base + meta.image };
  return sheets[key];
}
