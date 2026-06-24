// Perception — vision cones with line-of-sight. Ported from m3's inCone.
//
// An observer at (ox,oy) facing `dir` with half-angle fov/2 and `range` sees
// (px,py) only if it's inside the cone AND nothing opaque blocks the straight
// line between them. Walls and doors block sight. This is real spatial seeing —
// guards and cameras only catch what they can actually look at.
//
// Single-floor: vision never crosses floors (an observer sees only its own
// grid). Callers pass the grid for the observer's floor.

import { WALL, DOOR } from './world.js';

export function inCone(grid, W, H, ox, oy, dir, fov, range, px, py) {
  const dx = px - ox, dy = py - oy;
  const d = Math.hypot(dx, dy);
  if (d > range || d < 0.1) return false;

  // inside the angular cone?
  let a = Math.atan2(dy, dx) - dir;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  if (Math.abs(a) > fov / 2) return false;

  // line-of-sight: march the ray, stop at the first opaque tile
  const steps = Math.ceil(d * 2);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const cx = Math.floor(ox + dx * t);
    const cy = Math.floor(oy + dy * t);
    if (cx >= 0 && cx < W && cy >= 0 && cy < H) {
      const tile = grid[cy][cx];
      if (tile === WALL || tile === DOOR) return false;
    }
  }
  return true;
}

// Cast the cone as a polygon (ray fan) — for rendering the visible area, and
// also handy for "where can this observer actually see" queries.
export function coneRays(grid, W, H, ox, oy, dir, fov, range, rayCount = 24) {
  const pts = [];
  for (let i = 0; i <= rayCount; i++) {
    const angle = dir - fov / 2 + (fov * i) / rayCount;
    let hit = range;
    for (let r = 0.5; r <= range; r += 0.5) {
      const cx = Math.floor(ox + Math.cos(angle) * r);
      const cy = Math.floor(oy + Math.sin(angle) * r);
      if (cx < 0 || cx >= W || cy < 0 || cy >= H) { hit = r; break; }
      const tile = grid[cy][cx];
      if (tile === WALL || tile === DOOR) { hit = r; break; }
    }
    pts.push({ x: ox + Math.cos(angle) * hit, y: oy + Math.sin(angle) * hit });
  }
  return pts;
}
