/**
 * LidarSensor — synthesizes a 360° spinning-mirror LiDAR sweep.
 *
 * Models the geometry of a Velodyne-style multi-channel rotating scanner:
 *   - `hSamples` azimuth samples per full rotation
 *   - `vChannels` vertical channels stacked between vFov[0] and vFov[1]
 *   - `maxRange` clipped beyond which a return is "no echo"
 *
 * Noise model:
 *   - Gaussian range error (σ scales with range, like real diodes)
 *   - Uniform miss probability per beam (dirt, distant surface dropouts)
 *   - Intensity from a Lambertian approximation + box.color brightness
 *
 * Returns flat Float32Array of xyz triples (world coords) so downstream
 * code can pass it straight to a Three.js BufferGeometry.
 */

import { gauss, TAU } from '../core/math.js';

export class LidarSensor {
  constructor(cfg) { this.configure(cfg ?? {}); }

  configure(cfg) {
    this.hSamples  = cfg.hSamples  ?? 720;
    this.vChannels = cfg.vChannels ?? 16;
    this.vFovDeg   = cfg.vFovDeg   ?? [-15, 15];
    this.maxRange  = cfg.maxRange  ?? 18;
    this.rangeNoise = cfg.rangeNoise ?? 0.012; // σ at 1 m
    this.missProb  = cfg.missProb  ?? 0.018;
    this.height    = cfg.height    ?? 0.45;     // sensor height above pose
    // We pre-compute beam directions once; only the sensor's world pose changes.
    this._buildBeams();
    this._buf = new Float32Array(this.hSamples * this.vChannels * 3);
    this._int = new Uint8Array(this.hSamples * this.vChannels);
    this._rays = null; // optional — only allocated if a caller asks for them
  }

  _buildBeams() {
    const { hSamples, vChannels, vFovDeg } = this;
    const beams = new Float32Array(hSamples * vChannels * 3);
    const v0 = vFovDeg[0] * Math.PI / 180;
    const v1 = vFovDeg[1] * Math.PI / 180;
    let i = 0;
    for (let h = 0; h < hSamples; h++) {
      const az = (h / hSamples) * TAU;
      const ca = Math.cos(az), sa = Math.sin(az);
      for (let v = 0; v < vChannels; v++) {
        const t = vChannels === 1 ? 0.5 : v / (vChannels - 1);
        const el = v0 + (v1 - v0) * t;
        const ce = Math.cos(el), se = Math.sin(el);
        beams[i++] = ca * ce; // x
        beams[i++] = se;      // y (up)
        beams[i++] = sa * ce; // z
      }
    }
    this._beams = beams;
  }

  sweep(pose, scene) {
    const { hSamples, vChannels, _beams: beams, _buf: buf, _int: intensity } = this;
    // Sensor mounted slightly above the agent.
    const ox = pose.x, oy = pose.y + this.height, oz = pose.z;
    let outIdx = 0;
    let intIdx = 0;
    let pointCount = 0;

    const rangeNoise = this.rangeNoise;
    const missProb   = this.missProb;
    const maxRange   = this.maxRange;

    for (let i = 0; i < hSamples * vChannels; i++) {
      const dx = beams[i*3+0];
      const dy = beams[i*3+1];
      const dz = beams[i*3+2];
      // miss?
      if (Math.random() < missProb) continue;
      const hit = scene.cast(ox, oy, oz, dx, dy, dz, maxRange);
      if (hit.t >= maxRange) continue;
      // Range noise scales mildly with distance, like real diode jitter.
      const tNoisy = hit.t + gauss() * rangeNoise * (1 + hit.t * 0.5);
      if (tNoisy <= 0 || tNoisy >= maxRange) continue;
      const px = ox + dx * tNoisy;
      const py = oy + dy * tNoisy;
      const pz = oz + dz * tNoisy;
      buf[outIdx++] = px; buf[outIdx++] = py; buf[outIdx++] = pz;
      // Lambertian: cos(angle of incidence) ≈ |dot(normal, -dir)|.
      // Boxes are axis aligned so we approximate with the dominant axis.
      const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
      const lambert = ax > ay && ax > az ? ax : ay > az ? ay : az;
      const baseI = (hit.box?.color ?? 0xaab7d4);
      const brightness = ((baseI >> 16 & 0xff) + (baseI >> 8 & 0xff) + (baseI & 0xff)) / (3 * 255);
      intensity[intIdx++] = Math.min(255, Math.floor(255 * 0.35 * lambert + 165 * brightness));
      pointCount++;
    }

    return {
      points: buf.subarray(0, pointCount * 3),
      intensity: intensity.subarray(0, pointCount),
      origin: [ox, oy, oz],
      rays: this._rays, // null unless someone enabled it
      hSamples, vChannels,
    };
  }

  // Adversarial hooks — wired to Controls. The detector still has to
  // notice; we only inject the corruption into the next sweep.
  injectSpoof(buf, count) {
    // Insert `count` plausibly-located fake points clustered near origin
    // — the canonical LiDAR injection attack (Cao et al. 2019, "Adversarial
    // sensor attack on LiDAR-based perception in autonomous driving").
    const out = new Float32Array(buf.length + count * 3);
    out.set(buf, 0);
    for (let i = 0; i < count; i++) {
      const az = Math.random() * TAU;
      const r  = 1.0 + Math.random() * 1.5;
      out[buf.length + i*3 + 0] = Math.cos(az) * r;
      out[buf.length + i*3 + 1] = 0.4 + Math.random() * 0.2;
      out[buf.length + i*3 + 2] = Math.sin(az) * r;
    }
    return out;
  }

  injectBlinding(buf, sectorAz, widthRad) {
    // Drop every point within an azimuth wedge — sector blinding is what a
    // bright IR source does to consumer-grade LiDARs.
    const kept = [];
    for (let i = 0; i < buf.length; i += 3) {
      const az = Math.atan2(buf[i+2], buf[i]);
      const dAz = Math.atan2(Math.sin(az - sectorAz), Math.cos(az - sectorAz));
      if (Math.abs(dAz) < widthRad / 2) continue;
      kept.push(buf[i], buf[i+1], buf[i+2]);
    }
    return new Float32Array(kept);
  }
}
