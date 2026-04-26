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

const stage = (label) => { bootSub.textContent = label; };

// Surface boot failures on-screen as well as in the console — a blank
// boot screen is the worst possible failure mode at demo time.
const fail = (where, err) => {
  console.error(`[penumbra:boot] ${where}:`, err);
  bootSub.style.color = '#ff5d6c';
  bootSub.style.fontSize = '11px';
  bootSub.style.maxWidth = '60ch';
  bootSub.style.textAlign = 'center';
  bootSub.textContent = `boot failed at "${where}" — ${err?.message ?? err}`;
};
window.addEventListener('error', (e) => fail('window error', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => fail('unhandled rejection', e.reason));

// Cache-bust every dynamic import with the build hash from this
// script's URL. CI stamps `?v=<short-sha>` into index.html; without
// this, GitHub Pages's 10-minute cache TTL serves stale modules after
// a push and you see ghost errors that don't match the on-disk source.
const BUILD_RAW = new URL(import.meta.url).searchParams.get('v');
const BUILD = (BUILD_RAW && BUILD_RAW !== '__BUILD__') ? BUILD_RAW : 'dev';
const v = (p) => `${p}?v=${BUILD}`;
buildEl.textContent = (BUILD !== 'dev')
  ? BUILD
  : new Date().toISOString().slice(11, 16).replace(':', '');

try {
  stage('loading three.js');
  const THREE = await import('three');

  stage('loading orbit controls');
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');

  stage('loading app');
  const { App } = await import(v('./core/app.js'));

  stage('constructing app');
  const app = new App({ THREE, OrbitControls, build: BUILD });

  stage('initializing perception');
  await app.boot();

  // Hand off; from here the App owns the loop.
  requestAnimationFrame(() => bootEl.classList.add('is-hidden'));
} catch (err) {
  fail('boot', err);
  throw err;
}
