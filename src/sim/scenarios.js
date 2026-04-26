/**
 * Packaged scenarios.
 *
 * Each scenario describes a deployment Penumbra is plausibly defending:
 * the static world, dynamic obstacles, the embodied agent, the sensor
 * configuration, and the constraint zones a reasonable operator would
 * declare. Numbers are in meters; world is right-handed, +Y up.
 *
 * The `home_at_night` scenario is the personal-stakes one — it exists
 * because the project author has tripped over their own things in the
 * dark more times than they care to admit.
 */

const FLOOR = (size = 8) => ({
  id: 'floor', label: 'floor',
  center: [0, -0.05, 0], size: [size, 0.05, size], color: 0x232838,
});
const WALL = (id, c, s, color = 0x2a2f42) => ({ id, label: id, center: c, size: s, color });

export const SCENARIOS = {

  /* ────────── HOME — A studio at 3am ────────── */
  home_at_night: {
    id: 'home_at_night',
    name: 'Studio @ 3am',
    blurb: 'You. The floor. A charging cable.',
    bounds: { min: [-4, 0, -4], max: [4, 3, 4] },
    statics: [
      FLOOR(4),
      // outer walls
      WALL('wall-N', [0, 1.2, -4], [4, 1.2, 0.1]),
      WALL('wall-S', [0, 1.2,  4], [4, 1.2, 0.1]),
      WALL('wall-E', [ 4, 1.2, 0], [0.1, 1.2, 4]),
      WALL('wall-W', [-4, 1.2, 0], [0.1, 1.2, 4]),
      // furniture
      WALL('bed',     [-2.4, 0.30,  2.6], [1.1, 0.30, 0.95], 0x3a3050),
      WALL('desk',    [ 2.6, 0.40, -2.6], [0.7, 0.40, 0.45], 0x3b3326),
      WALL('chair',   [ 1.8, 0.45, -2.4], [0.22,0.45, 0.22], 0x2c2c34),
      WALL('shelves', [-3.7, 0.90,-1.6], [0.20, 0.9, 1.0], 0x322a1d),
      WALL('rug',     [ 0.0, 0.005, 0.0], [1.6, 0.005, 1.2], 0x36304a),
    ],
    dynamics: [
      // a cable left across the floor — the trip hazard
      { id: 'cable', label: 'charging cable', kind: 'cable',
        center: [-0.2, 0.025, 1.2], size: [0.9, 0.015, 0.02], color: 0xff5d6c },
      // a sleeping cat that drifts a little
      { id: 'cat', label: 'cat', kind: 'pet',
        center: [-1.2, 0.10, 0.6], size: [0.18, 0.08, 0.30], color: 0xffb547,
        path: [[-1.4, 0.10, 0.6], [-0.95, 0.10, 0.55]], speed: 0.18 },
    ],
    agent: {
      mode: 'waypoints', speed: 0.45, radius: 0.20, height: 0.30,
      start: { x: -3.2, y: 0, z: -3.0, yaw: 0 },
      waypoints: [
        [-3.2, 0, -3.0], [ 1.2, 0, -3.0], [ 2.6, 0, -1.8],
        [ 0.6, 0, 1.8], [-2.6, 0, 2.0],   [-3.4, 0, 0.4],
      ],
    },
    sensor: { hSamples: 540, vChannels: 12, maxRange: 7,  height: 0.40 },
    zones: [
      { id: 'cable-zone', kind: 'hard', label: 'cable on floor',
        shape: { type: 'box', center: [-0.2, 0.4, 1.2], size: [1.1, 0.5, 0.20] } },
      { id: 'bed-perimeter', kind: 'soft', label: 'bed perimeter',
        shape: { type: 'box', center: [-2.4, 0.5, 2.6], size: [1.6, 0.7, 1.4] } },
      { id: 'cat-bubble', kind: 'soft', label: 'cat (1m bubble)',
        shape: { type: 'sphere', center: [-1.2, 0.2, 0.6], radius: 1.0 } },
      { id: 'doorway', kind: 'trust', label: 'doorway (allowed)',
        shape: { type: 'box', center: [3.5, 0.6, 3.5], size: [0.8, 0.6, 0.8] } },
    ],
  },

  /* ────────── WAREHOUSE — pickers + AMR ────────── */
  warehouse_robot: {
    id: 'warehouse_robot',
    name: 'Cold-chain warehouse',
    blurb: 'AMR + human pickers. ANSI/RIA R15.06 separation.',
    bounds: { min: [-7, 0, -7], max: [7, 3, 7] },
    statics: [
      FLOOR(7),
      // shelf rows
      ...[-4,-2,0,2,4].map((x, i) => WALL(`rack-${i}`, [x, 1.0, 0], [0.4, 1.0, 5.5], 0x2c3344)),
      WALL('dock',   [0, 0.40, -6.2], [3.5, 0.40, 0.4], 0x3a3026),
    ],
    dynamics: [
      // human picker walking an aisle
      { id: 'picker-1', label: 'picker', kind: 'human',
        center: [-1, 0.85, -3], size: [0.30, 0.85, 0.20], color: 0xffb547,
        path: [[-1, 0.85, -3], [-1, 0.85,  3]], speed: 0.55 },
      { id: 'picker-2', label: 'picker', kind: 'human',
        center: [ 3, 0.85, -2], size: [0.30, 0.85, 0.20], color: 0xffb547,
        path: [[ 3, 0.85, 3], [ 3, 0.85, -3]], speed: 0.40 },
    ],
    agent: {
      mode: 'waypoints', speed: 0.85, radius: 0.45, height: 0.50,
      start: { x: -6, y: 0, z: -6 },
      waypoints: [[-6,0,-6],[ 6,0,-6],[ 6,0, 6],[-6,0, 6]],
    },
    sensor: { hSamples: 720, vChannels: 16, maxRange: 16, height: 0.85 },
    zones: [
      { id: 'dock', kind: 'hard', label: 'loading dock',
        shape: { type: 'box', center: [0, 0.5, -6.2], size: [3.6, 0.6, 0.6] } },
      // The 1.5 m human exclusion is added dynamically by the constraint
      // engine — see engine.attachDynamicHuman().
    ],
  },

  /* ────────── AV — intersection ────────── */
  autonomous_vehicle: {
    id: 'autonomous_vehicle',
    name: 'Urban intersection',
    blurb: 'AV approaching crosswalk + cyclist lane.',
    bounds: { min: [-12, 0, -12], max: [12, 4, 12] },
    statics: [
      FLOOR(12),
      // buildings
      WALL('bldg-NE', [ 8, 2, -8], [3.5, 2, 3.5], 0x222936),
      WALL('bldg-NW', [-8, 2, -8], [3.5, 2, 3.5], 0x222936),
      WALL('bldg-SE', [ 8, 2,  8], [3.5, 2, 3.5], 0x222936),
      WALL('bldg-SW', [-8, 2,  8], [3.5, 2, 3.5], 0x222936),
      // a parked car
      WALL('parked', [-3.0, 0.6, -3.5], [0.9, 0.6, 2.2], 0x3b2c3b),
    ],
    dynamics: [
      { id: 'pedestrian', label: 'pedestrian', kind: 'human',
        center: [-1.5, 0.85, -1], size: [0.30, 0.85, 0.20], color: 0xffb547,
        path: [[-1.5, 0.85, -1], [ 1.5, 0.85, -1]], speed: 0.7 },
      { id: 'cyclist', label: 'cyclist', kind: 'human',
        center: [3, 0.85, 5], size: [0.25, 0.85, 0.6], color: 0x82a4ff,
        path: [[3, 0.85, 5], [3, 0.85, -5]], speed: 1.6 },
    ],
    agent: {
      mode: 'waypoints', speed: 1.4, radius: 0.9, height: 0.70,
      start: { x: 0, y: 0, z: 8 },
      waypoints: [[0,0,8],[0,0,-8],[0,0,8]],
    },
    sensor: { hSamples: 900, vChannels: 16, maxRange: 18, height: 1.5 },
    zones: [
      { id: 'crosswalk', kind: 'hard', label: 'crosswalk',
        shape: { type: 'box', center: [0, 0.5, -1.5], size: [3.5, 0.5, 0.7] } },
      { id: 'bike-lane', kind: 'soft', label: 'cyclist lane',
        shape: { type: 'box', center: [3, 0.5, 0], size: [0.4, 0.5, 6] } },
    ],
  },

  /* ────────── ATTACK — point injection ────────── */
  spoofing_attack: {
    id: 'spoofing_attack',
    name: 'Sensor attack',
    blurb: 'Same studio. Adversary injects fake returns.',
    // Inherits the home scenario at boot via the controls layer.
    bounds: { min: [-4, 0, -4], max: [4, 3, 4] },
    statics: [],
    dynamics: [],
    agent: { mode: 'static', speed: 0, radius: 0.2, height: 0.3 },
    sensor: { hSamples: 540, vChannels: 12, maxRange: 7, height: 0.40 },
    zones: [],
    inheritsFrom: 'home_at_night',
    attack: { spoof: true, injectCount: 240 },
  },
};
