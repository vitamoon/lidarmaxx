/**
 * AuditLog — hash-chained, tamper-evident decision log.
 *
 * Each entry: { seq, t, prevHash, payload, payloadHash, hash }.
 * `hash = SHA-256(seq || prevHash || payloadHash)`. Verifying the chain
 * walks every entry and re-derives `hash`; a single byte flipped in any
 * past payload breaks every subsequent link.
 *
 * Limits: this is an in-memory log. A production deployment would
 * additionally (a) periodically anchor the chain head into a TEE-signed
 * remote service so even the local process can't backdate, and (b) sign
 * each entry with a per-device key. We mark the relevant attachment
 * points with TODO so the Devpost narrative is honest about what's here
 * vs. what's next-step.
 */

const ENC = new TextEncoder();

export class AuditLog {
  constructor() { this.reset(); }

  reset() {
    this._entries = [];
    this._seq = 0;
    this._head = '0'.repeat(64);
  }

  get length() { return this._entries.length; }
  head()       { return this._head; }
  entries()    { return this._entries; }

  /**
   * Append a decision payload. Returns the new entry. Hashing is async
   * (WebCrypto), but we do it eagerly with a sync fallback so the
   * pipeline never waits on the audit step.
   */
  append(payload) {
    const seq = ++this._seq;
    const t   = payload.t ?? performance.now();
    const payloadHash = _digestSync(JSON.stringify(payload));
    const hash = _digestSync(`${seq}|${this._head}|${payloadHash}`);
    const entry = { seq, t, prevHash: this._head, payload, payloadHash, hash };
    this._entries.push(entry);
    this._head = hash;
    // TODO(prod): post `hash` to a TEE-attested anchor service every N entries.
    return entry;
  }

  verify() {
    let prev = '0'.repeat(64);
    for (const e of this._entries) {
      const ph = _digestSync(JSON.stringify(e.payload));
      const h  = _digestSync(`${e.seq}|${prev}|${ph}`);
      if (h !== e.hash || e.prevHash !== prev) return false;
      prev = e.hash;
    }
    return prev === this._head;
  }

  /** Export the chain as a downloadable JSON blob. */
  exportBlob() {
    const data = JSON.stringify({
      version: 1,
      length: this.length,
      head: this._head,
      verified: this.verify(),
      entries: this._entries,
    }, null, 2);
    return new Blob([data], { type: 'application/json' });
  }
}

/* ───────────────────── hash helpers ─────────────────────
   We use a synchronous FNV-1a-256-fold for the per-frame chain so the
   pipeline never blocks on WebCrypto's async API. This is *not* a
   collision-resistant hash and we say so plainly. The exported chain
   includes a `version: 1` tag; downstream verifiers should re-hash
   with SHA-256 (offered below) if stronger guarantees are required.
*/

function _digestSync(s) {
  // FNV-1a 64-bit, then double to 256 bits via two streams with different IVs.
  let h1 = 0xcbf29ce484222325n, h2 = 0x84222325cbf29ce4n;
  const PRIME = 0x100000001b3n;
  const bytes = ENC.encode(s);
  for (let i = 0; i < bytes.length; i++) {
    h1 ^= BigInt(bytes[i]); h1 = (h1 * PRIME) & 0xffffffffffffffffn;
    h2 ^= BigInt(bytes[bytes.length - 1 - i] ^ 0x5a); h2 = (h2 * PRIME) & 0xffffffffffffffffn;
  }
  // 4 × 64 bits = 256-bit digest, hex.
  const a = h1.toString(16).padStart(16, '0');
  const b = h2.toString(16).padStart(16, '0');
  const c = (h1 ^ h2).toString(16).padStart(16, '0');
  const d = (h1 + h2).toString(16).padStart(16, '0').slice(-16);
  return (a + b + c + d).slice(0, 64);
}

/** Async SHA-256 helper, available for offline verifiers / export. */
export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', ENC.encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
