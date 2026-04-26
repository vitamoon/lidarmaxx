/**
 * Controls — wires the left-rail UI to App.
 *
 * Owns: scenario picker, zone list, paint tools, layer toggles,
 * adversarial toggles, audit-log export.
 *
 * Notably does *not* own state — every control either calls a method
 * on the renderer / engine / sensor or notifies App. Centralizing the
 * write authority makes the audit log a faithful record of why the
 * world looked the way it did at any tick.
 */

import { SCENARIOS } from '../sim/scenarios.js';

export class Controls {
  constructor({ app, onScenarioChange }) {
    this.app = app;
    this.onScenarioChange = onScenarioChange;
    this.scenarios = SCENARIOS;
    this._wireToggles();
    this._wirePaintTools();
    this._wireCameraButtons();
    this._wireAdversarial();
    this._wireExport();
  }

  populateScenarios() {
    const grid = document.getElementById('scenario-grid');
    grid.innerHTML = '';
    for (const id of Object.keys(this.scenarios)) {
      const sc = this.scenarios[id];
      const btn = document.createElement('button');
      btn.className = 'scenario';
      btn.dataset.id = id;
      btn.dataset.active = (id === this.app.scenario.id) ? 'true' : 'false';
      btn.innerHTML = `
        <div class="scenario__name">${sc.name}</div>
        <div class="scenario__sub">${sc.blurb}</div>
      `;
      btn.addEventListener('click', () => {
        this.onScenarioChange(id);
        for (const el of grid.querySelectorAll('.scenario')) el.dataset.active = 'false';
        btn.dataset.active = 'true';
      });
      grid.appendChild(btn);
    }
  }

  refreshZones(zones) {
    const list = document.getElementById('zone-list');
    list.innerHTML = '';
    if (!zones.length) {
      const li = document.createElement('li');
      li.className = 'zone-list__empty';
      li.textContent = 'No zones defined yet.';
      list.appendChild(li);
      return;
    }
    for (const z of zones) {
      const li = document.createElement('li');
      li.className = 'zone-item';
      const sw = document.createElement('span');
      sw.className = `zone-item__swatch tool__swatch--${z.kind}`;
      const name = document.createElement('span');
      name.className = 'zone-item__name';
      name.textContent = `${z.kind} · ${z.label}`;
      const del = document.createElement('button');
      del.className = 'zone-item__del';
      del.title = 'remove';
      del.textContent = '×';
      del.addEventListener('click', () => {
        const i = this.app.constraints.zones().findIndex(zz => zz.id === z.id);
        if (i >= 0) {
          this.app.constraints._zones.splice(i, 1);
          this.refreshZones(this.app.constraints.zones());
        }
      });
      li.appendChild(sw); li.appendChild(name); li.appendChild(del);
      list.appendChild(li);
    }
  }

  _wireToggles() {
    const map = {
      'layer-points': 'points', 'layer-clusters': 'clusters',
      'layer-tracks': 'tracks', 'layer-zones': 'zones',
      'layer-agent':  'agent',  'layer-sensor':  'sensor',
    };
    for (const [id, name] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener('change', () => this.app.renderer.setLayer(name, el.checked));
    }
  }

  _wirePaintTools() {
    const tools = document.querySelectorAll('[data-tool]');
    for (const t of tools) {
      t.addEventListener('click', () => {
        const tool = t.dataset.tool;
        if (tool === 'clear') {
          this.app.constraints.clear();
          this.refreshZones([]);
          this.app.painter.setTool(null);
          for (const o of tools) o.dataset.active = 'false';
          return;
        }
        const kind = tool.replace('paint-', '');
        const wasActive = t.dataset.active === 'true';
        for (const o of tools) o.dataset.active = 'false';
        if (!wasActive) {
          t.dataset.active = 'true';
          this.app.painter.setTool(kind);
        } else {
          this.app.painter.setTool(null);
        }
      });
    }
  }

  _wireCameraButtons() {
    const ids = { 'cam-orbit': 'orbit', 'cam-fpv': 'fpv', 'cam-top': 'top' };
    const buttons = Object.keys(ids).map(id => document.getElementById(id));
    for (const btn of buttons) {
      const mode = ids[btn.id];
      btn.addEventListener('click', () => {
        for (const b of buttons) b.dataset.active = 'false';
        btn.dataset.active = 'true';
        this.app.renderer.setCameraMode(mode);
        const hudCam = document.getElementById('hud-cam');
        if (hudCam) hudCam.textContent = mode;
      });
    }
    document.getElementById('cam-orbit').dataset.active = 'true';
  }

  _wireAdversarial() {
    const spoof = document.getElementById('attack-spoof');
    const blind = document.getElementById('attack-blind');
    const sensor = this.app.sensor;
    // Wrap the original sweep so toggles are honored without a code path
    // through App._tick — this keeps the sensor module ignorant of UI.
    const orig = sensor.sweep.bind(sensor);
    sensor.sweep = (pose, scene) => {
      const r = orig(pose, scene);
      if (spoof.checked) {
        const augmented = sensor.injectSpoof(r.points, 220);
        const aug = new Uint8Array(augmented.length / 3);
        aug.set(r.intensity.slice(0, r.intensity.length));
        for (let i = r.intensity.length; i < aug.length; i++) aug[i] = 255;
        return { ...r, points: augmented, intensity: aug };
      }
      if (blind.checked) {
        const out = sensor.injectBlinding(r.points, Math.PI / 4, Math.PI / 3);
        return { ...r, points: out, intensity: r.intensity.subarray(0, out.length / 3) };
      }
      return r;
    };
  }

  _wireExport() {
    const btn = document.getElementById('export-audit');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const blob = this.app.audit.exportBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `penumbra-audit-${Date.now()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  }
}
