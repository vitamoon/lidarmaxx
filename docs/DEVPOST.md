# Penumbra — Devpost submission

> *360° spatial alignment for embodied AI.*
> Built solo at LA Hacks 2026.

## Inspiration

Two nights before the hackathon I tripped over a charging cable in my
own apartment. I was walking back from the kitchen at 3 a.m. with the
lights off, on autopilot, and I went down hard enough to bruise a hip
and split a lip. It was the third time this year. Not a great look for
someone whose entire degree is about teaching machines to perceive
space.

Lying on the floor doing that staring-at-the-ceiling reassessment thing,
I realized something embarrassing about the apartment around me. My
smart speaker knows my voice. My phone knows my schedule. The robot
vacuum has a millimeter-accurate map of every wall. Not one of those
systems was, at any point that night, checking that I had not left a
tripwire across my own home — even though every one of them had the
sensor data to do it.

It scaled in my head. The same gap exists, with much higher stakes,
everywhere embodied AI is shipping right now: humanoid-class policies
moving into homes (Figure, 1X), warehouse AMRs operating around human
pickers (Symbotic, Locus, the new Boston Dynamics fleet), Autopilot
eating pedestrians on a quarterly cadence. We have built a stunning
content-moderation stack for AI's *outputs* and approximately nothing
for AI's *actions*. There is no "is-this-output-safe" classifier
equivalent for "did the robot just enter the nursery."

So I built one. Or, the layer one would call into.

## What it does

Penumbra is a real-time, browser-only reference implementation of a
**spatial constitution enforcer** for embodied AI. The operator (you,
your insurer, your safety auditor, your regulator) declares geometric
constraints — *the robot does not enter the nursery, the drone stays
out of the cyclist lane, no machine passes within 1.5 m of a tracked
human* — and Penumbra continuously verifies them against a live 360°
LiDAR feed. Every decision is logged into a tamper-evident hash chain.

Open the live site:
- pick a scenario,
- watch the synthesized 360° point cloud sweep around the agent,
- paint a no-go zone with your mouse,
- watch the simulated agent walk into it,
- see the violation flash and the audit chain advance,
- toggle "inject spoof points" and watch the sensor-integrity meter
  blow past suspect threshold while the chain still records every event,
- export the chain as JSON and verify it offline.

## How it works (one paragraph)

Synthesized point cloud from a Velodyne-class sensor model →
voxel-grid acceleration → DBSCAN clustering → multi-object Kalman
tracking with greedy gated assignment → per-zone signed-distance-field
evaluation against the agent pose and every confirmed track → decisions
appended to a hash-chained audit log → all of it visualized in
Three.js with a custom intensity-shaded point shader. Twenty-Hz
perception, 60 Hz render. About 1.5k lines of perception/constraint
code, plus an audit log and the UI.

[`docs/ARCHITECTURE.md`](ARCHITECTURE.md) walks through the pipeline in
detail. [`docs/ALIGNMENT.md`](ALIGNMENT.md) makes the alignment-research
case. [`docs/CITATIONS.md`](CITATIONS.md) names every paper and standard
the work touches.

## What's novel

I want to be careful here, because the *individual* parts (DBSCAN,
Kalman, SDF zones, chained logs) are not new. The contribution is the
*framing and the assembly*: an out-of-loop, model-independent,
sensor-grounded, geometrically-formal verifier that occupies the same
slot in the embodied stack that a content classifier occupies in the
text stack. That slot is, today, empty. The hackathon submission is a
plausible inhabitant for it.

A few specific things I think are worth their footnote:

1. **The trust-zone primitive.** A "soft" zone (penalize) suppressed
   by an overlapping "trust" zone (allowed) is enough to model nearly
   every human-comprehensible spatial intent without a dedicated DSL.
   I'd expected to need more primitives.
2. **Spoof-detector composition.** Three cheap heads (range-bin spike,
   temporal jump, density discontinuity) compose into a usable monitor
   without any learned model. A research-grade defense is for next
   week; this is what *should* always be running.
3. **Audit chain is per-tick, not per-incident.** The chain records
   *every* decision, not just violations. That makes "did Penumbra
   fail to notice a violation" detectable post hoc by replaying the
   sensor stream against the chain.

## Challenges

Three real ones, in time-cost order.

**The point shader.** I burned an hour on a shader where points were
correctly positioned but invisible. It turned out to be the depth
write — transparent points need `depthWrite: false` so a near-camera
sprite doesn't occlude points behind it. Obvious in retrospect, painful
in the moment.

**DBSCAN's neighborhood query in JS.** Naive `forEach` over points
hit ~28 ms per sweep at 12k points and the demo started thrashing.
Voxel-grid acceleration brought it under 4 ms. The grid is rebuilt every
tick; bookkeeping overhead would've cost more than the rebuild.

**The honest version of the audit chain.** I started with a synchronous
SHA-256 fold, then realized WebCrypto is async-only. Switched to FNV-1a
for the per-tick chain (fast, sync, *not* collision-resistant) and
exposed `sha256Hex` for the exported chain. The README is explicit about
this trade-off — silent cryptographic substitutions are how you ship
broken safety code.

## What's next

In rough order of how directly they unlock real deployments:

1. **Real LiDAR ingestion.** A WebSerial / WebHID adapter for an
   RPLidar A3 (~$700) is a one-evening port. iPhone Pro LiDAR via WebRTC
   is a one-week port.
2. **Planner integration contracts.** A standard event format so any
   ROS-side or Isaac-side planner can subscribe to Penumbra decisions.
3. **TEE-anchored audit.** Every Nth chain head signed by a hardware
   key and posted to a transparency log. Replaces the current "trust
   the local browser" assumption.
4. **Cross-modal verifier.** A camera-based companion that
   independently judges the same constraints; disagreements fan out
   to a human reviewer.
5. **Standard zone library.** Community-maintained zones for common
   environments (kitchens, hospital rooms, warehouse aisles, urban
   intersections). The "constitutional library" equivalent.

## Acknowledgments

Built solo. The intellectual lineage is owed mostly to Anthropic's
Constitutional AI work (Bai et al. 2022) and to every adversarial-LiDAR
paper (Cao 2019, Petit 2015, Sun 2020) — without those, the spoof
detector wouldn't exist. The DBSCAN implementation follows Ester et al.
1996 directly. The personal motivation is owed to a single white
charging cable that I have now physically zip-tied to a baseboard.

## Try it

Live: https://vitamoon.github.io/lidarmaxx/
Source: https://github.com/vitamoon/lidarmaxx
