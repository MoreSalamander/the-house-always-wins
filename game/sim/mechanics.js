// Mechanics — the first slice that makes the house BITE.
//
// Up to now guards and cameras only shaped routing (the crew preferred quiet
// paths). This layer gives sightings a consequence, and gives CELESTE the tool
// to fight back:
//
//   · DETECTION  — each frame, anyone a guard or a LIVE camera can see raises an
//                  alarm meter. Held in view long enough → CAUGHT. (Out of sight,
//                  the alarm cools off.) The conductor is immune to cameras —
//                  she owns the feeds — but guards can still spot her.
//
//   · THE RELAY  — once CELESTE reaches the security console, she runs a
//                  travelling blackout: she darkens the ONE camera currently
//                  watching a crew member, restoring it the moment they pass.
//                  Only one feed dark at a time (the house's dead-feed detector
//                  would notice more) — so if two crew are exposed to two
//                  different cameras at once, she can only cover one. That gap
//                  is where a run goes wrong.
//
// Pure-ish: mutates `state` and `cams[].on`; reads everything else.

import { detect, observerSees } from './detection.js';
import { roomOf } from './world.js';

// Who can be "caught" and where. The fighters performing in the pit and the
// driver parked at the truck are sanctioned cover — the house expects them.
// Only the infiltrators draw heat, and only while EXPOSED: somewhere a guest
// shouldn't be (off the public floor, edging to the stairs, or up/down stairs),
// and still EN ROUTE — once they've reached their area they're in position
// (behind the vault door, at the console) and out of the open.
const INFILTRATORS = new Set(['conductor', 'safecracker', 'explosives']);
const PUBLIC = new Set(['lobby', 'bar', 'casino', 'arena']);

function restricted(rooms, c) {
  // region-based so boundary/door tiles between public rooms aren't false flags:
  // anything north of the service wall (y<=23) is back-of-house / secure core,
  // plus the staff-only rooms (kitchen, cage) that sit inside the public band.
  const x = Math.floor(c.x), y = Math.floor(c.y);
  if (y <= 23) return true;
  const r = roomOf(rooms, 'floor1', x, y);
  return r === 'kitchen' || r === 'cage';
}

function exposed(rooms, c) {
  if (!INFILTRATORS.has(c.role) || c.safe || c.escaped) return false;
  const a = c.action || '';
  // tucked against cover — in position, holding for a gap, or blending in
  if (a === 'at objective' || a.includes('waiting') || a.includes('blending')) return false;
  return restricted(rooms, c);                            // caught only while moving in the open
}

export function initHeist() {
  return {
    alarm: 0,            // 0..1 — hits push it up, quiet cools it down
    caught: false,       // alarm maxed → the house is onto them
    spotted: [],         // names seen THIS frame (for the overlay)
    consoleHeld: false,  // CELESTE has the monitor wall
    darkCam: null,       // the single feed she's currently blacking out
    lastHit: null,
  };
}

const SPOT_FRAMES = 110;      // frames a guard must keep eyes on a crew member to CONFIRM a catch
const SPOT_RECOVER = 5;       // how fast the spot fades once line-of-sight is broken
const CAUGHT_RANGE = 1.6;     // point-blank: a guard can't miss someone right beside them, cone or not — instant catch
const CLEAR_SIGHT = 2.8;      // squarely in a guard's view THIS close (right in front of them) = caught on the spot, no grace. Farther in-cone sightings get the duck-for-cover spot clock.

// CELESTE's travelling blackout: restore last frame's dark feed, then dark the
// one live camera currently watching an EXPOSED (non-conductor) crew member.
function runRelay(state, levels, rooms, crew, cams) {
  if (state.darkCam) {
    const prev = cams.find(c => c.id === state.darkCam);
    if (prev) prev.on = true;
    state.darkCam = null;
  }
  if (!state.consoleHeld) return;
  for (const cam of cams) {
    if (!cam.on) continue;
    const sees = crew.some(c => c.role !== 'conductor' && exposed(rooms, c) && observerSees(levels, cam, c));
    if (sees) { cam.on = false; state.darkCam = cam.id; return; }   // one feed only
  }
}

export function stepHeist(state, levels, rooms, crew, guards, cams) {
  // CELESTE seizes the console once she's settled at the security office
  const celeste = crew.find(c => c.role === 'conductor');
  if (celeste) {
    const sec = rooms.heist.echo_stage1.pos;
    if (Math.hypot(celeste.x - sec[0], celeste.y - sec[1]) < 2) state.consoleHeld = true;
  }

  runRelay(state, levels, rooms, crew, cams);

  // only EXPOSED infiltrators (off the public floor, on the move) can be seen;
  // the conductor is immune to cameras (she owns the feeds)
  const watch = crew.filter(c => exposed(rooms, c));
  const hits = detect(levels, guards, cams, watch)
    .filter(h => !(h.kind === 'camera' && crewRole(crew, h.who) === 'conductor'));
  const seenBy = {};
  for (const h of hits) seenBy[h.who] = h;

  // INSTANT CATCHES — no grace, no ducking out of it:
  //   · POINT-BLANK: right up against a guard, cone or not (can't tiptoe past
  //     someone an arm's length away).
  //   · IN PLAIN SIGHT: squarely in a guard's view at close range — running
  //     across right in front of them. The spot-clock grace below is only for
  //     sightings FARTHER than CLEAR_SIGHT (caught in route, with a beat to duck).
  for (const c of watch) {
    for (const g of guards) {
      if (g.floor !== c.floor) continue;
      const d = Math.hypot(c.x - g.x, c.y - g.y);
      if (d <= CAUGHT_RANGE) {
        state.caught = true;
        state.lastHit = { who: c.name, kind: 'point-blank', by: g.id };
      } else if (d <= CLEAR_SIGHT && observerSees(levels, g, c)) {
        state.caught = true;
        state.lastHit = { who: c.name, kind: 'in plain sight', by: g.id };
      }
    }
  }

  // SPOTTED — being seen doesn't catch instantly; it starts a clock. Stay in a
  // guard's sightline and it counts up to a CONFIRMED catch. Break line of sight
  // (duck into cover, or the guard glances away) and the spot fades fast. That
  // window is what hiding exploits.
  for (const c of crew) {
    if (!INFILTRATORS.has(c.role)) continue;
    if (seenBy[c.name]) {
      c.spot = (c.spot || 0) + 1;
      if (c.spot >= SPOT_FRAMES) { state.caught = true; state.lastHit = seenBy[c.name]; }
    } else {
      c.spot = Math.max(0, (c.spot || 0) - SPOT_RECOVER);
    }
  }
  state.spotted = crew.filter(c => (c.spot || 0) > 0).map(c => c.name);
  return state;
}

function crewRole(crew, name) {
  const c = crew.find(m => m.name === name);
  return c ? c.role : null;
}
