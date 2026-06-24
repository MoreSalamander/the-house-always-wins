// The world: the 3-floor building, as data the sim queries.
//
// Pure — takes the parsed levels.json (geometry) and level_rooms.json
// (semantics) and answers spatial questions. No file IO, no DOM, so it runs in
// Node (tests) and the browser (the game) unchanged. Loaders live with the
// caller (Node: fs; browser: fetch).

export const FLOOR = 0, WALL = 1, DOOR = 2, STAIRS = 3, ELEVATOR = 4,
             ARENA = 5, CASINO = 6, VAULT = 7, SERVICE = 8, WINDOW = 9,
             PROP = 10;   // low furniture: blocks movement, NOT sight (see over a table)

// solid to MOVEMENT (walls + furniture + teller windows). Sight is separate —
// perception only treats WALL/DOOR as opaque, so PROP (low props) and WINDOW
// (the cage's teller windows) can be seen/transacted through but not walked through.
export function solid(t) { return t === WALL || t === PROP || t === WINDOW; }

export function dims(levels) {
  return { W: levels.meta.W, H: levels.meta.H };
}

export function grid(levels, floor) {
  return levels.floors[floor];
}

export function tileAt(levels, floor, x, y) {
  const g = levels.floors[floor];
  const { W, H } = dims(levels);
  if (x < 0 || x >= W || y < 0 || y >= H) return WALL;
  return g[y][x];
}

export function walkable(levels, floor, x, y) {
  return !solid(tileAt(levels, floor, Math.floor(x), Math.floor(y)));
}

export function roomOf(rooms, floor, x, y) {
  const rs = rooms.floors[floor].rooms;
  for (const name in rs) {
    const [rx, ry, rw, rh] = rs[name].rect;
    if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) return name;
  }
  return null;
}

export function point(rooms, floor, name) {
  return rooms.floors[floor].points[name];
}

export function objective(rooms, key) {
  return rooms.heist[key];
}

// One floor now — the whole house is flat. (Kept as an array so callers that
// iterate floors still work.)
export const FLOOR_ORDER = ['floor1'];

// No stairs on a single floor; kept defensively for any legacy caller.
export function stairsTile(rooms, floor) {
  return rooms.floors[floor].points.entrance;
}
