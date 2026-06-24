"""
THE HOUSE ALWAYS WINS — the watch-it-play-out view (casino-noir art pass).

Same top-down layout as the tuning bench, reskinned to feel like a *place*: real
room interiors (the lit pit, the carpet and slots of the casino floor, the server
racks, the monitor wall, the round vault door), warm/cold lighting pools, a
vignette and faint CCTV scanlines. The brain still owns all truth; this only
changes how it looks.

  python3 -m view.pygame_view                 # watch the campaign play out
  python3 -m view.pygame_view --run 3         # a run that gets caught
  python3 -m view.pygame_view --shot          # render stills, headless

Controls:  SPACE pause · ←/→ step · R restart · [ / ] prev/next run ·
           ↑/↓ speed · A auto-advance · ESC quit
"""

from __future__ import annotations

import os
import math
import random
import argparse

import pygame

from brain.heist import play
from brain.learning import CrewMemory, BOOM_LOUDNESS, BLACKOUT_LIMIT_S, SURV_THRESHOLD
from brain import layout

# --- casino-noir palette ----------------------------------------------------
BG_TOP      = (10, 11, 16)
BG_BOT      = (15, 12, 17)
SLAB        = (19, 20, 27)        # building shell
SLAB_EDGE   = (40, 42, 54)
FLOOR_DARK  = (24, 25, 33)
INK         = (222, 222, 232)
DIM         = (132, 132, 150)
FAINT       = (70, 72, 90)
GOLD        = (224, 184, 92)
GOLD_DK     = (120, 96, 44)
RED         = (220, 76, 72)
GREEN       = (104, 206, 124)
AMBER       = (236, 188, 76)
BLUE        = (104, 168, 230)
CYAN        = (96, 206, 214)
MAGENTA     = (206, 96, 162)
CARPET      = (46, 20, 28)        # casino burgundy
CARPET_LN   = (66, 30, 40)
FELT        = (28, 66, 50)
STEEL       = (58, 62, 72)
STEEL_DK    = (34, 37, 45)
CONCRETE    = (33, 35, 42)
WARM        = (236, 178, 96)
COLD        = (86, 150, 210)
PANEL       = (16, 16, 23)


def _lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


class Renderer:
    def __init__(self):
        pygame.font.init()
        def font(sz, bold=False):
            return pygame.font.SysFont("menlo,consolas,monospace", sz, bold=bold)
        self.f_sm = font(13)
        self.f_md = font(15)
        self.f_lg = font(22, bold=True)
        self.f_xl = font(40, bold=True)
        self.f_sign = font(11, bold=True)
        rng = random.Random(99)
        x, y, w, h = layout.CROWD_AREA
        self.crowd_seats = [(x + rng.uniform(0, w), y + rng.uniform(0, h)) for _ in range(60)]
        self.crowd_phase = [rng.uniform(0, 6.28) for _ in self.crowd_seats]
        self.rack_leds = [(rng.random(), rng.random()) for _ in range(40)]
        self._glow_cache = {}
        self.bg = self.building = self.vignette = self.scanlines = None

    # -- text ----------------------------------------------------------------
    def _t(self, surf, text, pos, font=None, color=INK):
        surf.blit((font or self.f_md).render(text, True, color), pos)

    def _sign(self, surf, text, x, y, color=DIM):
        # letter-spaced etched signage
        spaced = " ".join(text)
        self._t(surf, spaced, (x, y), self.f_sign, color)

    # -- lighting ------------------------------------------------------------
    def _glow(self, surf, center, radius, color, alpha):
        key = (radius, color, alpha)
        g = self._glow_cache.get(key)
        if g is None:
            g = pygame.Surface((radius * 2, radius * 2), pygame.SRCALPHA)
            steps = 22
            per = max(1, alpha // steps)
            for i in range(steps):
                rr = int(radius * (1 - i / steps))
                pygame.draw.circle(g, (*color, per), (radius, radius), rr)
            self._glow_cache[key] = g
        surf.blit(g, (int(center[0] - radius), int(center[1] - radius)),
                  special_flags=pygame.BLEND_RGB_ADD)

    def _room_light(self, s, rect, color, alpha):
        """A soft overhead pool, clipped to the room so it never bleeds out."""
        prev = s.get_clip()
        s.set_clip(rect)
        self._glow(s, (rect.centerx, int(rect.top + rect.h * 0.34)),
                   int(max(rect.w, rect.h) * 0.7), color, alpha)
        s.set_clip(prev)

    # -- background ----------------------------------------------------------
    def build_bg(self, size):
        s = pygame.Surface(size)
        w, h = size
        for y in range(0, h, 2):
            t = y / h
            c = tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t) for i in range(3))
            pygame.draw.line(s, c, (0, y), (w, y), 2)
        return s

    def build_vignette(self, size):
        w, h = size
        v = pygame.Surface(size, pygame.SRCALPHA)
        steps = 70
        for i in range(steps):
            a = int(120 * (i / steps) ** 2.4)
            inset = int(min(w, h) * 0.5 * (1 - i / steps))
            pygame.draw.rect(v, (0, 0, 0, a), (inset, inset * h // w, w - 2 * inset,
                             h - 2 * inset * h // w), border_radius=40)
        return v

    def build_scanlines(self, size):
        s = pygame.Surface(size, pygame.SRCALPHA)
        bx0, bx1 = layout.BUILDING_X
        for y in range(0, size[1], 3):
            pygame.draw.line(s, (0, 0, 0, 26), (bx0 - 6, y), (bx1 + 6, y))
        return s

    # -- the building (cached) ----------------------------------------------
    def build_building(self, size):
        s = pygame.Surface(size, pygame.SRCALPHA)
        bx0, bx1 = layout.BUILDING_X
        # outer shell with a soft drop shadow
        shell = pygame.Rect(bx0 - 6, 56, bx1 - bx0 + 12, 808)
        sh = pygame.Surface((shell.w + 24, shell.h + 24), pygame.SRCALPHA)
        pygame.draw.rect(sh, (0, 0, 0, 120), (12, 16, shell.w, shell.h), border_radius=14)
        s.blit(sh, (shell.x - 12, shell.y - 12))
        pygame.draw.rect(s, SLAB, shell, border_radius=12)
        pygame.draw.rect(s, SLAB_EDGE, shell, 1, border_radius=12)

        # floors
        for name, y0, y1 in layout.FLOORS:
            r = pygame.Rect(bx0, y0, bx1 - bx0, y1 - y0)
            pygame.draw.rect(s, FLOOR_DARK, r, border_radius=6)
            # top inner highlight + bottom inner shadow = depth
            pygame.draw.line(s, (255, 255, 255, 10), (r.left + 6, r.top + 1), (r.right - 6, r.top + 1))
            pygame.draw.line(s, (0, 0, 0, 90), (r.left + 6, r.bottom - 1), (r.right - 6, r.bottom - 1))
            self._sign(s, name, r.left + 12, r.top + 8, FAINT)

        # elevator shaft
        ex, ey, ew, eh = layout.ELEVATOR_SHAFT
        pygame.draw.rect(s, STEEL_DK, (ex, ey, ew, eh))
        for cy in range(ey + 6, ey + eh, 16):
            pygame.draw.line(s, (0, 0, 0, 120), (ex + ew // 2, cy), (ex + ew // 2, cy + 8))
        pygame.draw.rect(s, (0, 0, 0, 120), (ex, ey, ew, eh), 1)

        # rooms (each gets its own contained light pool)
        for name, rect in layout.ROOMS.items():
            self.paint_room(s, name, pygame.Rect(rect))

        # the route, faint
        pts = [p for _, _, p in layout.ROUTE]
        for a, b in zip(pts, pts[1:]):
            self._dotted(s, a, b, (70, 64, 56), gap=11, r=1)
        return s

    # -- per-room interiors --------------------------------------------------
    def paint_room(self, s, name, r):
        pygame.draw.rect(s, (28, 29, 38), r, border_radius=4)
        # inner bevel
        pygame.draw.line(s, (255, 255, 255, 14), (r.left + 3, r.top + 2), (r.right - 3, r.top + 2))
        pygame.draw.rect(s, (54, 56, 70), r, 1, border_radius=4)

        if name == "THE PIT":
            ring = r.inflate(-r.w * 0.30, -r.h * 0.30)
            pygame.draw.rect(s, (52, 40, 30), ring, border_radius=3)
            for k in range(3):
                pygame.draw.rect(s, (150, 120, 86), ring.inflate(-k * 8, -k * 8), 1, border_radius=3)
            for corner in [(ring.left, ring.top), (ring.right, ring.top),
                           (ring.left, ring.bottom), (ring.right, ring.bottom)]:
                pygame.draw.circle(s, (120, 96, 64), corner, 3)
        elif name == "CASINO FLOOR":
            for cx in range(r.left + 8, r.right, 22):
                pygame.draw.line(s, CARPET_LN, (cx, r.top + 18), (cx, r.bottom - 4))
            inner = pygame.Rect(r.left + 4, r.top + 18, r.w - 8, r.h - 22)
            tmp = pygame.Surface((inner.w, inner.h), pygame.SRCALPHA)
            tmp.fill((*CARPET, 150))
            s.blit(tmp, inner.topleft)
            # slot rows (cyan/magenta tops)
            for i, sx in enumerate(range(r.left + 16, r.right - 12, 30)):
                pygame.draw.rect(s, (40, 40, 52), (sx, r.bottom - 26, 14, 18), border_radius=2)
                pygame.draw.rect(s, CYAN if i % 2 else MAGENTA, (sx, r.bottom - 26, 14, 4), border_radius=2)
            # a felt table
            pygame.draw.ellipse(s, FELT, (r.left + 14, r.top + 26, 70, 40))
            pygame.draw.ellipse(s, (60, 110, 86), (r.left + 14, r.top + 26, 70, 40), 1)
        elif name == "LOUNGE":
            for tx, ty in [(r.left + 60, r.centery), (r.left + 150, r.top + 40),
                           (r.left + 230, r.centery + 20)]:
                pygame.draw.circle(s, (44, 38, 32), (tx, ty), 13)
                pygame.draw.circle(s, (70, 58, 44), (tx, ty), 13, 1)
        elif name == "THE CAGE":
            pygame.draw.rect(s, (40, 34, 24), (r.left + 6, r.bottom - 20, r.w - 12, 14))
            for bx in range(r.left + 14, r.right - 8, 14):
                pygame.draw.line(s, (90, 78, 50), (bx, r.top + 18), (bx, r.bottom - 22))
            for gx in range(r.left + 20, r.right - 12, 28):  # gold stacks
                pygame.draw.rect(s, GOLD_DK, (gx, r.bottom - 18, 10, 8))
        elif name == "LOADING DOCK":
            pygame.draw.rect(s, CONCRETE, r.inflate(-6, -22).move(0, 8), border_radius=2)
            for dy in range(r.top + 20, r.bottom - 4, 9):     # roller door
                pygame.draw.line(s, (52, 54, 62), (r.left + 6, dy), (r.left + 70, dy))
        elif name == "CARGO ELEV":
            mid = r.centerx
            pygame.draw.rect(s, STEEL, (r.left + 8, r.top + 20, r.w - 16, r.h - 26))
            pygame.draw.line(s, STEEL_DK, (mid, r.top + 20), (mid, r.bottom - 6), 2)
        elif name == "EMPLOYEE HALL":
            for tx in range(r.left + 16, r.right, 26):
                pygame.draw.line(s, (38, 40, 48), (tx, r.top + 20), (tx, r.bottom - 4))
        elif name == "SERVER ROOM":
            for i, rx in enumerate(range(r.left + 14, r.right - 14, 30)):
                pygame.draw.rect(s, (26, 30, 40), (rx, r.top + 24, 20, r.h - 34))
                pygame.draw.rect(s, (40, 48, 64), (rx, r.top + 24, 20, r.h - 34), 1)
                for j in range(5):
                    lit, blink = self.rack_leds[(i * 5 + j) % len(self.rack_leds)]
                    col = (CYAN if lit > 0.5 else (60, 90, 90))
                    pygame.draw.rect(s, col, (rx + 4, r.top + 32 + j * 16, 12, 3))
        elif name == "SURVEILLANCE":
            # the monitor wall
            for j in range(2):
                for i in range(5):
                    mx, my = r.left + 14 + i * 36, r.top + 22 + j * 30
                    pygame.draw.rect(s, (20, 30, 38), (mx, my, 30, 22), border_radius=2)
                    pygame.draw.rect(s, (50, 80, 96), (mx, my, 30, 22), 1, border_radius=2)
                    pygame.draw.line(s, (40, 70, 80), (mx + 2, my + 11), (mx + 28, my + 11))
        elif name == "THE VAULT":
            cx, cy = r.left + 90, r.centery + 6
            pygame.draw.circle(s, STEEL_DK, (cx, cy), 56)
            pygame.draw.circle(s, STEEL, (cx, cy), 56, 3)
            pygame.draw.circle(s, (78, 82, 92), (cx, cy), 40, 2)
            for a in range(0, 360, 45):
                bx = cx + int(math.cos(math.radians(a)) * 48)
                by = cy + int(math.sin(math.radians(a)) * 48)
                pygame.draw.circle(s, (90, 94, 104), (bx, by), 3)
            pygame.draw.circle(s, (110, 114, 124), (cx, cy), 10, 2)   # handle
            pygame.draw.line(s, (110, 114, 124), (cx - 14, cy), (cx + 14, cy), 2)
            pygame.draw.line(s, (110, 114, 124), (cx, cy - 14), (cx, cy + 14), 2)
            for gx in range(r.right - 70, r.right - 12, 16):          # gold inside
                pygame.draw.rect(s, GOLD_DK, (gx, r.bottom - 26, 12, 12))
        elif name in ("OFFICES", "BREAK ROOM"):
            for dx in range(r.left + 16, r.right - 20, 50):
                pygame.draw.rect(s, (36, 37, 46), (dx, r.top + 30, 34, 18), border_radius=2)

        # contained overhead light — warm above, cold in the basement/secure rooms
        warm = name in ("THE PIT", "CASINO FLOOR", "LOUNGE", "THE CAGE", "LOADING DOCK")
        cold = name in ("SERVER ROOM", "SURVEILLANCE", "THE VAULT", "CARGO ELEV", "EMPLOYEE HALL")
        lcol = (40, 28, 13) if warm else (16, 31, 52) if cold else (24, 24, 32)
        self._room_light(s, r, lcol, 42 if warm else 38 if cold else 22)

        # room signage
        self._sign(s, name, r.left + 8, r.top + 5, (96, 98, 116))

    def _dotted(self, surf, a, b, color, gap=8, r=2):
        dx, dy = b[0] - a[0], b[1] - a[1]
        dist = math.hypot(dx, dy) or 1
        n = int(dist // gap)
        for i in range(n + 1):
            t = i / max(n, 1)
            pygame.draw.circle(surf, color, (int(a[0] + dx * t), int(a[1] + dy * t)), r)

    def _cone(self, surf, center, facing, half_angle, rng, color, alpha=46):
        layer = pygame.Surface(surf.get_size(), pygame.SRCALPHA)
        pts = [center]
        for i in range(15):
            a = facing - half_angle + (2 * half_angle) * i / 14
            pts.append((center[0] + math.cos(a) * rng, center[1] + math.sin(a) * rng))
        pygame.draw.polygon(layer, (*color, alpha), pts)
        surf.blit(layer, (0, 0))

    def _actor(self, surf, pos, r, color, label=None, ring=None, glow=True):
        p = (int(pos[0]), int(pos[1]))
        if glow:
            self._glow(surf, p, int(r * 2.6), color, 70)
        if ring:
            pygame.draw.circle(surf, ring, p, r + 5, 2)
        pygame.draw.circle(surf, (0, 0, 0), (p[0] + 1, p[1] + 2), r)   # shadow
        pygame.draw.circle(surf, color, p, r)
        pygame.draw.circle(surf, (255, 255, 255, 60), (p[0] - r // 3, p[1] - r // 3), max(1, r // 3))
        if label:
            self._t(surf, label, (p[0] + r + 4, p[1] - 7), self.f_sm, color)

    # -- the whole frame -----------------------------------------------------
    def draw(self, surf, f, meta):
        if self.bg is None:
            self.bg = self.build_bg(surf.get_size())
            self.building = self.build_building(surf.get_size())
            self.vignette = self.build_vignette(surf.get_size())
            self.scanlines = self.build_scanlines(surf.get_size())
        surf.blit(self.bg, (0, 0))
        surf.blit(self.building, (0, 0))

        # dynamic lighting — the roar lights the pit (contained to the room)
        if f.phase.value == "BLOW_WINDOW":
            pit = pygame.Rect(layout.ROOMS["THE PIT"])
            pulse = int(60 + 70 * f.signals.crowd_noise)
            prev = surf.get_clip(); surf.set_clip(pit)
            self._glow(surf, pit.center, int(pit.w * 0.7), (pulse, int(pulse * 0.7), 30), 120)
            surf.set_clip(prev)
        if f.phase.value == "CAUGHT":
            wash = pygame.Surface(surf.get_size(), pygame.SRCALPHA)
            wash.fill((120, 20, 20, 28))
            surf.blit(wash, (0, 0))

        self._draw_crowd(surf, f)
        self._draw_cameras(surf, f)
        self._draw_guards(surf, f)
        self._draw_fighters(surf, f)
        self._draw_crew(surf, f)
        self._draw_vault(surf, f)

        surf.blit(self.scanlines, (0, 0))
        surf.blit(self.vignette, (0, 0))
        self._draw_hud(surf, f, meta)

    def _draw_crowd(self, surf, f):
        noise = f.signals.crowd_noise
        amp = 1.5 + noise * 10.0
        roar = f.phase.value == "BLOW_WINDOW" and noise > 0.6
        bright = int(120 + noise * 120)
        col = (min(255, bright + 50), min(255, bright), 90)
        for (sx, sy), ph in zip(self.crowd_seats, self.crowd_phase):
            t = f.time_s * (4.0 + noise * 6.0) + ph
            jx, jy = math.sin(t) * amp, math.cos(t * 1.3) * amp * 0.6
            pygame.draw.circle(surf, col, (int(sx + jx), int(sy + jy)), 3 if roar else 2)

    def _draw_cameras(self, surf, f):
        hacker = next((c for c in f.crew if c.role == "HACKER"), None)
        for cam in f.cameras:
            p = (int(cam.pos[0]), int(cam.pos[1]))
            if cam.state == "DARK":
                if hacker:
                    self._dotted(surf, hacker.pos, cam.pos, (110, 60, 60), gap=13, r=1)
                pygame.draw.circle(surf, (60, 20, 20), p, 8)
                pygame.draw.circle(surf, RED, p, 8, 2)
                pygame.draw.line(surf, RED, (p[0] - 4, p[1] - 4), (p[0] + 4, p[1] + 4), 2)
                pygame.draw.line(surf, RED, (p[0] - 4, p[1] + 4), (p[0] + 4, p[1] - 4), 2)
            else:
                self._cone(surf, cam.pos, cam.facing, 0.5, 50, (90, 200, 150), 30)
                pygame.draw.circle(surf, (20, 40, 34), p, 5)
                pygame.draw.circle(surf, GREEN, p, 3)

    def _draw_guards(self, surf, f):
        for g in f.guards:
            if g.kind == "FLOOR":
                alarmed = g.alert_state == "ALARMED"
                col = RED if alarmed else (206, 140, 96)
                if g.vision:
                    self._cone(surf, g.pos, g.facing, g.vision.angle, g.vision.range,
                               (220, 80, 80) if alarmed else (206, 150, 96), 38)
                self._actor(surf, g.pos, 6, col, "GUARD", glow=alarmed)
            else:
                x, y = int(g.pos[0]), int(g.pos[1])
                ring = (AMBER if g.alert_state == "SUSPICIOUS"
                        else RED if g.alert_state == "ALARMED" else FAINT)
                self._actor(surf, (x, y), 5, (170, 170, 188), "WATCH", ring=ring, glow=False)

    def _draw_fighters(self, surf, f):
        roar = f.phase.value == "BLOW_WINDOW"
        for ftr in f.fighters:
            self._actor(surf, ftr.pos, 6, GOLD if ftr.id == "jack" else RED, glow=roar)
        if roar:
            a, b = f.fighters[0].pos, f.fighters[1].pos
            mid = _lerp(a, b, 0.5)
            rr = 4 + int((math.sin(f.time_s * 30) + 1) * 3)
            pygame.draw.circle(surf, (255, 240, 180), (int(mid[0]), int(mid[1])), rr, 2)

    def _draw_crew(self, surf, f):
        for c in f.crew:
            if c.role == "HACKER":
                self._actor(surf, c.pos, 6, BLUE, "ECHO")
            elif c.role == "DRIVER":
                x, y = int(c.pos[0]), int(c.pos[1])
                pygame.draw.rect(surf, (62, 78, 96), (x - 16, y - 9, 30, 18), border_radius=3)
                pygame.draw.rect(surf, (90, 110, 130), (x - 16, y - 9, 30, 18), 1, border_radius=3)
                self._actor(surf, (x, y), 4, BLUE, "RICO", glow=False)
            elif c.role == "SAFECRACKER":
                self._actor(surf, c.pos, 7, GOLD, "MARA")
                pygame.draw.circle(surf, (255, 240, 200), (int(c.pos[0]), int(c.pos[1])), 12, 1)

    def _draw_vault(self, surf, f):
        if not f.vault:
            return
        v = f.vault
        p = (int(v.pos[0]), int(v.pos[1]))
        if v.blown:
            col = GREEN if v.masked else RED
            self._glow(surf, p, 34, col, 90)
            for rr in (16, 10, 5):
                pygame.draw.circle(surf, col, p, rr, 2)
        elif v.armed:
            pygame.draw.circle(surf, AMBER, p, 9, 2)
            self._glow(surf, p, 18, AMBER, 70)

    # -- HUD: the conductor's console ----------------------------------------
    def _draw_hud(self, surf, f, meta):
        hx0, hx1 = layout.HUD_X
        pygame.draw.rect(surf, PANEL, (hx0 - 6, 16, hx1 - hx0 + 12, surf.get_height() - 32), border_radius=10)
        pygame.draw.rect(surf, SLAB_EDGE, (hx0 - 6, 16, hx1 - hx0 + 12, surf.get_height() - 32), 1, border_radius=10)
        x, y = hx0 + 8, 30
        self._t(surf, "THE HOUSE ALWAYS WINS", (x, y), self.f_md, GOLD); y += 24
        self._t(surf, f"run {f.run:<3} seed {f.seed}   frame {f.frame}  ({f.time_s:4.1f}s)",
                (x, y), self.f_sm, DIM); y += 26

        self._t(surf, f.phase.value, (x, y), self.f_lg,
                RED if f.phase.value == "CAUGHT" else (GREEN if f.phase.value == "SUCCESS" else INK))
        y += 36
        self._t(surf, "ODDS", (x, y), self.f_sm, DIM)
        self._t(surf, f"{f.odds*100:3.0f}%", (x + 250, y - 14), self.f_xl,
                GREEN if f.odds > 0.66 else (AMBER if f.odds > 0.33 else RED))
        y += 18
        self._bar(surf, x, y, 230, 12, f.odds, GOLD); y += 30

        self._t(surf, "CROWD NOISE  vs  BLAST", (x, y), self.f_sm, DIM); y += 18
        self._noise_meter(surf, x, y, 300, 18, f.signals.crowd_noise,
                          f.vault.boom_loudness if f.vault else BOOM_LOUDNESS, f.vault)
        y += 42
        if f.vault and f.vault.masked is not None:
            self._t(surf, "MASKED — blast covered" if f.vault.masked else "HEARD — guard caught it",
                    (x, y), self.f_md, GREEN if f.vault.masked else RED); y += 24

        sec = f.security
        if sec.dark_count:
            danger = sec.nearest_trip_s is not None and sec.nearest_trip_s < 1.0
            self._t(surf, "FEED DARK", (x, y), self.f_sm, RED if danger else AMBER)
            self._t(surf, f"alarm in {max(0.0, sec.nearest_trip_s):4.1f}s", (x + 110, y),
                    self.f_sm, RED if danger else AMBER); y += 16
            self._bar(surf, x, y, 300, 10, max(0.0, (sec.nearest_trip_s or 0) / sec.blackout_limit_s),
                      RED if danger else AMBER); y += 24

        sv = next((g for g in f.guards if g.kind == "SURVEILLANCE"), None)
        if sv:
            self._t(surf, f"WATCHER  {sv.alert_state}", (x, y), self.f_sm,
                    RED if sv.alert_state == "ALARMED" else (AMBER if sv.alert_state == "SUSPICIOUS" else DIM))
            y += 16
            self._bar(surf, x, y, 300, 10, min(1.0, sv.feed_suspicion / SURV_THRESHOLD), AMBER); y += 24

        if f.vault and 0 < f.vault.charge_progress < 1 and not f.vault.blown:
            self._t(surf, "CHARGE", (x, y), self.f_sm, DIM); y += 16
            self._bar(surf, x, y, 300, 10, f.vault.charge_progress, GOLD); y += 24

        hk = next((c for c in f.crew if c.role == "HACKER"), None)
        if hk and hk.decision:
            d = hk.decision
            y += 6
            pygame.draw.line(surf, FAINT, (x, y), (x + 300, y), 1); y += 8
            self._t(surf, f"ECHO ▸ {d.choice}", (x, y), self.f_md, BLUE); y += 20
            self._t(surf, f"conf {d.confidence*100:3.0f}%", (x, y), self.f_sm, DIM); y += 18
            for line in self._wrap(d.why, 42):
                self._t(surf, line, (x, y), self.f_sm, INK); y += 16

        if f.events:
            y += 6
            self._t(surf, "· " + "  ".join(e.kind for e in f.events[:3]), (x, y), self.f_sm, AMBER)

        camp = meta.get("campaign")
        if camp and camp[1]:
            wins, total, last10 = camp
            self._t(surf, f"CAMPAIGN  {wins}/{total} wins   last-10 {last10*100:3.0f}%",
                    (x, surf.get_height() - 92), self.f_sm, GOLD)
        by = surf.get_height() - 70
        if f.memory.last_failure:
            for line in self._wrap("last: " + f.memory.last_failure, 44):
                self._t(surf, line, (x, by), self.f_sm, DIM); by += 15
        spd = meta.get("speed", 1.0)
        state = "PAUSED" if meta.get("paused") else f"{spd:.1f}x"
        self._t(surf, f"[{state}]  SPACE ←→ R  [ ] runs  ↑↓ speed  A  ESC",
                (x, surf.get_height() - 24), self.f_sm, FAINT)

    def _bar(self, surf, x, y, w, h, frac, color):
        pygame.draw.rect(surf, (38, 38, 50), (x, y, w, h), border_radius=3)
        fw = int(w * max(0.0, min(1.0, frac)))
        if fw > 0:
            pygame.draw.rect(surf, color, (x, y, fw, h), border_radius=3)

    def _noise_meter(self, surf, x, y, w, h, noise, boom, vault):
        pygame.draw.rect(surf, (38, 38, 50), (x, y, w, h), border_radius=3)
        fw = int(w * max(0.0, min(1.0, noise)))
        masked = vault and vault.masked
        col = GREEN if (masked is True) else (RED if masked is False else WARM)
        if fw > 0:
            pygame.draw.rect(surf, col, (x, y, fw, h), border_radius=3)
        bx = x + int(w * boom)
        pygame.draw.line(surf, INK, (bx, y - 4), (bx, y + h + 4), 2)
        self._t(surf, f"{boom:.2f}", (bx - 12, y + h + 4), self.f_sm, INK)

    # -- overlays ------------------------------------------------------------
    def draw_banner(self, surf, outcome, cause):
        bx0, bx1 = layout.BUILDING_X
        cx, cy = (bx0 + bx1) // 2, 430
        win = outcome == "SUCCESS"
        title = "CLEAN GETAWAY" if win else "CAUGHT"
        col = GREEN if win else RED
        sub = "the money's gone" if win else {
            "alarm": "a feed stayed dark too long",
            "surveillance": "the watcher made the blackout pattern",
            "heard": "the blast beat the roar",
        }.get(cause, "the house won this one")
        box = pygame.Surface((470, 124), pygame.SRCALPHA)
        box.fill((8, 8, 12, 244))
        pygame.draw.rect(box, col, box.get_rect(), 2, border_radius=12)
        surf.blit(box, (cx - 235, cy - 62))
        t = self.f_xl.render(title, True, col)
        surf.blit(t, (cx - t.get_width() // 2, cy - 44))
        ssub = self.f_md.render(sub, True, INK)
        surf.blit(ssub, (cx - ssub.get_width() // 2, cy + 16))

    def draw_intro(self, surf, t):
        if self.bg is None:
            self.bg = self.build_bg(surf.get_size())
            self.vignette = self.build_vignette(surf.get_size())
        surf.blit(self.bg, (0, 0))
        cx = surf.get_width() // 2
        self._glow(surf, (cx, 388), 320, (60, 46, 22), 120)
        title = self.f_xl.render("THE HOUSE ALWAYS WINS", True, GOLD)
        surf.blit(title, (cx - title.get_width() // 2, 360))
        sub = self.f_md.render("an AI heist — watch the crew learn to beat the house", True, DIM)
        surf.blit(sub, (cx - sub.get_width() // 2, 410))
        if t > 1.2:
            go = self.f_sm.render("the take begins…", True, FAINT)
            surf.blit(go, (cx - go.get_width() // 2, 450))
        surf.blit(self.vignette, (0, 0))

    @staticmethod
    def _wrap(text, n):
        words, lines, cur = text.split(), [], ""
        for wd in words:
            if len(cur) + len(wd) + 1 > n:
                lines.append(cur); cur = wd
            else:
                cur = (cur + " " + wd).strip()
        if cur:
            lines.append(cur)
        return lines


# --- replay helpers ---------------------------------------------------------
def _frames_for_run(seed, run):
    mem = CrewMemory()
    for r in range(1, run):
        _, o, c = play(seed, r, mem); mem.record(o, c)
    frames, outcome, cause = play(seed, run, mem)
    return frames, outcome, cause


def _campaign_stats(results):
    if not results:
        return (0, 0, 0.0)
    wins = sum(results.values())
    recent = [results[k] for k in sorted(results)[-10:]]
    return (wins, len(results), sum(recent) / len(recent))


def interactive(seed, run, auto=True):
    pygame.init()
    screen = pygame.display.set_mode(layout.WINDOW)
    pygame.display.set_caption("THE HOUSE ALWAYS WINS")
    clock = pygame.time.Clock()
    r = Renderer()

    frames, outcome, cause = _frames_for_run(seed, run)
    idx, paused, speed = 0.0, False, 1.5
    auto_advance = auto
    results, hold, intro_t = {}, 0.0, 0.0
    INTRO, BANNER_HOLD = 2.0, 2.4
    running = True
    while running:
        dt = clock.tick(60) / 1000.0
        for e in pygame.event.get():
            if e.type == pygame.QUIT:
                running = False
            elif e.type == pygame.KEYDOWN:
                if e.key in (pygame.K_ESCAPE, pygame.K_q):
                    running = False
                elif e.key == pygame.K_SPACE:
                    paused = not paused
                elif e.key == pygame.K_a:
                    auto_advance = not auto_advance
                elif e.key == pygame.K_RIGHT:
                    idx = min(len(frames) - 1, idx + 1); paused = True
                elif e.key == pygame.K_LEFT:
                    idx = max(0, idx - 1); paused = True
                elif e.key == pygame.K_r:
                    idx = 0; hold = 0.0
                elif e.key in (pygame.K_RIGHTBRACKET, pygame.K_LEFTBRACKET):
                    run = max(1, run + (1 if e.key == pygame.K_RIGHTBRACKET else -1))
                    frames, outcome, cause = _frames_for_run(seed, run); idx = 0; hold = 0.0
                elif e.key == pygame.K_UP:
                    speed = min(8.0, speed * 1.5)
                elif e.key == pygame.K_DOWN:
                    speed = max(0.125, speed / 1.5)

        if intro_t < INTRO:
            intro_t += dt
            r.draw_intro(screen, intro_t)
            pygame.display.flip()
            continue

        at_end = idx >= len(frames) - 1
        if not paused and not at_end:
            idx = min(len(frames) - 1, idx + speed * 60 * dt)
        if at_end:
            results.setdefault(run, outcome == "SUCCESS")

        meta = {"paused": paused, "speed": speed, "auto": auto_advance,
                "outcome": outcome, "cause": cause, "campaign": _campaign_stats(results)}
        r.draw(screen, frames[int(idx)], meta)
        if at_end:
            r.draw_banner(screen, outcome, cause)
            hold += dt
            if auto_advance and not paused and hold > BANNER_HOLD:
                run += 1
                frames, outcome, cause = _frames_for_run(seed, run)
                idx, hold = 0.0, 0.0
        else:
            hold = 0.0
        pygame.display.flip()
    pygame.quit()


def shots(seed=12345):
    os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
    pygame.init()
    surf = pygame.Surface(layout.WINDOW)
    r = Renderer()
    out = os.path.join(os.path.dirname(__file__), "..", "examples", "shots")
    os.makedirs(out, exist_ok=True)

    def save(frames, pick, name, banner=None):
        f = pick(frames)
        r.draw(surf, f, {"paused": True, "speed": 1.0, "campaign": (7, 10, 0.8)})
        if banner:
            r.draw_banner(surf, *banner)
        pygame.image.save(surf, os.path.join(out, name))
        print(f"  wrote {name}  (run {f.run}, {f.phase.value}, t={f.time_s:.1f}s)")

    win, wo, wc = _frames_for_run(seed, 30)
    save(win, lambda fs: next(c for c in fs if any(cam.state == "DARK" for cam in c.cameras)
                              and c.phase.value == "DESCENT"), "01_descent.png")
    save(win, lambda fs: next(c for c in fs if c.vault and c.vault.blown), "02_blow.png")
    save(win, lambda fs: fs[-1], "04_win_banner.png", banner=(wo, wc))
    caught, co, cc = _frames_for_run(seed, 3)
    save(caught, lambda fs: fs[-1], "03_caught.png", banner=(co, cc))
    r.draw_intro(surf, 1.5); pygame.image.save(surf, os.path.join(out, "00_intro.png"))
    pygame.quit()
    print(f"\n  stills in {os.path.normpath(out)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=12345)
    ap.add_argument("--run", type=int, default=1, help="start run (default 1 — watch them learn)")
    ap.add_argument("--no-auto", action="store_true", help="don't auto-advance to the next run")
    ap.add_argument("--shot", action="store_true", help="render stills headless")
    args = ap.parse_args()
    if args.shot:
        shots(args.seed)
    else:
        interactive(args.seed, args.run, auto=not args.no_auto)


if __name__ == "__main__":
    main()
