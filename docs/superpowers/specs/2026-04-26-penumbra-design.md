# Penumbra — Design Spec

**Author:** @vitamoon
**Date:** 2026-04-26
**Status:** Approved (LA Hacks 2026 build)

## 1. Problem

We have a rich vocabulary for aligning *language models* — RLHF, constitutional
AI, debate, RLAIF, deliberation. We have approximately *zero* deployed
machinery for the analogous problem in physical space: how do you constrain
the actions of an embodied agent (a robot, a drone, an autonomous vehicle, a
humanoid) such that violations of human-specified spatial intent are
*impossible*, not merely *unlikely*?

Today's autonomous platforms answer this with model-internal heuristics:
"don't hit pedestrians" is an emergent property of a learned policy. When the
policy is wrong — and it will be wrong, distributionally and adversarially —
there is no independent layer that catches it. The alignment community has
inherited a strange asymmetry: a chatbot's harms are mediated through text and
caught by classifiers, but a humanoid's harms are mediated through physics and
caught by … hope, mostly.

Penumbra closes that gap for one tractable slice: **geometric constraints on
3D space**, enforced from a 360° sensor stream, in real time, with a
tamper-evident audit log.

## 2. Scope (this build)

In scope:
- Browser-only reference implementation (zero install for judges).
- Synthetic 360° LiDAR sweep over a procedurally-generated 3D scene.
- Voxel-grid + DBSCAN clustering pipeline.
- Multi-object Kalman tracking with Hungarian assignment.
- SDF-based constraint engine: hard zones (must-not-enter), soft zones
  (penalize / slow), trust zones (allowed).
- Interactive constraint painter: click-and-drag to declare zones.
- Simulated agent (drone) navigating the scene; live violation detection.
- Spoof / adversarial-injection detector on the point stream.
- SHA-256 hash-chained audit log of every decision.
- Four packaged demo scenarios.

Out of scope (acknowledged future work):
- Real LiDAR hardware ingestion (RPLidar / Velodyne / Livox).
- KITTI / nuScenes replay.
- Distributed enforcement across multi-agent fleets.
- Cryptographic attestation (TEE-signed log entries).

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Sensor layer       (sim/lidar.js)                           │
│  ─ Synthesized 360° sweep, configurable noise model          │
└─────────────────────────────┬────────────────────────────────┘
                              │ raw point stream
┌─────────────────────────────▼────────────────────────────────┐
│  Perception        (perception/voxelgrid.js, dbscan.js,      │
│                     tracker.js, spoof.js)                    │
│  ─ Voxel hash → cluster → track → spoof check                │
└─────────────────────────────┬────────────────────────────────┘
                              │ tracked objects + agent pose
┌─────────────────────────────▼────────────────────────────────┐
│  Constraints       (constraints/sdf.js, zones.js, engine.js) │
│  ─ Per-zone signed-distance evaluation, intent classification│
└─────────────────────────────┬────────────────────────────────┘
                              │ {ok | warn | violation}
┌─────────────────────────────▼────────────────────────────────┐
│  Audit             (audit/log.js)                            │
│  ─ Hash-chained event log, exportable                        │
└─────────────────────────────┬────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────┐
│  Presentation      (render/*, ui/*)                          │
│  ─ Three.js scene, overlays, alerts, controls                │
└──────────────────────────────────────────────────────────────┘
```

The pipeline runs on a fixed-step clock (configurable, default 20 Hz). Each
tick: (a) the sensor produces a fresh point cloud, (b) the perception layer
clusters and tracks, (c) the constraint engine evaluates every active zone
against every tracked object and the agent itself, (d) the audit log appends a
hash-chained entry, (e) the renderer composites everything.

## 4. Component contracts

### 4.1 `LidarSensor`
- `sweep(scenePose) -> Float32Array (xyz triples) + Uint8Array (intensity)`
- Configurable horizontal/vertical resolution, max range, gaussian range noise,
  miss probability.

### 4.2 `VoxelGrid`
- `insert(points)` — O(N) hashmap insertion.
- `neighbors(point, radius)` — O(k) lookup, k = points in adjacent voxels.

### 4.3 `dbscan(points, eps, minPts) -> Cluster[]`
- Standard DBSCAN with voxel-grid acceleration. Returns clusters with point
  members, centroid, AABB, and a stable id heuristic.

### 4.4 `Tracker`
- `update(detections, dt) -> Track[]`
- Constant-velocity Kalman per track. Hungarian assignment by Mahalanobis
  distance. Track lifecycle: tentative → confirmed → lost.

### 4.5 `SpoofDetector`
- `score(points, history) -> { score: 0..1, suspect: boolean, reasons: [] }`
- Flags: range-bin spikes, intensity inversions, points violating sensor
  geometry, sudden density discontinuities.

### 4.6 `ConstraintEngine`
- `evaluate(pose, tracks) -> Decision[]`
- Each zone implements `sdf(point) -> number` (negative inside).
- Decision verdict: `ok | warn | violation` plus zone id, distance, time.

### 4.7 `AuditLog`
- `append(event) -> { seq, hash }`
- Each entry: `{seq, prevHash, payload, payloadHash, hash}`.
- `verify()` walks the chain and confirms every link.

## 5. Data flow per frame (target: 20 Hz, p99 < 50 ms)

1. `clock.tick()` → t
2. `agent.step(t, dt)` → pose
3. `sensor.sweep(pose, scene)` → points
4. `spoof.score(points)` → flag (does *not* gate the rest; logged either way)
5. `voxelGrid.replace(points)`
6. `clusters = dbscan(voxelGrid)`
7. `tracks = tracker.update(clusters, dt)`
8. `decisions = constraintEngine.evaluate(pose, tracks)`
9. `audit.append({t, pose, clusters, tracks, decisions, spoof})`
10. `renderer.draw(...)`

## 6. UI

Single-page layout, three regions:
- **Center (3D viewport):** orbit camera around the scene; point cloud,
  tracked-object boxes, agent, constraint volumes, violation flashes.
- **Left rail (controls):** scenario picker, zone tools (paint/clear),
  layer toggles, simulated attack toggle, audit-log export.
- **Right rail (telemetry):** live FPS, point count, cluster/track counts,
  active violations feed (most recent 20), spoof score gauge.

## 7. Packaged scenarios

1. **`home_at_night`** — A studio apartment in low light. The camera is a
   ceiling-mounted node. The "agent" is a roomba-like floor robot. Constraint
   zones include charging cables, a sleeping dog, and the threshold of the
   bedroom. Personal-stakes scenario.
2. **`warehouse_robot`** — Cold-chain warehouse with human pickers. Zone
   includes a 1.5 m exclusion radius around tracked humans (analog of the
   ANSI/RIA R15.06 separation distance).
3. **`autonomous_vehicle`** — Intersection scene with crosswalk. Zones include
   the crosswalk and the cyclist lane.
4. **`spoofing_attack`** — Same as `home_at_night` but with a simulated
   point-injection attack; demonstrates that the spoof detector flags it and
   the audit log records the attack.

## 8. Testing strategy

Pure-static, no test framework. Verification is via:
- Hand-built golden scenarios with known cluster counts and known-correct
  violation outcomes.
- A `?selftest=1` URL parameter runs sanity asserts on the core math
  (DBSCAN, SDF intersection, Kalman update step) and prints results to console.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Frame budget blown by DBSCAN on dense clouds | Voxel-grid accelerates from O(N²) to O(N·k); cap N at 30k points. |
| Three.js perf with 30k points | Custom shader, single `BufferGeometry`, no per-point objects. |
| Constraint painter UX is confusing | Provide pre-built scenarios so the painter is optional, not required. |
| "Looks like a tech demo, not a product" | Devpost narrative grounds it in a real personal stake + named market. |

## 10. Non-goals

- Not a planner. Penumbra observes and judges; it does not steer the agent.
  (Future work: a planner-side hook that consumes Penumbra decisions.)
- Not a perception model. Penumbra runs *downstream* of whatever perception
  the agent already has — it is a second, independent check.
- Not a complete safety case. It is one verifiable layer in what should be
  a defense-in-depth posture.
