"""
The real building, for the brain.

Loads the canonical design (design/levels.json + design/level_rooms.json) and
exposes it to the simulation: the tile grids, named rooms, key points, the heist
objectives, and — the point of this module — the ACTUAL routes through the
building, computed by breadth-first search on the real tile grids:

  * MARA's descent   lobby → stairs → (basement) → vault
  * ECHO stage 1     lobby → stairs → (floor 2) → security office
  * ECHO stage 2     security office → stairs → (basement) → server room

This replaces the hand-placed placeholder layout.py. Coordinates are tiles
[x, y] (x = col 0..W-1, y = row 0..H-1), per floor. Floors connect at the
aligned stairwell.
"""

from __future__ import annotations

import json
import os
from collections import deque

_DESIGN = os.path.join(os.path.dirname(__file__), "..", "design")


def _load(name):
    with open(os.path.join(_DESIGN, name)) as f:
        return json.load(f)


_LEVELS = _load("levels.json")
_ROOMS = _load("level_rooms.json")

W = _LEVELS["meta"]["W"]
H = _LEVELS["meta"]["H"]
TILES = {int(k): v for k, v in _LEVELS["meta"]["tiles"].items()}
NAME2TILE = {v: k for k, v in TILES.items()}
WALL = NAME2TILE["WALL"]

GRIDS = _LEVELS["floors"]          # floor -> grid[y][x]
ROOMS = _ROOMS["floors"]           # floor -> {label, rooms, points}
HEIST = _ROOMS["heist"]


# --- geometry helpers -------------------------------------------------------
def walkable(floor: str, x: int, y: int) -> bool:
    g = GRIDS[floor]
    return 0 <= x < W and 0 <= y < H and g[y][x] != WALL


def room_of(floor: str, x: int, y: int) -> str | None:
    """Which named room contains this tile, if any."""
    for name, r in ROOMS[floor]["rooms"].items():
        rx, ry, rw, rh = r["rect"]
        if rx <= x < rx + rw and ry <= y < ry + rh:
            return name
    return None


def point(floor: str, name: str):
    return ROOMS[floor]["points"][name]


def room_center(floor: str, name: str):
    return ROOMS[floor]["rooms"][name]["center"]


# --- pathfinding ------------------------------------------------------------
def bfs(floor: str, start, goal):
    """Shortest 4-connected walkable path, list of [x,y] inclusive, or None."""
    start, goal = tuple(start), tuple(goal)
    prev = {start: None}
    q = deque([start])
    while q:
        cur = q.popleft()
        if cur == goal:
            break
        x, y = cur
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if (nx, ny) not in prev and walkable(floor, nx, ny):
                prev[(nx, ny)] = cur
                q.append((nx, ny))
    if goal not in prev:
        return None
    path, c = [], goal
    while c is not None:
        path.append(list(c))
        c = prev[c]
    return path[::-1]


# --- routes (segments: list of {floor, path}) -------------------------------
def _seg(floor, a, b):
    p = bfs(floor, a, b)
    if p is None:
        raise ValueError(f"no path on {floor} from {a} to {b}")
    return {"floor": floor, "path": p}


def route_mara():
    """Lobby → stairs (floor1) → vault (basement)."""
    return [
        _seg("floor1", HEIST["mara_start"]["pos"], point("floor1", "stairs")),
        _seg("basement", point("basement", "stairs"), HEIST["mara_goal"]["pos"]),
    ]


def route_echo_stage1():
    """Lobby → stairs (floor1) → security office (floor2)."""
    return [
        _seg("floor1", HEIST["mara_start"]["pos"], point("floor1", "stairs")),
        _seg("floor2", point("floor2", "stairs"), HEIST["echo_stage1"]["pos"]),
    ]


def route_echo_stage2():
    """Security office → stairs (floor2) → server room (basement)."""
    return [
        _seg("floor2", HEIST["echo_stage1"]["pos"], point("floor2", "stairs")),
        _seg("basement", point("basement", "stairs"), HEIST["echo_stage2"]["pos"]),
    ]


def zones(segments):
    """Ordered distinct (floor, room) the path crosses — the camera-relay steps."""
    out = []
    for seg in segments:
        for x, y in seg["path"]:
            r = room_of(seg["floor"], x, y)
            tag = (seg["floor"], r)
            if r and (not out or out[-1] != tag):
                out.append(tag)
    return out


if __name__ == "__main__":
    def show(name, segs):
        total = sum(len(s["path"]) for s in segs)
        print(f"  {name:18} {total:3d} tiles over {len(segs)} floors")
        for s in segs:
            a, b = s["path"][0], s["path"][-1]
            print(f"      {s['floor']:8} {a} → {b}  ({len(s['path'])} tiles, "
                  f"{room_of(s['floor'], *a)} → {room_of(s['floor'], *b)})")
        print(f"      zones: {' → '.join(f'{f}:{r}' for f, r in zones(segs))}")

    print(f"\n  THE HOUSE — routes on the real building ({W}x{H}, 3 floors)\n")
    show("MARA descent", route_mara())
    show("ECHO stage 1", route_echo_stage1())
    show("ECHO stage 2", route_echo_stage2())
    print()
