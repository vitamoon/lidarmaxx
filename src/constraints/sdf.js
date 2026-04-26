/**
 * Signed-distance functions for constraint primitives.
 *
 * Every zone shape implements `sdf(x, y, z) -> number` where the value
 * is negative inside the shape and positive outside. The constraint
 * engine reads the sign + magnitude to produce {ok | warn | violation}.
 *
 * SDFs are convenient because:
 *   - Composition is a single Math.min / Math.max.
 *   - "How far past the boundary" is a free byproduct of the verdict.
 *   - The exact same code can drive a renderer's marching-cubes preview
 *     if we ever want fancy zone visualization.
 */

const ABS = Math.abs;

export const SDF = {

  box(c, half) {
    return (x, y, z) => {
      const dx = ABS(x - c[0]) - half[0];
      const dy = ABS(y - c[1]) - half[1];
      const dz = ABS(z - c[2]) - half[2];
      const ax = Math.max(dx, 0);
      const ay = Math.max(dy, 0);
      const az = Math.max(dz, 0);
      const outside = Math.sqrt(ax*ax + ay*ay + az*az);
      const inside  = Math.min(0, Math.max(dx, Math.max(dy, dz)));
      return outside + inside;
    };
  },

  sphere(c, r) {
    return (x, y, z) => {
      const dx = x - c[0], dy = y - c[1], dz = z - c[2];
      return Math.sqrt(dx*dx + dy*dy + dz*dz) - r;
    };
  },

  cylinderY(c, r, halfH) {
    // Vertical (y-axis) cylinder centered at c.
    return (x, y, z) => {
      const dx = x - c[0], dz = z - c[2];
      const radial = Math.sqrt(dx*dx + dz*dz) - r;
      const axial  = ABS(y - c[1]) - halfH;
      const ar = Math.max(radial, 0);
      const aa = Math.max(axial,  0);
      const outside = Math.sqrt(ar*ar + aa*aa);
      const inside  = Math.min(0, Math.max(radial, axial));
      return outside + inside;
    };
  },

  /** Build the sdf callable from the wire-format shape descriptor. */
  build(shape) {
    switch (shape.type) {
      case 'box':      return SDF.box(shape.center, shape.size);
      case 'sphere':   return SDF.sphere(shape.center, shape.radius);
      case 'cylinder': return SDF.cylinderY(shape.center, shape.radius, shape.halfHeight ?? 0.5);
      default:
        throw new Error(`SDF: unknown shape type "${shape.type}"`);
    }
  },
};
