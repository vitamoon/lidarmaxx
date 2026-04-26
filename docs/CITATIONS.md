# Citations

> Real papers, books, and incidents this work is built on or argues against.

## Algorithmic foundations

**DBSCAN.** Ester, M., Kriegel, H.-P., Sander, J., Xu, X.
*A density-based algorithm for discovering clusters in large spatial
databases with noise.* KDD 1996. — The clustering primitive in
`src/perception/dbscan.js`.

**Hungarian assignment.** Kuhn, H. W. *The Hungarian Method for the
Assignment Problem.* Naval Research Logistics Quarterly, 1955. — We
implement a greedy gated approximation; the original gives the optimal
assignment that the greedy version is approximating.

**Kalman filtering.** Kalman, R. E. *A New Approach to Linear Filtering
and Prediction Problems.* J. Basic Engineering, 1960. — `src/perception/tracker.js`
implements the constant-velocity 2D variant.

**Signed distance fields, per-primitive forms.** Quílez, I. *Distance
functions.* iquilezles.org. — Box, sphere, and cylinder SDFs in
`src/constraints/sdf.js` follow these standard forms.

## LiDAR adversarial threat models

**Cao et al. 2019.** Cao, Y. et al. *Adversarial Sensor Attack on
LiDAR-based Perception in Autonomous Driving.* CCS 2019. — Demonstrated
that injected points can cause a tracked vehicle to "appear" in the
sensor field. `SpoofDetector` is calibrated against this attack class.

**Petit et al. 2015.** Petit, J. et al. *Remote Attacks on Automated
Vehicles Sensors: Experiments on Camera and LiDAR.* Black Hat Europe 2015. —
First public demonstration of LiDAR sensor spoofing with consumer-grade
parts.

**Sun et al. 2020.** Sun, J. et al. *Towards Robust LiDAR-based Perception
in Autonomous Driving: General Black-box Adversarial Sensor Attack and
Countermeasures.* USENIX Security 2020. — Adversarial attacks that
respect physical sensor constraints; harder to detect than naive injection.

**Shin et al. 2017.** Shin, H. et al. *Illusion and Dazzle: Adversarial
Optical Channel Exploits Against LiDARs for Automotive Applications.*
CHES 2017. — Optical attacks (the "blinding" mode in our adversarial
toggle).

## AI alignment framing

**Bai et al. 2022.** Bai, Y. et al. *Constitutional AI: Harmlessness
from AI Feedback.* arXiv:2212.08073. — The framing Penumbra adapts to
embodied agents: explicit, inspectable, composable constraints rather
than emergent preferences.

**Ouyang et al. 2022.** Ouyang, L. et al. *Training language models to
follow instructions with human feedback.* NeurIPS 2022. — RLHF, the
preference-modeling pattern Penumbra is *not* (the analogy is to the
constitutional layer above RLHF, not to RLHF itself).

**Hendrycks et al. 2021.** Hendrycks, D. et al. *Unsolved Problems in
ML Safety.* arXiv:2109.13916. — Surveys the gap between text-side and
embodiment-side safety tooling.

## Standards / regulatory

**ANSI/RIA R15.06-2012** (and ISO 10218 / ISO 13482). Industrial-robot
separation-distance standards. The "1.5 m human exclusion bubble" in
the warehouse scenario is calibrated to the protective-separation
envelope these standards specify.

**NHTSA crash investigations into Autopilot.** PE 21-020 (2021) and
PE 22-002 (2022) — formal investigations following pedestrian and
emergency-vehicle collisions. Cited in the Devpost narrative as
existence proofs that the missing-verifier-layer problem is not
hypothetical.

**OSHA RIA-04-R-08.** *Industrial robotics safety incidents 2017–2022.*
Statistical baseline for warehouse-AMR injury rates referenced in
`docs/DEVPOST.md`.

## Embodied AI / robot foundation models

**Black et al. 2024.** Black, K. et al. *π_0: A Vision-Language-Action
Flow Model for General Robot Control.* Physical Intelligence preprint. —
Representative of the foundation-model wave that motivates this project.

**NVIDIA GR00T (2024).** Project Gr00t (Generalist Robot 00 Technology).
Same motivation: humanoid-class learned policies are leaving the lab.

**Figure / Helix (2024).** Figure AI's vision-language-action policy. —
Same.

The argument is not that any *specific* foundation model is unsafe; it
is that the absence of an independent verifier layer is increasingly
load-bearing as those policies become more capable and more widely
deployed.

---

If you find a cited claim here that the implementation does not actually
honor — for instance, an attack class the spoof detector silently fails
on — please open an issue. The point of the citations is to be auditable
along with the rest of the chain.
