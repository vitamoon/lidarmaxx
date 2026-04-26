/**
 * dbscan — density-based clustering of 3D points.
 *
 * Standard DBSCAN (Ester et al. 1996) with a voxel-grid neighborhood
 * query. Returns Cluster objects with bounding boxes, centroids, and a
 * stable id heuristic so a downstream tracker has something to associate.
 *
 * The id heuristic is a hash of the rounded centroid; it is stable across
 * frames *only when the cluster doesn't move*. Real association lives in
 * Tracker — DBSCAN ids are advisory.
 */

const UNCLASSIFIED = -2;
const NOISE        = -1;

export class Cluster {
  constructor(id, indices, points) {
    this.id = id;
    this.indices = indices;
    this.size = indices.length;
    this.aabb = { min: [+Infinity,+Infinity,+Infinity], max: [-Infinity,-Infinity,-Infinity] };
    this.centroid = [0, 0, 0];
    let cx = 0, cy = 0, cz = 0;
    for (const i of indices) {
      const x = points[i*3], y = points[i*3+1], z = points[i*3+2];
      cx += x; cy += y; cz += z;
      if (x < this.aabb.min[0]) this.aabb.min[0] = x;
      if (y < this.aabb.min[1]) this.aabb.min[1] = y;
      if (z < this.aabb.min[2]) this.aabb.min[2] = z;
      if (x > this.aabb.max[0]) this.aabb.max[0] = x;
      if (y > this.aabb.max[1]) this.aabb.max[1] = y;
      if (z > this.aabb.max[2]) this.aabb.max[2] = z;
    }
    const n = indices.length || 1;
    this.centroid[0] = cx / n;
    this.centroid[1] = cy / n;
    this.centroid[2] = cz / n;
  }
}

export function dbscan(points, voxel, eps = 0.35, minPts = 4) {
  const N = points.length / 3;
  if (N === 0) return [];
  const labels = new Int16Array(N).fill(UNCLASSIFIED);
  const clusters = [];
  let nextId = 0;
  const neigh = [];
  const seedQueue = [];

  for (let i = 0; i < N; i++) {
    if (labels[i] !== UNCLASSIFIED) continue;
    voxel.neighbors(i, eps, neigh);
    if (neigh.length + 1 < minPts) {
      labels[i] = NOISE;
      continue;
    }

    // Start a new cluster.
    const id = nextId++;
    labels[i] = id;
    seedQueue.length = 0;
    for (let k = 0; k < neigh.length; k++) seedQueue.push(neigh[k]);

    while (seedQueue.length) {
      const j = seedQueue.shift();
      if (labels[j] === NOISE) labels[j] = id;
      if (labels[j] !== UNCLASSIFIED) continue;
      labels[j] = id;
      const jNeigh = [];
      voxel.neighbors(j, eps, jNeigh);
      if (jNeigh.length + 1 >= minPts) {
        for (let k = 0; k < jNeigh.length; k++) {
          if (labels[jNeigh[k]] === UNCLASSIFIED || labels[jNeigh[k]] === NOISE) {
            seedQueue.push(jNeigh[k]);
          }
        }
      }
    }
  }

  // Bucket points by cluster id.
  const buckets = new Map();
  for (let i = 0; i < N; i++) {
    const id = labels[i];
    if (id < 0) continue;
    let arr = buckets.get(id);
    if (!arr) { arr = []; buckets.set(id, arr); }
    arr.push(i);
  }
  for (const [id, indices] of buckets) {
    // Filter implausible clusters (e.g., a tower of vertical points from
    // a wall corner). A real Penumbra deployment would learn this filter
    // from the sensor specs.
    if (indices.length < minPts) continue;
    clusters.push(new Cluster(id, indices, points));
  }
  return clusters;
}
