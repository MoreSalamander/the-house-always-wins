// The cast, on the single-floor house.
//
// The crew (final names): CELESTE the conductor, SABLE the safecracker, DORIAN
// the explosives, AUGUSTE + ROMAN the fighters, MARLOWE the driver. Plus the
// house's guards, cameras, and staff. Everyone lives on one floor now, so the
// heist plays out across the map: public floor up front, back-of-house behind
// the service wall, the vault deep in the secure core behind a checkpoint.
//
// Guard/camera/staff placements are a sensible STARTER set to tune on the bench.

import { objective } from './world.js';

export const CREW = {
  CELESTE: { role: 'conductor',  color: '#7fd4ff' },
  SABLE:   { role: 'safecracker', color: '#c9a0ff' },
  DORIAN:  { role: 'explosives', color: '#ff9a6a' },
  AUGUSTE: { role: 'fighter',    color: '#e0b85c' },
  ROMAN:   { role: 'fighter',    color: '#d44c48' },
  MARLOWE: { role: 'driver',     color: '#67c97a' },
};

export function initialCrew(rooms) {
  const start = objective(rooms, 'mara_start').pos;   // the lobby, at the doors
  const fight = objective(rooms, 'fight').pos;        // the arena
  const dock = objective(rooms, 'driver').pos;        // the loading dock
  const at = (x, y, name) => ({
    name, ...CREW[name], floor: 'floor1', x, y, facing: -Math.PI / 2,
    state: 'IDLE', phase: 0, path: null, pi: 0, action: 'standing by',
  });
  return [
    at(start[0] - 2, start[1], 'CELESTE'),   // enter, blend at the bar, then to the security office
    at(start[0],     start[1], 'SABLE'),     // enter, blend at the casino, then to the vault
    at(start[0] + 2, start[1], 'DORIAN'),    // follows SABLE
    at(fight[0] - 1, fight[1], 'AUGUSTE'),   // in the pit
    at(fight[0] + 1, fight[1], 'ROMAN'),
    at(dock[0],      dock[1],  'MARLOWE'),   // at the truck
  ];
}

// Guards — posts across the single floor. facing in radians, 0 = +x.
// Two of them work a DUTY CYCLE (post ↔ break) — their breaks are the gaps the
// crew time their crossings to:
//   · G-SEC   guards the security office (CELESTE's gate)
//   · G-VAULT guards the secure-core checkpoint (SABLE's gate)
export function initialGuards() {
  const g = (id, x, y, facing, zone) => ({
    id, floor: 'floor1', x, y, facing, fov: Math.PI / 2, range: 8,
    zone, state: 'IDLE', path: null, pi: 0, scanPhase: 0, wait: 0,
  });
  return [
    // public floor — two stationary guards posted at desks in the LOBBY, at the
    // entrances to the arena and the casino (no lobby patrol)
    g('G-DOOR-A', 26, 50, 0, 'lobby_arena'),           // between the arena wall and his desk, facing the room
    g('G-DOOR-C', 57, 50, Math.PI, 'lobby_casino'),    // between the casino wall and his desk, facing the room
    g('G-CASINO', 70, 40, Math.PI, 'casino'),
    g('G-ARENA',  18, 30, Math.PI / 2, 'arena'),   // outside the ring (the ring is solid now)
    // back-of-house
    g('G-HALL2',  14, 23, 0, 'back_hall'),            // west third of the back-of-house corridor
    g('G-HALL',   41, 23, 0, 'back_hall'),            // middle third
    g('G-BOH',    68, 23, 0, 'back_hall'),            // east third
    // secure core
    g('G-DEP',    25, 13, 0, 'core'),                 // west third of the secure-core corridor
    g('G-CORE',   48, 13, 0, 'core'),                 // middle third
    g('G-CORE2',  70, 13, 0, 'core'),                 // east third
  ].map(gd => {
    // posted desk guards — never move, gaze fixed on the middle of the room
    if (gd.id === 'G-DOOR-A' || gd.id === 'G-DOOR-C') return { ...gd, fixed: true };
    // chokepoint patrollers — sweep the routes the infiltrators must cross
    if (gd.id === 'G-CASINO') return {
      ...gd, patrol: [[70, 36], [76, 38], [70, 48], [62, 44]], patrolIdx: 0,
    };
    // roamers stay in their own area — never the public lounge / kitchen
    if (gd.id === 'G-ARENA') return { ...gd, roamZone: [2, 26, 22, 24] };   // the arena
    // secure-core hallway (y13, walkable x14..82) — split into non-overlapping
    // thirds; each guard bounces back and forth inside his own segment
    if (gd.id === 'G-DEP')   return { ...gd, patrol: [[15, 13], [35, 13]], patrolIdx: 0 };   // west third
    if (gd.id === 'G-CORE')  return { ...gd, patrol: [[38, 13], [58, 13]], patrolIdx: 0 };   // middle third (vault approach)
    if (gd.id === 'G-CORE2') return { ...gd, patrol: [[61, 13], [81, 13]], patrolIdx: 0 };   // east third
    // back-of-house hallway (y23, walkable x1..82) — same: thirds, no overlap
    if (gd.id === 'G-HALL2') return { ...gd, patrol: [[2, 23], [26, 23]], patrolIdx: 0 };    // west third
    if (gd.id === 'G-HALL')  return { ...gd, patrol: [[29, 23], [53, 23]], patrolIdx: 0 };   // middle third (checkpoint approach)
    if (gd.id === 'G-BOH')   return { ...gd, patrol: [[56, 23], [80, 23]], patrolIdx: 0 };   // east third
    return gd;
  });
}

// Cameras — coverage across the floor. on/off is CELESTE's to flip.
// PUBLIC cameras are VISUAL ONLY: they show what the house sees, but the crew
// (blending as guests) don't route around them. Back-of-house / secure cameras
// are the ones the crew must avoid.
export function initialCams() {
  const c = (id, x, y, facing, pub = false) => ({
    id, floor: 'floor1', x, y, facing, fov: Math.PI / 2, range: 10, on: true, public: pub,
  });
  return [
    // public floor — visual only
    c('CAM-ENTRANCE', 40, 45, Math.PI / 2, true),   // above the front desk, cone reaching down to the front door
    // arena — a camera in each corner, looking diagonally across the pit
    c('CAM-ARENA-NW',  3, 27,  Math.PI / 4, true),       // NW corner → SE
    c('CAM-ARENA-NE', 22, 27,  3 * Math.PI / 4, true),   // NE corner → SW
    c('CAM-ARENA-SW',  3, 50, -Math.PI / 4, true),       // SW corner → NE
    c('CAM-ARENA-SE', 22, 50, -3 * Math.PI / 4, true),   // SE corner → NW
    // casino — cameras in three corners (not the cash/cage corner)
    c('CAM-CAS-NE',   80, 27, 3 * Math.PI / 4, true),    // NE corner, looking into the floor
    c('CAM-CAS-SW',   61, 50, -Math.PI / 4, true),       // SW corner
    c('CAM-CAS-SE',   78, 50, -3 * Math.PI / 4, true),   // SE corner
    // back-of-house + secure core — the crew route around these
    c('CAM-BACKHALL', 40, 23, -Math.PI / 2),
    c('CAM-SEC',      9, 17, Math.PI / 2),
    c('CAM-COUNT',    73, 17, Math.PI / 2),
    c('CAM-CHK',      53, 14, -Math.PI / 2),
    c('CAM-VAULT',    43, 3, Math.PI / 2),
    c('CAM-SERVER',   63, 3, Math.PI / 2),
  ];
}

// Staff — they WORK the public floor. They never catch the crew, but they have
// eyes: a guest somewhere they shouldn't be (off the public floor) raises their
// suspicion until they call security.
export function initialStaff() {
  const s = (id, role, x, y, facing, kind, color) => ({
    id, role, floor: 'floor1', x, y, home: [x, y], facing,
    fov: 2.4, range: 7, suspicion: 0, state: 'WORKING', kind, color,
    path: null, pi: 0, wait: 0,
  });
  return [
    s('FRONT-DESK', 'front_desk', 40, 46, -Math.PI / 2, 'STATIONARY', '#7fa0b0'),
    s('BARTENDER',  'bartender',  41, 33, Math.PI / 2,  'STATIONARY', '#7fb0a0'),
    s('WAITRESS',   'cocktail',   45, 39, 0,            'ROAM',       '#b894c0'),
    s('CASHIER',    'cage',       66, 28, Math.PI / 2,  'STATIONARY', '#9fb0c0'),
    s('DEALER-1',   'dealer',     66, 32, 0,            'STATIONARY', '#9fb0c0'),
    s('DEALER-2',   'dealer',     66, 40, 0,            'STATIONARY', '#9fb0c0'),
    s('DEALER-3',   'dealer',     66, 47, 0,            'STATIONARY', '#9fb0c0'),
    s('PIT-BOSS',   'pit_boss',   18, 40, Math.PI,      'ROAM',       '#c9b27a'),
    s('USHER',      'usher',      12, 47, -Math.PI / 2, 'ROAM',       '#7fa0b0'),
  ];
}
