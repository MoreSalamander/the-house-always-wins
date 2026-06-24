// Node regression for the JS sim core — run: node game/test/core.test.mjs
// Verifies the foundation on the REAL 3-floor building, headless (no browser).

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert';

import { makeRng } from '../sim/rng.js';
import * as world from '../sim/world.js';
import { inCone } from '../sim/perception.js';
import { astar, routeAcross, routeLength } from '../sim/pathfind.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const levels = JSON.parse(fs.readFileSync(path.join(root, 'design/levels.json')));
const rooms = JSON.parse(fs.readFileSync(path.join(root, 'design/level_rooms.json')));
const { W, H } = world.dims(levels);

console.log('\n  THE HOUSE — JS sim core regression\n');

// 1. DETERMINISM — same seed, same stream
{
  const a = makeRng(12345), b = makeRng(12345);
  const sa = Array.from({ length: 1000 }, () => a());
  const sb = Array.from({ length: 1000 }, () => b());
  assert.deepStrictEqual(sa, sb);
  assert.notStrictEqual(makeRng(1)(), makeRng(2)());
  console.log('  ✓ rng: same seed replays identically');
}

// 2. PERCEPTION — line-of-sight blocks through walls/doors
{
  const f1 = world.grid(levels, 'floor1');
  // observer in the center (40,30) looking north (-y). The service wall is at
  // y=24 (a door at x=40, also opaque) between the observer and the back.
  const dir = -Math.PI / 2, fov = Math.PI / 2, range = 14;
  const near = inCone(f1, W, H, 40, 30, dir, fov, range, 40, 27); // open floor ahead
  const thruWall = inCone(f1, W, H, 40, 30, dir, fov, range, 40, 20); // past the y=24 service wall/door
  const behind = inCone(f1, W, H, 40, 30, dir, fov, range, 40, 34); // behind the observer
  assert.ok(near, 'should see open floor ahead');
  assert.ok(!thruWall, 'should NOT see through the service wall/door');
  assert.ok(!behind, 'should NOT see behind the facing direction');
  console.log('  ✓ perception: cone + line-of-sight (walls/doors block, back is blind)');
}

// 3. PATHFIND — A* finds a path; none into a wall
{
  const f1 = world.grid(levels, 'floor1');
  const p = astar(f1, W, H, 40, 50, 43, 6); // lobby → vault, across the whole house
  assert.ok(p && p.length > 1, 'lobby→vault should path');
  const intoWall = astar(f1, W, H, 40, 50, 0, 0); // (0,0) is a wall
  assert.strictEqual(intoWall, null, 'no path into a wall');
  console.log(`  ✓ pathfind: A* lobby→vault (${p.length} tiles), rejects walls`);
}

// 4. ROUTES — one floor now; every infiltration route reaches its room
{
  const obj = k => world.objective(rooms, k).pos;
  const mara = routeAcross(levels, rooms, 'floor1', obj('mara_start'), 'floor1', obj('mara_goal'));
  const echo1 = routeAcross(levels, rooms, 'floor1', obj('mara_start'), 'floor1', obj('echo_stage1'));
  const echo2 = routeAcross(levels, rooms, 'floor1', obj('echo_stage1'), 'floor1', obj('echo_stage2'));
  assert.strictEqual(mara.length, 1, 'one floor — one segment');
  for (const [n, r] of [['MARA', mara], ['ECHO1', echo1], ['ECHO2', echo2]])
    assert.ok(routeLength(r) > 10, `${n} route should reach its room (got ${routeLength(r)})`);
  console.log(`  ✓ routes: lobby→vault=${routeLength(mara)}, →security=${routeLength(echo1)}, security→server=${routeLength(echo2)} tiles`);
}

console.log('\n  all core checks green\n');
