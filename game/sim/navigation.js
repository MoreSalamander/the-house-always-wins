// Crew navigation — the "thinking" layer. Ported from m3, per-floor.
//
// A crew member doesn't just A* straight at a goal — they weigh several routes
// (direct, and around each side) by how exposed each is to guards and cameras,
// and pick the safest, with hysteresis so they don't dither. Every evaluation is
// recorded on the agent (routeType, routeScore, routeOptions, debugRoutes) so
// the debug view can DRAW the decision: the chosen path bright, the rejects dim,
// each with its score. That record is the legibility the whole project is about.

import { solid, dims, grid, roomOf } from './world.js';

// Public rooms — here the crew are guests, so guards and cameras don't shape
// their route (they only sneak once they're off the public floor).
const PUBLIC = new Set(['lobby', 'bar', 'casino', 'arena']);
import { astar } from './pathfind.js';
import { inCone } from './perception.js';
import { securityGapOpen, vaultGapOpen } from './guards.js';

const CREW_SPEED = 0.032;      // crew pace
const ROUTE_HYSTERESIS = 60;   // commit to a route — don't flip on every guard twitch
const REPLAN_EVERY = 10;       // frames between re-evaluations
const LOOKAHEAD = 8;           // tiles CELESTE scans ahead on a route for guard sightlines
const HOLD_PATIENCE = 120;     // a SHORT beat to wait for a window before committing through (≈2s)
const GUARD_CLEARANCE = 2.6;   // keep at least this far from a guard off the public floor — a margin over the point-blank catch range

// ---- threat at a point: guard vision/proximity + live camera cones ----------
export function threatAt(levels, floor, x, y, guards, cams, excludeCams = false) {
  const g = grid(levels, floor);
  const { W, H } = dims(levels);
  let threat = 0;
  for (const gd of guards) {
    if (gd.floor !== floor) continue;
    const d = Math.hypot(gd.x - x, gd.y - y);
    if (inCone(g, W, H, gd.x, gd.y, gd.facing, gd.fov, gd.range, x, y)) threat += 100;
    else if (d < gd.range + 2) threat += 40 - d * 5;
  }
  if (!excludeCams) {
    for (const c of cams) {
      if (c.public) continue;   // public cameras are visual only — the crew ignore them
      if (c.floor === floor && c.on && inCone(g, W, H, c.x, c.y, c.facing, c.fov, c.range, x, y)) threat += 100;
    }
  }
  return threat;
}

// ---- score a candidate path (higher = safer) --------------------------------
function scorePath(levels, rooms, floor, pts, guards, cams, checkCameras) {
  if (!pts || !pts.length) return -Infinity;
  const g = grid(levels, floor);
  const { W, H } = dims(levels);
  let minDist = Infinity, total = 0, checks = 0, dirPen = 0, camPen = 0, conePen = 0;
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    // in the public front the crew blend as guests — guards/cameras don't shape
    // the route there (only once they're north of the service wall, or in a
    // staff-only room, do sightlines matter)
    if (rooms) {
      const px = Math.floor(pt.x), py = Math.floor(pt.y), rm = roomOf(rooms, floor, px, py);
      if (py >= 24 && rm !== 'kitchen' && rm !== 'cage') continue;
    }
    for (const gd of guards) {
      if (gd.floor !== floor) continue;
      const d = Math.hypot(gd.x - pt.x, gd.y - pt.y);
      if (d < minDist) minDist = d;
      total += d; checks++;
      // walking through what a guard can actually SEE is the real danger
      if (inCone(g, W, H, gd.x, gd.y, gd.facing, gd.fov, gd.range, pt.x, pt.y)) conePen += 140;
      if (d <= GUARD_CLEARANCE) conePen += 220;     // point-blank — brushing past is an instant catch, avoid it like a sightline
      if (gd.path && gd.pi < gd.path.length) {                 // guard heading this way?
        const dest = gd.path[gd.path.length - 1];
        const toPt = Math.hypot(dest.x - pt.x, dest.y - pt.y);
        const toSelf = Math.hypot(dest.x - gd.x, dest.y - gd.y);
        if (toPt < toSelf && d < gd.range + 4) dirPen += 30;
      }
    }
    if (checkCameras) {
      for (const c of cams) {
        if (c.public) continue;   // public cameras are visual only — the crew ignore them
        if (c.floor === floor && c.on && inCone(g, W, H, c.x, c.y, c.facing, c.fov, c.range, pt.x, pt.y)) camPen += 100;
      }
    }
  }
  if (minDist === Infinity) minDist = 50;                        // no guards on this floor
  // …minus a cost for length, so the crew COMMIT to crossing a guarded chokepoint
  // rather than preferring an endless detour away from the objective (they accept
  // the risk — getting seen is the alarm's job, not a reason to freeze).
  return minDist * 10 + (checks ? total / checks : 0) - dirPen - camPen - conePen - pts.length * 3;
}

// a tile is "public" (crew blend freely) if it's south of the service wall and
// not a staff-only room
function publicTile(rooms, floor, x, y) {
  const fx = Math.floor(x), fy = Math.floor(y);
  if (fy <= 23) return false;
  const rm = roomOf(rooms, floor, fx, fy);
  return rm !== 'kitchen' && rm !== 'cage';
}

// is (x,y) inside any guard's live vision cone right now?
function seenByGuard(levels, floor, x, y, guards) {
  const g = grid(levels, floor);
  const { W, H } = dims(levels);
  for (const gd of guards) {
    if (gd.floor !== floor) continue;
    if (inCone(g, W, H, gd.x, gd.y, gd.facing, gd.fov, gd.range, x, y)) return true;
  }
  return false;
}

// is (x,y) within `radius` of any guard? (cone or not)
function nearGuard(floor, x, y, guards, radius = GUARD_CLEARANCE) {
  for (const gd of guards) {
    if (gd.floor !== floor) continue;
    if (Math.hypot(gd.x - x, gd.y - y) <= radius) return true;
  }
  return false;
}

// would stepping onto `pt` put a crew member somewhere they shouldn't be AND
// in danger — either inside a guard's sightline, or right up against one (which
// is now an instant catch). Either way the route logic treats it as exposed.
function exposedStep(levels, rooms, a, pt, guards) {
  if (publicTile(rooms, a.floor, pt.x, pt.y)) return false;
  return seenByGuard(levels, a.floor, pt.x, pt.y, guards) || nearGuard(a.floor, pt.x, pt.y, guards);
}

// HIDING SPOTS — room interiors the crew can duck into. A guard can't see
// through a door, so once a crew member is inside a room they're hidden, full
// stop. CELESTE sends them to the nearest one when there's no clean way past a
// guard; they wait it out, then slip back onto the route.
const HIDE_SPOTS = [
  [29, 19], [44, 19], [73, 19], [21, 19],   // break room / manager / counting / utility
  [22, 7], [63, 7], [77, 7], [7, 7],         // safety deposit / server / mechanical / loading dock
  [58, 18], [63, 18],                        // staff restroom / janitor closet (atrium, by the checkpoint)
];
function nearestHide(a, guards) {
  // flee to the nearest hide spot that ISN'T sitting next to a guard — never
  // break for cover in a direction that runs you up against the threat.
  let best = null, bd = Infinity, fallback = null, fd = Infinity;
  for (const [x, y] of HIDE_SPOTS) {
    const d = Math.hypot(x - a.x, y - a.y);
    if (d < fd) { fd = d; fallback = [x, y]; }            // nearest, regardless
    let nearG = false;
    if (guards) for (const g of guards) {
      if (g.floor === a.floor && Math.hypot(g.x - x, g.y - y) <= GUARD_CLEARANCE + 1.5) { nearG = true; break; }
    }
    if (!nearG && d < bd) { bd = d; best = [x, y]; }
  }
  return best || fallback;
}

// ---- the decision: evaluate routes, pick the safest, record everything ------
export function smartMove(levels, rooms, a, tx, ty, guards, cams, checkCameras = false) {
  const { W, H } = dims(levels);
  const g = grid(levels, a.floor);
  const direct = astar(g, W, H, a.x, a.y, tx, ty);
  if (!direct) { a.debugRoutes = []; return false; }

  const midX = (a.x + tx) / 2, midY = (a.y + ty) / 2;
  const clampX = v => Math.max(1, Math.min(W - 2, Math.round(v)));
  const clampY = v => Math.max(1, Math.min(H - 2, Math.round(v)));
  const via = (wx, wy) => {
    wx = clampX(wx); wy = clampY(wy);
    if (solid(g[wy][wx])) return null;
    const p1 = astar(g, W, H, a.x, a.y, wx, wy);
    const p2 = astar(g, W, H, wx, wy, tx, ty);
    return (p1 && p2) ? [...p1, ...p2.slice(1)] : null;
  };

  const cands = [{ name: 'DIRECT', path: direct }];
  const variants = {
    TOP:   via(midX, Math.min(a.y, ty) - 5),
    BOT:   via(midX, Math.max(a.y, ty) + 5),
    LEFT:  via(Math.min(a.x, tx) - 5, midY),
    RIGHT: via(Math.max(a.x, tx) + 5, midY),
  };
  for (const name in variants) if (variants[name]) cands.push({ name, path: variants[name] });

  cands.forEach(c => { c.score = scorePath(levels, rooms, a.floor, c.path, guards, cams, checkCameras); });
  let best = cands.reduce((p, q) => (q.score > p.score ? q : p), cands[0]);

  // hysteresis — stick with the current route unless a clearly better one exists
  if (a.routeType && a.path && a.pi < a.path.length) {
    const cur = cands.find(c => c.name === a.routeType);
    if (cur && best.score < cur.score + ROUTE_HYSTERESIS) best = cur;
  }

  const keeping = a.routeType === best.name && a.path && a.pi < a.path.length;
  if (!keeping) { a.path = best.path; a.pi = 1; }
  a.routeType = best.name;
  a.routeScore = best.score.toFixed(0);
  a.routeOptions = cands.map(c => `${c.name}:${c.score.toFixed(0)}`).join(' ');
  a.debugRoutes = cands.map(c => ({ name: c.name, path: c.path, score: c.score, chosen: c === best }));
  return true;
}

// ---- move one step along the current path -----------------------------------
function advanceAlong(a, speed) {
  if (!a.path || a.pi >= a.path.length) return 'idle';
  const t = a.path[a.pi];
  const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy);
  if (d > 0.01) a.facing = Math.atan2(dy, dx);
  if (d < speed) { a.x = t.x; a.y = t.y; if (++a.pi >= a.path.length) { a.path = null; return 'arrived'; } }
  else { a.x += dx / d * speed; a.y += dy / d * speed; }
  return 'moving';
}

// ---- objectives: an ordered queue per crew member ---------------------------
// One floor now: the crew walk IN and disperse across the public floor as cover
// — fighters to the pit, safecracker to the casino, explosives + conductor to
// the bar — then HOLD there, blending, until their staggered cue. Then the
// infiltrators cross the back of the house to their jobs, pausing at a guarded
// CHECKPOINT until the guard's gap opens (a gate waypoint, in place of the old
// stairwell gate). Fighters stay in the pit; the driver waits at the truck.
export function assignObjectives(crew, rooms) {
  const H = rooms.heist, F = 'floor1';
  const fight = H.fight.pos;
  const vault = H.mara_goal.pos;
  const sec = H.echo_stage1.pos;
  const dock = H.driver.pos;
  const checkHold = H.gates.checkpoint.hold;   // wait here for G-VAULT's gap
  const secHold = H.gates.security.hold;       // wait here for G-SEC's gap
  const casino = [70, 40];                      // SABLE blends among the games
  const barL = [34, 40];                         // CELESTE blends at the bar
  const arenaStage = [18, 42];                   // DORIAN blends in the arena crowd
  const set = (name, objs) => {
    const c = crew.find(m => m.name === name);
    if (c) { c.objectives = objs; c.objIdx = 0; c.replanTimer = 0; c.holdTimer = 0; }
  };
  // CELESTE peels off first (a brief blend, then in to tap the feed). The
  // infiltrators HOLD in their blend spots until she's seized the camera
  // console, then release one by one (a per-member stagger after the signal).
  set('CELESTE', [
    { floor: F, pos: barL, hold: 200 },
    { floor: F, pos: secHold, gate: 'security' },
    { floor: F, pos: sec },
  ]);
  set('SABLE', [
    { floor: F, pos: casino, releaseOn: 'console', stagger: 120 },
    { floor: F, pos: checkHold, gate: 'vault' },
    { floor: F, pos: vault },
  ]);
  // DORIAN goes ONE AT A TIME — he holds in the arena until SABLE has reached
  // the vault, then crosses (so they're never both in the secure core at once)
  set('DORIAN', [
    { floor: F, pos: arenaStage, releaseOn: 'sable', stagger: 60 },
    { floor: F, pos: checkHold, gate: 'vault' },
    { floor: F, pos: [vault[0] + 2, vault[1]] },
  ]);
  set('AUGUSTE', [{ floor: F, pos: [fight[0] - 1, fight[1]] }]);   // the fight
  set('ROMAN',   [{ floor: F, pos: [fight[0] + 1, fight[1]] }]);
  set('MARLOWE', [{ floor: F, pos: dock }]);                       // the wheel
}

function gateOpen(gate, guards) {
  if (gate === 'security') return securityGapOpen(guards);
  if (gate === 'vault') return vaultGapOpen(guards);
  return true;
}

// ---- advance one crew member one frame (walk the objective queue) ------------
// `signals` carries run-level cues (e.g. consoleHeld = CELESTE has the feed).
export function stepCrewMember(levels, rooms, a, guards, cams, signals = {}) {
  if (!a.objectives || a.objIdx >= a.objectives.length) { a.action = 'holding'; a.path = null; return; }

  const cur = a.objectives[a.objIdx];
  const target = cur.pos;
  const atTarget = Math.hypot(a.x - target[0], a.y - target[1]) < 1.5;

  if (atTarget) {
    // HOLD to blend in (a timed beat)
    if (cur.hold && (a.holdTimer || 0) < cur.hold) {
      a.holdTimer = (a.holdTimer || 0) + 1;
      a.path = null; a.debugRoutes = [];
      a.action = `blending in — holding for the cue (${cur.hold - a.holdTimer})`;
      return;
    }
    // RELEASE on a run cue — hold in the blend spot until the signal fires, then
    // a short stagger. 'console' = CELESTE has the feed; 'sable' = SABLE has
    // reached the vault (so DORIAN crosses one at a time).
    if (cur.releaseOn) {
      const ready = cur.releaseOn === 'console' ? signals.consoleHeld
                  : cur.releaseOn === 'sable'   ? signals.sableAtVault
                  : true;
      if (!ready) {
        a.path = null; a.debugRoutes = []; a.holdTimer = 0;
        a.action = cur.releaseOn === 'sable'
          ? 'blending in — waiting for SABLE to clear the vault…'
          : 'blending in — waiting for CELESTE to tap the feed…';
        return;
      }
      if ((a.holdTimer || 0) < (cur.stagger || 0)) {
        a.holdTimer = (a.holdTimer || 0) + 1;
        a.path = null; a.debugRoutes = [];
        a.action = `cue is up — moving (${cur.stagger - a.holdTimer})`;
        return;
      }
    }
    // GATE — tucked at the checkpoint, waiting for the guard's gap
    if (cur.gate && !gateOpen(cur.gate, guards)) {
      a.path = null; a.debugRoutes = [];
      a.action = 'at the checkpoint — waiting for the gap…';
      return;
    }
    // advance the queue (or settle at the final objective)
    if (a.objIdx < a.objectives.length - 1) {
      a.objIdx++; a.holdTimer = 0;
      a.path = null; a.routeType = null; a.debugRoutes = [];
      a.action = cur.gate ? 'gap — slipping through' : 'cue — moving out';
    } else {
      a.path = null; a.debugRoutes = []; a.action = 'at objective';
    }
    return;
  }

  const tag = signals.consoleHeld && a.role !== 'conductor' ? 'CELESTE: ' : '';
  const avoidCams = a.role !== 'conductor';             // CELESTE owns the cameras
  const blockedAhead = () => {
    if (!a.path) return false;
    for (let i = a.pi; i < Math.min(a.path.length, a.pi + LOOKAHEAD); i++)
      if (exposedStep(levels, rooms, a, a.path[i], guards)) return true;
    return false;
  };

  // SPOTTED — a guard has eyes on them (the spot clock is ticking). Break line
  // of sight FAST: bolt for the nearest room. Reaching cover drops the spot
  // before it confirms. (Mere proximity does NOT trigger this — that's handled
  // by the hard give-way gate before they move; hiding is a last resort for an
  // actual sighting, not a reaction to a guard walking by.)
  if ((a.spot || 0) > 0 && !a.hiding) {
    const s = nearestHide(a, guards);
    if (s) { a.hiding = true; a.hideTarget = s; a.routeType = null; }
  }

  // HIDING — bolt to cover, then wait in the room until the spot has faded and
  // the way out is clear, and emerge
  if (a.hiding) {
    const atHide = Math.hypot(a.x - a.hideTarget[0], a.y - a.hideTarget[1]) < 1.2;
    if (!atHide) {
      smartMove(levels, rooms, a, a.hideTarget[0], a.hideTarget[1], guards, cams, avoidCams);
      // even fleeing, never step point-blank into a guard (that's an instant
      // catch) — if the bolt would breach clearance, hold and break LOS in place
      const nt = a.path && a.pi < a.path.length ? a.path[a.pi] : null;
      if (!(nt && !publicTile(rooms, a.floor, nt.x, nt.y) && nearGuard(a.floor, nt.x, nt.y, guards, GUARD_CLEARANCE)))
        advanceAlong(a, CREW_SPEED);
      a.action = tag + ((a.spot || 0) > 0 ? 'spotted — breaking for cover!' : 'slipping into cover');
      return;
    }
    if ((a.spot || 0) > 0) { a.path = null; a.debugRoutes = []; a.action = tag + 'in cover — guard still looking'; return; }
    // spot has faded — emerge once the immediate way out is clear
    smartMove(levels, rooms, a, target[0], target[1], guards, cams, avoidCams);
    let canMove = !!a.path;
    if (a.path) for (let i = a.pi; i < Math.min(a.path.length, a.pi + 3); i++)
      if (exposedStep(levels, rooms, a, a.path[i], guards)) { canMove = false; break; }
    if (!canMove) { a.path = null; a.debugRoutes = []; a.action = tag + 'hidden — waiting it out'; return; }
    a.hiding = false; a.hideTarget = null;
  }

  // navigate toward the target
  a.replanTimer = (a.replanTimer || 0) + 1;
  if (a.replanTimer >= REPLAN_EVERY || !a.path) {
    a.replanTimer = 0;
    if (smartMove(levels, rooms, a, target[0], target[1], guards, cams, avoidCams))
      a.action = `→ objective via ${a.routeType} (${a.routeScore})`;
    else a.action = 'seeking route…';
  }

  // CELESTE CONDUCTS — the way ahead crosses a guard's sightline. With patrols
  // this predictable, the FIRST move is to WAIT, not gamble: if they're unseen
  // where they stand, hold and let the cone sweep past — the window will open.
  // Waiting a beat beats risking a sighting. Only after waiting in vain do they
  // try to route around; hiding stays a LAST RESORT for an actual sighting (the
  // spot clock above), e.g. an unpredictable glance they couldn't wait out.
  if (blockedAhead()) {
    const safeHere = !exposedStep(levels, rooms, a, { x: Math.round(a.x), y: Math.round(a.y) }, guards);
    if (safeHere && (a.holdWait || 0) < HOLD_PATIENCE) {
      a.holdWait = (a.holdWait || 0) + 1;
      a.path = null; a.debugRoutes = [];
      a.action = tag + 'holding — waiting for the window';
      return;
    }
    // the window didn't open in that beat (or they're already exposed) — stop
    // waiting and COMMIT: take the best route and push through, even into a
    // sightline. An actual sighting from here is exactly what the spot clock +
    // hiding (above) are the last resort for. (holdWait stays maxed so they keep
    // moving; it resets the moment the way ahead is clear again.)
    a.routeType = null;
    smartMove(levels, rooms, a, target[0], target[1], guards, cams, avoidCams);
    const n2 = a.path && a.pi < a.path.length ? a.path[a.pi] : null;
    a.action = tag + (n2 && exposedStep(levels, rooms, a, n2, guards)
      ? 'no window — pushing through' : `reroute via ${a.routeType}`);
  } else {
    a.holdWait = 0;
  }
  // GIVE WAY (hard rule) — off the public floor, never step inside a guard's
  // clearance, whichever way it's facing. If the next tile would breach it, hold
  // and let the guard move on. This is why they don't walk into a guard's back.
  if (a.path && a.pi < a.path.length) {
    const nt = a.path[a.pi];
    if (!publicTile(rooms, a.floor, nt.x, nt.y) && nearGuard(a.floor, nt.x, nt.y, guards, GUARD_CLEARANCE)) {
      a.action = tag + 'giving way — guard too close';
      return;
    }
  }
  advanceAlong(a, CREW_SPEED);
}

export function stepCrew(levels, rooms, crew, guards, cams, signals = {}) {
  // derive run cues for sequential release (SABLE settled at the vault)
  const sable = crew.find(c => c.name === 'SABLE');
  signals.sableAtVault = !!(sable && sable.objectives &&
    sable.objIdx >= sable.objectives.length - 1 && sable.action === 'at objective');
  for (const a of crew) stepCrewMember(levels, rooms, a, guards, cams, signals);
}
