/**
 * Math helpers used across modules.
 *
 * Kept dependency-free so a renderer-less unit test can import them. The
 * file is small on purpose — anything domain-specific lives next to its
 * caller (e.g., perception/tracker.js owns the Kalman update step).
 */

export const TAU = Math.PI * 2;

export const clamp  = (x, a, b) => x < a ? a : x > b ? b : x;
export const lerp   = (a, b, t) => a + (b - a) * t;
export const smooth = (x) => x * x * (3 - 2 * x); // smoothstep
export const sign   = (x) => x < 0 ? -1 : 1;

export const dist2  = (a, b) => {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return dx*dx + dy*dy + dz*dz;
};
export const dist   = (a, b) => Math.sqrt(dist2(a, b));

/** Box-Muller for gaussian noise. Single sample, mean 0 std 1. */
export function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

/** xorshift32 — deterministic PRNG seeded by a 32-bit int. */
export function rng(seed = 1) {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) / 0x1_0000_0000);
  };
}

/** Ray-AABB slab test. Returns t along the ray, or Infinity if miss. */
export function rayAABB(ox, oy, oz, dx, dy, dz, min, max) {
  let tMin = -Infinity, tMax = Infinity;
  for (let i = 0; i < 3; i++) {
    const o = i === 0 ? ox : i === 1 ? oy : oz;
    const d = i === 0 ? dx : i === 1 ? dy : dz;
    const lo = min[i], hi = max[i];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    const inv = 1 / d;
    let t1 = (lo - o) * inv, t2 = (hi - o) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return Infinity;
  }
  return tMin > 0 ? tMin : (tMax > 0 ? tMax : Infinity);
}
