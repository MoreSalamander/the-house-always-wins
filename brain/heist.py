"""
THE HOUSE ALWAYS WINS — the deterministic heist simulation.

One Heist instance plays one attempt, frame by frame, fully determined by
(seed, run, skill). It threads the subsystems on a single clock and builds a
StateFrame each tick — the brain's whole job. Nothing here renders; it produces
the wire frames the renderer (or the ASCII debug view) draws.

The run is three risk gates in sequence, each legible on its own clock:
  1. DESCENT   — the camera-blackout relay; fail = a feed runs past the alarm,
                 or the monitor-wall watcher notices the pattern.
  2. VAULT     — drill + arm under cover (always succeeds in this slice).
  3. BLOW      — the masking test: does the roar peak cover the blast?
  then ESCAPE  — load the truck and roll.

Determinism: every sample comes from one seeded RNG keyed on (seed, run), so the
same inputs always replay the same heist, down to the ending frame.
"""

from __future__ import annotations

import random
from .state_frame import (
    StateFrame, HeistPhase, Signals, Fighter, CrewMember, CrewRole, Guard,
    GuardKind, Vision, Camera, CameraState, Security, AlarmState, Vault, Escape,
    Memory, Event, EventKind, Decision, FPS,
)
from .learning import (
    CrewSkill, CrewMemory, BOOM_LOUDNESS, BLACKOUT_LIMIT_S, BASE_CROSS_S,
    SURV_THRESHOLD, SURV_NOISE_STD,
)
from .layout import ROUTE, POS
from .verify import verify_blackout, verify_surveillance, verify_masking

# --- timing (seconds) -------------------------------------------------------
INFILTRATE_S = 1.5
DRILL_S = 3.0
ROAR_RAMP_S = 1.4          # fighters wind the crowd up to the peak over this
LOAD_S = 3.0
HOLD_AFTER_END_S = 1.2     # let the terminal frame breathe before the run ends

# ROUTE (the safecracker's descent) lives in layout.py — the spatial source of
# truth shared with the view, so placement is tuned in one place.
N_CROSSINGS = len(ROUTE) - 1     # crossings to reach the VAULT zone


def _lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


class Heist:
    def __init__(self, seed: int, run: int, skill: CrewSkill, mem: CrewMemory):
        self.seed = seed
        self.run = run
        self.skill = skill
        self.mem = mem
        self.rng = random.Random(seed * 1_000_003 + run)

        # pre-sample the run's luck up front (keeps determinism trivial)
        self.cross_dur = [
            BASE_CROSS_S + max(0.0, self.rng.gauss(skill.cross_delay_mean, skill.cross_delay_std))
            for _ in range(N_CROSSINGS)
        ]
        self.cross_susp = [
            max(0.0, self.rng.gauss(skill.surv_per_blackout, SURV_NOISE_STD))
            for _ in range(N_CROSSINGS)
        ]
        self.roar_peak = max(0.0, min(1.0, self.rng.gauss(skill.roar_peak_mean, skill.roar_peak_std)))

        # mutable run state
        self.frame = 0
        self.phase = HeistPhase.INFILTRATE
        self.crossing = 0
        self.cross_elapsed = 0.0
        self.total_susp = 0.0
        self.drill_elapsed = 0.0
        self.roar_elapsed = 0.0
        self.load_elapsed = 0.0
        self.charge_progress = 0.0
        self.armed = False
        self.blown = False
        self.masked = None          # None | True | False
        self.blow_frame = None
        self.boom = BOOM_LOUDNESS
        self.loot = 0.0
        self.loot_loaded = 0.0
        self.crowd_noise = 0.34
        self.sc_pos = ROUTE[0][2]
        self.outcome: str | None = None
        self.cause: str | None = None
        self.heard_boom = False
        self.feed_alarmed = False
        self._end_hold = 0.0
        self._events: list[Event] = []

    # -- one tick ------------------------------------------------------------
    def step(self) -> StateFrame | None:
        """One turn of the named pipeline — assess → propose → verify →
        commit/fail → log. The phase handler reads the world (assess), the crew
        chooses (propose), verify.py's gates dispose (verify), the run advances
        or ends (commit/fail), and a StateFrame carries the events out (log).

        Returns the StateFrame, or None when the run is over.
        """
        if self._end_hold >= HOLD_AFTER_END_S:
            return None
        self._events = []
        dt = 1.0 / FPS

        if self.outcome is None:
            self._update_fight(dt)
            handler = {
                HeistPhase.INFILTRATE: self._infiltrate,
                HeistPhase.DESCENT: self._descent,
                HeistPhase.VAULT_DRILLING: self._drill,
                HeistPhase.BLOW_WINDOW: self._blow_window,
                HeistPhase.ESCAPE: self._escape,
            }[self.phase]
            handler(dt)
        else:
            self._end_hold += dt

        frame = self._build_frame()
        self.frame += 1
        return frame

    # -- subsystems ----------------------------------------------------------
    def _update_fight(self, dt):
        """Ambient pit noise while stalling; the roar is driven in _blow_window."""
        if self.phase != HeistPhase.BLOW_WINDOW:
            import math
            self.crowd_noise = 0.34 + 0.05 * math.sin(self.frame * 0.05)

    def _infiltrate(self, dt):
        if self.frame >= INFILTRATE_S * FPS:
            self.phase = HeistPhase.DESCENT

    def _descent(self, dt):
        i = self.crossing
        prev_elapsed = self.cross_elapsed
        self.cross_elapsed += dt
        dur = self.cross_dur[i]
        # safecracker slides from this zone toward the next
        self.sc_pos = _lerp(ROUTE[i][2], ROUTE[i + 1][2], min(1.0, self.cross_elapsed / dur))

        # VERIFY (blackout gate): the active feed is dark the whole crossing
        if not verify_blackout(self.cross_elapsed, BLACKOUT_LIMIT_S):
            self._fail("alarm")
            self._events.append(Event(EventKind.ALARM_TRIPPED, ROUTE[i][1],
                                      {"dark_s": round(self.cross_elapsed, 2)}))
            return
        # edge-triggered: warn once, the frame the clock first enters the danger band
        warn_at = BLACKOUT_LIMIT_S - 1.0
        if prev_elapsed < warn_at <= self.cross_elapsed:
            self._events.append(Event(EventKind.BLACKOUT_WARNING, ROUTE[i][1],
                                      {"trip_in_s": round(BLACKOUT_LIMIT_S - self.cross_elapsed, 2)}))

        if self.cross_elapsed >= dur:
            # crossing cleared: restore the feed, the watcher clocks one more blackout
            self.total_susp += self.cross_susp[i]
            self._events.append(Event(EventKind.CAMERA_RESTORED, ROUTE[i][1]))
            self._events.append(Event(EventKind.ZONE_CLEARED, "safecracker", {"zone": ROUTE[i][0]}))
            # VERIFY (surveillance gate): the restored feed adds to the pattern
            if not verify_surveillance(self.total_susp, SURV_THRESHOLD):
                self.feed_alarmed = True
                self._events.append(Event(EventKind.FEED_SUSPICION, "sv",
                                          {"suspicion": round(self.total_susp, 2)}))
                self._fail("surveillance")
                return
            self.crossing += 1
            self.cross_elapsed = 0.0
            if self.crossing >= N_CROSSINGS:
                self.sc_pos = ROUTE[-1][2]
                self.phase = HeistPhase.VAULT_DRILLING
            else:
                self._events.append(Event(EventKind.CAMERA_DARK, ROUTE[self.crossing][1]))

    def _drill(self, dt):
        self.drill_elapsed += dt
        self.charge_progress = min(1.0, self.drill_elapsed / DRILL_S)
        if self.charge_progress >= 1.0 and not self.armed:
            self.armed = True
            self._events.append(Event(EventKind.CHARGE_ARMED, "safecracker"))
            self.phase = HeistPhase.BLOW_WINDOW

    def _blow_window(self, dt):
        """Fighters wind the crowd to a peak; conductor blows at the crest."""
        import math
        self.roar_elapsed += dt
        ramp = ROAR_RAMP_S
        t = min(1.0, self.roar_elapsed / ramp)
        ambient = 0.36
        # half-sine: peaks at the midpoint of the ramp — the conductor's moment
        self.crowd_noise = ambient + (self.roar_peak - ambient) * math.sin(math.pi * t)
        if self.roar_elapsed >= ramp / 2 and not self.blown:
            self.blown = True
            self.blow_frame = self.frame
            # VERIFY (masking gate): the whole game in one grounded comparison
            verdict = verify_masking(self.crowd_noise, self.boom)
            self.masked = verdict.passed
            self._events.append(Event(EventKind.CHARGE_BLOWN, "safecracker",
                                      {"boom": self.boom, "noise": round(self.crowd_noise, 3)}))
            if self.masked:
                self.loot = 1.0
                self.phase = HeistPhase.ESCAPE
            else:
                self.heard_boom = True
                self._events.append(Event(EventKind.BOOM_HEARD, "g1"))
                self._fail("heard")

    def _escape(self, dt):
        self.load_elapsed += dt
        self.loot_loaded = min(1.0, self.load_elapsed / LOAD_S)
        if self.loot_loaded >= 1.0:
            self._events.append(Event(EventKind.TRUCK_ROLLING, "rico"))
            self._events.append(Event(EventKind.ESCAPED, "crew"))
            self.outcome = "SUCCESS"

    def _fail(self, cause):
        self.outcome = "CAUGHT"
        self.cause = cause
        self._events.append(Event(EventKind.CAUGHT, "crew", {"cause": cause}))

    # -- live odds -----------------------------------------------------------
    def _odds(self) -> float:
        if self.outcome == "SUCCESS":
            return 1.0
        if self.outcome == "CAUGHT":
            return 0.0
        descent_done = self.phase in (HeistPhase.VAULT_DRILLING, HeistPhase.BLOW_WINDOW, HeistPhase.ESCAPE)
        remaining = max(0, N_CROSSINGS - self.crossing)
        return round(self.skill.odds(remaining, self.total_susp, descent_done, self.masked), 3)

    # -- frame assembly ------------------------------------------------------
    def _build_frame(self) -> StateFrame:
        # cameras: the one being crossed is DARK, rest LIVE
        cams, dark_zone, dark_elapsed = [], None, 0.0
        if self.phase == HeistPhase.DESCENT:
            dark_zone, dark_elapsed = ROUTE[self.crossing][0], self.cross_elapsed
        elif self.phase == HeistPhase.VAULT_DRILLING:
            dark_zone, dark_elapsed = "VAULT", min(self.drill_elapsed, BLACKOUT_LIMIT_S)
        for zone, label, pos in ROUTE:
            dark = (zone == dark_zone)
            cams.append(Camera(id=f"cam_{zone.lower()}", name=label, zone=zone, pos=pos,
                               facing=1.57,
                               state=CameraState.DARK if dark else CameraState.LIVE,
                               dark_elapsed_s=round(dark_elapsed, 2) if dark else 0.0))

        nearest_trip = round(BLACKOUT_LIMIT_S - dark_elapsed, 2) if dark_zone else None
        if self.outcome == "CAUGHT":
            alarm = AlarmState.TRIPPED
        elif dark_zone and dark_elapsed >= BLACKOUT_LIMIT_S - 1.0:
            alarm = AlarmState.RISING
        else:
            alarm = AlarmState.CALM
        security = Security(alarm_state=alarm, blackout_limit_s=BLACKOUT_LIMIT_S,
                            dark_count=1 if dark_zone else 0, nearest_trip_s=nearest_trip)

        # conductor (hacker) — the legible decision
        hacker_decision = self._conductor_decision(dark_elapsed if dark_zone else 0.0, nearest_trip)

        crew = [
            CrewMember(id="echo", name="ECHO", role=CrewRole.HACKER, pos=POS["hacker"],
                       state="WORKING", intent="conduct: cover descent, time the roar",
                       decision=hacker_decision),
            CrewMember(id="mara", name="MARA", role=CrewRole.SAFECRACKER, pos=self.sc_pos,
                       state=self._safecracker_state(), zone=self._safecracker_zone(),
                       intent=self._safecracker_intent()),
            CrewMember(id="rico", name="RICO", role=CrewRole.DRIVER, pos=POS["driver"],
                       state="WAITING" if self.phase != HeistPhase.ESCAPE else "LOADING",
                       intent="idle at dock, engine warm"),
        ]

        guards = [
            Guard(id="g1", kind=GuardKind.FLOOR, pos=POS["guard_floor"], facing=3.3,
                  vision=Vision(angle=0.6, range=160.0),
                  alert=1.0 if self.heard_boom else 0.1,
                  alert_state="ALARMED" if self.heard_boom else "CALM",
                  heard_boom=self.heard_boom),
            Guard(id="sv", kind=GuardKind.SURVEILLANCE, pos=POS["guard_surv"], facing=0.0,
                  vision=None,
                  alert=min(1.0, self.total_susp / SURV_THRESHOLD),
                  alert_state="ALARMED" if self.feed_alarmed else
                              ("SUSPICIOUS" if self.total_susp > SURV_THRESHOLD * 0.5 else "CALM"),
                  feed_suspicion=round(self.total_susp, 3)),
        ]

        vault = Vault(pos=ROUTE[-1][2], charge_progress=round(self.charge_progress, 3),
                      armed=self.armed, blown=self.blown, blow_frame=self.blow_frame,
                      boom_loudness=self.boom, masked=self.masked, loot=self.loot)

        escape = Escape(truck_at_dock=True, loot_loaded=round(self.loot_loaded, 3),
                        rolling=self.loot_loaded >= 1.0, clear=self.outcome == "SUCCESS")

        signals = Signals(crowd_noise=round(self.crowd_noise, 3),
                          window_open=self.phase == HeistPhase.BLOW_WINDOW,
                          window_start_s=0.0, window_end_s=ROAR_RAMP_S,
                          tension=round(self._tension(nearest_trip), 3))

        memory = Memory(run=self.run, last_failure=self.mem.last_failure,
                        window_shift_s=0.0, best_outcome=self.mem.best_outcome)

        return StateFrame(
            frame=self.frame, seed=self.seed, run=self.run, phase=self.phase,
            odds=self._odds(), signals=signals,
            fighters=self._fighters(), crew=crew, guards=guards, cameras=cams,
            security=security, vault=vault, escape=escape, memory=memory,
            events=list(self._events),
        )

    # -- small presenters ----------------------------------------------------
    def _conductor_decision(self, dark_elapsed, nearest_trip) -> Decision:
        if self.outcome == "CAUGHT":
            return Decision("abort", 0.0, {"cause": self.cause}, "the house won this one")
        if self.phase == HeistPhase.DESCENT:
            return Decision("cover descent", round(self.skill.p_blackout_ok(N_CROSSINGS - self.crossing), 2),
                            {"dark_feed": ROUTE[self.crossing][1], "trip_in_s": nearest_trip,
                             "watcher": f"{self.total_susp:.2f}/{SURV_THRESHOLD:.1f}"},
                            f"feed dark {dark_elapsed:.1f}s, restoring on the cross")
        if self.phase == HeistPhase.VAULT_DRILLING:
            return Decision("hold", 0.8, {"drill": f"{self.charge_progress*100:.0f}%"},
                            "drilling under cover, roar on standby")
        if self.phase == HeistPhase.BLOW_WINDOW:
            if self.blown:
                return Decision("blow", round(self.skill.p_mask(), 2),
                                {"noise": round(self.crowd_noise, 2), "boom": self.boom},
                                "masked!" if self.masked else "roar fell short")
            return Decision("wait for peak", round(self.skill.p_mask(), 2),
                            {"noise": round(self.crowd_noise, 2), "boom": self.boom,
                             "need": f">= {self.boom}"},
                            "winding the crowd up, holding for the crest")
        if self.phase == HeistPhase.ESCAPE:
            return Decision("run", 0.97, {"loaded": f"{self.loot_loaded*100:.0f}%"}, "money's moving, go")
        return Decision("set", 0.5, {}, "taking positions")

    def _fighters(self):
        roaring = self.phase == HeistPhase.BLOW_WINDOW
        jp, bp = POS["fighters"]
        return [
            Fighter(id="jack", name="JACK", archetype="BRAWLER", pos=jp,
                    facing=0.1, state="ATTACKING" if roaring else "CIRCLING",
                    health=0.7, stamina=0.5, action="heavy" if roaring else "jab"),
            Fighter(id="bruno", name="BRUNO", archetype="BRAWLER", pos=bp,
                    facing=3.0, state="STUNNED" if roaring else "BLOCKING",
                    health=0.4, stamina=0.5, action=None),
        ]

    def _safecracker_state(self):
        return {
            HeistPhase.INFILTRATE: "MOVING", HeistPhase.DESCENT: "MOVING",
            HeistPhase.VAULT_DRILLING: "WORKING", HeistPhase.BLOW_WINDOW: "BLOWING",
            HeistPhase.ESCAPE: "FLEEING",
        }.get(self.phase, "WAITING")

    def _safecracker_zone(self):
        if self.phase == HeistPhase.DESCENT:
            return ROUTE[self.crossing][0]
        if self.phase in (HeistPhase.VAULT_DRILLING, HeistPhase.BLOW_WINDOW, HeistPhase.ESCAPE):
            return "VAULT"
        return ROUTE[0][0]

    def _safecracker_intent(self):
        return {
            HeistPhase.INFILTRATE: "move to the floor on Echo's go",
            HeistPhase.DESCENT: "cross on the dark feed",
            HeistPhase.VAULT_DRILLING: "drill + arm",
            HeistPhase.BLOW_WINDOW: "armed — wait for the roar",
            HeistPhase.ESCAPE: "loot to the elevator",
        }.get(self.phase, "stand by")

    def _tension(self, nearest_trip):
        if self.phase == HeistPhase.DESCENT and nearest_trip is not None:
            return max(0.0, 1.0 - nearest_trip / BLACKOUT_LIMIT_S)
        if self.phase == HeistPhase.BLOW_WINDOW and not self.blown:
            return 0.9
        if self.outcome == "CAUGHT":
            return 1.0
        return 0.4


def play(seed: int, run: int, mem: CrewMemory):
    """Play one full heist deterministically; return (frames, outcome, cause)."""
    import copy
    h = Heist(seed, run, copy.deepcopy(mem.skill), mem)
    frames = []
    while True:
        f = h.step()
        if f is None:
            break
        frames.append(f)
    return frames, h.outcome, h.cause
