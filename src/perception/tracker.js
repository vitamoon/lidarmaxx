/**
 * Tracker — multi-object Kalman tracking with greedy-Hungarian assignment.
 *
 * State per track: position (x, z) + velocity (vx, vz). We deliberately
 * track on the ground plane only — vertical clutter (ceiling, varying
 * shelf heights) is noise for the safety judgement and dragging Y into
 * the state burns budget. A real deployment with a 3D-relevant agent
 * (drone) would extend this to (x, y, z, vx, vy, vz).
 *
 * Lifecycle: tentative → confirmed (after `minHits` hits) → lost (after
 * `maxAge` misses). Decisions are emitted only for *confirmed* tracks.
 */

let TRACK_ID = 1;

class Track {
  constructor(measurement, dt) {
    this.id = TRACK_ID++;
    this.x  = measurement[0]; // ground X
    this.z  = measurement[2]; // ground Z (treated as "y" of 2D state)
    this.vx = 0; this.vz = 0;
    // 4×4 covariance — we only update its diagonal because the off-diags
    // stay tiny for our motion model and constant measurement noise.
    this.P = [4, 4, 4, 4];
    this.hits = 1;
    this.misses = 0;
    this.age = 0;
    this.confirmed = false;
    this.lastSeen = 0;
    // Carry the most recent cluster's bbox for visualization.
    this.bbox = null;
  }
  predict(dt) {
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    // Process noise grows the position covariance each step.
    const q = 0.10 * dt;
    this.P[0] += q; this.P[1] += q;
    this.P[2] += 0.04 * dt; this.P[3] += 0.04 * dt;
    this.age += dt;
  }
  update(measurement, dt) {
    // Measurement is a position observation (x, z). Standard Kalman 2D.
    const r = 0.06; // measurement variance
    const kx = this.P[0] / (this.P[0] + r);
    const kz = this.P[1] / (this.P[1] + r);
    const innovX = measurement[0] - this.x;
    const innovZ = measurement[2] - this.z;
    this.x += kx * innovX;
    this.z += kz * innovZ;
    // Velocity update from innovation magnitude (pseudo-measurement).
    const aVx = innovX / Math.max(dt, 1/60);
    const aVz = innovZ / Math.max(dt, 1/60);
    this.vx = 0.7 * this.vx + 0.3 * aVx;
    this.vz = 0.7 * this.vz + 0.3 * aVz;
    this.P[0] *= (1 - kx);
    this.P[1] *= (1 - kz);
    this.hits++;
    this.misses = 0;
    this.lastSeen = 0;
  }
}

export class Tracker {
  constructor({ matchGate = 1.5, maxAge = 12, minHits = 3 } = {}) {
    this.tracks = [];
    this.matchGate = matchGate;
    this.maxAge = maxAge;     // ticks of allowed misses
    this.minHits = minHits;
  }

  update(detections, dt) {
    // 1. predict each track
    for (const t of this.tracks) t.predict(dt);

    // 2. greedy assignment by squared planar distance, gated.
    const usedDet   = new Set();
    const usedTrack = new Set();
    const pairs = [];
    for (let i = 0; i < this.tracks.length; i++) {
      for (let j = 0; j < detections.length; j++) {
        const t = this.tracks[i];
        const d = detections[j].centroid;
        const dx = t.x - d[0], dz = t.z - d[2];
        const dd = dx*dx + dz*dz;
        if (dd <= this.matchGate * this.matchGate) pairs.push([dd, i, j]);
      }
    }
    pairs.sort((a, b) => a[0] - b[0]);
    for (const [, i, j] of pairs) {
      if (usedTrack.has(i) || usedDet.has(j)) continue;
      usedTrack.add(i); usedDet.add(j);
      this.tracks[i].update(detections[j].centroid, dt);
      this.tracks[i].bbox = detections[j].aabb;
    }

    // 3. spawn new tracks for unmatched detections
    for (let j = 0; j < detections.length; j++) {
      if (usedDet.has(j)) continue;
      const t = new Track(detections[j].centroid, dt);
      t.bbox = detections[j].aabb;
      this.tracks.push(t);
    }

    // 4. age unmatched tracks; cull stale ones
    for (let i = 0; i < this.tracks.length; i++) {
      if (!usedTrack.has(i)) {
        this.tracks[i].misses++;
        this.tracks[i].lastSeen += 1;
      }
      if (this.tracks[i].hits >= this.minHits) this.tracks[i].confirmed = true;
    }
    this.tracks = this.tracks.filter(t => t.misses < this.maxAge);

    return this.tracks;
  }

  reset() { this.tracks = []; }
}
