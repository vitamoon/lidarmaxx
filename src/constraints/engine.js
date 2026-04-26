/**
 * ConstraintEngine — evaluates zones against agent + tracked objects.
 *
 * Vocabulary (see ALIGNMENT.md for the framing):
 *   - hard  : agent and any tracked object must remain *outside*. Inside ⇒ violation.
 *   - soft  : tolerated penetration with severity proportional to depth.
 *   - trust : explicit allowance; suppresses penalties from overlapping soft zones.
 *
 * The engine returns *decisions*, not actions. A planner decides what to
 * do with a verdict; Penumbra only certifies what the world is and what
 * the operator's intent says about it.
 */

import { SDF } from './sdf.js';

let ZONE_ID = 1;

export class Zone {
  constructor({ id, kind, label, shape }) {
    this.id    = id ?? `z${ZONE_ID++}`;
    this.kind  = kind;   // 'hard' | 'soft' | 'trust'
    this.label = label ?? this.id;
    this.shape = shape;
    this.sdf   = SDF.build(shape);
  }
  contains(x, y, z) { return this.sdf(x, y, z) < 0; }
  distance(x, y, z) { return this.sdf(x, y, z); }
}

export class ConstraintEngine {
  constructor() {
    this._zones = [];
    this._violationCounts = new Map();
  }

  add(z) { this._zones.push(z instanceof Zone ? z : new Zone(z)); }
  clear() { this._zones = []; }
  zones() { return this._zones; }

  evaluate(agentPose, tracks) {
    const decisions = [];

    // Trust zones first — we use them to mute soft penalties.
    const trusts = this._zones.filter(z => z.kind === 'trust');
    const inAnyTrust = (x, y, z) => trusts.some(t => t.distance(x, y, z) < 0);

    // Agent vs every zone
    for (const zone of this._zones) {
      if (zone.kind === 'trust') continue;
      const d = zone.distance(agentPose.x, agentPose.y + 0.2, agentPose.z);
      let verdict;
      if (zone.kind === 'hard') {
        verdict = d < 0 ? 'violation' : (d < 0.15 ? 'warn' : 'ok');
      } else { // soft
        if (inAnyTrust(agentPose.x, agentPose.y + 0.2, agentPose.z)) {
          verdict = 'ok';
        } else {
          verdict = d < -0.20 ? 'violation' : (d < 0.15 ? 'warn' : 'ok');
        }
      }
      decisions.push({
        actor: 'agent',
        actorId: 'agent',
        zoneId: zone.id, zoneLabel: zone.label, zoneKind: zone.kind,
        distance: d,
        verdict,
        t: performance.now(),
      });
    }

    // Tracks vs hard zones (e.g., did a tracked human enter a no-go area?
    // For warehouse_robot scenario the human-bubble is a *dynamic* hard
    // zone attached around the agent itself; that flips the question to
    // "is a human within the agent's exclusion radius".
    for (const trk of tracks) {
      if (!trk.confirmed) continue;
      for (const zone of this._zones) {
        if (zone.kind !== 'hard') continue;
        const d = zone.distance(trk.x, 0.4, trk.z);
        if (d < 0) {
          decisions.push({
            actor: 'track',
            actorId: `t${trk.id}`,
            zoneId: zone.id, zoneLabel: zone.label, zoneKind: 'hard',
            distance: d,
            verdict: 'violation',
            t: performance.now(),
          });
        }
      }
    }

    // Update rolling violation counts so the UI can show "5 violations
    // in the last 100 frames" rather than just the per-frame count.
    for (const d of decisions) {
      if (d.verdict !== 'violation') continue;
      const key = `${d.zoneId}:${d.actorId}`;
      this._violationCounts.set(key, (this._violationCounts.get(key) || 0) + 1);
    }

    return decisions;
  }
}
