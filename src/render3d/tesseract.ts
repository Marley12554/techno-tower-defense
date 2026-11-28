/**
 * A tesseract (4D hypercube) drawn as glowing edges: 16 vertices, 32 edges,
 * rotated in the XW and ZW planes and projected to 3D, so the inner and outer
 * cubes keep turning through each other. With dims = 3 it is a plain cube (the
 * Sandbox Mk I core, which becomes the tesseract's inner cube at Mk II).
 *
 * Edges are instanced thin cylinders (WebGL lines are 1 px), with a wider soft
 * copy for glow.
 */
import * as THREE from 'three';

const VERTS: number[][] = [];
for (let i = 0; i < 16; i++) VERTS.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
const EDGES: [number, number][] = [];
for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j > i) EDGES.push([i, j]); }

const UP = new THREE.Vector3(0, 1, 0);
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pa = new THREE.Vector3(), pb = new THREE.Vector3(), d = new THREE.Vector3(), sc = new THREE.Vector3();

export class Tesseract {
  readonly group = new THREE.Group();
  private edges: [number, number][];
  private core: THREE.InstancedMesh;
  private soft: THREE.InstancedMesh;
  private nodes: THREE.InstancedMesh;
  readonly mats: THREE.MeshBasicMaterial[];
  private p3: THREE.Vector3[] = VERTS.map(() => new THREE.Vector3());
  /** Rotation state (radians): 4D planes and a 3D tumble. */
  xw = 0; zw = 0; tumble = 0;
  /** 0..1, scales the whole thing (used for fold-in collapses). */
  scale = 1;

  constructor(color: THREE.Color, readonly size: number, readonly dims: 3 | 4 = 4, thickness = 1) {
    this.edges = dims === 4 ? EDGES : EDGES.filter(([a, b]) => VERTS[a][3] > 0 && VERTS[b][3] > 0);
    const n = this.edges.length;
    const g1 = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    const g2 = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    const add = (c: THREE.Color, o: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mats = [add(color.clone().multiplyScalar(1.7), 0.95), add(color.clone(), 0.22), add(color.clone().multiplyScalar(2), 1)];
    this.core = new THREE.InstancedMesh(g1, this.mats[0], n);
    this.soft = new THREE.InstancedMesh(g2, this.mats[1], n);
    this.nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), this.mats[2], dims === 4 ? 16 : 8);
    for (const m of [this.core, this.soft, this.nodes]) { m.frustumCulled = false; m.renderOrder = 3; this.group.add(m); }
    this.thick = size * 0.035 * thickness;
  }
  private thick: number;

  /** Sets every material's opacity relative to its default. */
  setOpacity(k: number): void { this.mats[0].opacity = 0.95 * k; this.mats[1].opacity = 0.22 * k; this.mats[2].opacity = k; }

  update(): void {
    const cx = Math.cos(this.xw), sx = Math.sin(this.xw), cz = Math.cos(this.zw), sz = Math.sin(this.zw);
    const ct = Math.cos(this.tumble), st = Math.sin(this.tumble);
    const s = this.size * this.scale;
    let ni = 0;
    VERTS.forEach((v, i) => {
      let [x, y, z, w] = v;
      if (this.dims === 4) {
        [x, w] = [x * cx - w * sx, x * sx + w * cx];
        [z, w] = [z * cz - w * sz, z * sz + w * cz];
      } else w = 1;
      // a slow 3D tumble so it never reads as a flat diagram
      [x, z] = [x * ct - z * st, x * st + z * ct];
      [y, z] = [y * Math.cos(0.5) - z * Math.sin(0.5), y * Math.sin(0.5) + z * Math.cos(0.5)];
      const k = this.dims === 4 ? 1.6 / (2.6 - w) : 0.62;
      this.p3[i].set(x * k * s, y * k * s, z * k * s);
      if (this.dims === 4 || v[3] > 0) {
        const r = this.thick * 1.6 * (this.dims === 4 ? 0.7 + 0.3 * k : 1);
        m4.compose(this.p3[i], q.identity(), sc.set(r, r, r));
        this.nodes.setMatrixAt(ni++, m4);
      }
    });
    this.edges.forEach(([a, b], i) => {
      pa.copy(this.p3[a]); pb.copy(this.p3[b]);
      d.subVectors(pb, pa);
      const len = d.length();
      q.setFromUnitVectors(UP, d.normalize());
      const mid = pa.add(pb).multiplyScalar(0.5);
      m4.compose(mid, q, sc.set(this.thick, len, this.thick));
      this.core.setMatrixAt(i, m4);
      m4.compose(mid, q, sc.set(this.thick * 3.2, len, this.thick * 3.2));
      this.soft.setMatrixAt(i, m4);
    });
    this.core.instanceMatrix.needsUpdate = true;
    this.soft.instanceMatrix.needsUpdate = true;
    this.nodes.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const m of [this.core, this.soft, this.nodes]) m.geometry.dispose();
    for (const m of this.mats) m.dispose();
  }
}
