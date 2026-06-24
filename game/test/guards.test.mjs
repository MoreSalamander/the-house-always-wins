// Node regression for guard AI — run: node game/test/guards.test.mjs

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert';

import { makeRng } from '../sim/rng.js';
import { initialGuards } from '../sim/agents.js';
import { stepGuards, securityGapOpen } from '../sim/guards.js';
import { WALL, dims, grid } from '../sim/world.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const levels = JSON.parse(fs.readFileSync(path.join(root, 'design/levels.json')));
const { W, H } = dims(levels);

console.log('\n  THE HOUSE — guard AI regression\n');

function run(seed, ticks, onTick) {
  const rng = makeRng(seed);
  const guards = initialGuards();
  const starts = guards.map(g => ({ floor: g.floor, x: g.x, y: g.y }));
  for (let t = 0; t < ticks; t++) {
    stepGuards(levels, guards, rng);
    if (onTick) onTick(guards);
  }
  return { guards, starts };
}

// 1. MOVEMENT — guards actually patrol, never clip into a wall, stay on-floor
{
  let wallHits = 0, floorChanges = 0;
  const { guards, starts } = run(42, 1500, gs => {
    for (const g of gs) {
      if (grid(levels, g.floor)[Math.floor(g.y)][Math.floor(g.x)] === WALL) wallHits++;
    }
  });
  guards.forEach((g, i) => { if (g.floor !== starts[i].floor) floorChanges++; });
  const moved = guards.filter((g, i) => Math.hypot(g.x - starts[i].x, g.y - starts[i].y) > 1).length;

  assert.strictEqual(wallHits, 0, 'a guard walked into a wall');
  assert.strictEqual(floorChanges, 0, 'guards must stay on their own floor');
  assert.ok(moved >= 2, `guards should patrol (only ${moved} moved)`);
  console.log(`  ✓ movement: ${moved}/3 guards patrolling, 0 wall clips, all stayed on-floor`);
}

// 2. SCANNING — guards rotate to look around (facing changes a lot)
{
  const rng = makeRng(7);
  const guards = initialGuards();
  const facings = guards.map(() => new Set());
  for (let t = 0; t < 600; t++) {
    stepGuards(levels, guards, rng);
    guards.forEach((g, i) => facings[i].add(Math.round(g.facing * 4)));
  }
  // patrolling guards sweep; posted guards (g.fixed, or a duty post gaze) hold steady
  const holds = (g) => g.fixed || (g.duty && g.duty.postFacing != null);
  assert.ok(guards.every((g, i) => holds(g) || facings[i].size >= 3), 'each patrolling guard should sweep');
  assert.ok(guards.some(g => g.fixed && facings[guards.indexOf(g)].size === 1), 'a posted guard holds one facing');
  console.log('  ✓ scanning: patrollers sweep; posted desk guards hold a fixed gaze');
}

// 3. DETERMINISM — same seed → identical patrol
{
  const a = run(99, 800).guards;
  const b = run(99, 800).guards;
  const snap = gs => gs.map(g => `${g.x.toFixed(4)},${g.y.toFixed(4)},${g.facing.toFixed(4)}`).join('|');
  assert.strictEqual(snap(a), snap(b), 'guard patrol must replay identically');
  assert.notStrictEqual(snap(run(1, 3200).guards), snap(run(2, 3200).guards));
  console.log('  ✓ determinism: same seed replays the same patrol');
}

// 4. GATES — the duty guards (G-SEC / G-VAULT) were removed, so the checkpoint
// and security gates are unmanned: gapOpen reports open and never finds a guard.
{
  const guards = initialGuards();
  assert.ok(!guards.some(g => g.id === 'G-SEC' || g.id === 'G-VAULT'), 'no duty guards on the roster');
  assert.ok(securityGapOpen(guards), 'an unmanned gate reads as open (crew pass freely)');
  console.log('  ✓ gates: duty guards gone — security/vault gates resolve open');
}

console.log('\n  all guard checks green\n');
