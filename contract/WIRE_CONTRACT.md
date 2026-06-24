# THE HOUSE ALWAYS WINS — Wire Contract (v1)

The single seam between the two halves of the game.

```
  Python brain (deterministic, seed-locked)
        │   emits ONE StateFrame per tick
        ▼
  Unreal Engine 5  (pure renderer + audio + camera)
```

The brain owns all truth. Unreal owns nothing but pixels and sound. Every
number Unreal needs to draw the film **and** the backtick debug overlay is in
the StateFrame; nothing the brain decides is recomputed engine-side. Get this
schema right and the two halves can be built in parallel without touching each
other.

**v1** holds the full world: the 5-person crew, the staged fight (masking roar),
the camera-blackout relay + alarm clock, the surveillance watcher, the vault, the
truck/escape clock, and the live odds board. The executable source of truth is
`brain/state_frame.py`; `examples/frame_example.json` is a concrete frame the
renderer parses against on day one.

---

## Transport

Schema is transport-agnostic. A frame is a JSON object; v1 assumes
**newline-delimited JSON** (one frame = one line) so the stream can be `tail`ed
and read by eye. Frames are **fire-and-forget and idempotent** — each carries
absolute state, not deltas, so a dropped frame is harmless (render the next one).
`frame` is monotonic; the renderer ignores any frame older than the last applied.
Target rate 60 fps; Unreal interpolates between frames, the brain never does.

## Coordinate space

Brain works in an abstract 2-D top-down plane: `+x` right, `+y` down, origin
top-left, units = "sim units". Unreal maps sim units → world space once, in its
receiver. The brain stays 2-D forever; 3-D placement is render-side only.

## Versioning

`v` bumps only on a **breaking** change. Additive fields (new optional keys, new
event kinds, new enum members) do **not** bump `v`; the renderer must ignore
unknown keys and degrade gracefully on unknown enum values. Brain stays ahead of
renderer without lockstep releases.

---

## StateFrame (top level)

| field      | type    | meaning |
|------------|---------|---------|
| `v`        | int     | schema version (1) |
| `frame`    | int     | monotonic tick counter, starts 0 |
| `seed`     | int     | RNG seed — shown on the debrief; same seed ⇒ same run |
| `run`      | int     | attempt number (cross-run learning) |
| `time_s`   | float   | `frame / fps`, convenience |
| `phase`    | string  | macro heist phase, see **HeistPhase** |
| `odds`     | float   | 0–1 live win probability — the casino odds board |
| `signals`  | object  | the fight-driven masking curve, see **Signals** |
| `fighters` | array   | the two pit combatants, see **Fighter** |
| `crew`     | array   | hacker / safecracker / driver, see **CrewMember** |
| `guards`   | array   | floor + surveillance, see **Guard** |
| `cameras`  | array   | CCTV feeds, see **Camera** |
| `security` | object  | alarm + blackout clock, see **Security** |
| `vault`    | object  | the objective + masking test, see **Vault** |
| `escape`   | object  | truck/dock clock, see **Escape** |
| `memory`   | object  | cross-run memory snapshot, see **Memory** |
| `events`   | array   | discrete cues fired THIS frame, see **Event** |

---

### HeistPhase (string enum)

Macro state. Drives music bed, camera framing, win/lose screen.

`INFILTRATE` → `DESCENT` → `VAULT_DRILLING` → `BLOW_WINDOW` → `ESCAPE` →
terminal `SUCCESS` | `CAUGHT` | `FAILED`

- `INFILTRATE` — crew enters, takes positions; the fight stalls.
- `DESCENT` — safecracker relays down through camera zones under rolling blackouts.
- `VAULT_DRILLING` — at the door, arming the charge under cover.
- `BLOW_WINDOW` — charge armed; the conductor reads the roar curve for the moment.
- `ESCAPE` — loot → cargo elevator → loading dock → truck.
- `CAUGHT` — a guard heard the boom, saw the crew, or the alarm tripped. The house wins.

### CrewRole / GuardKind / CameraState / AlarmState (string enums)

- **CrewRole:** `FIGHTER` (also in `fighters`) · `HACKER` (the conductor) · `SAFECRACKER` · `DRIVER`
- **GuardKind:** `FLOOR` (trigger = line of sight) · `SURVEILLANCE` (trigger = feed pattern) · `PIT_BOSS`
- **CameraState:** `LIVE` · `DARK` (hacker cut it; dead-feed clock running)
- **AlarmState:** `CALM` · `RISING` (a feed is dark, clock ticking) · `TRIPPED`

---

### Signals (object) — the fight's masking curve

| field            | type   | range   | meaning |
|------------------|--------|---------|---------|
| `crowd_noise`    | float  | 0.0–1.0 | live ambient masking floor, driven by the fight |
| `window_open`    | bool   | —       | is the crew's *planned* roar window currently active |
| `window_start_s` | float  | —       | planned window start (overlay marks it on the curve) |
| `window_end_s`   | float  | —       | planned window end |
| `tension`        | float  | 0.0–1.0 | derived "closeness to disaster" — drives score + post-process |

### Fighter (object)

| field | type | meaning |
|-------|------|---------|
| `id` / `name` | string | stable id / display |
| `archetype` | string | `BRAWLER` \| `COUNTER` \| `TECHNICIAN` \| `WILDCARD` |
| `pos` `[x,y]` / `facing` | — | sim position / radians |
| `state` | string | FSM state (IDLE/APPROACHING/ATTACKING/STUNNED/DEFEATED/…) |
| `health` / `stamina` | float | 0.0–1.0 |
| `action` | string\|null | `jab`/`heavy`/`block`/`dodge`/null |
| `decision` | object\|null | see **Decision** |

### CrewMember (object)

| field | type | meaning |
|-------|------|---------|
| `id` / `name` | string | |
| `role` | string | **CrewRole** |
| `pos` `[x,y]` | — | sim position |
| `state` | string | `MOVING`/`WORKING`/`WAITING`/`BLOWING`/`FLEEING`/… |
| `zone` | string\|null | current camera zone (the safecracker's relay step) |
| `intent` | string | one-line goal for the overlay |
| `decision` | object\|null | the conductor's blow/hold + cover calls live here (hacker) |

### Decision (object) — the legibility payload

The reason the backtick overlay exists. Printed verbatim.

| field | type | meaning |
|-------|------|---------|
| `choice` | string | what was decided (`"hold"`, `"blow"`, `"heavy"`, `"cut cam_vault"`, …) |
| `confidence` | float | 0.0–1.0 |
| `assessment` | object | free-form key→value the overlay prints (noise_read, blackout_clock, …) |
| `why` | string | one short human sentence |

### Guard (object)

| field | type | meaning |
|-------|------|---------|
| `id` | string | |
| `kind` | string | **GuardKind** |
| `pos` `[x,y]` / `facing` | — | sim position / radians |
| `vision` | object\|null | `{angle: <rad half-angle>, range: <units>}`; null for SURVEILLANCE |
| `alert` | float | 0.0–1.0 suspicion |
| `alert_state` | string | `CALM` \| `SUSPICIOUS` \| `ALARMED` |
| `heard_boom` | bool | FLOOR: an unmasked blast reached them |
| `feed_suspicion` | float | SURVEILLANCE: 0–1 suspicion from the blackout pattern |

### Camera (object)

One CCTV feed. The hacker flips `state`; the renderer uses these to draw the
diegetic CCTV view (a `DARK` feed = a black tile / static). A `DARK` feed runs
the dead-feed clock.

| field | type | meaning |
|-------|------|---------|
| `id` / `name` | string | stable id / overlay label |
| `zone` | string | the room/route segment it covers |
| `pos` `[x,y]` / `facing` | — | sim placement |
| `state` | string | **CameraState** `LIVE` \| `DARK` |
| `dark_elapsed_s` | float | seconds this feed has been dark (0 if live) |

### Security (object) — the house's automated camera defenses

| field | type | meaning |
|-------|------|---------|
| `alarm_state` | string | **AlarmState** |
| `blackout_limit_s` | float | max a single feed may stay dark before the alarm trips ("a few seconds") |
| `dark_count` | int | cameras currently dark — the surveillance watcher's suspicion driver |
| `nearest_trip_s` | float\|null | smallest `(limit − dark_elapsed)` across dark feeds — THE blackout clock the overlay shows |

### Vault (object) — the objective + the test

| field | type | meaning |
|-------|------|---------|
| `pos` `[x,y]` | — | the door |
| `charge_progress` | float | 0.0–1.0 drilling/arming |
| `armed` / `blown` | bool | charge ready / detonated |
| `blow_frame` | int\|null | frame the charge blew |
| `boom_loudness` | float | 0.0–1.0 blast loudness |
| `masked` | bool\|null | **THE TEST:** at `blow_frame`, was `boom_loudness <= crowd_noise`? null until blown |
| `loot` | float | 0.0–1.0 money extracted |

`masked == false` ⇒ the boom beat the roar: a guard's `heard_boom` flips,
`alert` spikes, `phase` → `CAUGHT`.

### Escape (object) — the money's way out

| field | type | meaning |
|-------|------|---------|
| `truck_at_dock` | bool | the driver is parked and ready |
| `loot_loaded` | float | 0.0–1.0 of the take loaded onto the truck |
| `rolling` | bool | truck pulling away |
| `clear` | bool | crew + money away clean |

### Memory (object) — cross-run learning, surfaced for the overlay

| field | type | meaning |
|-------|------|---------|
| `run` | int | this attempt's number |
| `last_failure` | string\|null | e.g. `"run 6: blew at 598 — boom 0.70 > noise 0.49, g1 heard it"` |
| `window_shift_s` | float | learned adjustment to the planned window vs run 1 |
| `best_outcome` | string | best terminal phase reached so far |

The brain owns the actual learning; this is a read-only snapshot for the montage.

### Event (object) — discrete cues for audio + camera

A frame's `events` array is the trigger list the renderer fires SFX / camera
cuts off, so Unreal never infers a moment from state deltas.

| field | type | meaning |
|-------|------|---------|
| `kind` | string | see below |
| `actor` | string\|null | id of the actor/camera it concerns |
| `payload` | object | kind-specific extras (e.g. `{"trip_in_s": 1.6}`) |

**EventKind:** `BIG_HIT` · `KNOCKOUT` · `CROWD_ROAR` · `CAMERA_DARK` ·
`CAMERA_RESTORED` · `BLACKOUT_WARNING` · `FEED_SUSPICION` · `ZONE_CLEARED` ·
`CHARGE_SET` · `CHARGE_ARMED` · `CHARGE_BLOWN` · `BOOM_HEARD` · `GUARD_ALERTED` ·
`LOOT_LOADING` · `TRUCK_ROLLING` · `ALARM_TRIPPED` · `CAUGHT` · `ESCAPED`
