// Customers — the house is busy. A casino's worth of patrons milling the public
// floor (lobby, bar, casino, arena), drawn as little black dots. They're ambient
// life: they wander their room, pause, drift on. They don't catch anyone — they
// ARE the crowd the crew blends into (later they can lower a worker's suspicion;
// for now they're the texture that makes "blending in" mean something visually).
//
// Seeded, so the floor fills and churns identically for a given run.

import { solid, dims, grid, roomOf } from './world.js';

const CUST_SPEED = 0.009;                 // a slow, idle drift
const PUBLIC = ['lobby', 'bar', 'casino', 'arena'];

function randPublicTile(levels, rooms, rng) {
  const { W, H } = dims(levels);
  const g = grid(levels, 'floor1');
  for (let i = 0; i < 60; i++) {
    const x = 1 + Math.floor(rng() * (W - 2));
    const y = 1 + Math.floor(rng() * (H - 2));
    if (!solid(g[y][x]) && PUBLIC.includes(roomOf(rooms, 'floor1', x, y))) return { x, y };
  }
  return null;
}

export function initCustomers(levels, rooms, rng, n = 36) {
  const cust = [];
  for (let i = 0; i < n * 3 && cust.length < n; i++) {
    const t = randPublicTile(levels, rooms, rng);
    if (!t) continue;
    cust.push({ floor: 'floor1', x: t.x + 0.5, y: t.y + 0.5,
      tx: t.x + 0.5, ty: t.y + 0.5, wait: Math.floor(rng() * 80) });
  }
  return cust;
}

export function stepCustomers(levels, rooms, cust, rng) {
  const { W, H } = dims(levels);
  const g = grid(levels, 'floor1');
  for (const c of cust) {
    if (c.wait > 0) { c.wait--; continue; }
    const here = roomOf(rooms, 'floor1', Math.floor(c.x), Math.floor(c.y));
    const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
    if (d < CUST_SPEED) {
      c.x = c.tx; c.y = c.ty;
      // drift to a fresh spot a few tiles away, staying in the SAME public room
      for (let i = 0; i < 14; i++) {
        const nx = Math.floor(c.x) + Math.floor(rng() * 7) - 3;
        const ny = Math.floor(c.y) + Math.floor(rng() * 7) - 3;
        if (nx > 0 && nx < W && ny > 0 && ny < H && !solid(g[ny][nx]) &&
            roomOf(rooms, 'floor1', nx, ny) === here && PUBLIC.includes(here)) {
          c.tx = nx + 0.5; c.ty = ny + 0.5; break;
        }
      }
      c.wait = Math.floor(rng() * 100);
    } else {
      // never step into a wall — if the next tile is solid, stop and re-pick
      const nx = c.x + dx / d * CUST_SPEED, ny = c.y + dy / d * CUST_SPEED;
      if (solid(g[Math.floor(ny)][Math.floor(nx)])) { c.tx = c.x; c.ty = c.y; c.wait = 20; }
      else { c.x = nx; c.y = ny; }
    }
  }
}
