// THE HOUSE — mechanics layer (detection bite + CELESTE's blackout relay)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert';

import { makeRng } from '../sim/rng.js';
import { initialGuards, initialCams, initialCrew, initialStaff } from '../sim/agents.js';
import { stepGuards } from '../sim/guards.js';
import { assignObjectives, stepCrew } from '../sim/navigation.js';
import { stepStaffAll } from '../sim/staff.js';
import { initHeist, stepHeist } from '../sim/mechanics.js';
import { feedsDark } from '../sim/detection.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..', '..');
const levels = JSON.parse(readFileSync(join(root, 'design/levels.json')));
const rooms  = JSON.parse(readFileSync(join(root, 'design/level_rooms.json')));

console.log('\n  THE HOUSE — mechanics regression\n');

// run the whole sim for N frames, return the heist state + max feeds dark seen
function run(seed, frames) {
  const rng = makeRng(seed);
  const guards = initialGuards(), cams = initialCams(), staff = initialStaff(), crew = initialCrew(rooms);
  assignObjectives(crew, rooms);
  const heist = initHeist();
  const ctx = { frame: 0, calls: [] };
  let maxDark = 0;
  for (let t = 0; t < frames; t++) {
    ctx.frame = t;
    stepGuards(levels, guards, rng);
    stepStaffAll(levels, rooms, staff, crew, guards, rng, ctx);
    stepCrew(levels, rooms, crew, guards, cams);
    stepHeist(heist, levels, rooms, crew, guards, cams);
    maxDark = Math.max(maxDark, feedsDark(cams));
  }
  return { heist, maxDark };
}

// 1. the relay never blacks out more than one feed at a time (dead-feed gate)
{
  const { maxDark, heist } = run(2026, 4000);
  assert.ok(maxDark <= 1, `at most one feed dark at a time (saw ${maxDark})`);
  console.log(`  ✓ blackout relay: never more than ${maxDark} feed dark at once${heist.consoleHeld ? ' (console seized)' : ''}`);
}

// 2. deterministic — same seed replays the same alarm trajectory
{
  const a = run(7, 3000).heist, b = run(7, 3000).heist;
  assert.strictEqual(a.alarm.toFixed(6), b.alarm.toFixed(6), 'alarm is deterministic');
  assert.strictEqual(a.caught, b.caught, 'outcome is deterministic');
  console.log(`  ✓ determinism: alarm replays identically (${a.alarm.toFixed(3)})`);
}

// 3. detection bites — a crew member parked in a guard's vision maxes the alarm
{
  const guards = initialGuards();
  const g = guards.find(x => x.id === 'G-CORE');     // in the secure core (restricted)
  const cams = [];                                    // isolate the guard
  const crew = [{ name: 'SABLE', role: 'safecracker', floor: g.floor,
    x: g.x + Math.cos(g.facing) * 2, y: g.y + Math.sin(g.facing) * 2 }];  // right in his cone
  const heist = initHeist();
  for (let t = 0; t < 200; t++) stepHeist(heist, levels, rooms, crew, guards, cams);
  assert.ok(heist.spotted.includes('SABLE'), 'the guard spots SABLE');
  assert.ok(heist.caught, 'held in view, the alarm maxes → CAUGHT');
  console.log(`  ✓ detection bites: parked in a cone → CAUGHT (alarm ${heist.alarm.toFixed(2)})`);
}

console.log('\n  all mechanics checks green\n');
