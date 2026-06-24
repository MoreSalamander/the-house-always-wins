// Node regression for crew navigation / the "thinking" layer.
// run: node game/test/navigation.test.mjs

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert';

import { makeRng } from '../sim/rng.js';
import { initialCrew, initialGuards, initialCams } from '../sim/agents.js';
import { stepGuards } from '../sim/guards.js';
import { smartMove, threatAt, assignObjectives, stepCrew } from '../sim/navigation.js';
import { initHeist, stepHeist } from '../sim/mechanics.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const levels = JSON.parse(fs.readFileSync(path.join(root, 'design/levels.json')));
const rooms = JSON.parse(fs.readFileSync(path.join(root, 'design/level_rooms.json')));

console.log('\n  THE HOUSE — navigation / thinking regression\n');

// 1. smartMove records the decision: candidates, scores, a chosen route
{
  const a = { floor: 'floor1', x: 40, y: 48, role: 'safecracker' };
  const ok = smartMove(levels, rooms, a, 40, 38, [], [], false);   // lobby → bar, no guards
  assert.ok(ok, 'should find a route');
  assert.ok(a.path && a.path.length > 1, 'has a path to follow');
  assert.ok(a.debugRoutes.length >= 1, 'records candidate routes for the overlay');
  assert.ok(a.debugRoutes.some(r => r.chosen), 'one candidate is chosen');
  assert.ok(typeof a.routeScore === 'string' && a.routeOptions.includes(':'), 'records scores');
  console.log(`  ✓ smartMove: ${a.debugRoutes.length} candidates, chose ${a.routeType} (${a.routeScore})`);
}

// 2. threat reads guards (vision = big) and live cameras
{
  // guard in the open lobby looking WEST — clear sightline down the row
  const guard = { floor: 'floor1', x: 40, y: 48, facing: Math.PI, fov: Math.PI / 2, range: 8 };
  const seen = threatAt(levels, 'floor1', 35, 48, [guard], [], false);   // in the cone, clear LOS
  const elsewhere = threatAt(levels, 'floor1', 45, 48, [guard], [], false); // behind him
  assert.ok(seen >= 100, `in-cone threat should be high (got ${seen})`);
  assert.ok(elsewhere < seen, 'far away is safer');
  console.log(`  ✓ threat: in-vision=${seen}, far=${elsewhere}`);
}

// 3. crew make real progress toward objectives, across the single floor.
// The house is a MONTAGE now — most single runs end in a catch by design, so we
// retry across attempts (rng stream continues, like the bench) until one goes
// clean: CELESTE seizes the feed AND SABLE reaches the vault.
{
  const rng = makeRng(2026);
  const vault = rooms.heist.mara_goal.pos, sec = rooms.heist.echo_stage1.pos;
  let clean = false, attempts = 0, lastSable = null, lastCeleste = null;
  for (let a = 0; a < 60 && !clean; a++) {
    attempts = a + 1;
    const crew = initialCrew(rooms);
    const guards = initialGuards();
    const cams = initialCams();
    assignObjectives(crew, rooms);
    const heist = initHeist();
    const sable = crew.find(c => c.name === 'SABLE');
    const celeste = crew.find(c => c.name === 'CELESTE');
    for (let t = 0; t < 12000; t++) {
      stepGuards(levels, guards, rng);
      stepCrew(levels, rooms, crew, guards, cams, heist);   // heist carries the console signal
      stepHeist(heist, levels, rooms, crew, guards, cams);
      if (heist.caught) break;
      if (heist.consoleHeld &&
          Math.hypot(sable.x - vault[0], sable.y - vault[1]) < 4 &&
          Math.hypot(celeste.x - sec[0], celeste.y - sec[1]) < 4) { clean = true; break; }
    }
    lastSable = sable; lastCeleste = celeste;
  }
  assert.ok(clean, `crew should land a clean run within 60 attempts (last: SABLE ${lastSable.x.toFixed(0)},${lastSable.y.toFixed(0)} / CELESTE ${lastCeleste.x.toFixed(0)},${lastCeleste.y.toFixed(0)})`);
  console.log(`  ✓ crew progress: clean run on attempt ${attempts} — SABLE→vault, CELESTE→security office`);
}

// 4. determinism
{
  const runOnce = (seed) => {
    const rng = makeRng(seed); const crew = initialCrew(rooms);
    const guards = initialGuards(); const cams = initialCams(); assignObjectives(crew, rooms);
    for (let t = 0; t < 1500; t++) { stepGuards(levels, guards, rng); stepCrew(levels, rooms, crew, guards, cams); }
    return crew.map(c => `${c.floor}:${c.x.toFixed(3)},${c.y.toFixed(3)}`).join('|');
  };
  assert.strictEqual(runOnce(5), runOnce(5), 'same seed → same run');
  console.log('  ✓ determinism: the run replays identically');
}

console.log('\n  all navigation checks green\n');
