// Branching run map (Slay-the-Spire style). Pure + seeded.
// floors[0] is the bottom; the last floor holds the single boss node.

const crosses = (a, b) => (a[0] - b[0]) * (a[1] - b[1]) < 0;

function connect(lower, upper, rng) {
  const n = lower.length;
  const m = upper.length;
  const edges = [];
  const has = (i, j) => edges.some((e) => e[0] === i && e[1] === j);
  const deg = (i) => edges.filter((e) => e[0] === i).length;
  const ok = (i, j) => !has(i, j) && deg(i) < 3 && !edges.some((e) => crosses(e, [i, j]));
  const pos = (i, k) => (k === 1 ? 0.5 : i / (k - 1));
  for (let i = 0; i < n; i++) {
    const j = Math.round(pos(i, n) * (m - 1));
    if (!has(i, j)) edges.push([i, j]);
  }
  for (let j = 0; j < m; j++) {
    if (edges.some((e) => e[1] === j)) continue;
    let i = Math.round(pos(j, m) * (n - 1));
    if (!ok(i, j)) {
      // nearest lower node that can take the edge without crossing
      const order = [...Array(n).keys()].sort((a, b) => Math.abs(a - i) - Math.abs(b - i));
      i = order.find((k) => !edges.some((e) => crosses(e, [k, j]))) ?? i;
    }
    edges.push([i, j]);
  }
  // a few extra branches for choice
  for (let i = 0; i < n; i++) {
    if (!rng.chance(0.4)) continue;
    const js = edges.filter((e) => e[0] === i).map((e) => e[1]);
    const cand = rng.chance(0.5) ? Math.max(...js) + 1 : Math.min(...js) - 1;
    if (cand >= 0 && cand < m && ok(i, cand)) edges.push([i, cand]);
  }
  for (const [i, j] of edges) lower[i].up.push(upper[j].id);
  for (const node of lower) node.up.sort();
}

export function generateMap(rng, { tier = 1, rooms, balance }) {
  const [fmin, fmax] = balance.floorsByTier[String(tier)] || balance.floorsByTier['1'];
  const total = rng.int(fmin, fmax); // includes the boss floor
  const regular = total - 1;
  const [nmin, nmax] = balance.nodesPerFloor;
  const floors = [];
  let nid = 0;
  for (let f = 0; f < regular; f++) {
    const n = rng.int(nmin, nmax);
    const row = [];
    for (let i = 0; i < n; i++) {
      const jitter = (rng.next() - 0.5) * (0.5 / n);
      row.push({ id: 'n' + nid++, f, i, x: Math.round(((i + 0.5) / n + jitter) * 1000) / 1000, type: null, up: [] });
    }
    floors.push(row);
  }
  for (let f = 0; f < regular - 1; f++) connect(floors[f], floors[f + 1], rng);
  const boss = { id: 'boss', f: regular, i: 0, x: 0.5, type: 'boss', up: [] };
  for (const node of floors[regular - 1]) node.up = ['boss'];
  floors.push([boss]);
  assignRooms(floors, rng, rooms, tier);
  return { floors, total };
}

function assignRooms(floors, rng, rooms, tier) {
  const regular = floors.length - 1;
  const restFloor = regular - 1;
  const treasure = Math.max(1, Math.floor(regular / 2));
  const byId = {};
  for (const row of floors) for (const n of row) byId[n.id] = n;
  const parentsOf = (node) => (node.f === 0 ? [] : floors[node.f - 1].filter((p) => p.up.includes(node.id)));
  const pool = rooms.filter((r) => r.w > 0 && r.id !== 'boss' && (r.tier || 1) <= tier);
  for (let f = 0; f < regular; f++) {
    for (const node of floors[f]) {
      if (f === 0) node.type = 'combat';
      else if (f === restFloor) node.type = 'rest';
      else if (f === treasure) node.type = 'loot';
      else {
        const parentTypes = parentsOf(node).map((p) => p.type);
        const noCozy = f === restFloor - 1 || parentTypes.some((t) => t === 'shop' || t === 'rest');
        const cand = pool.filter((r) => {
          if ((r.minFloor || 1) > f + 1) return false;
          if (r.id === 'elite' && f < 2) return false; // floors 1-2: no elites
          if (noCozy && (r.id === 'shop' || r.id === 'rest')) return false;
          if (r.id === 'loot' && (f === treasure - 1 || f === treasure + 1)) return false;
          return true;
        });
        node.type = cand.length ? rng.weighted(cand, (r) => r.w).id : 'combat';
      }
    }
  }
}

export function findNode(map, id) {
  for (const row of map.floors) for (const n of row) if (n.id === id) return n;
  return null;
}

// Nodes the player may enter next.
export function availableNodes(map, posId) {
  if (!posId) return map.floors[0].map((n) => n.id);
  const cur = findNode(map, posId);
  return cur ? cur.up.slice() : [];
}

// Every bottom-to-boss path, as arrays of node ids (used by tests; maps are small).
export function allPaths(map) {
  const out = [];
  const walk = (node, acc) => {
    const path = [...acc, node.id];
    if (!node.up.length) return out.push(path);
    for (const id of node.up) walk(findNode(map, id), path);
  };
  for (const n of map.floors[0]) walk(n, []);
  return out;
}
