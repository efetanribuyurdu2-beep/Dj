/** Small, fast, seedable PRNG (mulberry32). Same seed → same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stream keyed by (seed, key) so replays never depend on call order elsewhere. */
export function keyedRng(seed: number, key: number): () => number {
  return mulberry32((Math.imul(seed ^ 0x9e3779b9, 2654435761) + Math.imul(key + 1, 40503)) >>> 0);
}

export function clamp(v: number, lo = 0, hi = 100): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
