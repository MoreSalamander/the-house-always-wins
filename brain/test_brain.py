"""
Regression guards for the two non-negotiables.

Run:  python3 -m brain.test_brain     (plain asserts, no pytest needed)

1. DETERMINISM — same (seed, run, skill) replays the same heist exactly.
2. THE HOUSE KEEPS ITS EDGE — a learning crew climbs from a long shot to
   "wins most nights", but never to certainty: it still loses sometimes even
   fully trained, and the estimated odds never hit 100%.
3. CONTRACT SHAPE — every emitted StateFrame serializes to JSON cleanly.
"""

from __future__ import annotations
import json
from .heist import play, Heist
from .learning import CrewMemory, CrewSkill
from .verify import verify_blackout, verify_surveillance, verify_masking


def test_determinism():
    a = CrewMemory(); b = CrewMemory()
    for run in range(1, 25):
        fa, oa, ca = play(777, run, a); a.record(oa, ca)
        fb, ob, cb = play(777, run, b); b.record(ob, cb)
        assert oa == ob and ca == cb, f"run {run}: {oa}/{ca} != {ob}/{cb}"
        assert len(fa) == len(fb), f"run {run}: frame count differs"
        assert fa[-1].to_json() == fb[-1].to_json(), f"run {run}: final frame differs"
    print("  ✓ determinism: 24 runs replay identically")


def test_house_keeps_its_edge():
    mem = CrewMemory()
    outcomes = []
    for run in range(1, 121):
        _, o, c = play(20260608, run, mem)
        mem.record(o, c)
        outcomes.append(o == "SUCCESS")

    early = sum(outcomes[:15]) / 15           # green crew
    late = sum(outcomes[-40:]) / 40           # seasoned crew
    assert early < 0.45, f"rookies should struggle, got {early:.2f}"
    assert late > 0.75, f"veterans should win most nights, got {late:.2f}"
    assert late < 1.0, f"the house must keep its edge — got a perfect {late:.2f}"
    assert mem.skill.odds() < 0.97, f"odds must never reach certainty, got {mem.skill.odds():.3f}"
    # and a trained crew still tastes defeat
    assert not all(outcomes[-40:]), "a seasoned crew should still lose occasionally"
    print(f"  ✓ the house keeps its edge: rookies {early*100:.0f}% → veterans {late*100:.0f}% "
          f"(odds cap {mem.skill.odds()*100:.0f}%, never 100)")


def test_contract_shape():
    mem = CrewMemory()
    frames, _, _ = play(42, 50, mem)
    for f in frames:
        d = json.loads(f.to_json())          # must round-trip
        assert d["v"] == 1 and "odds" in d and "security" in d
    # the masking test must resolve to a real verdict by the end of a played run
    blown = [f for f in frames if f.vault and f.vault.blown]
    if blown:
        assert blown[-1].vault.masked in (True, False)
    print(f"  ✓ contract shape: {len(frames)} frames serialize clean")


def test_verifiers_are_pure_gates():
    """The verification layer: deterministic, boundary-exact, overlay-printable.
    The crew proposes; these gates dispose."""
    assert verify_masking(0.70, 0.68).passed       # roar covers blast
    assert not verify_masking(0.60, 0.68).passed    # blast heard
    assert verify_masking(0.68, 0.68).passed        # boundary: equal = masked
    assert not verify_blackout(4.0, 4.0).passed     # boundary: at-limit = trips
    assert verify_blackout(3.99, 4.0).passed
    assert not verify_surveillance(1.0, 1.0).passed
    assert verify_surveillance(0.99, 1.0).passed
    # reasons are non-empty and printable (they feed the debug overlay)
    for v in (verify_masking(0.7, 0.68), verify_blackout(2.0, 4.0), verify_surveillance(0.5, 1.0)):
        assert v.gate and v.reason
    print("  ✓ verifiers are pure deterministic gates (the model proposes, Python disposes)")


if __name__ == "__main__":
    print("\n  THE HOUSE ALWAYS WINS — brain regression\n")
    test_determinism()
    test_house_keeps_its_edge()
    test_contract_shape()
    test_verifiers_are_pure_gates()
    print("\n  all guards green\n")
