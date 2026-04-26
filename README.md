# Penumbra

> Real-time 360° spatial alignment for embodied AI.

Penumbra is the missing safety layer for AI systems that move through
physical space. Humans declare inviolable geometric constraints — *the
robot does not enter the nursery, the drone does not cross the property
line, the forklift does not pass within 1.5 m of a person* — and Penumbra
continuously verifies those constraints against a live 360° LiDAR feed
at sensor speed, with a tamper-evident audit log of every decision.

This repo is the runnable reference implementation. It runs entirely in
the browser, with no install step.

**Live demo:** https://vitamoon.github.io/lidarmaxx/

**Project status:** built solo at LA Hacks 2026.

| | |
|---|---|
| Submission writeup | [`docs/DEVPOST.md`](docs/DEVPOST.md) |
| Technical deep-dive | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Alignment thesis  | [`docs/ALIGNMENT.md`](docs/ALIGNMENT.md) |
| Citations & prior art | [`docs/CITATIONS.md`](docs/CITATIONS.md) |
| Original spec | [`docs/superpowers/specs/2026-04-26-penumbra-design.md`](docs/superpowers/specs/2026-04-26-penumbra-design.md) |

## Why this exists

Constitutional AI (Bai et al. 2022) gives us a way to constrain *what
models say*. RLHF (Ouyang et al. 2022) shapes *what they output*. Neither
has anything useful to say about *what an embodied AI does in the room
you are standing in*.

As robot foundation models leave the lab and enter homes, warehouses,
and roads, the alignment community's text-centric toolkit stops being
sufficient. Penumbra is one piece of the answer: a real-time,
formally-checkable, verifiable spatial constitution that an embodied
agent must respect, enforced at the sensor layer, independent of the
model that's driving the agent.

The longer argument — and where Penumbra sits relative to RLHF,
constitutional AI, and red-teaming — lives in
[`docs/ALIGNMENT.md`](docs/ALIGNMENT.md).

## What's in the box

- A 360° simulated LiDAR sensor (Velodyne-class geometry, configurable
  noise model) sweeping a procedurally-generated 3D scene.
- A perception pipeline: voxel-grid → DBSCAN clustering → multi-object
  Kalman tracking with greedy gated assignment.
- A constraint engine over signed-distance-field zones (hard / soft /
  trust). Paint zones with the mouse, or load any of four packaged
  scenarios.
- An adversarial-input detector for the point stream — point injection
  (Cao et al. 2019) and sector blinding (Shin et al. 2017).
- A hash-chained, tamper-evident audit log. Exportable as JSON for
  offline verification.
- A 60 Hz Three.js viewport with a custom intensity-shaded point cloud
  shader, dynamic zone overlays, and a live decision feed.

Everything runs in the browser. The only external dependency is Three.js,
loaded from a CDN via `<script type="importmap">`. No bundler, no
`node_modules`, no toolchain.

## Quick start

```bash
git clone https://github.com/vitamoon/lidarmaxx.git
cd lidarmaxx
python -m http.server 8000   # any static server works — npx serve, caddy, etc.
# open http://localhost:8000
```

Or just open `index.html` directly. The importmap means the page works
from `file://` too, though some browsers gate WebGL on `http://`.

### Packaged scenarios

| Scenario | What it demonstrates |
|---|---|
| `Studio @ 3am` | Personal-stakes scenario: home robot, sleeping cat, and a charging cable across the floor as a hard zone. |
| `Cold-chain warehouse` | AMR + human pickers; ANSI/RIA R15.06-style separation envelope around tracked humans. |
| `Urban intersection` | Autonomous vehicle approaching a crosswalk; pedestrian + cyclist in the lane. |
| `Sensor attack` | Same studio, with simulated LiDAR point injection. Spoof detector should flash, audit chain should record the attack. |

### Painting zones

With a scenario loaded, click `Hard`, `Soft`, or `Trust` in the left
rail and click-and-drag on the floor. Click a tool again to deselect.
Painted zones are stored in the constraint engine and persist until
you switch scenarios or hit `Clear all`.

### Exporting the audit log

`Export audit log` downloads the entire decision chain as JSON. Each
entry includes its sequence number, the prior-entry hash, the
serialized payload, the payload hash, and the entry hash. A standalone
verifier can replay the chain and recompute every link; flipping a
single byte in any past payload breaks every subsequent hash.

## Project layout

```
src/
  core/          orchestration + math
    app.js          fixed-step pipeline
    math.js         clamp, lerp, gauss, ray-AABB
  sim/           the world the LiDAR sees
    scene.js        axis-aligned-box scene + dynamic obstacles
    lidar.js        Velodyne-class sensor model with noise + spoofing hooks
    agent.js        autonomous agent controllers
    scenarios.js    four packaged deployments
  perception/    raw points → tracked objects
    voxelgrid.js    sparse spatial hash for accelerated neighborhood queries
    dbscan.js       density-based clustering (Ester et al. 1996)
    tracker.js      per-object Kalman + greedy gated assignment
    spoof.js        cheap composite adversarial-input detector
  constraints/   operator intent → verdicts
    sdf.js          signed-distance-field primitives (box, sphere, cylinder)
    engine.js       evaluation: agent + tracks vs every zone
    painter.js      pointer-driven 3D zone authoring
  audit/         tamper-evident decision record
    log.js          hash-chained log + export
  render/        Three.js scene + custom point shader
    renderer.js     scene graph, point cloud, overlays, camera modes
  ui/            chrome
    controls.js     left-rail wiring
    telemetry.js    right-rail live numbers + spoof gauge + decision feed
    alerts.js       transient violation banners
styles/main.css   ~480 lines of design tokens + components
index.html        single page, importmap loader
docs/             architecture + alignment + citations + devpost narrative
```

Approximate size: 1.5k LoC of JS, plus ~500 lines of CSS, plus the
narrative docs. Source-of-truth is the source — no transpilation.

## Limitations and honest caveats

- **No real LiDAR yet.** The sensor is synthesized. The algorithms are
  the same ones a real-LiDAR build would use; only the input source
  changes. A WebSerial port for an RPLidar A3 is a one-evening follow-up.
- **No planner integration.** Penumbra produces decisions, not actions.
  A safe-to-deploy stack pairs Penumbra with a planner that consumes
  decisions (pre-collision braking, conservative replanning, etc.).
- **Audit chain is single-process.** The chain is cryptographically
  honest within the running tab, but a malicious or compromised host
  can rewrite history before the JSON is exported. Production needs
  TEE-attested anchoring; the code marks the attachment point.
- **The hash is FNV-1a, not SHA-256.** This is a deliberate
  speed/honesty trade — see the docstring in `src/audit/log.js`. The
  exported chain includes a SHA-256 helper for offline re-derivation.

## License

MIT. See [`LICENSE`](LICENSE).
