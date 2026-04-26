/**
 * SpoofDetector — adversarial-input detector for the point stream.
 *
 * Real LiDAR attacks exist. The canonical references are:
 *   - Cao et al. (2019) "Adversarial Sensor Attack on LiDAR-based
 *     Perception in Autonomous Driving" — point injection.
 *   - Petit et al. (2015) "Remote Attacks on Automated Vehicles Sensors:
 *     Experiments on Camera and LiDAR" — relay / replay attacks.
 *   - Sun et al. (2020) "Towards Robust LiDAR-based Perception in
 *     Autonomous Driving: General Black-box Adversarial Sensor Attack" —
 *     spoof-with-physical-constraints attack.
 *
 * What this module does (the cheap, deployable subset):
 *   1. *Density discontinuity.* A real sweep has a smooth, range-dependent
 *      density profile; injected points cluster too tightly at chosen ranges.
 *   2. *Range-bin spike.* The histogram of ranges over a sweep is approximately
 *      Poisson; injected points create sub-decimeter spikes with implausible
 *      sample counts.
 *   3. *Temporal anomaly.* The total point count and centroid drift smoothly
 *      between sweeps; abrupt jumps in either flag an attack.
 *
 * It is not a research-grade defense — it is the sort of cheap, always-on
 * monitor that *should* run alongside a learned model and feed both
 * decisions and forensic evidence to the audit log.
 */

export class SpoofDetector {
  constructor({ window = 30 } = {}) {
    this.window = window;
    this.history = []; // ring of {count, mx, mz, hist}
  }

  score(sweep, _tracks) {
    const points = sweep.points;
    const N = points.length / 3;
    if (N === 0) return { score: 0, suspect: false, reasons: [], breakdown: { temporal: 0, hist: 0, density: 0 } };

    // Cheap range-histogram (16 bins out to maxRange ~= 18).
    const histBins = 16;
    const hist = new Uint16Array(histBins);
    let mx = 0, mz = 0;
    let maxR = 0;
    for (let i = 0; i < N; i++) {
      const x = points[i*3], z = points[i*3+2];
      mx += x; mz += z;
      const r = Math.hypot(x, z);
      if (r > maxR) maxR = r;
      const bin = Math.min(histBins - 1, Math.floor(r / 1.2)); // ~1.2 m bins
      hist[bin]++;
    }
    mx /= N; mz /= N;

    // Histogram-spike score: ratio of max-bin to median-bin.
    const sorted = Array.from(hist).sort((a, b) => a - b);
    const median = sorted[Math.floor(histBins / 2)] || 1;
    const spike = Math.max(...hist) / Math.max(1, median);
    const histScore = Math.max(0, Math.min(1, (spike - 4) / 12));

    // Temporal-anomaly score: jump in count or centroid vs. recent mean.
    let temporalScore = 0;
    if (this.history.length >= 5) {
      let mc = 0, mmx = 0, mmz = 0;
      for (const h of this.history) { mc += h.count; mmx += h.mx; mmz += h.mz; }
      mc /= this.history.length; mmx /= this.history.length; mmz /= this.history.length;
      const dC = Math.abs(N - mc) / Math.max(50, mc);
      const dCent = Math.hypot(mx - mmx, mz - mmz);
      temporalScore = Math.min(1, dC * 0.5 + dCent * 0.6);
    }

    // Density-discontinuity score: variance of bin counts after smoothing.
    let smoothed = 0;
    for (let b = 1; b < histBins - 1; b++) {
      const local = (hist[b-1] + hist[b] + hist[b+1]) / 3;
      smoothed += Math.abs(hist[b] - local);
    }
    const densityScore = Math.min(1, smoothed / Math.max(1, N) * 4);

    const score = Math.min(1, histScore * 0.45 + temporalScore * 0.35 + densityScore * 0.20);
    const reasons = [];
    if (histScore  > 0.35) reasons.push('range-bin spike');
    if (temporalScore > 0.40) reasons.push('temporal jump');
    if (densityScore > 0.45) reasons.push('density discontinuity');

    // Push current observation into the history ring.
    this.history.push({ count: N, mx, mz, hist });
    if (this.history.length > this.window) this.history.shift();

    return {
      score,
      suspect: score > 0.55,
      reasons,
      breakdown: { temporal: temporalScore, hist: histScore, density: densityScore },
    };
  }

  reset() { this.history = []; }
}
