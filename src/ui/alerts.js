/**
 * Alerts — transient overlay banners on the viewport.
 *
 * We only flash on *new* violations (transitions from ok → violation).
 * A flapping zone (agent oscillating across a boundary) would otherwise
 * spam the user; debouncing here matches what a human operator actually
 * needs to see at a glance.
 */

export class Alerts {
  constructor() {
    this.stack = document.getElementById('alert-stack');
    this._lastVerdict = new Map(); // (zoneId|actorId) -> verdict
  }

  ingest(decisions, spoof) {
    if (spoof?.suspect && this._lastSpoof !== true) {
      this._lastSpoof = true;
      this._show(`integrity alert · ${spoof.reasons.join(', ')}`, 'warn');
    } else if (!spoof?.suspect) {
      this._lastSpoof = false;
    }

    for (const d of decisions) {
      const key = `${d.zoneId}|${d.actorId}`;
      const prev = this._lastVerdict.get(key);
      this._lastVerdict.set(key, d.verdict);
      if (d.verdict === 'violation' && prev !== 'violation') {
        const title = d.actor === 'agent' ? 'agent' : `track ${d.actorId}`;
        this._show(`violation · ${title} entered ${d.zoneLabel}`, 'crit');
      }
    }
  }

  _show(text, kind = 'crit') {
    const el = document.createElement('div');
    el.className = `alert${kind === 'warn' ? ' alert--warn' : kind === 'info' ? ' alert--info' : ''}`;
    el.innerHTML = `<span class="alert__dot"></span><span>${text}</span>`;
    this.stack.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 240ms';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 280);
    }, 2400);

    // Cap concurrent alerts.
    while (this.stack.children.length > 4) this.stack.firstChild.remove();
  }
}
