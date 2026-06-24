// Staff & suspicion — the soft detection layer.
//
// The house's workers (front desk, bar, dealers, cocktail waitress, pit boss)
// don't CATCH the crew — they just work the floor. But they have eyes. When one
// sees a guest somewhere a guest shouldn't be — slipping toward the stairs, in
// back-of-house — their suspicion climbs. Held high enough, they CALL SECURITY,
// and the nearest guard breaks off to investigate the spot. Suspicion decays
// when nothing's amiss, so the crew can cool a room down by staying clean.
//
// This is the "something's afoot" pressure: not a fail, an escalation.

import { solid, dims, grid, roomOf } from './world.js';
import { inCone } from './perception.js';
import { astar } from './pathfind.js';

const STAFF_SPEED = 0.016;      // staff pace
const SUSPECT_RATE = 0.012;     // per frame while watching something off
const LOITER_RATE = 0.004;      // slower creep while a guest just LINGERS in view
const DWELL_GRACE = 200;        // frames you can blend in a worker's sightline before it wears thin
const DECAY = 0.005;            // per frame when all looks normal
const ALERT_AT = 1.0;
const DOOR_PROXIMITY = 4;       // a guest this close to a service door reads as "off"

// where guests are allowed to be (the public floor)
const PUBLIC = new Set(['lobby', 'bar', 'casino', 'arena']);

function outOfPlace(rooms, c) {
  const r = roomOf(rooms, 'floor1', Math.floor(c.x), Math.floor(c.y));
  if (!PUBLIC.has(r)) return true;                       // cage, back-of-house, secure core, corridors
  for (const d of rooms.floors.floor1.points.service_doors) // edging toward the back
    if (Math.hypot(c.x - d[0], c.y - d[1]) < DOOR_PROXIMITY) return true;
  return false;
}

function advance(a, speed) {
  if (!a.path || a.pi >= a.path.length) { a.path = null; return; }
  const t = a.path[a.pi];
  const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy);
  if (d > 0.01) a.facing = Math.atan2(dy, dx);
  if (d < speed) { a.x = t.x; a.y = t.y; if (++a.pi >= a.path.length) a.path = null; }
  else { a.x += dx / d * speed; a.y += dy / d * speed; }
}

function pickStaffRoam(levels, rooms, st, rng) {
  const { W, H } = dims(levels);
  const g = grid(levels, st.floor);
  for (let i = 0; i < 40; i++) {
    const x = st.home[0] + Math.round((rng() * 2 - 1) * 8);
    const y = st.home[1] + Math.round((rng() * 2 - 1) * 8);
    if (x > 0 && x < W && y > 0 && y < H && !solid(g[y][x]) &&
        PUBLIC.has(roomOf(rooms, st.floor, x, y)) &&
        Math.hypot(x - st.x, y - st.y) >= 3) {
      return { x, y };
    }
  }
  return null;
}

function callSecurity(levels, st, loc, guards, ctx) {
  const { W, H } = dims(levels);
  let best = null, bd = Infinity;
  for (const g of guards) {
    if (g.floor !== st.floor) continue;
    const d = Math.hypot(g.x - loc.x, g.y - loc.y);
    if (d < bd) { bd = d; best = g; }
  }
  if (best) {
    const p = astar(grid(levels, best.floor), W, H, best.x, best.y, Math.floor(loc.x), Math.floor(loc.y));
    if (p && p.length > 1) { best.path = p; best.pi = 1; best.investigating = true; }
  }
  (ctx.calls ||= []).push({ by: st.id, floor: st.floor,
    loc: { x: Math.round(loc.x), y: Math.round(loc.y) }, frame: ctx.frame || 0 });
  ctx.securityCalled = true;
}

export function stepStaff(levels, rooms, st, crew, guards, rng, ctx) {
  const { W, H } = dims(levels);
  const g = grid(levels, st.floor);

  // work the floor
  if (st.kind === 'ROAM') {
    if (st.wait > 0) { st.wait--; }
    else if (st.path) advance(st, STAFF_SPEED);
    else {
      const t = pickStaffRoam(levels, rooms, st, rng);
      if (t) { const p = astar(g, W, H, st.x, st.y, t.x, t.y); if (p && p.length > 1) { st.path = p; st.pi = 1; } else st.wait = 30; }
      else st.wait = 30;
    }
  }

  // watch the room → suspicion. Two triggers:
  //  · OFF      — a guest somewhere they shouldn't be (fast climb)
  //  · LINGER   — a guest blending in plain sight, but standing in the worker's
  //               sightline too long (slow climb once the dwell grace runs out)
  let sawOff = false, sawLinger = false, where = null, lingerWhere = null;
  for (const c of crew) {
    if (c.escaped || c.safe || c.floor !== st.floor) continue;
    if (!inCone(g, W, H, st.x, st.y, st.facing, st.fov, st.range, c.x, c.y)) continue;
    if (outOfPlace(rooms, c)) { sawOff = true; where = { x: c.x, y: c.y }; }
    else { sawLinger = true; lingerWhere = { x: c.x, y: c.y }; }
  }
  if (sawOff) {
    st.suspicion = Math.min(1, st.suspicion + SUSPECT_RATE);
    st.lastSeen = where; st.dwell = 0;
    if (st.state !== 'ALERTING') st.state = 'SUSPICIOUS';
  } else if (sawLinger) {
    st.dwell = (st.dwell || 0) + 1;
    if (st.dwell > DWELL_GRACE) {                          // the blend has worn thin
      st.suspicion = Math.min(1, st.suspicion + LOITER_RATE);
      st.lastSeen = lingerWhere;
      if (st.state !== 'ALERTING') st.state = 'SUSPICIOUS';
    } else {
      st.suspicion = Math.max(0, st.suspicion - DECAY);    // still just another patron
    }
  } else {
    st.dwell = 0;
    st.suspicion = Math.max(0, st.suspicion - DECAY);
    if (st.suspicion < 0.05 && st.state !== 'ALERTING') st.state = 'WORKING';
  }

  if (st.suspicion >= ALERT_AT && st.state !== 'ALERTING') {
    st.state = 'ALERTING';
    callSecurity(levels, st, st.lastSeen || { x: st.x, y: st.y }, guards, ctx);
  }
}

export function stepStaffAll(levels, rooms, staff, crew, guards, rng, ctx) {
  for (const st of staff) stepStaff(levels, rooms, st, crew, guards, rng, ctx);
}
