# Penumbra and AI alignment

> What problem does Penumbra actually solve, and where does it sit in the
> alignment stack?

## The asymmetry

The text-output side of AI alignment has a real, deployed toolkit:

- **RLHF** (Ouyang et al. 2022) — humans rank outputs, the model learns
  the preference order.
- **Constitutional AI** (Bai et al. 2022) — explicit rules that the
  model is trained to refuse to break.
- **RLAIF / debate / deliberation** — use models to scale the supervision
  of other models.
- Plus the entire content-moderation classifier stack, which exists
  *outside* the model and catches escapes after the fact.

The corresponding toolkit for *physical actions* does not exist at any
comparable level of maturity. When a robot decides where to move, the
guarantee that it doesn't move *into a person* is, today:

- An emergent property of a learned policy, plus
- A handful of hard-coded geometric checks inside the planner, plus
- The hope that the perception stack didn't miss the person.

When Tesla's Autopilot kills a pedestrian (NHTSA has investigated
several), the failure is not "the policy chose to hit them." The failure
is that there was no independent layer whose only job was to certify
that the trajectory respected human-specified spatial intent.

## What Penumbra is for

Penumbra is one piece of an embodied alignment stack. Specifically, it
fills the role of *content-classifier-equivalent for physical actions* —
an out-of-loop, model-independent checker that consumes the same world
the agent is acting on and produces a verifiable yes/no on a finite set
of declared constraints.

Critically, Penumbra:

- **Does not trust the agent's perception.** It runs on the raw sensor
  stream, not on the agent's internal world model.
- **Does not trust the agent's policy.** It evaluates the agent's
  realized pose against zones; the policy's intent is irrelevant.
- **Produces evidence, not just verdicts.** Every decision is logged
  with the geometric distance, the responsible zone, and a chained
  hash so the record can't be silently rewritten after the fact.

## Why "constitutional" applies

Anthropic's Constitutional AI puts the safety target *outside the
preference data*. Instead of "humans rated this response high," the
target becomes "this response is consistent with this written
constitution." That move buys you two things:

1. **Inspectability.** The constitution is a document a human can read
   and argue with. The preference dataset is millions of opaque rankings.
2. **Composability.** You can layer constitutions, override them per
   deployment, version them under change control.

Penumbra inherits both properties for spatial behavior. Zones are a
declarative spatial constitution. They're inspectable (a JSON file in
the repo, a painted volume in the UI) and composable (per-deployment,
overrideable, versioned). When an agent crosses a zone boundary, the
violation isn't "the policy did something a labeler would dislike," it's
"the agent's pose entered a region the operator declared off-limits,
verified against the raw sensor at tick T with hash H."

## Why "verifiable" matters

The most common alignment-evaluation pattern today is:
*model* → *behavior* → *metric* → *aggregate score*. A verifier is a
different shape:
*action* + *constraint* → *certificate (or witness of violation)*.

Penumbra produces certificates, not metrics. A certificate is a much
stronger object: it's an evidence-bearing claim about a specific
spatial-temporal event, not a summary statistic. The audit log is a
concatenation of certificates. A regulator, an insurer, an incident
responder, or a judge in a wrongful-death suit can replay the chain and
re-derive every verdict.

## What Penumbra is *not*

- **Not a planner.** It does not steer the agent. A safe-to-deploy stack
  pairs Penumbra with a planner that can consume its decisions
  (pre-collision braking, conservative path replanning, halt-and-yield).
- **Not a perception model.** Penumbra runs *downstream* of whatever
  perception the agent already has — it is a second, independent check.
- **Not a complete safety case.** It is one verifiable layer in what
  must be a defense-in-depth posture. Sensor failure modes, software
  bugs in the verifier itself, adversaries with physical access, and
  out-of-distribution geometry will all defeat any single layer.

## Where this points

The interesting work this implies, that this hackathon project does not
attempt:

1. **Standard zone vocabularies.** ANSI/RIA R15.06 already specifies
   separation distances for industrial robots; the home and AV regimes
   have nothing comparable. A community-maintained zone library is the
   "constitutional library" equivalent.
2. **Cross-modal verifiers.** Penumbra is LiDAR-only. A camera-based
   verifier with disagreement-flagging would catch a spoofed LiDAR.
3. **Trusted execution.** Every `audit.append` should be signed by
   per-device hardware keys and anchored to a verifiable log service.
4. **Planner integration contracts.** A standardized interface so any
   planner can subscribe to Penumbra's decision stream and react.
5. **Provable constraint compilation.** Today's SDFs are evaluated
   numerically per-tick. With static zone geometry and a known agent
   reachability envelope, many constraints can be verified *ahead of
   time* with formal methods.

The pitch for this hackathon is narrow: build the verifier layer for
real, with real algorithms, in a form a judge can actually run, and
make the case that this is missing infrastructure.
