# Architecture

> A walk through the pipeline, layer by layer, in the order data moves through it.

Penumbra runs as a single-page browser app with no build step. Three.js is
loaded from a CDN via `<script type="importmap">`; everything else is plain
ES modules. Source layout mirrors the pipeline:

```
src/
  core/        # math, app orchestration
  sim/         # the world the LiDAR sees + the agent we are judging
  perception/  # voxel grid, DBSCAN, Kalman tracking, spoof detection
  constraints/ # SDF zones, evaluation engine, paint UI
  audit/       # hash-chained decision log
  render/      # Three.js scene + custom point shader
  ui/          # left/right rails, alerts, telemetry
```

## The tick

`App._tick(dt)` runs at a fixed 20 Hz. The graphics loop runs at the
display's native rate (60 / 120 Hz) and reuses the most recent perception
frame between ticks. Decoupling the two means a 17 ms perception spike
doesn't drop a graphics frame.

```
┌─sim─────────┐  ┌─sensor──────┐  ┌─perception─────────────────────┐
│ scene.step  │  │ sweep()     │  │ voxel → dbscan → tracker       │
│ agent.step  │  │ + noise/miss│  │ ↓                              │
└─────┬───────┘  └─────┬───────┘  │ spoof.score (parallel branch)  │
      │                │          └────────────┬───────────────────┘
      └────────────────┴───────────────────────▼─────┐
                                                     │
                            ┌─constraints────────────┴───┐
                            │ engine.evaluate(pose, trks)│
                            └────────────┬───────────────┘
                                         ▼
                                 ┌─audit.append─┐    ┌─render─┐
                                 │ hash chain   │ →  │ frame  │
                                 └──────────────┘    └────────┘
```

## Sensor model

`LidarSensor` (src/sim/lidar.js) approximates a Velodyne-class spinning
scanner. The geometry is parameterized:

- `hSamples` azimuth samples per rotation (default 720, → 0.5° angular)
- `vChannels` vertical channels evenly spread across `vFovDeg`
- `maxRange` clipped distance
- A noise model with three terms:
  1. **Gaussian range jitter** — σ scales with range, mimicking diode
     time-of-flight uncertainty.
  2. **Miss probability** — uniform per-beam dropouts; a cheap proxy for
     dirt, very-low-reflectance surfaces, and sensor saturation.
  3. **Lambertian intensity** — `cos(angle of incidence)` weighted by
     surface "brightness," giving DBSCAN a signal beyond pure geometry.

The world (`SceneSim`) is a list of axis-aligned boxes. We accept this
constraint deliberately — the safety judgement only ever needs voxel-grade
geometry, and the inner ray-AABB test is two muls per box. With <50 boxes
per scenario and <20k beams per sweep, total cast cost is <4 ms in Chrome
on an M1.

## Perception

**Voxel grid.** A sparse spatial hash with 0.20 m cells. Inserting 10k
points takes ~1.5 ms; neighbor queries are O(k) where k = points in the
3³ adjacent voxels.

**DBSCAN.** Standard density-based clustering (Ester et al. 1996) backed
by the voxel-grid neighborhood query. We chose DBSCAN over k-means
because the cluster count is unknown ahead of time and DBSCAN naturally
labels noise as noise — exactly what you want when a stray glass surface
returns three drifting points.

**Tracker.** One Kalman filter per track (state: `[x, z, vx, vz]`,
ground-plane only). Greedy assignment by gated squared distance — strictly
weaker than the optimal Hungarian assignment but close enough at small
detection counts and ~10× cheaper. Lifecycle: tentative (1–2 hits) →
confirmed (≥`minHits`) → lost (>`maxAge` misses).

**Spoof detector.** A three-headed cheap monitor:
- Range-bin spike — fake injected returns cluster too tightly at chosen ranges.
- Temporal jump — abrupt centroid or count change vs a 30-tick rolling mean.
- Density discontinuity — variance of bin counts after a 1-D smoothing.
Each head produces a 0–1 score; a weighted sum gates the `suspect` bit.

## Constraints

**Zone shapes** are signed-distance fields. Each shape implements
`sdf(x, y, z) -> number` (negative inside). Three primitives ship — box,
sphere, vertical cylinder — which are sufficient for every plausible
constraint a hackathon judge will paint at us.

**Verdicts.**
- `hard` zone: agent or any tracked object inside ⇒ violation.
- `soft` zone: shallow penetration ⇒ warn; deep penetration ⇒ violation;
  suppressed when the actor is also inside a `trust` zone.
- `trust` zone: explicit allowance, mutes overlapping soft penalties.

The engine returns an array of `Decision` objects, one per (actor, zone)
pair that is non-OK. It does *not* steer the agent — Penumbra observes
and certifies; a planner is downstream.

## Audit

Every tick appends an entry to a chained log:

```
entry_n = {
  seq:       n,
  prevHash:  entry_{n-1}.hash,
  payload:   { t, pose, stats, spoof, decisions },
  payloadHash: H(json(payload)),
  hash:      H(seq || prevHash || payloadHash),
}
```

`H` is a 256-bit FNV-1a fold (synchronous, ~0.1 µs/byte). For exported
chains we also expose `sha256Hex` (WebCrypto async) so downstream
verifiers can re-derive the chain with a collision-resistant primitive.

The chain's only goal is *tamper evidence*: any flipped byte in any past
payload changes that entry's hash, which changes every subsequent entry's
hash. A production deployment would additionally anchor the chain head
to a TEE-attested remote service every N entries; we mark the attachment
point with a TODO.

## Render

`Renderer` owns the Three.js scene. The point cloud is a single
`THREE.Points` with a `BufferGeometry` reallocated to powers-of-two as
the per-frame point count grows. The custom shader does three things:
- modulates point size by depth (foreground points are larger)
- colors by intensity using a low/high color LUT
- applies a depth fog so the cloud fades into the scene background

Cluster bboxes and track arrows are pooled — we keep N hidden meshes
around and only update positions/visibility per frame. Zone meshes are
created lazily on first sight and removed when the zone goes away.

## Why static, why no build step

Three reasons:

1. **Demo robustness.** Hackathon WiFi is hostile. A single HTML file
   plus one CDN dep is the most demo-resilient artifact possible.
2. **Read-the-source legibility.** A judge can `git clone` and open any
   file in any editor and see plain JS. No transpilation, no source maps,
   no "where did this code come from."
3. **Honesty about complexity.** We claim 1.5k LoC of perception code.
   No build means that's literally the source they read.
