// Detection — the fail condition, built on perception.
//
// A guard or a live camera "catches" a crew member when that member is inside
// the observer's vision cone with clear line-of-sight, ON THE SAME FLOOR (sight
// never crosses floors). Cameras only catch while ON — CELESTE turning a feed
// dark is what creates the blind window. A crew member in a safe zone (the pit
// crowd, a hiding spot) isn't catchable.
//
// Pure: returns the list of detections this instant. What the run DOES with a
// detection (alarm now, or the escape-race if the outside line is cut) is the
// mechanics layer's job, not this one.

import { inCone } from './perception.js';
import { grid, dims } from './world.js';

export function observerSees(levels, obs, target) {
  if (obs.floor !== target.floor) return false;        // vision is per-floor
  const g = grid(levels, obs.floor);
  const { W, H } = dims(levels);
  return inCone(g, W, H, obs.x, obs.y, obs.facing, obs.fov, obs.range, target.x, target.y);
}

export function detect(levels, guards, cams, crew) {
  const hits = [];
  for (const c of crew) {
    if (c.safe || c.escaped) continue;                 // hidden / already out
    for (const g of guards) {
      if (observerSees(levels, g, c)) {
        hits.push({ by: g.id, kind: 'guard', who: c.name, floor: c.floor });
      }
    }
    for (const cam of cams) {
      if (cam.on && observerSees(levels, cam, c)) {
        hits.push({ by: cam.id, kind: 'camera', who: c.name, floor: c.floor });
      }
    }
  }
  return hits;
}

// How many feeds are dark — CELESTE may only run ONE blackout at a time before
// the house's dead-feed detector notices (the camera-blackout gate).
export function feedsDark(cams) {
  return cams.filter(c => !c.on).length;
}
