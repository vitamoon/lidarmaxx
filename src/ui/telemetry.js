/**
 * Telemetry — right-rail live numbers + spoof gauge + decision feed +
 * audit chain headers.
 *
 * Updates are throttled per-element: numbers refresh every tick, but
 * decision-feed mutation is capped to ~6 Hz so the DOM doesn't thrash
 * when 200 simultaneous decisions stream by.
 */

const fmt = {
  fps:    (v) => v.toFixed(0),
  ms:     (v) => `${v.toFixed(1)} ms`,
  big:    (v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${v}`,
  pct:    (v) => `${(v*100).toFixed(0)}%`,
  hash6:  (h) => h ? h.slice(0, 6) + '…' + h.slice(-4) : '—',
};

export class Telemetry {
  constructor() {
    this._lastFeedAt = 0;
    this._feedBuf = [];
    this._spoofEMA = 0;
  }

  update(state) {
    document.getElementById('stat-fps').textContent      = fmt.fps(state.fps || 0);
    document.getElementById('stat-tick').textContent     = fmt.ms(state.tickMs || 0);
    document.getElementById('stat-points').textContent   = fmt.big(state.points || 0);
    document.getElementById('stat-clusters').textContent = `${state.clusters || 0}`;
    document.getElementById('stat-tracks').textContent   = `${state.tracks || 0}`;
    document.getElementById('stat-viol').textContent     = `${state.violations || 0}`;

    document.getElementById('hud-points').textContent = fmt.big(state.points || 0);
    document.getElementById('hud-sweep').textContent  = `${fmt.fps(state.fps || 0)} Hz`;

    // Spoof meter — EMA so it doesn't flicker.
    this._spoofEMA = 0.7 * this._spoofEMA + 0.3 * (state.spoof?.score ?? 0);
    const spoofPct = Math.min(100, Math.max(0, this._spoofEMA * 100));
    document.getElementById('spoof-fill').style.width = `${spoofPct}%`;
    const cap = document.getElementById('spoof-caption');
    if (state.spoof?.suspect) {
      cap.textContent = `suspect — ${state.spoof.reasons.join(', ')}`;
      cap.style.color = 'var(--crit)';
    } else if (this._spoofEMA > 0.30) {
      cap.textContent = `elevated (${spoofPct.toFixed(0)}%)`;
      cap.style.color = 'var(--warn)';
    } else {
      cap.textContent = 'nominal';
      cap.style.color = '';
    }

    // Audit chain
    document.getElementById('audit-count').textContent = `${state.auditCount}`;
    document.getElementById('audit-head').textContent  = fmt.hash6(state.auditHead);
    const v = document.getElementById('audit-verified');
    v.textContent = state.auditOk ? 'ok' : 'BROKEN';
    v.style.color = state.auditOk ? 'var(--ok)' : 'var(--crit)';

    // Decision feed (throttled)
    const now = performance.now();
    if (state.spoof?.suspect) {
      this._feedBuf.push({ kind: 'spoof', verdict: 'warn', label: 'integrity', t: now });
    }
    if (now - this._lastFeedAt > 160) {
      this._lastFeedAt = now;
      this._renderFeed();
    }
  }

  pushDecisions(decisions) {
    for (const d of decisions) {
      if (d.verdict === 'ok') continue;
      this._feedBuf.push({
        kind: d.zoneKind, verdict: d.verdict,
        label: `${d.actorId} ↦ ${d.zoneLabel}`,
        d: d.distance, t: performance.now(),
      });
    }
    if (this._feedBuf.length > 60) this._feedBuf.splice(0, this._feedBuf.length - 60);
  }

  _renderFeed() {
    const list = document.getElementById('decision-feed');
    if (this._feedBuf.length === 0) {
      list.innerHTML = '<li class="feed__empty">No active violations.</li>';
      return;
    }
    list.innerHTML = '';
    const recent = this._feedBuf.slice(-20).reverse();
    for (const r of recent) {
      const li = document.createElement('li');
      li.className = 'feed__row';
      li.innerHTML = `
        <span class="feed__t">${(r.t/1000).toFixed(1)}s</span>
        <span class="feed__zone">${r.label}</span>
        <span class="feed__verdict feed__verdict--${r.verdict}">${r.verdict}</span>
      `;
      list.appendChild(li);
    }
  }
}
