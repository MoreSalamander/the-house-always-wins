"""
ASCII debug view — the backtick overlay, in a terminal.

Renders a single StateFrame as the conductor's console: the odds board, the
crowd-noise curve against the boom line (the masking test), the blackout clock,
the surveillance watcher, the safecracker's progress, and the conductor's live
decision. No pygame, no Unreal — this is how we watch the brain think and tune
whether the timing feels suspenseful before any pixels exist.
"""

from __future__ import annotations
from .state_frame import StateFrame
from .learning import BOOM_LOUDNESS


def _bar(value: float, width: int = 20, fill: str = "█", empty: str = "░") -> str:
    n = max(0, min(width, round(value * width)))
    return fill * n + empty * (width - n)


def _noise_bar(noise: float, boom: float, width: int = 28) -> str:
    """Crowd-noise bar with a │ marker at the boom threshold."""
    cells = []
    boom_col = round(boom * width)
    filled = round(noise * width)
    for i in range(width):
        if i == boom_col:
            cells.append("┊")          # the line the noise must clear
        elif i < filled:
            cells.append("█")
        else:
            cells.append("░")
    return "".join(cells)


def render(f: StateFrame) -> str:
    L = []
    L.append(f"╔══ THE HOUSE ALWAYS WINS ── run {f.run}  seed {f.seed}  frame {f.frame} ({f.time_s:4.1f}s)")
    L.append(f"║ PHASE: {f.phase.value:<14}   ODDS: {_bar(f.odds, 16)} {f.odds*100:4.0f}%")
    L.append("║")

    # the masking test — always show the curve vs the boom line
    s = f.signals
    L.append(f"║ CROWD  {_noise_bar(s.crowd_noise, f.vault.boom_loudness if f.vault else BOOM_LOUDNESS)} {s.crowd_noise:.2f}")
    if f.vault:
        boom = f.vault.boom_loudness
        verdict = ""
        if f.vault.masked is True:
            verdict = "  ← MASKED ✓"
        elif f.vault.masked is False:
            verdict = "  ← HEARD ✗"
        L.append(f"║ BOOM   {' ' * round(boom*28)}┊ need ≥ {boom:.2f}{verdict}")

    # the blackout clock
    sec = f.security
    if sec.dark_count:
        L.append(f"║ FEED   {sec.alarm_state:<8} dark, trips in {sec.nearest_trip_s:>4.1f}s  "
                 f"(limit {sec.blackout_limit_s:.0f}s)")
    # the watcher
    sv = next((g for g in f.guards if g.kind == "SURVEILLANCE"), None)
    if sv:
        L.append(f"║ WATCH  {sv.alert_state:<10} suspicion {_bar(sv.feed_suspicion, 12)} {sv.feed_suspicion:.2f}")

    # safecracker
    sc = next((c for c in f.crew if c.role == "SAFECRACKER"), None)
    if sc:
        L.append(f"║ MARA   {sc.state:<8} @ {str(sc.zone):<9} — {sc.intent}")
    if f.vault and f.vault.charge_progress > 0 and not f.vault.blown:
        L.append(f"║ CHARGE {_bar(f.vault.charge_progress, 16)} {f.vault.charge_progress*100:3.0f}%")

    # the conductor
    hk = next((c for c in f.crew if c.role == "HACKER"), None)
    if hk and hk.decision:
        d = hk.decision
        L.append("║")
        L.append(f"║ ECHO ▸ {d.choice:<14} conf {d.confidence*100:3.0f}%  — {d.why}")

    if f.events:
        L.append(f"║ events: {', '.join(e.kind for e in f.events)}")
    L.append("╚" + "─" * 60)
    return "\n".join(L)
