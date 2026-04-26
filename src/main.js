/**
 * Penumbra — entry point.
 *
 * The boot sequence is intentionally explicit: each stage announces itself
 * to the splash screen so a slow CDN fetch or a misconfigured importmap
 * shows up as a stuck stage instead of a blank page. We do not catch and
 * swallow startup errors — if the perception loop cannot start, the user
 * (and a judge) deserves to see the stack trace.
 */

const bootSub = document.getElementById('boot-sub');
const bootEl  = document.getElementById('boot');
const buildEl = document.getElementById('build-hash');

// Build hash. Three sources, in priority:
//   1. CI sed-stamps the short SHA into the placeholder span at deploy time.
//   2. URL fragment ?build=<hash> wins for ad-hoc overrides.
//   3. Local dev: wall-clock minute as a "session id" so successive
//      screenshots are distinguishable from each other.
const stamped = buildEl.textContent.trim();
const fromHash = location.hash.match(/build=([a-z0-9]{6,})/i)?.[1];
buildEl.textContent =
  fromHash ??
  (stamped && stamped !== '—' ? stamped : new Date().toISOString().slice(11, 16).replace(':', ''));

const stage = (label) => { bootSub.textContent = label; };

stage('loading three.js');
const THREE = await import('three');

stage('loading orbit controls');
const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');

stage('initializing perception');
const { App } = await import('./core/app.js');

const app = new App({ THREE, OrbitControls });
await app.boot();

// Hand off; from here the App owns the loop.
requestAnimationFrame(() => bootEl.classList.add('is-hidden'));
