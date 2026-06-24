"""
Cross-run learning + the odds math.

The crew is a small bundle of skill parameters (CrewSkill). Across runs, a rule
keyed on *how the last run failed* nudges the responsible parameters toward a
hard cap — the crew gets better at exactly the thing that burned them. The cap is
never reached, so the win probability climbs toward (but never to) certainty:
the house always keeps its edge.

The odds board is derived analytically from the current skill — three
independent gates the heist must pass (survive the camera blackouts, survive the
surveillance watcher, mask the blast) — so the displayed odds are an honest
estimate, while the actual run is decided by seeded samples in heist.py.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, asdict

# --- world constants the odds math needs (mirrored from heist.py) -----------
BOOM_LOUDNESS = 0.68
BLACKOUT_LIMIT_S = 4.0
BASE_CROSS_S = 1.6
SURV_THRESHOLD = 1.0
SURV_NOISE_STD = 0.06
N_CROSSINGS = 4


def _normcdf(x: float, mu: float = 0.0, sigma: float = 1.0) -> float:
    """Φ — standard normal CDF via erf. sigma>0."""
    if sigma <= 0:
        return 1.0 if x >= mu else 0.0
    return 0.5 * (1.0 + math.erf((x - mu) / (sigma * math.sqrt(2.0))))


# Hard caps — the best the crew can ever get. The gap to these caps is the
# house's permanent edge; learning closes it but never shuts it. Tuned so a
# fully-trained crew sits near ~90% (each of the three gates keeps a few % of
# residual risk): they win most nights, never all of them.
#   p_mask     ≈ 0.96   (roar still falls short ~4%)
#   p_blackout ≈ 0.97   (a crossing still runs long ~0.8%/cross over 4)
#   p_surv     ≈ 0.98   (the watcher still notices ~2%)
#   overall    ≈ 0.91
CAPS = dict(
    roar_peak_mean=0.80, roar_peak_std=0.07,
    cross_delay_mean=0.15, cross_delay_std=0.93,
    surv_per_blackout=0.19,
)
# Where a green crew starts — clumsy, loud, twitchy.
ROOKIE = dict(
    roar_peak_mean=0.60, roar_peak_std=0.17,
    cross_delay_mean=1.10, cross_delay_std=1.10,
    surv_per_blackout=0.30,
)


@dataclass
class CrewSkill:
    """The learnable crew. Lower delay/std/susp = better; higher peak = better."""
    roar_peak_mean: float       # avg height of the masking roar the fighters land
    roar_peak_std: float        # consistency of that roar
    cross_delay_mean: float     # extra seconds a camera-zone crossing tends to run long
    cross_delay_std: float      # how unpredictable that delay is
    surv_per_blackout: float    # suspicion each blackout feeds the monitor wall

    @staticmethod
    def rookie() -> "CrewSkill":
        return CrewSkill(**ROOKIE)

    # -- the three gates, as probabilities -----------------------------------
    def p_overrun_per_crossing(self) -> float:
        """P(one zone crossing keeps a feed dark past the alarm limit)."""
        slack = BLACKOUT_LIMIT_S - BASE_CROSS_S - self.cross_delay_mean
        return 1.0 - _normcdf(slack / max(self.cross_delay_std, 1e-6))

    def p_blackout_ok(self, remaining: int) -> float:
        return (1.0 - self.p_overrun_per_crossing()) ** max(remaining, 0)

    def p_surv_ok(self, remaining: int, susp_so_far: float = 0.0) -> float:
        """P(monitor-wall suspicion stays under the threshold over `remaining` blackouts)."""
        if remaining <= 0:
            return 1.0 if susp_so_far < SURV_THRESHOLD else 0.0
        mu = susp_so_far + remaining * self.surv_per_blackout
        sigma = math.sqrt(remaining) * SURV_NOISE_STD
        return _normcdf(SURV_THRESHOLD, mu, sigma)

    def p_mask(self) -> float:
        """P(the roar peak covers the blast)."""
        return 1.0 - _normcdf(BOOM_LOUDNESS, self.roar_peak_mean, self.roar_peak_std)

    def odds(self, remaining_crossings: int = N_CROSSINGS, susp_so_far: float = 0.0,
             descent_done: bool = False, masked: bool | None = None) -> float:
        """Live win probability given how far the current run has progressed."""
        if masked is True:
            return 0.97          # blast masked; only the drive-out remains
        if masked is False:
            return 0.0
        p_blow = self.p_mask()
        if descent_done:
            return p_blow
        p_desc = self.p_blackout_ok(remaining_crossings) * self.p_surv_ok(remaining_crossings, susp_so_far)
        return p_desc * p_blow


@dataclass
class CrewMemory:
    """What the crew carries between attempts — the montage's substance."""
    run: int = 0
    wins: int = 0
    last_failure: str | None = None
    best_outcome: str = "FAILED"
    skill: CrewSkill = None  # set in __post_init__

    def __post_init__(self):
        if self.skill is None:
            self.skill = CrewSkill.rookie()

    @property
    def win_rate(self) -> float:
        return self.wins / self.run if self.run else 0.0

    def _toward_cap(self, attr: str, rate: float) -> None:
        cur = getattr(self.skill, attr)
        cap = CAPS[attr]
        setattr(self.skill, attr, cur + (cap - cur) * rate)

    def learn(self, cause: str) -> None:
        """Nudge the parameters responsible for `cause` toward their caps.

        Big step on the thing that just failed; small drift everywhere else
        (the crew tightens up generally with reps, but learns the painful
        lesson fastest).
        """
        BIG, SMALL = 0.35, 0.06
        focus = {
            "alarm":        ["cross_delay_mean", "cross_delay_std"],
            "surveillance": ["surv_per_blackout"],
            "heard":        ["roar_peak_mean", "roar_peak_std"],
        }.get(cause, [])
        for attr in CAPS:
            self._toward_cap(attr, BIG if attr in focus else SMALL)

    def record(self, outcome: str, cause: str | None) -> None:
        self.run += 1
        if outcome == "SUCCESS":
            self.wins += 1
            self.best_outcome = "SUCCESS"
            self.last_failure = None
            for attr in CAPS:          # success still sharpens, gently
                self._toward_cap(attr, 0.10)
        else:
            if cause:
                self.learn(cause)
            self.last_failure = self._describe(cause)

    @staticmethod
    def _describe(cause: str | None) -> str | None:
        return {
            "alarm":        "a camera stayed dark too long — alarm tripped",
            "surveillance": "the monitor-wall watcher caught the blackout pattern",
            "heard":        "the blast beat the roar — a guard heard it",
        }.get(cause, cause)

    def snapshot(self) -> dict:
        d = asdict(self)
        d["win_rate"] = round(self.win_rate, 3)
        return d
