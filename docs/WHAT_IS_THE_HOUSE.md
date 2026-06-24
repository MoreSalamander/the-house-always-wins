# The House Always Wins

*A cinematic AI heist you **watch**, not play.*

---

## What it is

**The House Always Wins** is a heist that runs itself. You don't control anyone —
you watch a crew of six AI characters autonomously break into a casino, and you
watch the casino try to stop them. Every decision is the AI's. Your job is to
witness it: the plan, the close calls, the way a single guard glancing the wrong
direction blows the whole thing.

The title is the premise. The house keeps its edge — the crew can be caught at
any moment — so no run is guaranteed. When a run goes wrong, it starts over, and
you watch the crew try again. It's a **montage of attempts** converging on a
clean score.

---

## The house

The casino is one large floor, laid out in three bands from the front door back:

- **The public floor (front)** — where guests (and the disguised crew) mingle:
  - **Lobby** at the entrance, with the front desk and two posted greeter-guards.
  - **The Arena** (left) — a boxing ring with a staged fight and a crowd.
  - **The Casino** (right) — blackjack, poker, and roulette tables, a wall of
    slot machines, and the **cash cage** (chips ↔ money through teller windows).
  - **The Bar / Lounge** (center) and the **Kitchen** behind it.

- **Back-of-house (middle)** — staff-only, behind a service wall:
  - **Security Office** (the monitor wall), the **Utility Closet**, the **Break
    Room**, the **Manager's Office**, and the **Counting Room**.

- **The secure core (deep back)** — behind a guarded checkpoint:
  - The **Vault**, the **Server Room**, **Safety-Deposit**, **Mechanical**, and
    the **Loading Dock** where the getaway truck waits.

Cash flows in a straight line — cage → counting room — and the crew's target,
the vault, sits as far from the door as the building allows.

---

## The crew

| Name | Role | Job |
|------|------|-----|
| **CELESTE** | Conductor / hacker | Taps the security camera feeds, then **guides the crew** — through, back, or around |
| **SABLE** | Safecracker | Reaches the vault and cracks it |
| **DORIAN** | Explosives | Follows SABLE to the vault, one at a time |
| **AUGUSTE** & **ROMAN** | The fighters | The staged fight — the crowd they draw is cover |
| **MARLOWE** | Driver | Waits at the truck, the way out |

---

## How a heist unfolds

1. **Walk in and blend.** The crew enter as guests and disperse across the public
   floor — the fighters to the ring, SABLE to the casino, DORIAN to the arena
   crowd, CELESTE to the bar. They hold there, blending, doing nothing
   suspicious.

2. **CELESTE gets the eyes.** She slips into the **utility closet** next to the
   security office, **drills the shared wall**, and taps the camera feeds. Now
   she can see what the house sees.

3. **One by one, on her signal.** With the feeds live, CELESTE releases the
   infiltrators — SABLE first, then DORIAN once SABLE has reached the vault.
   They cross the back of the house and the secure-core **checkpoint**, timing
   each move to the guards' gaps.

4. **CELESTE conducts.** As they move through the secure areas she's on the
   feeds, calling it: **reroute** around a guard's sightline, **hold** at the
   edge until a patrol sweeps past, or **fall back** when one closes in.

5. **The score — or the alarm.** The crew reach the vault and the getaway. But if
   a guard ever **sees** an infiltrator somewhere they shouldn't be, it's over —
   the run fails and starts again.

---

## The rules that make it tense

- **Blend in public.** On the public floor the crew are just guests — guards and
  cameras don't faze them. The danger only begins past the service wall.

- **Getting seen is a fail.** In the back-of-house and secure core, a single
  guard sighting (or an uncovered camera) ends the run. No health bar, no slow
  meter — caught is caught.

- **Sneaking is real.** The crew never step into a guard's vision cone in a
  secure area. They wait for it to sweep past, route around it, or back off —
  and the **gates** (the security office and the vault checkpoint) only open
  when the guard on duty steps away on break.

- **Public cameras are just cameras.** They show what the house sees, but the
  crew (as guests) ignore them. Only the back-of-house and secure-core cameras
  shape their route — and CELESTE can black those out once she has the console.

- **The montage.** Each attempt plays out differently. Caught → restart → try
  again, until a run threads the needle. You're watching a crew *learn the
  building*.

---

## How you watch it

The current build is a **2D debug bench** — a top-down, god's-eye view of the
whole floor with a live "thinking" panel on the side. You see:

- every guard's sweeping **vision cone**, every camera, every staff member;
- the crew as colored dots, with their **candidate routes scored** and the chosen
  one drawn;
- a side panel reading each character's current thought —
  *"blending in — waiting for CELESTE to tap the feed…"*,
  *"CELESTE: reroute via TOP"*, *"at the checkpoint — waiting for the gap…"*;
- the run state up top: **attempt #**, the alarm, whether CELESTE has the console.

The bench is the workbench. The eventual presentation layer is a cinematic
3D casino — but every decision shown there is made by the same headless brain
you can watch here, frame by frame.

---

## The idea underneath it

**The House Always Wins** is an instance of the MoreSalamander **Deterministic
Scaffold** thesis: the AI *proposes* (each crew member reasons about where to go,
which route is safest, when to move), and a deterministic core *disposes* (the
rules — who can see whom, when a gate is open, whether a sighting is a fail — are
exact, seed-locked, and the same every run). The brain is the player; the
scaffold is the referee.

Two things follow from that:

- **It's legible.** Because every decision is exposed in the thinking panel, you
  can always answer *why* — why SABLE held, why CELESTE rerouted DORIAN, why the
  run failed. The "AI" isn't a black box; it's a console you can read.

- **It's honest.** The house genuinely keeps its edge. The crew get better at
  reading the building across attempts, but the math never lets them win every
  time. The tension lives in that gap — which is exactly what the title promises.

---

## Where it stands

**Built and running** (a deterministic JS brain, watchable on the 2D bench, all
test suites green):

- the single-floor casino as canonical geometry;
- the full cast — crew, guards (patrols, fixed posts, duty-cycle gaps),
  cameras, staff, and a casino's worth of milling customers;
- real perception (vision cones + line-of-sight, walls/furniture block sight);
- blend-and-stage, the console-tap, sequential release, the gated crossings;
- CELESTE conducting (reroute / hold / fall back);
- getting-seen-is-a-fail and the restart montage.

**Next** (the cinematic core that gives the title its punch):

- **the roar** — the staged fight's crowd noise masking the vault charge (the
  signature beat: is the boom louder than the crowd at the moment it blows?);
- SABLE's actual vault **crack** and the **loot-and-escape** to the truck;
- CELESTE cutting the **outside line** so a late trip rings only inside;
- a **win-probability / odds board** — the house framing its own chances;
- the cinematic **3D** presentation layer.

---

*The house always wins — until the night it doesn't.*
