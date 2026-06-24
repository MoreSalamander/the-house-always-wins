// Obstacles — furniture you can't walk through (or see through).
//
// The decorative props in design/furniture.json become solid: their footprint
// tiles are stamped WALL into the level grid at load, so pathfinding routes
// around them and sightlines are blocked (a slot bank or the bar is cover).
// The boxing RING is solid too (see-over, so the fight stays visible) — the
// fighters spawn inside it and never path out, so they're the only ones on it;
// everyone else routes around it.
//
// Stamp ONCE, right after loading levels + furniture, before anything spawns or
// plans. Mutates the levels grid in place.

import { WALL, PROP, dims } from './world.js';

// Tall props you can't see over (block sight + movement). Everything else low
// — tables, card felts, desks — blocks movement but you can see across it.
const SIGHT_BLOCKING = new Set(['slots', 'counter']);

// the tiles a single furniture item covers
export function footprint(it) {
  const out = [];
  const add = (x, y) => { if (x >= 0 && y >= 0) out.push([Math.floor(x), Math.floor(y)]); };
  if (it.type === 'ring' || it.type === 'counter' || it.type === 'desk' || it.type === 'felt' ||
      it.type === 'bleacher' || it.type === 'seats') {
    for (let x = it.x; x < it.x + it.w; x++)
      for (let y = it.y; y < it.y + it.h; y++) add(x, y);
    add(it.x + it.w - 0.01, it.y);                             // catch the far edge
    add(it.x, it.y + it.h - 0.01);
    add(it.x + it.w - 0.01, it.y + it.h - 0.01);
  } else if (it.type === 'table') {
    const r = it.r;
    for (let x = Math.floor(it.x - r); x <= Math.ceil(it.x + r); x++)
      for (let y = Math.floor(it.y - r); y <= Math.ceil(it.y + r); y++)
        if (Math.hypot(x - it.x, y - it.y) <= r) add(x, y);
  } else if (it.type === 'slots') {
    const gap = it.gap || 2;
    for (let c = 0; c < it.cols; c++)
      for (let r = 0; r < it.rows; r++) {
        const mx = it.x + c * gap, my = it.y + r * 1.4;
        for (let x = mx; x < mx + 1.2; x++) for (let y = my; y < my + 1.0; y++) add(x, y);
      }
  }
  return out;
}

// every blocked tile on a floor, deduped — handy for tests/verification
export function obstacleTiles(furniture, floor) {
  const items = (furniture.floors && furniture.floors[floor]) || [];
  const seen = new Set();
  for (const it of items) for (const [x, y] of footprint(it)) seen.add(`${x},${y}`);
  return [...seen].map(s => s.split(',').map(Number));
}

// stamp furniture footprints into the level grids (mutates levels): tall props
// → WALL (block sight too), low props → PROP (movement only, see over them)
export function stampFurniture(levels, furniture) {
  const { W, H } = dims(levels);
  for (const floor in (furniture.floors || {})) {
    const g = levels.floors[floor];
    if (!g) continue;
    for (const it of furniture.floors[floor]) {
      const val = SIGHT_BLOCKING.has(it.type) ? WALL : PROP;
      for (const [x, y] of footprint(it))
        if (x > 0 && x < W - 1 && y > 0 && y < H - 1) g[y][x] = val;
    }
  }
  return levels;
}
