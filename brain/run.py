"""
Headless runner — prove the mechanic without a single pixel.

  python3 -m brain.run --campaign 40
        Play 40 attempts with one learning crew; watch the odds climb from
        long-shot to "wins most nights" — the montage, as a table.

  python3 -m brain.run --watch --seed 12345 --run 30
        Replay one heist as the ASCII conductor's console, frame by frame.

  python3 -m brain.run --trace --seed 12345 --run 30
        One heist as a terse event log (phase changes + outcome).
"""

from __future__ import annotations

import argparse
import time

from .heist import play
from .learning import CrewMemory
from .debug_view import render


def campaign(n: int, seed: int = 12345):
    mem = CrewMemory()
    print(f"\n  THE HOUSE ALWAYS WINS — {n} attempts, one learning crew (seed {seed})\n")
    print("  run | outcome | how it ended                                  | est.odds | win-rate")
    print("  " + "-" * 92)
    window = []
    for run in range(1, n + 1):
        pre = mem.skill.odds()                      # the crew's odds going in
        frames, outcome, cause = play(seed, run, mem)
        mem.record(outcome, cause)
        window.append(1 if outcome == "SUCCESS" else 0)
        window = window[-10:]
        recent = sum(window) / len(window)
        tag = "WIN " if outcome == "SUCCESS" else "lost"
        how = "clean — money's gone" if outcome == "SUCCESS" \
              else (CrewMemory._describe(cause) or "caught")
        print(f"  {run:3d} | {tag}    | {how:<45} |   {pre*100:4.0f}%   |  {recent*100:3.0f}%")
    print("  " + "-" * 92)
    print(f"  final: {mem.wins}/{mem.run} wins ({mem.win_rate*100:.0f}%), "
          f"last-10 {sum(window)/len(window)*100:.0f}%, "
          f"crew odds now {mem.skill.odds()*100:.0f}%\n")


def watch(seed: int, run: int, fps: float = 30.0):
    # rebuild the crew's skill state by replaying runs up to `run`
    mem = CrewMemory()
    for r in range(1, run):
        _, outcome, cause = play(seed, r, mem)
        mem.record(outcome, cause)
    frames, outcome, cause = play(seed, run, mem)
    delay = 1.0 / fps
    for f in frames:
        print("\033[2J\033[H", end="")     # clear + home
        print(render(f))
        time.sleep(delay)
    print(f"\n  OUTCOME: {outcome}" + (f" ({cause})" if cause else ""))


def trace(seed: int, run: int):
    mem = CrewMemory()
    for r in range(1, run):
        _, o, c = play(seed, r, mem)
        mem.record(o, c)
    frames, outcome, cause = play(seed, run, mem)
    last_phase = None
    for f in frames:
        if f.phase != last_phase:
            print(f"  [{f.time_s:5.1f}s] → {f.phase.value}")
            last_phase = f.phase
        for e in f.events:
            print(f"  [{f.time_s:5.1f}s]     · {e.kind.value}" + (f" {e.payload}" if e.payload else ""))
    print(f"\n  OUTCOME: {outcome}" + (f" ({cause})" if cause else ""))


def main():
    ap = argparse.ArgumentParser(description="The House Always Wins — heist brain")
    ap.add_argument("--campaign", type=int, metavar="N", help="play N learning attempts")
    ap.add_argument("--watch", action="store_true", help="ASCII-render one heist")
    ap.add_argument("--trace", action="store_true", help="event log for one heist")
    ap.add_argument("--seed", type=int, default=12345)
    ap.add_argument("--run", type=int, default=30)
    ap.add_argument("--fps", type=float, default=30.0)
    args = ap.parse_args()

    if args.campaign:
        campaign(args.campaign, args.seed)
    elif args.watch:
        watch(args.seed, args.run, args.fps)
    elif args.trace:
        trace(args.seed, args.run)
    else:
        campaign(40, args.seed)


if __name__ == "__main__":
    main()
