/*
 * THE HOUSE — canonical level geometry (ONE FLOOR).
 *
 * The whole casino on a single large map (84x54). Everything that used to be
 * stacked across three floors is now laid out flat:
 *
 *   · PUBLIC FLOOR (front)  — lobby at the doors, ARENA (the fight) left,
 *                             CASINO (slots/games) right, BAR + CAGE center.
 *   · BACK-OF-HOUSE (mid)   — break room, security office, manager's office,
 *                             counting room, behind a service wall.
 *   · SECURE CORE (back)    — vault, server room, safety-deposit, mechanical,
 *                             plus the loading dock, behind a guarded CHECKPOINT.
 *
 * The old "descent to the vault" becomes a horizontal deep-infiltration to the
 * back; the stairwell gate becomes the checkpoint gate.
 *
 *   node design/levelmaps.js      → writes design/levels.json
 *   <script src="levelmaps.js">   → exposes generators as globals
 */

const W = 84, H = 54;

const FLOOR = 0, WALL = 1, DOOR = 2, STAIRS = 3, ELEVATOR = 4,
      ARENA = 5, CASINO = 6, VAULT = 7, SERVICE = 8, WINDOW = 9, PROP = 10;

const TILE_NAMES = {
  0: 'FLOOR', 1: 'WALL', 2: 'DOOR', 3: 'STAIRS', 4: 'ELEVATOR',
  5: 'ARENA', 6: 'CASINO', 7: 'VAULT', 8: 'SERVICE', 9: 'WINDOW', 10: 'PROP',
};

// a walled rectangle (interior left as-is); call door() to punch openings
function box(m, x, y, w, h) {
  for (let i = x; i < x + w; i++) { m[y][i] = WALL; m[y + h - 1][i] = WALL; }
  for (let j = y; j < y + h; j++) { m[j][x] = WALL; m[j][x + w - 1] = WALL; }
}

function makeMain() {
  const m = Array.from({ length: H }, () => Array(W).fill(FLOOR));
  for (let x = 0; x < W; x++) { m[0][x] = WALL; m[H - 1][x] = WALL; }
  for (let y = 0; y < H; y++) { m[y][0] = WALL; m[y][W - 1] = WALL; }
  m[H - 1][40] = DOOR; m[H - 1][41] = DOOR;                 // main entrance (south)

  // ===== PUBLIC FLOOR (front, y25..52) =====
  for (let y = 25; y < H - 1; y++) { m[y][25] = WALL; m[y][58] = WALL; }   // arena|center, center|casino
  m[40][25] = DOOR; m[47][25] = DOOR; m[40][58] = DOOR; m[47][58] = DOOR;  // wide public openings
  for (let y = 28; y < 51; y++) for (let x = 2; x < 24; x++) m[y][x] = ARENA;
  for (let y = 28; y < 51; y++) for (let x = 60; x < 82; x++) m[y][x] = CASINO;
  // lobby ↔ bar: a wall behind the front desk, with a passage at each side
  for (let x = 28; x <= 55; x++) m[44][x] = WALL;
  // bar ↔ kitchen — a door just outside each end of the bar counter (the thin
  // rectangle spans x36–47, so the doors sit at x35 and x48)
  for (let x = 26; x <= 57; x++) m[32][x] = WALL;
  m[32][35] = DOOR; m[32][48] = DOOR;
  // kitchen — a big middle room (behind the counter, with the bar doors and the
  // service door) and a smaller room on each side, joined by an internal door
  for (let y = 25; y <= 31; y++) { m[y][34] = WALL; m[y][49] = WALL; }
  m[28][34] = DOOR; m[28][49] = DOOR;
  // cage (cashier) — ONE door, on the north wall, lined up with the service door
  // [70,24] and the counting-room door [70,22] (the cash corridor). Teller
  // windows face the casino floor.
  box(m, 60, 26, 13, 6);
  for (let y = 27; y < 31; y++) for (let x = 61; x < 72; x++) m[y][x] = FLOOR;  // clear interior
  m[26][70] = DOOR;
  m[31][63] = WINDOW; m[31][66] = WINDOW; m[31][69] = WINDOW;

  // ===== SERVICE WALL (public | back-of-house) =====
  for (let x = 1; x < W - 1; x++) m[24][x] = WALL;
  m[24][12] = DOOR; m[24][70] = DOOR;
  m[24][30] = DOOR; m[24][53] = DOOR;   // back doors, one in each kitchen side room (no central door)

  // ===== BACK-OF-HOUSE (y16..22) =====
  box(m, 2, 16, 16, 7);  m[22][9] = DOOR;    // security office (the monitor wall) — swapped from the break room
  box(m, 17, 16, 8, 7);  m[22][20] = DOOR;   // utility closet — shares the security wall; CELESTE drills it to tap the feeds
  box(m, 24, 16, 12, 7); m[22][29] = DOOR;   // break room (now half size)
  box(m, 38, 16, 14, 7); m[22][44] = DOOR;   // manager's office
  box(m, 66, 16, 16, 7); m[22][70] = DOOR;   // counting room (door lined up with the cash corridor)
  // two small hide spaces in the open back-of-house atrium (x52..65), east of the
  // checkpoint approach (x53 stays clear) — a staff restroom and a janitor closet
  // the crew can duck into when a corridor guard turns their way
  box(m, 57, 16, 4, 5); m[20][58] = DOOR;    // staff restroom
  box(m, 62, 16, 4, 5); m[20][63] = DOOR;    // janitor closet

  // ===== CHECKPOINT WALL (secure core | back-of-house), one guarded door =====
  for (let x = 1; x < W - 1; x++) m[15][x] = WALL;
  m[15][53] = DOOR;                          // THE CHECKPOINT (G-VAULT's gate)

  // ===== SECURE CORE (back, y2..11) =====
  // safety deposit | vault | server | mechanical sit FLUSH, sharing walls (one
  // contiguous secure block); all reachable from the y12..14 hallway below.
  box(m, 1, 1, 13, 13); m[7][13] = DOOR; m[0][7] = DOOR; m[1][7] = DOOR;  // loading dock + truck door (north)
  box(m, 16, 2, 18, 10); m[11][22] = DOOR;   // safety deposit — up against the vault
  box(m, 33, 2, 20, 10); m[11][43] = DOOR;   // vault — between safety deposit and the server room
  for (let y = 3; y < 11; y++) for (let x = 34; x < 52; x++) m[y][x] = VAULT;
  box(m, 52, 2, 19, 10); m[11][62] = DOOR;   // server room — between the vault and mechanical
  box(m, 70, 2, 13, 10); m[11][77] = DOOR;   // mechanical — up against the server room

  return m;
}

const LEVELS = { floor1: makeMain };

// ---- Node: dump levels.json ----
if (typeof module !== 'undefined' && require.main === module) {
  const fs = require('fs'), path = require('path');
  const out = {
    meta: { W, H, tiles: TILE_NAMES, generated: new Date().toISOString(),
            note: 'canonical single-floor geometry — see design/levelmaps.js' },
    floors: { floor1: makeMain() },
  };
  fs.writeFileSync(path.join(__dirname, 'levels.json'), JSON.stringify(out));
  console.log('wrote design/levels.json  (1 floor, ' + W + 'x' + H + ')');
}

// ---- Browser: expose as globals for the view ----
if (typeof window !== 'undefined') {
  Object.assign(window, { W, H, FLOOR, WALL, DOOR, STAIRS, ELEVATOR, ARENA,
    CASINO, VAULT, SERVICE, WINDOW, PROP, makeMain, LEVELS });
}
