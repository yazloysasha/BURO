// Seeded RNG (sfc32). State is 4 uint32 numbers and is stored in the save, so a run can never be rerolled.

export function hashString(str) {
  // xmur3-style string hash -> uint32
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function seedState(seed) {
  const s = typeof seed === 'number' ? String(seed >>> 0) : String(seed);
  const st = [hashString(s + 'a'), hashString(s + 'b'), hashString(s + 'c'), hashString(s + 'd')];
  const rng = new Rng(st);
  for (let i = 0; i < 15; i++) rng.next(); // warm up
  return rng.state();
}

export class Rng {
  constructor(state) {
    if (!Array.isArray(state) || state.length !== 4) throw new Error('bad rng state');
    [this.a, this.b, this.c, this.d] = state.map((v) => v >>> 0);
  }

  static fromSeed(seed) {
    return new Rng(seedState(seed));
  }

  state() {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }

  // float in [0, 1)
  next() {
    let { a, b, c, d } = this;
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return (r >>> 0) / 4294967296;
  }

  // integer in [min, max] inclusive
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  // entries: [{w, ...}] or [[value, weight]]; returns the chosen entry
  weighted(entries, weightOf = (e) => (Array.isArray(e) ? e[1] : e.w)) {
    let total = 0;
    for (const e of entries) total += Math.max(0, weightOf(e));
    if (total <= 0) return entries[0];
    let r = this.next() * total;
    for (const e of entries) {
      r -= Math.max(0, weightOf(e));
      if (r < 0) return e;
    }
    return entries[entries.length - 1];
  }

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // new uint32 seed derived from this stream (for sub-streams)
  seed() {
    return Math.floor(this.next() * 4294967296) >>> 0;
  }
}

// Run an RNG-consuming function against a stored state and write the new state back.
// holder[key] must be a 4-number state array.
export function withRng(holder, key, fn) {
  const rng = new Rng(holder[key]);
  const result = fn(rng);
  holder[key] = rng.state();
  return result;
}
