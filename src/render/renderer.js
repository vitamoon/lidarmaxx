/**
 * Renderer — Three.js scene + custom point shader + overlays.
 *
 * Layered draw order:
 *   1. floor + grid                  (static helpers)
 *   2. scene boxes (translucent)     (the "world" the LiDAR sees)
 *   3. point cloud                   (the live sweep, colored by intensity)
 *   4. cluster bboxes / track arrows (perception output)
 *   5. constraint zones              (operator intent, by zone kind)
 *   6. agent body                    (the actor under judgement)
 *   7. preview zone (paint mode)     (transient)
 *
 * Performance constraints:
 *   - One BufferGeometry for the cloud, reallocated only when capacity grows.
 *   - Boxes for clusters/zones are pooled and hidden when unused.
 *   - Custom shader: distance fog + intensity LUT, ~3 instructions per fragment.
 */

const HARD_HEX  = 0xff5d6c;
const SOFT_HEX  = 0xffb547;
const TRUST_HEX = 0x5ce1c4;
const AGENT_HEX = 0x82a4ff;
const SENSOR_HEX = 0x9f7aea;

const POINT_VERT = `
  attribute float aIntensity;
  varying float vIntensity;
  varying float vDepth;
  uniform float uSize;
  void main() {
    vIntensity = aIntensity;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_PointSize = uSize * (1.0 + 12.0 / max(1.0, vDepth));
    gl_Position = projectionMatrix * mv;
  }
`;

const POINT_FRAG = `
  varying float vIntensity;
  varying float vDepth;
  uniform vec3 uColorLow;
  uniform vec3 uColorHigh;
  uniform float uFogNear;
  uniform float uFogFar;
  void main() {
    // soft circular sprite
    vec2 d = gl_PointCoord - vec2(0.5);
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float falloff = 1.0 - smoothstep(0.10, 0.25, r2);
    vec3 base = mix(uColorLow, uColorHigh, vIntensity);
    float fog = clamp((uFogFar - vDepth) / (uFogFar - uFogNear), 0.0, 1.0);
    gl_FragColor = vec4(base * fog, falloff * (0.65 + 0.35 * fog));
  }
`;

export class Renderer {
  constructor({ THREE, OrbitControls, canvas, scene }) {
    this.THREE = THREE;
    this.OrbitControls = OrbitControls;
    this.canvas = canvas;
    this.simScene = scene;
    this._cameraMode = 'orbit';
    this._showSensorRays = false;
    this._frame = null;
    this._previewZone = null;
    this._zoneMeshes = new Map(); // zoneId -> mesh
    this._sceneBoxMeshes = new Map();
    this._clusterBoxes = []; // pool
    this._trackArrows = [];  // pool
    this._zonesVisible = true;
    this._clustersVisible = true;
    this._tracksVisible = true;
    this._pointsVisible = true;
    this._agentVisible = true;
  }

  async init() {
    const T = this.THREE;
    this.scene = new T.Scene();
    this.scene.fog = new T.FogExp2(0x05060c, 0.018);

    this.camera = new T.PerspectiveCamera(55, 1, 0.05, 200);
    this.camera.position.set(6, 6, 6);

    this.gl = new T.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.gl.setPixelRatio(Math.min(2, devicePixelRatio));
    this.gl.setClearColor(0x05060c, 1);

    this.controls = new this.OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0.5, 0);

    // Lights — minimal; the scene is mostly emissive.
    const hemi = new T.HemisphereLight(0xa0b8ff, 0x101018, 0.55);
    this.scene.add(hemi);
    const dir = new T.DirectionalLight(0xffffff, 0.4);
    dir.position.set(8, 10, 6);
    this.scene.add(dir);

    // Floor grid.
    const grid = new T.GridHelper(40, 80, 0x1a2030, 0x12161f);
    grid.position.y = 0;
    this.scene.add(grid);
    this._grid = grid;

    // Cloud geometry — capacity grows lazily.
    this._cloudCapacity = 0;
    this._cloud = null;

    // Agent visual
    const agentMat = new T.MeshStandardMaterial({
      color: AGENT_HEX, emissive: AGENT_HEX, emissiveIntensity: 0.4,
      roughness: 0.4, metalness: 0.1,
    });
    this._agent = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.32, 24), agentMat);
    this._agent.position.set(0, 0.16, 0);
    this.scene.add(this._agent);

    // Sensor halo
    const haloGeo = new T.RingGeometry(0.30, 0.34, 64);
    haloGeo.rotateX(-Math.PI / 2);
    const haloMat = new T.MeshBasicMaterial({ color: AGENT_HEX, transparent: true, opacity: 0.7 });
    this._halo = new T.Mesh(haloGeo, haloMat);
    this.scene.add(this._halo);

    // Resize hooks
    this._resize();
    window.addEventListener('resize', () => this._resize());

    // Floor plane for raycasting (invisible, painter uses it).
    this._floorPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
    this._raycaster = new T.Raycaster();

    // Build scene-box meshes for the current scenario.
    this._rebuildSceneBoxes();
    this.refit();
  }

  _resize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  refit() {
    const b = this.simScene.bounds;
    const cx = (b.min[0] + b.max[0]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    const span = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
    this.camera.position.set(cx + span * 0.55, span * 0.55, cz + span * 0.55);
    this.controls.target.set(cx, 0.4, cz);
    this.controls.update();
    this._rebuildSceneBoxes();
  }

  _rebuildSceneBoxes() {
    const T = this.THREE;
    // Remove old box meshes.
    for (const mesh of this._sceneBoxMeshes.values()) this.scene.remove(mesh);
    this._sceneBoxMeshes.clear();

    this.simScene.forEachBox(box => {
      const geo = new T.BoxGeometry(box.size[0]*2, box.size[1]*2, box.size[2]*2);
      const isFloor = box.id === 'floor';
      const mat = new T.MeshStandardMaterial({
        color: box.color,
        roughness: isFloor ? 0.95 : 0.7,
        metalness: 0.0,
        transparent: true,
        opacity: isFloor ? 1.0 : 0.85,
      });
      const mesh = new T.Mesh(geo, mat);
      mesh.position.set(box.center[0], box.center[1], box.center[2]);
      mesh.userData.boxId = box.id;
      this.scene.add(mesh);
      this._sceneBoxMeshes.set(box.id, mesh);
    });
  }

  setLayer(name, on) {
    if (name === 'points')   this._pointsVisible = on;
    if (name === 'clusters') this._clustersVisible = on;
    if (name === 'tracks')   this._tracksVisible = on;
    if (name === 'zones')    this._zonesVisible = on;
    if (name === 'agent')    { this._agentVisible = on; this._agent.visible = on; this._halo.visible = on; }
    if (name === 'sensor')   this._showSensorRays = on;
  }

  setCameraMode(mode) {
    this._cameraMode = mode;
    if (mode === 'top') {
      const b = this.simScene.bounds;
      const cx = (b.min[0] + b.max[0]) / 2;
      const cz = (b.min[2] + b.max[2]) / 2;
      const span = Math.max(b.max[0]-b.min[0], b.max[2]-b.min[2]);
      this.camera.position.set(cx, span * 1.1, cz + 0.001);
      this.controls.target.set(cx, 0, cz);
    } else if (mode === 'orbit') {
      this.refit();
    }
  }

  setFrame(frame) { this._frame = frame; }

  /** Convert a screen-space pixel to a world-space point on the y=0 plane. */
  screenToFloor(px, py) {
    const T = this.THREE;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new T.Vector2(
      ( px / rect.width)  * 2 - 1,
      -(py / rect.height) * 2 + 1,
    );
    this._raycaster.setFromCamera(ndc, this.camera);
    const hit = new T.Vector3();
    if (this._raycaster.ray.intersectPlane(this._floorPlane, hit)) {
      return [hit.x, 0, hit.z];
    }
    return null;
  }

  previewZone(spec) {
    const T = this.THREE;
    if (this._preview) { this.scene.remove(this._preview); this._preview = null; }
    if (!spec) return;
    const { start, end, kind } = spec;
    const cx = (start[0] + end[0]) / 2;
    const cz = (start[2] + end[2]) / 2;
    const sx = Math.max(0.18, Math.abs(end[0] - start[0]) / 2);
    const sz = Math.max(0.18, Math.abs(end[2] - start[2]) / 2);
    const color = kind === 'hard' ? HARD_HEX : kind === 'soft' ? SOFT_HEX : TRUST_HEX;
    const geo = new T.BoxGeometry(sx*2, 0.9, sz*2);
    const mat = new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.20, depthWrite: false });
    this._preview = new T.Mesh(geo, mat);
    this._preview.position.set(cx, 0.45, cz);
    this.scene.add(this._preview);
    // wireframe edge
    const edge = new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    this._preview.add(edge);
  }

  // ── per-frame draw

  draw(dt) {
    this.controls.update();

    if (this._frame) {
      this._drawCloud(this._frame);
      this._drawClusters(this._frame.clusters ?? []);
      this._drawTracks(this._frame.tracks ?? []);
      this._drawZones(this._frame.zones ?? []);
      this._drawAgent(this._frame.agent);
      this._drawSceneBoxes(this.simScene);
    }

    // Camera modes that auto-track
    if (this._cameraMode === 'fpv' && this._frame?.agent) {
      const a = this._frame.agent;
      this.camera.position.set(a.pose.x - Math.sin(a.pose.yaw) * 1.6, 1.2, a.pose.z - Math.cos(a.pose.yaw) * 1.6);
      this.controls.target.set(a.pose.x + Math.sin(a.pose.yaw) * 1.0, 0.6, a.pose.z + Math.cos(a.pose.yaw) * 1.0);
    }

    this.gl.render(this.scene, this.camera);
  }

  _drawCloud(frame) {
    const T = this.THREE;
    if (!this._pointsVisible) {
      if (this._cloud) this._cloud.visible = false;
      return;
    }
    const points = frame.points;
    const intensity = frame.intensity;
    const N = points.length / 3;
    if (N === 0) {
      if (this._cloud) this._cloud.visible = false;
      return;
    }

    if (!this._cloud || N > this._cloudCapacity) {
      // (Re)allocate to next power-of-two for amortized growth.
      const cap = Math.max(1024, 1 << Math.ceil(Math.log2(N)));
      this._cloudCapacity = cap;
      const geo = new T.BufferGeometry();
      geo.setAttribute('position',  new T.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(T.DynamicDrawUsage));
      geo.setAttribute('aIntensity',new T.BufferAttribute(new Float32Array(cap),     1).setUsage(T.DynamicDrawUsage));
      const mat = new T.ShaderMaterial({
        vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
        transparent: true, depthWrite: false,
        uniforms: {
          uSize: { value: 1.7 },
          uColorLow:  { value: new T.Color(0x456080) },
          uColorHigh: { value: new T.Color(0xc6e3ff) },
          uFogNear:   { value: 1.0 },
          uFogFar:    { value: 18.0 },
        },
      });
      if (this._cloud) this.scene.remove(this._cloud);
      this._cloud = new T.Points(geo, mat);
      this._cloud.frustumCulled = false;
      this.scene.add(this._cloud);
    }

    const pos = this._cloud.geometry.getAttribute('position').array;
    const ai  = this._cloud.geometry.getAttribute('aIntensity').array;
    pos.set(points);
    for (let i = 0; i < N; i++) ai[i] = intensity[i] / 255;
    this._cloud.geometry.setDrawRange(0, N);
    this._cloud.geometry.getAttribute('position').needsUpdate = true;
    this._cloud.geometry.getAttribute('aIntensity').needsUpdate = true;
    this._cloud.visible = true;
  }

  _drawClusters(clusters) {
    const T = this.THREE;
    while (this._clusterBoxes.length < clusters.length) {
      const geo = new T.BoxGeometry(1, 1, 1);
      const edges = new T.EdgesGeometry(geo);
      const mat = new T.LineBasicMaterial({ color: 0x9bd6ff, transparent: true, opacity: 0.85 });
      const mesh = new T.LineSegments(edges, mat);
      this.scene.add(mesh);
      this._clusterBoxes.push(mesh);
    }
    for (let i = 0; i < this._clusterBoxes.length; i++) {
      const m = this._clusterBoxes[i];
      if (i >= clusters.length || !this._clustersVisible) { m.visible = false; continue; }
      const c = clusters[i];
      m.visible = true;
      m.position.set((c.aabb.min[0]+c.aabb.max[0])/2, (c.aabb.min[1]+c.aabb.max[1])/2, (c.aabb.min[2]+c.aabb.max[2])/2);
      m.scale.set(
        Math.max(0.05, c.aabb.max[0]-c.aabb.min[0]),
        Math.max(0.05, c.aabb.max[1]-c.aabb.min[1]),
        Math.max(0.05, c.aabb.max[2]-c.aabb.min[2]),
      );
    }
  }

  _drawTracks(tracks) {
    const T = this.THREE;
    while (this._trackArrows.length < tracks.length) {
      const arrow = new T.ArrowHelper(new T.Vector3(1,0,0), new T.Vector3(0,0,0), 0.6, 0xb6c8ff, 0.18, 0.10);
      this.scene.add(arrow);
      this._trackArrows.push(arrow);
    }
    for (let i = 0; i < this._trackArrows.length; i++) {
      const a = this._trackArrows[i];
      if (i >= tracks.length || !this._tracksVisible) { a.visible = false; continue; }
      const t = tracks[i];
      const v = Math.hypot(t.vx, t.vz);
      if (v < 0.05 || !t.confirmed) { a.visible = false; continue; }
      a.visible = true;
      a.position.set(t.x, 0.45, t.z);
      a.setDirection(new T.Vector3(t.vx / v, 0, t.vz / v));
      a.setLength(Math.min(1.6, 0.4 + v * 0.7), 0.18, 0.10);
    }
  }

  _drawZones(zones) {
    const T = this.THREE;
    const seen = new Set();
    for (const z of zones) {
      seen.add(z.id);
      let mesh = this._zoneMeshes.get(z.id);
      const color = z.kind === 'hard' ? HARD_HEX : z.kind === 'soft' ? SOFT_HEX : TRUST_HEX;
      if (!mesh) {
        let geo;
        if (z.shape.type === 'box')      geo = new T.BoxGeometry(z.shape.size[0]*2, z.shape.size[1]*2, z.shape.size[2]*2);
        else if (z.shape.type === 'sphere') geo = new T.SphereGeometry(z.shape.radius, 24, 18);
        else if (z.shape.type === 'cylinder') geo = new T.CylinderGeometry(z.shape.radius, z.shape.radius, (z.shape.halfHeight ?? 0.5)*2, 24);
        else continue;
        const mat = new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false });
        mesh = new T.Mesh(geo, mat);
        const edges = new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
        mesh.add(edges);
        const c = z.shape.center;
        mesh.position.set(c[0], c[1], c[2]);
        this.scene.add(mesh);
        this._zoneMeshes.set(z.id, mesh);
      }
      mesh.visible = this._zonesVisible;
    }
    // Remove zones that disappeared
    for (const [id, mesh] of this._zoneMeshes) {
      if (!seen.has(id)) { this.scene.remove(mesh); this._zoneMeshes.delete(id); }
    }
  }

  _drawAgent(agent) {
    if (!agent || !this._agentVisible) return;
    const p = agent.pose;
    this._agent.position.set(p.x, 0.16, p.z);
    this._agent.rotation.y = p.yaw;
    this._halo.position.set(p.x, 0.005, p.z);
  }

  _drawSceneBoxes(scene) {
    scene.forEachBox(box => {
      const mesh = this._sceneBoxMeshes.get(box.id);
      if (!mesh) return;
      mesh.position.set(box.center[0], box.center[1], box.center[2]);
    });
  }
}
