// Seeded deterministic RNG (mulberry32). Same seed → same sequence, forever.
// The whole sim draws from this so a run is reproducible (the thesis: a
// deterministic scaffold). Returns floats in [0,1).
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Convenience helpers bound to an rng.
export function rngInt(rng, lo, hi) {       // inclusive lo, exclusive hi
  return lo + Math.floor(rng() * (hi - lo));
}
export function rngPick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
