/**
 * ConstraintPainter — pointer-driven zone authoring on the 3D viewport.
 *
 * Behavior:
 *   - When a paint tool is active, click-and-drag on the floor plane
 *     defines the XZ extent of a new box zone.
 *   - Drag distance < 0.25 m falls back to a small default radius so a
 *     single click still drops a zone (handy at demo time).
 *   - Active tool style + cursor are managed by the Controls UI; this
 *     module only owns the geometric work.
 *
 * The renderer is *trusted* to expose a `screenToFloor(x, y)` helper that
 * intersects a screen coordinate with the y=0 plane. We only depend on
 * that one method so the painter survives any future renderer rewrite.
 */

export class ConstraintPainter {
  constructor({ THREE, renderer, onAdd }) {
    this.THREE = THREE;
    this.renderer = renderer;
    this.onAdd = onAdd;
    this.activeKind = null;
    this._dragStart = null;

    const canvas = renderer.canvas;
    canvas.addEventListener('pointerdown', this._down);
    canvas.addEventListener('pointermove', this._move);
    canvas.addEventListener('pointerup',   this._up);
    canvas.addEventListener('pointerleave',this._up);
  }

  setTool(kind) {
    this.activeKind = kind; // 'hard' | 'soft' | 'trust' | null
    this.renderer.canvas.style.cursor = kind ? 'crosshair' : '';
  }

  _down = (e) => {
    if (!this.activeKind) return;
    const p = this.renderer.screenToFloor(e.offsetX, e.offsetY);
    if (!p) return;
    this._dragStart = p;
    this.renderer.previewZone({ start: p, end: p, kind: this.activeKind });
    e.preventDefault();
  };

  _move = (e) => {
    if (!this._dragStart) return;
    const p = this.renderer.screenToFloor(e.offsetX, e.offsetY);
    if (!p) return;
    this.renderer.previewZone({ start: this._dragStart, end: p, kind: this.activeKind });
  };

  _up = (e) => {
    if (!this._dragStart) return;
    const end = this.renderer.screenToFloor(e.offsetX, e.offsetY) ?? this._dragStart;
    const a = this._dragStart, b = end;
    this._dragStart = null;
    this.renderer.previewZone(null);

    const cx = (a[0] + b[0]) / 2;
    const cz = (a[2] + b[2]) / 2;
    const halfX = Math.max(0.18, Math.abs(b[0] - a[0]) / 2);
    const halfZ = Math.max(0.18, Math.abs(b[2] - a[2]) / 2);
    const halfY = 0.5;
    this.onAdd({
      kind: this.activeKind,
      label: `${this.activeKind} ${(2*halfX).toFixed(2)}×${(2*halfZ).toFixed(2)} m`,
      shape: { type: 'box', center: [cx, halfY, cz], size: [halfX, halfY, halfZ] },
    });
  };
}
