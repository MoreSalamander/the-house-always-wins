// Guard AI — the house's eyes in motion. Ported from m3, per-floor.
//
// A guard roams (or walks a fixed patrol loop) to a target, then runs a SCAN at
// the waypoint — pausing and rotating to look left / right / back — before
// choosing the next. Those sweeping cones are what make detection a live, timed
// problem: Celeste has to read the rhythm and route the crew through the gaps.
//
// Guards stay on their own floor (they don't take the stairs). Movement is
// frame-stepped; everything random comes from the seeded rng, so a patrol
// replays identically for a given seed.

import { solid, dims, grid } from './world.js';
import { astar } from './pathfind.js';

const GUARD_SPEED = 0.02;     // tiles/frame (crew faster)
const ROAM_MIN_DIST = 8;      // don't pick a target right on top of yourself
const SCAN_WAIT = 35;         // frames held at each look angle
const ARRIVE_WAIT = 40;       // beat of stillness on arrival before scanning
const GLANCE_CHANCE = 0.0035; // per frame, a walking patroller may glance somewhere
const GLANCE_FRAMES = 50;     // how long a glance holds (the house's edge)

function advance(g, speed) {
  const t = g.path[g.pi];
  const dx = t.x - g.x, dy = t.y - g.y, d = Math.hypot(dx, dy);
  if (d > 0.01) g.facing = Math.atan2(dy, dx);     // face where you're walking
  if (d < speed) {
    g.x = t.x; g.y = t.y;
    if (++g.pi >= g.path.length) { g.path = null; return 'arrived'; }
  } else {
    g.x += dx / d * speed; g.y += dy / d * speed;
  }
  return 'moving';
}

function pickRoam(levels, g, rng) {
  const { W, H } = dims(levels);
  const grd = grid(levels, g.floor);
  // roamZone [x,y,w,h] keeps a guard in his own area (so he never wanders the
  // public lounge / kitchen); without one he roams the whole floor
  const z = g.roamZone;
  const x0 = z ? z[0] : 1, y0 = z ? z[1] : 1;
  const xw = z ? z[2] : W - 2, yh = z ? z[3] : H - 2;
  for (let i = 0; i < 60; i++) {
    const x = x0 + Math.floor(rng() * xw);
    const y = y0 + Math.floor(rng() * yh);
    if (x > 0 && x < W - 1 && y > 0 && y < H - 1 &&
        !solid(grd[y][x]) && Math.hypot(x - g.x, y - g.y) >= ROAM_MIN_DIST) {
      return { x, y };
    }
  }
  return null;
}

function nextTarget(levels, g, rng) {
  if (g.patrol && g.patrol.length) {                 // fixed loop
    g.patrolIdx = ((g.patrolIdx || 0) + 1) % g.patrol.length;
    const [x, y] = g.patrol[g.patrolIdx];
    return { x, y };
  }
  return pickRoam(levels, g, rng);                   // free roam
}

// A "duty" guard alternates between standing his post (scanning) and stepping
// away on a break — a shift change / a trip to the restroom. While he's away
// from his post, the room is unwatched: that's the GAP the conductor waits for.
function updateDuty(g) {
  g.dutyTimer = (g.dutyTimer || 0) + 1;
  const was = !!g.onBreak;
  if (!g.onBreak && g.dutyTimer > g.duty.onPost) { g.onBreak = true; g.dutyTimer = 0; }
  else if (g.onBreak && g.dutyTimer > g.duty.onBreak) { g.onBreak = false; g.dutyTimer = 0; }
  if (was !== !!g.onBreak) { g.path = null; g.scanPhase = 3; g.wait = 0; }  // redirect now
}
function dutyTarget(g) {
  const p = g.onBreak ? g.duty.breakPoint : g.duty.post;
  return { x: p[0], y: p[1] };
}

// Is a duty guard's post unwatched right now? (on break AND away from it.)
export function gapOpen(guards, id) {
  const g = guards.find(x => x.id === id);
  if (!g || !g.duty) return true;
  return !!g.onBreak && Math.hypot(g.x - g.duty.post[0], g.y - g.duty.post[1]) > 4;
}
export function securityGapOpen(guards) { return gapOpen(guards, 'G-SEC'); }
export function vaultGapOpen(guards) { return gapOpen(guards, 'G-VAULT'); }

// Advance one guard by one frame.
export function stepGuard(levels, g, rng) {
  if (g.fixed) { g.state = 'WATCH'; return; }   // posted at a desk — never moves, gaze fixed on the room
  if (g.duty) updateDuty(g);
  if (g.wait > 0) { g.wait--; return; }

  if (g.path) {                                      // walking to a waypoint
    g.state = g.onBreak ? 'TO_BREAK' : 'MOVING';
    // THE HOUSE'S EDGE — a patrolling guard occasionally stops mid-stride to
    // glance around an unpredictable way; the crew can't fully time it, so even
    // a clean run carries a floor of risk
    if (g.patrol && !g.duty) {
      if (g.glance > 0) { g.glance--; g.facing = g.glanceDir; g.state = 'SCAN'; return; }
      if (rng() < GLANCE_CHANCE) { g.glance = GLANCE_FRAMES; g.glanceDir = rng() * Math.PI * 2; g.facing = g.glanceDir; g.state = 'SCAN'; return; }
    }
    if (advance(g, GUARD_SPEED) === 'arrived') { g.scanPhase = 0; g.wait = ARRIVE_WAIT; }
    // a fixed-gaze duty guard keeps his eyes on his station even while walking,
    // so his cone never sweeps the corridor the crew cross
    if (g.duty && g.duty.postFacing != null)
      g.facing = g.onBreak && g.duty.breakFacing != null ? g.duty.breakFacing : g.duty.postFacing;
    return;
  }

  // a duty guard with a fixed gaze holds it instead of sweeping — but ONLY once
  // he's arrived at his station; while walking (post↔break) he still moves
  // normally. On post he watches his station; on break he keeps facing it (away
  // from the floor) so his break is a genuine gap, not a roving cone.
  if (g.duty && g.duty.postFacing != null && !g.path) {
    const tgt = g.onBreak ? g.duty.breakPoint : g.duty.post;
    if (Math.hypot(g.x - tgt[0], g.y - tgt[1]) < 1.5) {
      g.facing = g.onBreak && g.duty.breakFacing != null ? g.duty.breakFacing : g.duty.postFacing;
      g.state = g.onBreak ? 'BREAK' : 'POST'; g.wait = 20; g.scanPhase = 0;
      return;
    }
  }

  // arrived: run the look-around scan (forward → left → right → back to center)
  if (g.scanPhase < 3) {
    g.scanPhase = (g.scanPhase || 0) + 1;
    if (g.scanPhase === 1) g.facing -= Math.PI / 2;        // glance left
    else if (g.scanPhase === 2) g.facing += Math.PI;       // glance right
    else g.facing -= Math.PI / 2;                          // settle center
    g.state = g.onBreak ? 'BREAK' : 'SCAN';
    g.wait = SCAN_WAIT;
    return;
  }

  // scan done → pick the next destination
  g.scanPhase = 0;
  g.state = g.onBreak ? 'BREAK' : 'IDLE';
  const { W, H } = dims(levels);
  const tgt = g.duty ? dutyTarget(g) : nextTarget(levels, g, rng);
  if (tgt) {
    const p = astar(grid(levels, g.floor), W, H, g.x, g.y, tgt.x, tgt.y);
    if (p && p.length > 1) { g.path = p; g.pi = 1; g.roamTarget = tgt; return; }
  }
  g.wait = 15;                                       // at post / break point — hold, then re-evaluate
}

export function stepGuards(levels, guards, rng) {
  for (const g of guards) stepGuard(levels, g, rng);
}
