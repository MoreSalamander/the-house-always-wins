# THE HOUSE ALWAYS WINS — Constitution

*A MoreSalamander StudioLabs production.*

> The doctrine, written before the code it governs. Edit the doctrine here first,
> then change the dependent code — never the reverse.

---

## The thesis this project encodes

MoreSalamander's one methodological commitment, the **Deterministic Scaffold**:

> *A well-fenced synthesis component becomes reliable as a system, because the
> unreliable part is wrapped in reliable ones that decide whether to trust each
> output, when to commit, when to reject.*

The model proposes; Python disposes — everywhere. Three moves, in this project as
in every other:

| move | here it is | where it lives |
|------|-----------|----------------|
| **1. Explain** (human-owned) | the constraints, written down before synthesis: the wire contract and the building | `contract/WIRE_CONTRACT.md`, `brain/layout.py`, this file |
| **2. Synthesize** (AI/agent) | the crew *proposes* every frame's decisions — cross now, drill, blow the door — the slot a learned/LLM policy drops into | `brain/heist.py` (conductor + agents), `brain/learning.py` |
| **3. Verify** (deterministic) | three pure gates dispose of each proposal at its risk boundary | `brain/verify.py` |

The House Always Wins is the studio thesis realized as **real-time game AI**: the
same verification discipline as my-AI-stro's grounding gates, rendered as a live
debug overlay where every decision is auditable at every frame.

---

## The named pipeline (one move per frame)

The per-frame brain is a named-stage pipeline — atomic responsibilities, explicit
flow, an event for every boundary crossed (the pipeline-shape discipline, the
same one running as NDJSON event streams elsewhere in the studio):

```
  ASSESS  →  PROPOSE  →  VERIFY  →  COMMIT / FAIL  →  LOG
  (read     (the crew    (verify.py   (advance the     (emit an
   the       chooses)     gates        run, or end it)   Event)
   world)                 dispose)
```

Each `StateFrame.events` entry is the studio's per-stage event vocabulary for
this domain: `ZONE_CLEARED`, `CHARGE_ARMED`, `CHARGE_BLOWN`, `BOOM_HEARD`,
`ALARM_TRIPPED`, `CAUGHT`, `ESCAPED` — `step_start`/`step_complete`, in heist
clothing.

---

## Verification at every boundary

The run advances through three risk boundaries; **each is a deterministic gate**,
not a heuristic, not an LLM, not an inline guess. A boundary is only crossed when
its gate returns `passed`.

1. **BLACKOUT** — `verify_blackout(dark_elapsed, limit)` — a cut camera feed may
   stay dark only so long before the dead-feed detector trips the alarm.
2. **SURVEILLANCE** — `verify_surveillance(total_suspicion, threshold)` — the
   monitor-wall watcher tolerates only so much accumulated blackout pattern.
3. **MASKING** — `verify_masking(crowd_noise, boom_loudness)` — the whole game in
   one grounded comparison: the blast is committed only if the roar covers it.

The grader is never the thing it grades: the gates are pure Python, separate from
the crew that proposes the actions they judge.

---

## Invariants (must always hold; the regression guards them)

- **Determinism.** Same `(seed, run, skill)` replays the same heist, frame for
  frame. No wall-clock, no unseeded randomness. (`test_determinism`)
- **The house keeps its edge.** Learning raises the win probability from a long
  shot toward "wins most nights", but **never to certainty** — every gate retains
  a few percent of permanent risk; a trained crew still loses sometimes.
  (`test_house_keeps_its_edge`)
- **The brain owns all truth.** Every number the renderer needs is in the
  `StateFrame`; the renderer recomputes nothing. (`test_contract_shape`)
- **The gates are pure.** Boundary-exact, side-effect-free, overlay-printable.
  (`test_verifiers_are_pure_gates`)

---

## Build order (constraints and verifiers before synthesis)

Verifiers are written before the thing they fence, scaffold before renderer:

1. **Contract** — the wire seam (`state_frame.py`, `WIRE_CONTRACT.md`). ✅
2. **Layout** — the building as data (`layout.py`). ✅
3. **Verifiers** — the deterministic gates (`verify.py`). ✅
4. **Brain** — the synthesis the gates fence (`heist.py`, `learning.py`). ✅
5. **Tuning bench** — the graphical instrument (`view/pygame_view.py`). ✅
6. **Unreal receiver** — the body the brain puppeteers over the live feed. ⏳

---

*Constraints are human-owned. Synthesis is the model's. Verification is the law.*
