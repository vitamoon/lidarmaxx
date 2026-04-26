/**
 * Agent — the embodied actor whose actions Penumbra is judging.
 *
 * Three controller modes:
 *   - 'waypoints' : visit each waypoint in sequence, repeat
 *   - 'random'    : random walk biased toward unvisited cells
 *   - 'static'    : mounted sensor; pose never moves
 *
 * The agent doesn't know about the constraint zones — that's the whole
 * point. Penumbra's job is to catch a misbehaving / under-aligned policy
 * regardless of what the agent "thinks" it is doing.
 */

export class Agent {
  constructor(cfg) {
    this.pose = { x: 0, y: 0, z: 0, yaw: 0 };
    this.vel  = { x: 0, z: 0 };
    this.configure(cfg ?? {});
  }

  configure(cfg) {
    this.mode      = cfg.mode      ?? 'waypoints';
    this.speed     = cfg.speed     ?? 0.6;       // m/s
    this.radius    = cfg.radius    ?? 0.22;      // collision radius
    this.height    = cfg.height    ?? 0.32;
    this.waypoints = cfg.waypoints ?? [[0,0,0]];
    this._wpIdx    = 0;
    if (cfg.start) this.pose = { ...this.pose, ...cfg.start };
  }

  step(dt, scene) {
    if (this.mode === 'static') return;

    let target;
    if (this.mode === 'waypoints') {
      target = this.waypoints[this._wpIdx];
      const dx = target[0] - this.pose.x;
      const dz = target[2] - this.pose.z;
      const d  = Math.hypot(dx, dz);
      if (d < 0.18) {
        this._wpIdx = (this._wpIdx + 1) % this.waypoints.length;
      }
    } else { // random
      // pick a target every ~2 s
      if (!this._rndTarget || Math.random() < dt * 0.5) {
        const b = scene?.bounds ?? { min:[-4,0,-4], max:[4,0,4] };
        this._rndTarget = [
          b.min[0] + Math.random() * (b.max[0] - b.min[0]),
          0,
          b.min[2] + Math.random() * (b.max[2] - b.min[2]),
        ];
      }
      target = this._rndTarget;
    }

    const dx = target[0] - this.pose.x;
    const dz = target[2] - this.pose.z;
    const d  = Math.hypot(dx, dz) || 1;
    const vx = (dx / d) * this.speed;
    const vz = (dz / d) * this.speed;
    this.vel.x = vx; this.vel.z = vz;
    this.pose.x += vx * dt;
    this.pose.z += vz * dt;
    this.pose.yaw = Math.atan2(vx, vz);
  }
}
