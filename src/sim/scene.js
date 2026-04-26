/**
 * SceneSim — the world the LiDAR sees.
 *
 * The scene is a list of axis-aligned boxes (static) plus a list of moving
 * obstacles (dynamic). Moving obstacles get a controller closure that
 * updates their pose each tick. Boxes are the only primitive on purpose —
 * a real LiDAR-driven safety system reasons about voxels, not nurbs, and
 * keeping the geometry trivial means the ray-cast is fast enough that we
 * can afford 16k rays per sweep in pure JS.
 */

import { rayAABB, TAU } from '../core/math.js';

export class Box {
  constructor({ id, center, size, kind = 'static', label = '', color = 0xaab7d4 }) {
    this.id = id;
    this.center = [...center];
    this.size = [...size]; // half-sizes (radii)
    this.kind = kind;      // 'static' | 'dynamic' | 'human' | 'cable' | 'pet'
    this.label = label;
    this.color = color;
    this._min = [0,0,0]; this._max = [0,0,0];
    this._refreshAABB();
  }
  _refreshAABB() {
    for (let i = 0; i < 3; i++) {
      this._min[i] = this.center[i] - this.size[i];
      this._max[i] = this.center[i] + this.size[i];
    }
  }
  setCenter(x, y, z) { this.center[0] = x; this.center[1] = y; this.center[2] = z; this._refreshAABB(); }
  intersect(ox, oy, oz, dx, dy, dz) {
    return rayAABB(ox, oy, oz, dx, dy, dz, this._min, this._max);
  }
}

export class SceneSim {
  constructor(THREE, scenario) {
    this.THREE = THREE;
    this.boxes = [];
    this.controllers = []; // [{box, fn(t, dt)}]
    this.t = 0;
    this.replaceWith(scenario);
  }

  replaceWith(scenario) {
    this.boxes = [];
    this.controllers = [];
    this.t = 0;
    this.bounds = scenario.bounds ?? { min: [-8,-0.1,-8], max: [8, 3, 8] };

    for (const b of scenario.statics ?? []) {
      this.boxes.push(new Box({ id: b.id, center: b.center, size: b.size, kind: 'static', label: b.label, color: b.color ?? 0xaab7d4 }));
    }
    for (const d of scenario.dynamics ?? []) {
      const box = new Box({ id: d.id, center: d.center, size: d.size, kind: d.kind ?? 'dynamic', label: d.label, color: d.color ?? 0xffb547 });
      this.boxes.push(box);
      // Default controller: oscillate along a line if `path` provided, else stay put.
      if (d.path) {
        this.controllers.push((t) => {
          const [a, b] = d.path;
          const phase = (Math.sin(t * (d.speed ?? 0.5)) + 1) / 2;
          box.setCenter(
            a[0] + (b[0]-a[0]) * phase,
            a[1] + (b[1]-a[1]) * phase,
            a[2] + (b[2]-a[2]) * phase,
          );
        });
      }
    }
  }

  step(dt) {
    this.t += dt;
    for (const fn of this.controllers) fn(this.t, dt);
  }

  /**
   * Ray-cast against every box; return the nearest hit distance + surface
   * tag. We accept O(N·rays) here because N is small (<50 in any scenario)
   * and the inner loop is a few muls per box.
   */
  cast(ox, oy, oz, dx, dy, dz, maxRange) {
    let bestT = maxRange;
    let bestBox = null;
    for (const box of this.boxes) {
      const t = box.intersect(ox, oy, oz, dx, dy, dz);
      if (t < bestT) { bestT = t; bestBox = box; }
    }
    return { t: bestT, box: bestBox };
  }

  forEachBox(fn) { for (const b of this.boxes) fn(b); }
}
