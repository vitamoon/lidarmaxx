/**
 * App — top-level orchestrator.
 *
 * This file is intentionally thin. It wires the pipeline stages together
 * and owns the fixed-step clock; every real algorithm lives in its own
 * module under sim/, perception/, constraints/, audit/, render/, ui/.
 *
 * Pipeline (run once per tick):
 *   sim → sensor → spoof → voxel → cluster → track → constraints → audit → render
 */

export class App {
  constructor({ THREE, OrbitControls }) {
    this.THREE = THREE;
    this.OrbitControls = OrbitControls;

    this.tickHz = 20;                    // perception loop rate
    this.tickMs = 1000 / this.tickHz;
    this.lastTick = 0;
    this.frameCount = 0;
    this.fpsEMA = 0;
    this.tickEMA = 0;
  }

  async boot() {
    const setHealth = (label, kind) => {
      const pill = document.getElementById('health-pill');
      const lbl  = document.getElementById('health-label');
      lbl.textContent = label;
      pill.className = `pill pill--${kind}`;
    };

    // The bulk of construction is intentionally lazy-imported here so the
    // boot screen text can update between stages on slow networks.
    setHealth('booting', 'warn');

    const { SceneSim }         = await import('../sim/scene.js');
    const { LidarSensor }      = await import('../sim/lidar.js');
    const { Agent }            = await import('../sim/agent.js');
    const { SCENARIOS, resolveScenario } = await import('../sim/scenarios.js');
    const { VoxelGrid }        = await import('../perception/voxelgrid.js');
    const { dbscan }           = await import('../perception/dbscan.js');
    const { Tracker }          = await import('../perception/tracker.js');
    const { SpoofDetector }    = await import('../perception/spoof.js');
    const { ConstraintEngine } = await import('../constraints/engine.js');
    const { ConstraintPainter } = await import('../constraints/painter.js');
    const { AuditLog }         = await import('../audit/log.js');
    const { Renderer }         = await import('../render/renderer.js');
    const { Controls }         = await import('../ui/controls.js');
    const { Telemetry }        = await import('../ui/telemetry.js');
    const { Alerts }           = await import('../ui/alerts.js');

    this._resolveScenario = resolveScenario;
    // dbscan is the only standalone function used by _tick; constructors
    // and instances are already pinned via `this.x = new X()`.
    this._dbscan = dbscan;

    // ── World + agent + sensor
    this.scenario = resolveScenario('home_at_night');
    this.scene = new SceneSim(this.THREE, this.scenario);
    this.agent = new Agent(this.scenario.agent);
    this.sensor = new LidarSensor(this.scenario.sensor);

    // ── Perception pipeline
    this.voxel    = new VoxelGrid(0.20);     // 20 cm cells
    this.tracker  = new Tracker({ matchGate: 1.5, maxAge: 12, minHits: 3 });
    this.spoof    = new SpoofDetector({ window: 30 });

    // ── Constraints + audit
    this.constraints = new ConstraintEngine();
    for (const z of this.scenario.zones ?? []) this.constraints.add(z);
    this.audit = new AuditLog();

    // ── Renderer (owns the canvas + Three.js scene)
    this.renderer = new Renderer({
      THREE: this.THREE,
      OrbitControls: this.OrbitControls,
      canvas: document.getElementById('viewport-canvas'),
      scene: this.scene,
    });
    await this.renderer.init();

    // ── UI
    this.painter = new ConstraintPainter({
      THREE: this.THREE,
      renderer: this.renderer,
      onAdd: (zone) => {
        this.constraints.add(zone);
        this.controls.refreshZones(this.constraints.zones());
      },
    });
    this.controls = new Controls({
      app: this,
      onScenarioChange: (id) => this.loadScenario(id),
    });
    this.telemetry = new Telemetry();
    this.alerts    = new Alerts();

    // Initial UI population
    this.controls.populateScenarios();
    this.controls.refreshZones(this.constraints.zones());

    setHealth('online', 'ok');
    this._loop();
  }

  loadScenario(id) {
    const next = this._resolveScenario(id);
    if (!next) return;
    this.scenario = next;
    this.scene.replaceWith(next);
    this.agent.configure(next.agent);
    this.sensor.configure(next.sensor);
    this.constraints.clear();
    for (const z of next.zones ?? []) this.constraints.add(z);
    this.controls.refreshZones(this.constraints.zones());
    this.audit.reset();
    this.tracker.reset();
    this.spoof.reset();
    this.renderer.refit();
    if (next.autoEnableSpoof) {
      const cb = document.getElementById('attack-spoof');
      if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
    }
  }

  _loop = () => {
    const now = performance.now();
    const dt  = Math.min(0.1, (now - this.lastTick) / 1000) || 0.05;

    if (now - this.lastTick >= this.tickMs) {
      const tStart = performance.now();
      this._tick(dt);
      const tEnd = performance.now();
      this.tickEMA = 0.9 * this.tickEMA + 0.1 * (tEnd - tStart);
      this.lastTick = now;
    }

    this.renderer.draw(dt);

    // FPS EMA (graphics frames, not perception ticks)
    this.frameCount++;
    if (this.frameCount % 6 === 0) {
      const inst = 1000 / Math.max(1, dt * 1000);
      this.fpsEMA = 0.8 * (this.fpsEMA || inst) + 0.2 * inst;
    }

    requestAnimationFrame(this._loop);
  };

  _tick(dt) {
    // 1. world tick
    this.scene.step(dt);
    this.agent.step(dt, this.scene);

    // 2. sensor sweep (returns interleaved Float32Array of xyz + intensity)
    const sweep = this.sensor.sweep(this.agent.pose, this.scene);

    // 3. spoof check (does NOT gate downstream; we want the chain to record
    //    the suspect points and still allow a human to inspect them)
    const spoofResult = this.spoof.score(sweep, this.tracker.tracks);

    // 4. voxelize + cluster
    this.voxel.replace(sweep.points);
    const clusters = this._dbscan(sweep.points, this.voxel, /*eps*/ 0.35, /*minPts*/ 4);

    // 5. track
    const tracks = this.tracker.update(clusters, dt);

    // 6. constraints
    const decisions = this.constraints.evaluate(this.agent.pose, tracks);

    // 7. audit
    const event = this.audit.append({
      t: performance.now(),
      pose: this.agent.pose,
      stats: { points: sweep.points.length / 3, clusters: clusters.length, tracks: tracks.length },
      spoof: spoofResult,
      decisions,
    });

    // 8. UI updates
    this.telemetry.update({
      fps: this.fpsEMA,
      tickMs: this.tickEMA,
      points: sweep.points.length / 3,
      clusters: clusters.length,
      tracks: tracks.length,
      violations: decisions.filter(d => d.verdict === 'violation').length,
      spoof: spoofResult,
      auditCount: this.audit.length,
      auditHead: event.hash,
      // Verifying the entire chain every tick is O(N); we only do it
      // once a second so even a long-running session stays cheap.
      auditOk: (this._auditCheckTick = (this._auditCheckTick ?? 0) + 1) % this.tickHz === 0
        ? (this._auditOk = this.audit.verify())
        : (this._auditOk ?? true),
    });
    this.telemetry.pushDecisions(decisions);
    this.alerts.ingest(decisions, spoofResult);

    // 9. render-side data handoff
    this.renderer.setFrame({
      points: sweep.points,
      intensity: sweep.intensity,
      clusters, tracks,
      zones: this.constraints.zones(),
      agent: this.agent,
      sensor: this.sensor,
      sensorRays: sweep.rays,
    });
  }
}
