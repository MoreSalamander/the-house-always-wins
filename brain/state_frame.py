"""
THE HOUSE ALWAYS WINS — the wire contract, as code.  (schema v1)

This module IS the seam between the deterministic Python brain and the Unreal
renderer. The brain builds a StateFrame each tick and emits `frame.to_json()`;
Unreal parses that JSON and draws it. Nothing here computes game logic — these
are pure data carriers plus serialization. See contract/WIRE_CONTRACT.md for the
prose spec.

Design rules baked in:
  - Absolute state, never deltas. A dropped frame is harmless.
  - The brain owns all truth; every field the renderer needs is present.
  - Additive changes don't bump SCHEMA_VERSION; breaking ones do.

v1 holds the full world: 5-person crew, the staged fight (masking roar), the
camera-blackout relay + alarm clock, the surveillance watcher, the vault, the
truck/escape clock, and the live odds board.

Run directly to print a sample frame:  python3 brain/state_frame.py [--pretty]
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional

SCHEMA_VERSION = 1
FPS = 60


# ---------------------------------------------------------------------------
# Enums — serialized as their string value, parsed leniently on the far side.
# ---------------------------------------------------------------------------

class HeistPhase(str, Enum):
    INFILTRATE = "INFILTRATE"          # crew enters, takes positions, fight stalls
    DESCENT = "DESCENT"                # safecracker relays down via camera blackouts
    VAULT_DRILLING = "VAULT_DRILLING"  # at the door, drilling/arming under cover
    BLOW_WINDOW = "BLOW_WINDOW"        # charge armed; conductor reads the roar curve
    ESCAPE = "ESCAPE"                  # loot → cargo elevator → dock → truck
    SUCCESS = "SUCCESS"                # terminal — the crew wins
    CAUGHT = "CAUGHT"                  # terminal — the house wins
    FAILED = "FAILED"                  # terminal — other failure


class CrewRole(str, Enum):
    FIGHTER = "FIGHTER"        # the two in the pit (also live in `fighters`)
    HACKER = "HACKER"          # server room; the conductor; owns the cameras
    SAFECRACKER = "SAFECRACKER"
    DRIVER = "DRIVER"          # the truck at the dock; the money's exit


class GuardKind(str, Enum):
    FLOOR = "FLOOR"                  # patrols; trigger = line of sight
    SURVEILLANCE = "SURVEILLANCE"    # watches the monitor wall; trigger = feed pattern
    PIT_BOSS = "PIT_BOSS"            # casino floor authority


class CameraState(str, Enum):
    LIVE = "LIVE"
    DARK = "DARK"      # hacker has cut this feed; dead-feed clock is running


class AlarmState(str, Enum):
    CALM = "CALM"
    RISING = "RISING"     # a feed is dark and the clock is ticking toward trip
    TRIPPED = "TRIPPED"   # the house won this round


class EventKind(str, Enum):
    BIG_HIT = "BIG_HIT"
    KNOCKOUT = "KNOCKOUT"
    CROWD_ROAR = "CROWD_ROAR"
    CAMERA_DARK = "CAMERA_DARK"
    CAMERA_RESTORED = "CAMERA_RESTORED"
    BLACKOUT_WARNING = "BLACKOUT_WARNING"   # a dark feed is nearing the alarm threshold
    FEED_SUSPICION = "FEED_SUSPICION"       # surveillance guard noticed the blackout pattern
    ZONE_CLEARED = "ZONE_CLEARED"           # safecracker crossed a camera zone
    CHARGE_SET = "CHARGE_SET"
    CHARGE_ARMED = "CHARGE_ARMED"
    CHARGE_BLOWN = "CHARGE_BLOWN"
    BOOM_HEARD = "BOOM_HEARD"               # an unmasked blast reached a guard
    GUARD_ALERTED = "GUARD_ALERTED"
    LOOT_LOADING = "LOOT_LOADING"
    TRUCK_ROLLING = "TRUCK_ROLLING"
    ALARM_TRIPPED = "ALARM_TRIPPED"
    CAUGHT = "CAUGHT"
    ESCAPED = "ESCAPED"


# ---------------------------------------------------------------------------
# Sub-objects
# ---------------------------------------------------------------------------

@dataclass
class Decision:
    """The legibility payload — what the backtick overlay prints verbatim."""
    choice: str
    confidence: float                       # 0..1
    assessment: dict = field(default_factory=dict)
    why: str = ""


@dataclass
class Signals:
    """The fight-driven masking curve and the crew's planned roar window."""
    crowd_noise: float = 0.0                # 0..1 live masking floor (the fight)
    window_open: bool = False
    window_start_s: float = 0.0
    window_end_s: float = 0.0
    tension: float = 0.0                    # 0..1 derived, drives score + post-process


@dataclass
class Fighter:
    id: str
    name: str
    archetype: str                          # BRAWLER | COUNTER | TECHNICIAN | WILDCARD
    pos: tuple[float, float]
    facing: float = 0.0                     # radians
    state: str = "IDLE"
    health: float = 1.0                     # 0..1
    stamina: float = 1.0                    # 0..1
    action: Optional[str] = None            # jab|heavy|block|dodge|None
    decision: Optional[Decision] = None


@dataclass
class CrewMember:
    id: str
    name: str
    role: CrewRole
    pos: tuple[float, float]
    state: str = "WAITING"                  # MOVING | WORKING | WAITING | BLOWING | FLEEING ...
    zone: Optional[str] = None              # current camera zone (safecracker's relay step)
    intent: str = ""                        # one-line goal for the overlay
    decision: Optional[Decision] = None     # the conductor's calls live here (hacker)


@dataclass
class Vision:
    angle: float                            # radians, half-angle of the cone
    range: float                            # sim units


@dataclass
class Guard:
    id: str
    kind: GuardKind
    pos: tuple[float, float]
    facing: float
    vision: Optional[Vision] = None         # None for SURVEILLANCE (no line of sight)
    alert: float = 0.0                      # 0..1 suspicion
    alert_state: str = "CALM"               # CALM | SUSPICIOUS | ALARMED
    heard_boom: bool = False                # FLOOR: an unmasked blast reached them
    feed_suspicion: float = 0.0             # SURVEILLANCE: suspicion from the blackout pattern


@dataclass
class Camera:
    """One CCTV feed. The hacker flips state LIVE<->DARK; a DARK feed runs a clock."""
    id: str
    name: str
    zone: str                               # the room/route segment it covers
    pos: tuple[float, float]
    facing: float = 0.0
    state: CameraState = CameraState.LIVE
    dark_elapsed_s: float = 0.0             # seconds this feed has been dark (0 if live)


@dataclass
class Security:
    """The house's automated defenses around the cameras."""
    alarm_state: AlarmState = AlarmState.CALM
    blackout_limit_s: float = 4.0           # max a single feed may stay dark before alarm
    dark_count: int = 0                     # cameras currently dark (surveillance suspicion driver)
    nearest_trip_s: Optional[float] = None  # smallest (limit - dark_elapsed) across dark feeds; the clock


@dataclass
class Vault:
    pos: tuple[float, float]
    charge_progress: float = 0.0            # 0..1 drilling/arming
    armed: bool = False
    blown: bool = False
    blow_frame: Optional[int] = None
    boom_loudness: float = 0.0              # 0..1
    masked: Optional[bool] = None           # THE TEST: boom_loudness <= crowd_noise at blow? None until blown
    loot: float = 0.0                       # 0..1 money extracted from the vault


@dataclass
class Escape:
    """The truck/dock clock — the money's way out."""
    truck_at_dock: bool = False
    loot_loaded: float = 0.0                # 0..1 of the take loaded onto the truck
    rolling: bool = False                   # truck pulling away
    clear: bool = False                     # crew + money away clean


@dataclass
class Memory:
    """Cross-run learning, surfaced read-only for the montage overlay."""
    run: int = 1
    last_failure: Optional[str] = None
    window_shift_s: float = 0.0
    best_outcome: str = "FAILED"


@dataclass
class Event:
    kind: EventKind
    actor: Optional[str] = None
    payload: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Top-level frame
# ---------------------------------------------------------------------------

@dataclass
class StateFrame:
    frame: int
    seed: int
    run: int
    phase: HeistPhase
    odds: float = 0.0                       # 0..1 live win probability (the odds board)
    signals: Signals = field(default_factory=Signals)
    fighters: list[Fighter] = field(default_factory=list)
    crew: list[CrewMember] = field(default_factory=list)
    guards: list[Guard] = field(default_factory=list)
    cameras: list[Camera] = field(default_factory=list)
    security: Security = field(default_factory=Security)
    vault: Optional[Vault] = None
    escape: Escape = field(default_factory=Escape)
    memory: Memory = field(default_factory=Memory)
    events: list[Event] = field(default_factory=list)
    v: int = SCHEMA_VERSION

    @property
    def time_s(self) -> float:
        return self.frame / FPS

    def to_dict(self) -> dict:
        d = asdict(self)
        # asdict() leaves str-Enums as their members; coerce to plain strings
        # and inject the derived time_s the renderer expects.
        d["phase"] = str(self.phase.value)
        d["time_s"] = self.time_s
        for c in d["crew"]:
            if c.get("role") is not None:
                c["role"] = str(c["role"].value) if isinstance(c["role"], CrewRole) else str(c["role"])
        for g in d["guards"]:
            g["kind"] = str(g["kind"].value) if isinstance(g["kind"], GuardKind) else str(g["kind"])
        for cam in d["cameras"]:
            cam["state"] = str(cam["state"].value) if isinstance(cam["state"], CameraState) else str(cam["state"])
        sec = d["security"]
        sec["alarm_state"] = str(sec["alarm_state"].value) if isinstance(sec["alarm_state"], AlarmState) else str(sec["alarm_state"])
        for ev in d["events"]:
            ev["kind"] = str(ev["kind"].value) if isinstance(ev["kind"], EventKind) else str(ev["kind"])
        return d

    def to_json(self) -> str:
        """One frame = one compact line (newline-delimited JSON transport)."""
        return json.dumps(self.to_dict(), separators=(",", ":"))


# ---------------------------------------------------------------------------
# Sample frame — the concrete target the Unreal receiver parses first.
# A mid-heist beat: fight roaring, safecracker mid-descent under a live camera
# blackout, charge armed, conductor holding for the peak, odds climbing.
# ---------------------------------------------------------------------------

def sample_frame() -> StateFrame:
    return StateFrame(
        frame=612,
        seed=12345,
        run=7,
        phase=HeistPhase.BLOW_WINDOW,
        odds=0.78,
        signals=Signals(
            crowd_noise=0.58, window_open=True,
            window_start_s=9.5, window_end_s=11.0, tension=0.82,
        ),
        fighters=[
            Fighter(
                id="jack", name="JACK", archetype="BRAWLER",
                pos=(560.0, 360.0), facing=0.1, state="ATTACKING",
                health=0.62, stamina=0.40, action="heavy",
                decision=Decision(
                    choice="heavy", confidence=0.85,
                    assessment={"distance": "CLOSE", "target_stamina": "LOW",
                                "pattern": "JAB_HAPPY", "opportunity": "TARGET_EXHAUSTED"},
                    why="opening for the finish near the window",
                ),
            ),
            Fighter(
                id="bruno", name="BRUNO", archetype="BRAWLER",
                pos=(640.0, 372.0), facing=3.0, state="STUNNED",
                health=0.18, stamina=0.55, action=None,
            ),
        ],
        crew=[
            CrewMember(
                id="echo", name="ECHO", role=CrewRole.HACKER,
                pos=(1180.0, 80.0), state="WORKING", intent="conduct: hold roar, cover descent",
                decision=Decision(
                    choice="hold", confidence=0.71,
                    assessment={"roar": "0.58 rising", "window": "OPEN",
                                "charge": "ARMED", "blackout_clock": "1.6s left",
                                "surveillance": "CALM"},
                    why="roar not peaked, charge ready, basement cam dark 2.4s — holding",
                ),
            ),
            CrewMember(
                id="mara", name="MARA", role=CrewRole.SAFECRACKER,
                pos=(1060.0, 620.0), state="WORKING", zone="VAULT",
                intent="arm + wait for roar",
                decision=Decision(
                    choice="wait", confidence=0.69,
                    assessment={"charge": "ARMED", "cover": "cam dark", "guard_g1": "CALM"},
                    why="armed, holding for Echo's blow call",
                ),
            ),
            CrewMember(
                id="rico", name="RICO", role=CrewRole.DRIVER,
                pos=(1280.0, 540.0), state="WAITING", intent="idle at dock, engine warm",
            ),
        ],
        guards=[
            Guard(
                id="g1", kind=GuardKind.FLOOR,
                pos=(1040.0, 600.0), facing=3.3,
                vision=Vision(angle=0.6, range=260.0),
                alert=0.12, alert_state="CALM",
            ),
            Guard(
                id="sv", kind=GuardKind.SURVEILLANCE,
                pos=(980.0, 640.0), facing=0.0, vision=None,
                alert=0.20, alert_state="CALM", feed_suspicion=0.20,
            ),
        ],
        cameras=[
            Camera(id="cam_floor", name="CASINO FLOOR", zone="CASINO",
                   pos=(900.0, 360.0), facing=1.57, state=CameraState.LIVE),
            Camera(id="cam_hall", name="EMPLOYEE HALL", zone="HALLWAY",
                   pos=(1000.0, 460.0), facing=1.57, state=CameraState.LIVE),
            Camera(id="cam_vault", name="VAULT APPROACH", zone="VAULT",
                   pos=(1040.0, 600.0), facing=0.0, state=CameraState.DARK,
                   dark_elapsed_s=2.4),
        ],
        security=Security(
            alarm_state=AlarmState.RISING, blackout_limit_s=4.0,
            dark_count=1, nearest_trip_s=1.6,
        ),
        vault=Vault(
            pos=(1060.0, 640.0), charge_progress=1.0, armed=True, blown=False,
            blow_frame=None, boom_loudness=0.70, masked=None, loot=0.0,
        ),
        escape=Escape(truck_at_dock=True, loot_loaded=0.0, rolling=False, clear=False),
        memory=Memory(
            run=7,
            last_failure="run 6: blew at 598 — boom 0.70 > noise 0.49, g1 heard it",
            window_shift_s=+0.4, best_outcome="ESCAPE",
        ),
        events=[
            Event(kind=EventKind.BIG_HIT, actor="jack", payload={"loudness": 0.58}),
            Event(kind=EventKind.BLACKOUT_WARNING, actor="cam_vault", payload={"trip_in_s": 1.6}),
        ],
    )


if __name__ == "__main__":
    import sys
    frame = sample_frame()
    if "--pretty" in sys.argv:
        print(json.dumps(frame.to_dict(), indent=2))
    else:
        print(frame.to_json())
