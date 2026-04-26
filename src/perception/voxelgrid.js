/**
 * VoxelGrid — sparse spatial hash over 3D points.
 *
 * Used as an acceleration structure for DBSCAN: instead of an O(N²) all-
 * pairs neighborhood query, we bucket points into voxels of side `cell`
 * and ask only for points in the 3³ adjacent voxels.
 *
 * The grid is rebuilt every tick rather than maintained incrementally.
 * For ~10k points and 0.20 m cells the rebuild costs <2 ms in Chrome on
 * a 2021 M1 — cheaper than the bookkeeping of an incremental update.
 */

export class VoxelGrid {
  constructor(cell = 0.2) {
    this.cell = cell;
    this.inv = 1 / cell;
    this.map = new Map(); // key -> array of point indices
  }

  _key(ix, iy, iz) {
    // Pack three signed 15-bit integers into a JS number-safe integer.
    // Bit budget: 3 × 15 = 45 bits, well under Number.MAX_SAFE_INTEGER
    // (2^53 — 1). The earlier 21-bit version produced keys up to 2^63
    // and silently collapsed adjacent Z cells together because the LSB
    // was below double-precision representable distance — every voxel
    // collided into one giant bucket and DBSCAN turned into O(N²).
    // Range: ±2^14 cells → ±3.27 km at 0.2 m cells. Plenty.
    const BIAS = 1 << 14;          // 16384
    const M    = 1 << 15;          // 32768
    return ((ix + BIAS) * M + (iy + BIAS)) * M + (iz + BIAS);
  }

  replace(points) {
    this.map.clear();
    this.points = points;
    const inv = this.inv;
    for (let i = 0; i < points.length; i += 3) {
      const ix = Math.floor(points[i  ] * inv);
      const iy = Math.floor(points[i+1] * inv);
      const iz = Math.floor(points[i+2] * inv);
      const key = this._key(ix, iy, iz);
      let bucket = this.map.get(key);
      if (!bucket) { bucket = []; this.map.set(key, bucket); }
      bucket.push(i / 3);
    }
  }

  /** Return point *indices* within `radius` of points[i]. */
  neighbors(i, radius, out) {
    out.length = 0;
    const points = this.points;
    const px = points[i*3], py = points[i*3+1], pz = points[i*3+2];
    const r2 = radius * radius;
    const inv = this.inv;
    const ix = Math.floor(px * inv);
    const iy = Math.floor(py * inv);
    const iz = Math.floor(pz * inv);
    const span = Math.max(1, Math.ceil(radius * inv));
    for (let dx = -span; dx <= span; dx++)
    for (let dy = -span; dy <= span; dy++)
    for (let dz = -span; dz <= span; dz++) {
      const bucket = this.map.get(this._key(ix+dx, iy+dy, iz+dz));
      if (!bucket) continue;
      for (let b = 0; b < bucket.length; b++) {
        const j = bucket[b];
        if (j === i) continue;
        const ex = points[j*3]   - px;
        const ey = points[j*3+1] - py;
        const ez = points[j*3+2] - pz;
        if (ex*ex + ey*ey + ez*ez <= r2) out.push(j);
      }
    }
    return out;
  }
}
