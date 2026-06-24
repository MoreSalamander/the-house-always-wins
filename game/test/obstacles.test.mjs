// THE HOUSE — furniture as obstacles (stamped into the grid)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert';

import { stampFurniture, footprint, obstacleTiles } from '../sim/obstacles.js';
import { routeAcross, routeLength } from '../sim/pathfind.js';
import { WALL, PROP, solid } from '../sim/world.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..', '..');
const load = f => JSON.parse(readFileSync(join(root, f)));
const rooms = load('design/level_rooms.json');
const furniture = load('design/furniture.json');

console.log('\n  THE HOUSE — obstacles (solid furniture)\n');

// 1. the ring is a solid obstacle (fighters spawn inside it); other props solid too
{
  const ring = { type: 'ring', x: 4, y: 14, w: 8, h: 8 };
  assert.ok(footprint(ring).length > 0, 'the ring is a solid obstacle');
  const felt = { type: 'felt', x: 38, y: 10, w: 3, h: 1.6 };
  assert.ok(footprint(felt).length > 0, 'a card table is solid');
  console.log(`  ✓ ring solid (${footprint(ring).length} tiles); card table footprint = ${footprint(felt).length} tiles`);
}

// 2. stamping never walls off a heist route, and blend/stairs tiles stay open
{
  const levels = load('design/levels.json');
  stampFurniture(levels, furniture);
  const tile = (f, x, y) => levels.floors[f][y][x];
  // (the fight tile is intentionally solid now — the ring is an obstacle the
  // fighters spawn on; they never path, so it doesn't need to be walkable)
  for (const [name, x, y] of [
    ['vault', 43, 6], ['SABLE blend', 70, 40], ['CELESTE blend', 34, 40],
    ['DORIAN blend', 48, 40], ['checkpoint hold', 53, 18],
  ]) assert.ok(!solid(tile('floor1', x, y)), `${name} tile (${x},${y}) must stay walkable`);

  const mara = routeAcross(levels, rooms, 'floor1', rooms.heist.mara_start.pos, 'floor1', rooms.heist.mara_goal.pos);
  const echo1 = routeAcross(levels, rooms, 'floor1', rooms.heist.mara_start.pos, 'floor1', rooms.heist.echo_stage1.pos);
  const echo2 = routeAcross(levels, rooms, 'floor1', rooms.heist.echo_stage1.pos, 'floor1', rooms.heist.echo_stage2.pos);
  assert.ok(routeLength(mara) > 0 && routeLength(echo1) > 0 && routeLength(echo2) > 0, 'all routes survive furniture');
  console.log(`  ✓ routes survive furniture: lobby→vault=${routeLength(mara)} →security=${routeLength(echo1)} →server=${routeLength(echo2)}`);
}

// 3. stamping adds solid tiles, and splits sight-blocking from see-over
{
  const before = load('design/levels.json');
  const after = load('design/levels.json');
  stampFurniture(after, furniture);
  let added = 0, walls = 0, props = 0;
  for (const f in after.floors)
    for (let y = 0; y < after.meta.H; y++) for (let x = 0; x < after.meta.W; x++) {
      const b = before.floors[f][y][x], a = after.floors[f][y][x];
      if (!solid(b) && solid(a)) { added++; if (a === WALL) walls++; if (a === PROP) props++; }
    }
  assert.ok(added >= 20, `furniture adds solid tiles (added ${added})`);
  assert.ok(walls > 0 && props > 0, 'both sight-blocking (WALL) and see-over (PROP) props exist');
  // a card felt is see-over (PROP); a slot bank blocks sight (WALL)
  assert.strictEqual(after.floors.floor1[34][61], PROP, 'blackjack felt is see-over (PROP)');
  assert.strictEqual(after.floors.floor1[28][79], WALL, 'slot bank blocks sight (WALL)');
  console.log(`  ✓ stamp adds ${added} solid tiles — ${walls} sight-blocking, ${props} see-over`);
}

console.log('\n  all obstacle checks green\n');
