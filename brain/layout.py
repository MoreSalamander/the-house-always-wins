"""
THE HOUSE — the building, as data.

The single source of spatial truth. Both the brain (where actors stand, the
safecracker's route) and the pygame view (rooms, floors, camera posts) read from
here, so tuning placement happens in ONE file and everything stays in sync.

Coordinates are the view's pixel space directly (sim units == pixels) to keep the
tuning loop tight: nudge a number here, see it move on screen. The building
occupies the left of the window; the conductor's HUD takes the right.

Three floors, stacked top-to-bottom the way the heist runs vertically — the
hacker up top in the server room, the fight + crowd on the main floor, the vault
down in the basement. The conductor sees all three at once.
"""

from __future__ import annotations

# --- window / regions -------------------------------------------------------
WINDOW = (1440, 900)
BUILDING_X = (20, 1060)
HUD_X = (1078, 1422)

# --- floors: (name, y_top, y_bottom) ----------------------------------------
FLOORS = [
    ("TOP FLOOR",  70, 300),
    ("MAIN FLOOR", 330, 600),
    ("BASEMENT",   630, 850),
]

# --- rooms: name -> (x, y, w, h) --------------------------------------------
ROOMS = {
    # top floor
    "OFFICES":      (40, 95, 250, 175),
    "BREAK ROOM":   (310, 95, 230, 175),
    "SERVER ROOM":  (560, 95, 460, 175),
    # main floor — back row (the very back: dock, elevator, halls, cage)
    "LOADING DOCK": (40, 348, 200, 92),
    "CARGO ELEV":   (252, 348, 118, 92),
    "EMPLOYEE HALL": (382, 348, 300, 92),
    "THE CAGE":     (700, 348, 320, 92),
    # main floor — front row (pit left, lounge middle, casino right)
    "THE PIT":      (40, 458, 300, 130),
    "LOUNGE":       (360, 458, 322, 130),
    "CASINO FLOOR": (700, 458, 320, 130),
    # basement
    "SURVEILLANCE": (382, 650, 300, 180),
    "THE VAULT":    (700, 650, 320, 180),
}

# the cargo elevator shaft visibly connects main floor → basement
ELEVATOR_SHAFT = (252, 348, 118, 502)   # x, y, w, h

# --- the safecracker's descent: (zone, camera label, position) --------------
# Threads casino floor → employee hall → cargo elevator → DOWN the shaft to the
# basement landing → across to the vault. One camera per zone.
ROUTE = [
    ("CASINO",   "CASINO FLOOR",   (855.0, 523.0)),
    ("HALLWAY",  "EMPLOYEE HALL",  (532.0, 394.0)),
    ("ELEVATOR", "CARGO ELEVATOR", (311.0, 394.0)),
    ("BASEMENT", "BASEMENT LAND",  (311.0, 740.0)),   # down the shaft
    ("VAULT",    "VAULT APPROACH", (855.0, 740.0)),
]

# --- fixed actor placements (tune freely) -----------------------------------
POS = {
    "hacker":      (790.0, 182.0),   # ECHO, in the server room
    "driver":      (140.0, 394.0),   # RICO, at the loading dock
    "fighters":    [(150.0, 523.0), (235.0, 523.0)],  # JACK / BRUNO in the pit
    "guard_floor": (690.0, 775.0),   # roams near the vault
    "guard_surv":  (532.0, 740.0),   # watches the monitor wall in surveillance
    "vault":       (855.0, 740.0),
}

PIT_CENTER = (190.0, 523.0)
CROWD_AREA = (48, 463, 284, 120)     # x, y, w, h — where the crowd dots live
