// Node regression for agents + detection — run: node game/test/detection.test.mjs
// Verifies the perception-driven catch on the real building.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert';

import { initialCrew, initialGuards, initialCams, CREW } from '../sim/agents.js';
import { observerSees, detect, feedsDark } from '../sim/detection.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const levels = JSON.parse(fs.readFileSync(path.join(root, 'design/levels.json')));
const rooms = JSON.parse(fs.readFileSync(path.join(root, 'design/level_rooms.json')));

console.log('\n  THE HOUSE — agents + detection regression\n');

// 1. THE CAST — six crew, the right names and roles
{
  const crew = initialCrew(rooms);
  const names = crew.map(c => c.name).sort();
  assert.deepStrictEqual(names, ['AUGUSTE', 'CELESTE', 'DORIAN', 'MARLOWE', 'ROMAN', 'SABLE']);
  assert.strictEqual(crew.find(c => c.name === 'CELESTE').role, 'conductor');
  assert.strictEqual(crew.find(c => c.name === 'SABLE').role, 'safecracker');
  assert.strictEqual(crew.find(c => c.name === 'DORIAN').role, 'explosives');
  assert.strictEqual(crew.filter(c => c.role === 'fighter').length, 2);
  assert.ok(crew.every(c => c.floor === 'floor1'), 'everyone starts on the ground floor');
  console.log('  ✓ cast: CELESTE / SABLE / DORIAN / AUGUSTE / ROMAN / MARLOWE, roles correct');
}

// 2. DETECTION — sees with clear LOS, blind through walls / other floors / behind
{
  const guard = { id: 'TEST', floor: 'floor1', x: 20, y: 30, facing: 0, fov: Math.PI / 2, range: 12 };
  // clear lobby corridor to the east
  assert.ok(observerSees(levels, guard, { floor: 'floor1', x: 25, y: 30 }), 'clear LOS east → seen');
  // a target one floor down is invisible
  assert.ok(!observerSees(levels, guard, { floor: 'basement', x: 25, y: 30 }), 'other floor → blind');
  // looking north from the lobby is blocked by the y=25 wall/door
  const gN = { ...guard, x: 25, facing: -Math.PI / 2 };
  assert.ok(!observerSees(levels, gN, { floor: 'floor1', x: 25, y: 20 }), 'through wall → blind');
  // behind the facing direction
  assert.ok(!observerSees(levels, guard, { floor: 'floor1', x: 14, y: 30 }), 'behind → blind');
  console.log('  ✓ detection: sees clear LOS, blind through walls / floors / behind');
}

// 3. detect() over the roster + the blackout count
{
  const guards = [{ id: 'G', floor: 'floor1', x: 20, y: 30, facing: 0, fov: Math.PI / 2, range: 12 }];
  const cams = initialCams();
  const crew = [
    { name: 'SABLE', floor: 'floor1', x: 25, y: 30 },         // in the guard's cone
    { name: 'DORIAN', floor: 'floor1', x: 25, y: 30, safe: true }, // hidden → ignored
    { name: 'MARLOWE', floor: 'basement', x: 25, y: 30 },     // another floor → unseen
  ];
  const hits = detect(levels, guards, cams, crew);
  assert.ok(hits.some(h => h.who === 'SABLE' && h.kind === 'guard'), 'SABLE caught by the guard');
  assert.ok(!hits.some(h => h.who === 'DORIAN'), 'hidden DORIAN not caught');
  assert.ok(!hits.some(h => h.who === 'MARLOWE'), 'off-floor MARLOWE not caught');

  assert.strictEqual(feedsDark(cams), 0, 'all feeds start live');
  cams[0].on = false;
  assert.strictEqual(feedsDark(cams), 1, 'one feed dark');
  console.log('  ✓ detect(): catches the exposed, ignores hidden/off-floor; blackout count works');
}

console.log('\n  all agent + detection checks green\n');
