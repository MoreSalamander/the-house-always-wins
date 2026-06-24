// Node regression for staff + suspicion — run: node game/test/staff.test.mjs

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert';

import { makeRng } from '../sim/rng.js';
import { initialStaff, initialGuards } from '../sim/agents.js';
import { stepStaff } from '../sim/staff.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const levels = JSON.parse(fs.readFileSync(path.join(root, 'design/levels.json')));
const rooms = JSON.parse(fs.readFileSync(path.join(root, 'design/level_rooms.json')));

console.log('\n  THE HOUSE — staff + suspicion regression\n');

// 1. ROSTER — the right workers
{
  const staff = initialStaff();
  const roles = staff.map(s => s.role).sort();
  assert.ok(roles.includes('front_desk') && roles.includes('bartender') &&
            roles.includes('cocktail') && roles.includes('pit_boss'));
  assert.strictEqual(staff.filter(s => s.role === 'dealer').length, 3, 'three dealers');
  assert.ok(staff.every(s => s.floor === 'floor1'), 'everyone works the one floor');
  console.log(`  ✓ roster: ${staff.length} staff on the floor`);
}

// 2. SUSPICION RISES → CALL when a guest is somewhere off (edging to the back)
{
  const rng = makeRng(1);
  // the pit boss in the arena looking north, toward a guest edging off the
  // public floor (near the arena's service door = "off")
  const bartender = { id: 'WATCH', role: 'pit_boss', floor: 'floor1', x: 12, y: 33,
    home: [12, 33], facing: -Math.PI / 2, fov: 2.4, range: 9, suspicion: 0, state: 'WORKING', kind: 'STATIONARY' };
  const guards = initialGuards();
  const sneak = [{ name: 'SABLE', floor: 'floor1', x: 12, y: 27 }];  // edging to the service door = "off"
  const ctx = { frame: 0, calls: [] };
  let alertedAt = -1;
  for (let t = 0; t < 200; t++) {
    ctx.frame = t;
    stepStaff(levels, rooms, bartender, sneak, guards, rng, ctx);
    if (bartender.state === 'ALERTING' && alertedAt < 0) alertedAt = t;
  }
  assert.ok(bartender.suspicion >= 1, 'suspicion should max out');
  assert.ok(alertedAt > 0, 'bartender should call security');
  assert.ok(ctx.securityCalled && ctx.calls.length === 1, 'a security call was logged');
  assert.ok(guards.some(g => g.investigating), 'a guard was sent to investigate');
  console.log(`  ✓ escalation: suspicion → call at frame ${alertedAt}, guard dispatched to ${ctx.calls[0].loc.x},${ctx.calls[0].loc.y}`);
}

// 3. STAYS CALM for a guest behaving normally (in the casino, not near stairs)
{
  const rng = makeRng(2);
  const dealer = { id: 'D', role: 'dealer', floor: 'floor1', x: 66, y: 40,
    home: [66, 40], facing: Math.PI, fov: 2.4, range: 9, suspicion: 0, state: 'WORKING', kind: 'STATIONARY' };
  const guards = initialGuards();
  const guest = [{ name: 'GUEST', floor: 'floor1', x: 62, y: 40 }];  // on the casino floor, fine
  const ctx = { frame: 0, calls: [] };
  for (let t = 0; t < 300; t++) { ctx.frame = t; stepStaff(levels, rooms, dealer, guest, guards, rng, ctx); }
  // a guest in their seat draws no CALL — at most the slow blend-clock creep,
  // never the full alarm (that's reserved for someone actually off the floor)
  assert.ok(dealer.suspicion < 1, `a normal guest shouldn't alarm the dealer (susp ${dealer.suspicion.toFixed(2)})`);
  assert.notStrictEqual(dealer.state, 'ALERTING', 'no escalation for normal activity');
  assert.strictEqual((ctx.calls || []).length, 0, 'no call for normal activity');
  console.log('  ✓ calm: a guest in the public floor raises no alarm');
}

console.log('\n  all staff + suspicion checks green\n');
