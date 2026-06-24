# THE HOUSE ALWAYS WINS

A cinematic AI heist you *watch*, not play — built to render in Unreal Engine.
Five AI crew autonomously rob a casino: a staged pit fight whose **crowd roar
masks the vault explosion**, a hacker conducting a **camera-blackout relay** to
sneak the safecracker down to the vault, and a truck at the dock for the money.
They can win or lose — and across runs they *learn*, climbing toward "win most
nights" but never to certainty. The house always keeps its edge.

Hit backtick on any run to peel the film back to the **debug overlay**: every
agent's perception, decision, and confidence — the conductor's console.

## Methodology — the Deterministic Scaffold

A MoreSalamander StudioLabs production, built on the studio's one commitment:
**the model proposes; Python disposes.** Three moves, encoded explicitly — see
[CONSTITUTION.md](CONSTITUTION.md) for the doctrine.

- **Explain** (human-owned) — the constraints written before synthesis: the wire
  contract and the building-as-data (`contract/`, `brain/layout.py`).
- **Synthesize** (AI/agent) — the crew *proposes* each frame's decisions; the
  slot a learned/LLM policy drops into (`brain/heist.py`, `brain/learning.py`).
- **Verify** (deterministic) — three pure gates *dispose* of each proposal at its
  risk boundary (`brain/verify.py`). Verification is a load-bearing layer, not a
  warning.

The per-frame brain is a named pipeline: **assess → propose → verify →
commit/fail → log**, with an event for every boundary crossed. The same
discipline as the rest of the studio, rendered as real-time game AI you can audit
frame by frame.

## Architecture — brain in Python, body in Unreal

```
  Python brain (deterministic, seed-locked)   ← this repo, today
    │   one StateFrame per tick (the wire contract)
    ▼
  Unreal Engine 5  (pure renderer + audio + camera)   ← next
```

The brain owns all truth; Unreal renders what it's told. The seam between them is
the wire contract — get a frame, draw a frame.

## Layout

```
contract/WIRE_CONTRACT.md   the seam — prose spec (read this first)
brain/
  state_frame.py            the contract as code (dataclasses + JSON)
  layout.py                 the building as data — the spatial source of truth
  heist.py                  the deterministic per-frame simulation
  learning.py               CrewSkill + cross-run learning + the odds math
  debug_view.py             the conductor's console, in ASCII
  run.py                    headless runner (campaign / watch / trace)
  test_brain.py             regression guards
view/
  pygame_view.py            the tuning bench — top-down god's-eye + HUD
examples/frame_example.json a concrete frame the renderer parses against
examples/shots/             rendered stills of the bench
```

## Run it

```bash
python3 -m brain.run --campaign 40          # the montage: watch the odds climb
python3 -m brain.run --watch  --run 30      # replay one heist, ASCII console
python3 -m brain.run --trace  --run 3       # one heist as an event log
python3 -m brain.test_brain                 # determinism + the house's edge

python3 -m view.pygame_view --run 30        # the tuning bench (graphical)
python3 -m view.pygame_view --run 3         # a run that gets caught
python3 -m view.pygame_view --shot          # render stills, headless
```

In the bench:  SPACE pause · ←/→ step · R restart · `[` / `]` prev/next run ·
↑/↓ speed · ESC quit. The building is data in `brain/layout.py` — move a number,
re-run, see it move.

## The three risk gates

A run is three legible gambles in sequence, each on its own clock:

1. **DESCENT** — the hacker blacks out cameras zone by zone so the safecracker
   crosses unseen, but a feed dark too long trips the alarm, and the
   surveillance watcher notices the blackout *pattern*.
2. **VAULT** — drill and arm the charge under cover.
3. **BLOW** — the masking test, the whole game in one comparison: at the blow
   frame, is `boom_loudness <= crowd_noise`? The roar has to cover the blast.

Then **ESCAPE** — load the truck and roll.

Learning sharpens whatever just failed: get caught by the watcher and the crew
learns to stagger blackouts; the blast gets heard and the fighters learn to land
a bigger roar. Three gates, each keeping a few percent of permanent risk — so
the odds plateau near 90%, and any given night can still go wrong.

---

*© 2026 MoreSalamander StudioLabs — built by the engineer learning how to build it.*
