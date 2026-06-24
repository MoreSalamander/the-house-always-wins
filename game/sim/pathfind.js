// Pathfinding — A* within a floor, plus multi-floor routing.
//
// Single-floor A* is ported from m3 (4-connected, Manhattan heuristic, walls
// blocked). The new part is MULTI-FLOOR: a journey across floors is a list of
// per-floor segments stitched at the aligned stairwell — the structural lift
// m3 didn't need (it was one floor). Returns segments [{floor, path:[{x,y}]}].

import { WALL, solid, dims, grid, point, objective, stairsTile } from './world.js';

export function astar(g, W, H, sx, sy, ex, ey, blocked = null) {
  const s = { x: Math.floor(sx), y: Math.floor(sy) };
  const e = { x: Math.floor(ex), y: Math.floor(ey) };
  if (e.x < 0 || e.x >= W || e.y < 0 || e.y >= H || solid(g[e.y][e.x])) return null;
  const open = [{ ...s, g: 0, f: 0 }], closed = new Set(), came = new Map();
  const isBlocked = (x, y) => solid(g[y][x]) || (blocked && blocked(x, y));
  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const c = open.shift(), k = `${c.x},${c.y}`;
    if (c.x === e.x && c.y === e.y) {
      const p = [c]; let cur = c;
      while (came.has(`${cur.x},${cur.y}`)) { cur = came.get(`${cur.x},${cur.y}`); p.unshift(cur); }
      return p.map(({ x, y }) => ({ x, y }));
    }
    if (closed.has(k)) continue;
    closed.add(k);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = c.x + dx, ny = c.y + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H || isBlocked(nx, ny) || closed.has(`${nx},${ny}`)) continue;
      const gg = c.g + 1, h = Math.abs(nx - e.x) + Math.abs(ny - e.y);
      came.set(`${nx},${ny}`, c);
      if (!open.find(n => n.x === nx && n.y === ny)) open.push({ x: nx, y: ny, g: gg, f: gg + h });
    }
  }
  return null;
}

// A journey across floors: a list of [floor, [x,y] start, [x,y] goal] legs.
// Each leg is A*'d on its floor; floors are joined by walking to the stairwell.
export function multiFloorRoute(levels, rooms, legs) {
  const { W, H } = dims(levels);
  const out = [];
  for (const [floor, from, to] of legs) {
    const path = astar(grid(levels, floor), W, H, from[0], from[1], to[0], to[1]);
    if (!path) throw new Error(`no path on ${floor} ${from}→${to}`);
    out.push({ floor, path });
  }
  return out;
}

// Convenience: build the legs for a crew member going from a start to an
// objective across floors, descending/ascending via the stairwell.
export function routeAcross(levels, rooms, startFloor, startPos, goalFloor, goalPos) {
  if (startFloor === goalFloor) {
    return multiFloorRoute(levels, rooms, [[startFloor, startPos, goalPos]]);
  }
  // one hop through the stairwell (enough for adjacent floors in this building)
  return multiFloorRoute(levels, rooms, [
    [startFloor, startPos, stairsTile(rooms, startFloor)],
    [goalFloor, stairsTile(rooms, goalFloor), goalPos],
  ]);
}

export function routeLength(segments) {
  return segments.reduce((n, s) => n + s.path.length, 0);
}
