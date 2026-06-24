"""
The verification layer — the deterministic scaffold's third move.

  MoreSalamander thesis: a well-fenced synthesis component becomes reliable as a
  SYSTEM because the unreliable part is wrapped in reliable ones that decide
  whether to trust each output, when to commit, when to reject.

In THE HOUSE ALWAYS WINS the crew (the synthesis component) *proposes* actions
every frame — cross now, drill, blow the door. This module is where Python
*disposes*: three pure, deterministic gates, one per risk boundary, each
returning an auditable Verdict. No gate is an LLM or a heuristic guess; each is a
single grounded comparison the debug overlay can print verbatim. The model
proposes; Python disposes — everywhere.

These are the load-bearing verification layer, deliberately separated from the
simulation so the boundaries are named and inspectable rather than buried in
inline `if`s — the same discipline as my-AI-stro's grounding gates.
"""

from __future__ import annotations
from dataclasses import dataclass


@dataclass(frozen=True)
class Verdict:
    """The result of one deterministic gate. `reason` is overlay-printable."""
    passed: bool
    gate: str
    reason: str

    def __bool__(self) -> bool:
        return self.passed


def verify_blackout(dark_elapsed_s: float, limit_s: float) -> Verdict:
    """BLACKOUT boundary — a cut feed may stay dark only so long before the
    house's dead-feed detector trips the alarm. The hacker proposes the cut;
    this gate disposes the moment it runs long."""
    if dark_elapsed_s >= limit_s:
        return Verdict(False, "BLACKOUT",
                       f"feed dark {dark_elapsed_s:.2f}s ≥ {limit_s:.0f}s limit — alarm")
    return Verdict(True, "BLACKOUT",
                   f"feed dark {dark_elapsed_s:.2f}s < {limit_s:.0f}s")


def verify_surveillance(total_suspicion: float, threshold: float) -> Verdict:
    """SURVEILLANCE boundary — the monitor-wall watcher tolerates only so much
    accumulated blackout pattern before he calls it in. The crew proposes each
    blackout; this gate disposes the run once the pattern is too loud."""
    if total_suspicion >= threshold:
        return Verdict(False, "SURVEILLANCE",
                       f"watcher suspicion {total_suspicion:.2f} ≥ {threshold:.2f} — made")
    return Verdict(True, "SURVEILLANCE",
                   f"watcher suspicion {total_suspicion:.2f} < {threshold:.2f}")


def verify_masking(crowd_noise: float, boom_loudness: float) -> Verdict:
    """MASKING boundary — the whole game in one grounded comparison. The blast is
    only committed if the roar covers it; otherwise a guard hears it. The
    conductor proposes the blow; this gate disposes whether it was clean."""
    if crowd_noise >= boom_loudness:
        return Verdict(True, "MASKING",
                       f"roar {crowd_noise:.2f} ≥ blast {boom_loudness:.2f} — masked")
    return Verdict(False, "MASKING",
                   f"blast {boom_loudness:.2f} > roar {crowd_noise:.2f} — heard")
