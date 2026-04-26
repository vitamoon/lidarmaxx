# Tech Feedback — LA Hacks 2026

> Submission for the MLH "share feedback about any technology you
> interacted with" prompt. I'm reviewing two technologies I leaned on
> heavily for this build: **GitHub** (primary) and **Three.js**
> (secondary). Both shaped the project in load-bearing ways.

---

## 1. GitHub — primary review

**What I used it for:** source hosting, Actions for CI, Pages for the
live demo, the gh REST API (anonymously) to poll my own deploy status,
and a bunch of `git rev-parse` plumbing inside the deploy workflow to
stamp the build hash into the page.

### What worked

- **GitHub Pages from Actions is genuinely the right shape for static
  hackathon demos.** No DNS to configure, no S3 + CloudFront ceremony,
  no per-request cost to worry about during demo hour. `git push` →
  live URL is the unbeatable workflow when judging is happening in the
  next four minutes.
- **`actions/upload-pages-artifact` + `actions/deploy-pages` is one of
  the cleaner first-party action pairs.** The separation of "build the
  artifact" from "deploy it" means I can run any pre-deploy step (in
  my case, `sed`-stamping the short SHA into the HTML) without
  rewriting the deploy plumbing.
- **The REST API is great even unauthenticated for read-only
  introspection.** During this build I needed to verify my own deploy
  status without leaving the terminal; `curl
  api.github.com/repos/.../actions/runs?per_page=1` plus a five-line
  `python -c` was all it took. As an autonomous-agent-friendly API,
  GitHub's REST is unusually polite — sane defaults, sane shapes.

### What didn't

- **First-time GitHub Pages enablement is a sharp edge.** The
  `actions/configure-pages@v5` action has an `enablement: true` option
  that's documented to auto-enable Pages on first run. In practice it
  failed on a brand-new personal repo with no obvious error path
  visible in the workflow log. The only fix was to manually click
  `Settings → Pages → Source: GitHub Actions` once. Adding ~30 minutes
  of unintended deploy chrome to a 36-hour project is a real cost. A
  cleaner failure mode would be: "Pages is not enabled on this repo;
  click here to enable, or run `gh repo edit --enable-pages`." Today
  the action just exits non-zero with a generic message.
- **Workflow secrets vs default `GITHUB_TOKEN` permissions are still
  confusing.** I had `permissions: { pages: write, id-token: write }`
  set at workflow scope, but I'm honestly still not sure whether
  enablement requires *additional* permissions beyond that or whether
  it's a Settings-level toggle. The error didn't tell me which.
- **Default line-ending behavior on Windows.** Every Write produced a
  `LF will be replaced by CRLF` warning. Easy to dismiss, but on a
  static-site repo where every `.js` file lives next to a CI workflow
  that runs on Linux, the inconsistent normalization adds non-zero
  cognitive load. A `.gitattributes` template that an
  `actions/checkout` could honor invisibly would fix this for ~all
  hackathon projects.

### What I'd ask for

A `gh hackathon init` command that sets up:
- repo + push,
- Pages enabled with Actions as source,
- a working `pages.yml` that handles the static-site case with one
  curl-able URL at the end,
- and a `make demo` shortcut that opens it.

I'd ship 30% more polished hackathon projects per weekend.

---

## 2. Three.js — secondary review

**What I used it for:** every pixel in the 3D viewport. Custom
`ShaderMaterial` for the point cloud, `BufferGeometry` with
`DynamicDrawUsage` for per-tick uploads, `OrbitControls` from
`examples/jsm`, `Raycaster` for the constraint-painter floor
intersection, plus the standard Mesh / Edges / ArrowHelper grab-bag.

### What worked

- **Importmap-loadable ES modules.** Three.js shipping pure ESM via
  `https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.module.js`
  with `examples/jsm/` as a sibling makes a build-step-free project
  not just possible but pleasant. I have a working scene in a
  10kB-gzipped HTML page; no other 3D library on the JS side has the
  same story today.
- **The `BufferGeometry` API is actually well-designed for streaming
  data.** I reallocate the points buffer to powers-of-two as the
  per-frame point count grows, then `setDrawRange` to render only the
  populated prefix. Three handles this without complaint, and the
  per-attribute `needsUpdate` flag is exactly the right escape hatch.
- **Custom shaders are easy to wire in.** Two files (vert + frag),
  one `ShaderMaterial`, full uniform control. I implemented intensity
  coloring + depth-based size + fog falloff in about 25 lines of GLSL,
  which I'm not sure is true on any other web 3D framework.

### What didn't

- **Documentation discoverability.** I knew exactly what I wanted
  (`PointsMaterial` with per-vertex intensity attribute) and still
  spent 20 minutes finding the right idiom. `BufferAttribute`'s `setX`
  / `setY` / `setZ` helpers are documented prominently, but the
  *streaming* pattern (`DynamicDrawUsage` + `needsUpdate` + `setDrawRange`)
  is scattered across three different examples. A single page titled
  "How to upload a fresh array every frame" would save many hours.
- **`PointsMaterial` doesn't expose intensity.** The default points
  material colors uniformly. Anything per-point requires dropping into
  a `ShaderMaterial`, which is fine if you can write GLSL but a brick
  wall if you can't. A built-in `IntensityPointsMaterial` with a
  configurable LUT would be a bigger UX win than the version-bump
  changelog suggests.
- **Transparent points + depth write.** The number-one sharp edge for
  point-cloud rendering in Three is that `transparent: true` with
  default `depthWrite: true` produces invisible-or-wrong output. The
  fix is to set `depthWrite: false`. The error message when you don't:
  none. The visual symptom: nothing. I burned about 45 minutes on this
  before finding the right Stack Overflow answer.

### What I'd ask for

A `THREE.PointCloud` higher-level helper that wraps the streaming
pattern + intensity coloring + depth-correct transparency. The current
state of the art is "copy a custom shader from someone's gist,"
which is the wrong abstraction layer for the second-most-common 3D-web
use case after polygonal meshes.

---

## Honorable mentions

- **`importmap`** — the underrated browser feature that made this
  whole no-build-step project possible. Underused everywhere.
- **`crypto.subtle`** — perfect API once you accept that everything is
  async. Useful even for non-security work (content addressing, etc.).
- **WebGL2 itself** — still the only ubiquitous way to put a million
  points on screen at 60 fps from a script tag.

The headline is: GitHub + Three.js + nothing else got me to a runnable
360° spatial-alignment demo in a working day. That ratio of
capability-to-toolchain is what makes hackathon software feasible at
all. Both technologies deserve their reputation.
