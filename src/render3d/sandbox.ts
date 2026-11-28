/**
 * Sandbox (round 10): a vault built from interlocking tetromino blocks around a
 * containment chamber holding a tesseract. Guarded and ritualistic: sealed with a
 * heartbeat glowing through the seams between the pieces; to fire, the pieces
 * shift apart in stages like a Tetris stack, the core lifts and spins up, the
 * charge launches, and the vault reseals. Designed backwards from Cluster II
 * (pods double-stack) and Remote II (all four pillars become a lattice uplink
 * carrying a dish), so everything in Mk II carries into both branches.
 *
 * Part           Mk I CELL           Mk II VAULT                CLUSTER I               REMOTE I
 * vault          tetromino walls     same                       same                    same
 * lid            O piece, lifts      splits into two dominoes   same                    same (stays sealed)
 * core           a cube              becomes a tesseract (4D)   same                    same
 * pillars        -                   4 I-piece pillars, braced  top cells become pods,  back pillars telescope
 *                                                               piped to the core       into an A-frame relay
 * base           square plinth       + wider plinth             + feed pipes            + relay mount
 *
 * Remote doesn't throw anything: its relay locks on, beams the target, and the
 * containment cage materializes there.
 */
import * as THREE from 'three';
import { GEN, MAT, ROLE, at, box, cyl, joint, ring, strut } from './kit';
import { Tower3D, type Stage } from './core';
import { Tesseract } from './tesseract';

const U = 0.068; // one tetromino cell
const GAP = 0.0065; // inset on faces that border another piece (where the light leaks through)
const TONES = [
  new THREE.MeshStandardMaterial({ color: '#56616e', metalness: 0.55, roughness: 0.32 }),
  new THREE.MeshStandardMaterial({ color: '#333b45', metalness: 0.5, roughness: 0.4 }),
  new THREE.MeshStandardMaterial({ color: '#77828f', metalness: 0.6, roughness: 0.3 }),
];
/** Perimeter of a 4x4 layer, clockwise from the back-left corner. */
const RING: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [0, 3], [0, 2], [0, 1]];
const LAYER_OFFSET = [0, 2, 1];

type Phase = 'sealed' | 'unseal' | 'charge' | 'hold' | 'reseal';
interface Piece { g: THREE.Group; out: THREE.Vector3 }

export class Sandbox extends Tower3D {
  private branch: 'none' | 'cluster' | 'remote';
  private seamMat: THREE.MeshStandardMaterial;
  private floorMat: THREE.MeshStandardMaterial;
  private topPieces: Piece[] = [];
  private lids: { g: THREE.Group; lift: THREE.Vector3; slide: THREE.Vector3 }[] = [];
  private coreG = new THREE.Group();
  private core: Tesseract;
  private coreY0 = 0;
  private coreY1 = 0;
  private pods: Tesseract[] = [];
  private podMats: THREE.MeshStandardMaterial[] = [];
  private relay: THREE.Group | null = null;
  private relayTip = new THREE.Object3D();
  private relayMat: THREE.MeshStandardMaterial | null = null;
  private beam: THREE.Mesh | null = null;
  private ritual: Phase = 'sealed';
  private pt = 0;
  private lidP = 0;
  private slideP = 0;
  private liftP = 0;
  private spin = 0.6;
  private recoil = 0;
  private shot: { m: Tesseract; from: THREE.Vector3; to: THREE.Vector3; t: number; T: number } | null = null;
  private beamT = 0;
  private aim = new THREE.Vector3();
  private body = new THREE.Group();

  constructor(readonly stage: Exclude<Stage, 'mk3'>) {
    super();
    const col = ROLE.area, r = this.root;
    const T = stage === 'mk1' ? 1 : 2;
    this.branch = stage.startsWith('cluster') ? 'cluster' : stage.startsWith('remote') ? 'remote' : 'none';
    this.seamMat = this.addGlow(col, 1.0, 2.6);
    this.floorMat = this.addGlow(col, 0.8, 3.0);
    this.base(col, T === 1 ? 0.5 : 0.65, T === 1 ? 0.28 : 0.36);
    this.range = this.branch === 'remote' ? 5.5 : 4.5;
    r.add(this.body);
    const b = this.body;

    /* ------------------------------------------------------------- plinth */
    let y = 0;
    if (T === 2) {
      at(box(0.5, 0.03, 0.5, GEN.gunmetalDark, 0.008), 0, 0, 0, b);
      this.rimSquare(0.5, 0.03, GEN.trim);
      y = 0.03;
    }
    at(box(0.34, 0.035, 0.34, GEN.gunmetal, 0.008), 0, y, 0, b);
    this.rimSquare(0.34, y + 0.035, GEN.trim);
    joint(at(box(0.343, 0.005, 0.343, this.seamMat, 0.002), 0, y + 0.012, 0, b)); // inlaid light
    y += 0.035;
    const floor = y;
    joint(at(box(2 * U - 0.01, 0.003, 2 * U - 0.01, this.floorMat, 0.001), 0, floor, 0, b)); // chamber floor glows

    /* ------------------------------------------------------ tetromino walls */
    const owner = new Map<string, number>();
    const pieces: [number, number, number][][] = [];
    for (let L = 0; L < 3; L++) {
      for (let p = 0; p < 3; p++) {
        const cells: [number, number, number][] = [];
        for (let k = 0; k < 4; k++) { const [i, j] = RING[(LAYER_OFFSET[L] + p * 4 + k) % 12]; cells.push([i, L, j]); }
        pieces.push(cells);
      }
    }
    // lid: one O piece at Mk I, two dominoes from Mk II
    const lidCells: [number, number, number][] = [[1, 2, 1], [2, 2, 1], [1, 2, 2], [2, 2, 2]];
    if (T === 1) pieces.push(lidCells);
    else { pieces.push([lidCells[0], lidCells[2]]); pieces.push([lidCells[1], lidCells[3]]); }
    pieces.forEach((cells, id) => cells.forEach(([i, L, j]) => owner.set(`${i},${L},${j}`, id)));
    // light behind the walls, seen only through the seams between pieces
    for (const [sx, sz, w, d] of [[0, -1, 4, 0], [0, 1, 4, 0], [-1, 0, 0, 4], [1, 0, 0, 4]] as const) {
      joint(at(box(w ? w * U - 0.01 : 0.004, 3 * U - 0.006, d ? d * U - 0.01 : 0.004, this.seamMat, 0.001), sx * 1.5 * U, floor + 0.003, sz * 1.5 * U, b));
    }
    const nLid = T === 1 ? 1 : 2;
    pieces.forEach((cells, id) => {
      const g = at(new THREE.Group(), 0, 0, 0, b);
      const tone = TONES[id % 3];
      for (const [i, L, j] of cells) {
        const same = (di: number, dl: number, dj: number) => owner.get(`${i + di},${L + dl},${j + dj}`) === id;
        const ix0 = same(-1, 0, 0) ? 0 : GAP, ix1 = same(1, 0, 0) ? 0 : GAP;
        const iz0 = same(0, 0, -1) ? 0 : GAP, iz1 = same(0, 0, 1) ? 0 : GAP;
        const iy0 = same(0, -1, 0) ? 0 : GAP * 0.5, iy1 = same(0, 1, 0) ? 0 : GAP * 0.5;
        const cx = (i - 1.5) * U + (ix0 - ix1) / 2, cz = (j - 1.5) * U + (iz0 - iz1) / 2;
        // tiny bevel so cells of one piece merge into one shape; the gaps between pieces carry the light
        at(box(U - ix0 - ix1, U - iy0 - iy1, U - iz0 - iz1, tone, 0.0012), cx, floor + L * U + iy0, cz, g);
      }
      const c = cells.reduce((a, [i, , j]) => a.add(new THREE.Vector3((i - 1.5) * U, 0, (j - 1.5) * U)), new THREE.Vector3()).multiplyScalar(1 / cells.length);
      const isLid = id >= pieces.length - nLid;
      // the lid lifts clear of the top layer first, then slides aside (back at Mk I; the two halves part at Mk II)
      if (isLid) this.lids.push({ g, lift: new THREE.Vector3(0, U + 0.004, 0), slide: T === 1 ? new THREE.Vector3(0, 0, -U * 2.05) : new THREE.Vector3(Math.sign(c.x) * U * 1.05, 0, 0) });
      else if (cells[0][1] === 2) this.topPieces.push({ g, out: c.setY(0).normalize().multiplyScalar(0.03) });
    });
    const top = floor + 3 * U;

    /* --------------------------------------------------------------- core */
    this.coreY0 = floor + U;
    this.coreY1 = top + 0.075;
    at(this.coreG, 0, this.coreY0, 0, b);
    this.core = new Tesseract(col, T === 1 ? 0.07 : 0.05, T === 1 ? 3 : 4);
    this.coreG.add(this.core.group);

    /* ----------------------------------------------------------- pillars */
    if (T === 2) {
      const P = 0.06, PR = 0.205;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const isPod = this.branch === 'cluster';
        const isMast = this.branch === 'remote' && sz < 0;
        const n = isPod ? 3 : 4;
        for (let k = 0; k < n; k++) at(box(P - 0.002, P - 0.002, P - 0.002, TONES[(k + (sx > 0 ? 1 : 0)) % 3], 0.004), sx * PR, floor - 0.035 + 0.001 + k * P, sz * PR, b);
        // seams of light on the two outer faces
        joint(at(box(0.004, n * P - 0.02, 0.012, this.seamMat, 0.0015), sx * (PR + P / 2 - 0.0005), floor - 0.025, sz * PR, b));
        joint(at(box(0.012, n * P - 0.02, 0.004, this.seamMat, 0.0015), sx * PR, floor - 0.025, sz * (PR + P / 2 - 0.0005), b));
        // brace to the vault corner
        const br = joint(at(box(0.07, 0.022, 0.026, GEN.armor, 0.004), sx * (PR - 0.045), floor + 1.4 * U, sz * (PR - 0.045), b));
        br.rotation.y = Math.atan2(-sz, sx); // long axis along the diagonal
        const ptop = floor - 0.034 + n * P;
        if (isPod) { // the top cell opens into a containment pod, piped to the core
          const pg = at(new THREE.Group(), sx * PR, ptop, sz * PR, b);
          at(box(P, 0.01, P, GEN.armor, 0.003), 0, 0, 0, pg);
          at(box(P, 0.01, P, GEN.armor, 0.003), 0, P - 0.01, 0, pg);
          for (const ax of [-1, 1]) for (const az of [-1, 1]) joint(at(box(0.008, P - 0.02, 0.008, GEN.trim, 0.002), ax * (P / 2 - 0.004), 0.01, az * (P / 2 - 0.004), pg));
          const pm = this.addGlow(col, 0.5, 2.6);
          this.podMats.push(pm);
          joint(at(box(P - 0.02, 0.003, P - 0.02, pm, 0.001), 0, 0.0095, 0, pg));
          const mini = new THREE.Group(); mini.position.y = P / 2; pg.add(mini);
          const pod = new Tesseract(col, 0.022, 3, 1.3);
          mini.add(pod.group);
          this.pods.push(pod);
          // lit feed pipe from the pod down to the vault's top corner
          const a = new THREE.Vector3(sx * (PR - 0.02), ptop + 0.01, sz * (PR - 0.02));
          const c = new THREE.Vector3(sx * 1.6 * U, top - 0.012, sz * 1.6 * U);
          b.add(joint(strut(a, c, 0.006, pm)));
          b.add(joint(strut(a, c, 0.009, MAT.glass)));
        }
        if (isMast) { // back pillars telescope up and lean in to carry the relay
          const t0 = new THREE.Vector3(sx * PR, ptop, sz * PR);
          at(box(0.046, 0.05, 0.046, GEN.trim, 0.004), sx * PR, ptop, sz * PR, b);
          const apex = new THREE.Vector3(0, top + 0.26, sz * PR * 0.6);
          const a = t0.clone().setY(ptop + 0.045);
          b.add(joint(strut(a, apex, 0.014, GEN.gunmetal)));
          b.add(joint(strut(a.clone().lerp(apex, 0.15), a.clone().lerp(apex, 0.85), 0.006, this.seamMat)));
        }
      }
      if (this.branch === 'remote') {
        const apexY = top + 0.26, az = -0.205 * 0.6;
        at(box(0.08, 0.03, 0.05, GEN.armor, 0.006), 0, apexY - 0.015, az, b); // crown block where the legs meet
        this.relay = at(new THREE.Group(), 0, apexY + 0.015, az, b);
        at(cyl(0.028, 0.018, GEN.trim, 20), 0, 0, 0, this.relay);
        const head = at(new THREE.Group(), 0, 0.045, 0, this.relay);
        head.rotation.x = 0.18;
        at(box(0.05, 0.05, 0.04, GEN.armor, 0.008), 0, -0.025, 0, head);
        const em = joint(at(ring(0.03, 0.0065, GEN.trim, 32), 0, 0, 0.026, head));
        em.rotation.x = Math.PI / 2;
        this.relayMat = this.addGlow(col, 0.6, 3.2);
        at(new THREE.Mesh(new THREE.SphereGeometry(0.014, 14, 10), this.relayMat), 0, 0, 0.024, head);
        at(this.relayTip, 0, 0, 0.04, head);
        const bg = new THREE.CylinderGeometry(0.006, 0.006, 1, 6); bg.translate(0, 0.5, 0);
        this.beam = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.beam.visible = false;
        r.add(this.beam);
      }
    }
  }

  /** Thin machined rim around the top edge of a square slab. */
  private rimSquare(w: number, yTop: number, mat: THREE.Material): void {
    for (const [x, z, rw, rd] of [[0, w / 2 - 0.005, w - 0.01, 0.008], [0, -w / 2 + 0.005, w - 0.01, 0.008], [w / 2 - 0.005, 0, 0.008, w - 0.01], [-w / 2 + 0.005, 0, 0.008, w - 0.01]]) {
      joint(at(box(rw, 0.004, rd, mat, 0.0015), x, yTop - 0.001, z, this.body));
    }
  }

  private go(p: Phase): void { this.ritual = p; this.pt = 0; }

  protected animate(dt: number, t: number, targets: THREE.Vector3[]): void {
    const target = targets[0] ?? null;
    const ease = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
    this.locks.length = 0;
    if (target) this.locks.push(target);
    this.pt += dt;

    // heartbeat (a soft double beat, well under three per second) while sealed
    const hbx = (t * 0.75) % 1;
    const hb = Math.exp(-(((hbx - 0.05) / 0.07) ** 2)) + 0.55 * Math.exp(-(((hbx - 0.27) / 0.07) ** 2));
    const sealed = 1 - this.lidP;
    this.seamMat.emissiveIntensity += hb * 0.9 * sealed;
    this.floorMat.emissiveIntensity += hb * 0.6 * sealed + this.liftP * 1.5;

    if (this.branch === 'remote') this.animateRemote(dt, target);
    else this.animateRitual(dt, target);

    // pieces follow the ritual: lid first, then the top layer shifts out, then the core lifts
    for (const l of this.lids) l.g.position.copy(l.lift).multiplyScalar(ease(this.lidP * 2)).addScaledVector(l.slide, ease(this.lidP * 2 - 1));
    for (const p of this.topPieces) p.g.position.copy(p.out).multiplyScalar(ease(this.slideP));
    this.coreG.position.y = this.coreY0 + (this.coreY1 - this.coreY0) * ease(this.liftP);
    this.recoil = Math.max(0, this.recoil - dt * 3);
    this.body.position.y = -0.012 * Math.sin(Math.min(1, this.recoil) * Math.PI);

    // the core turns through 4D; it spins up while charging
    this.core.xw += dt * this.spin;
    this.core.zw += dt * this.spin * 0.62;
    this.core.tumble += dt * 0.35;
    this.core.update();
    this.core.setOpacity(0.65 + 0.35 * this.alert);
    for (const p of this.pods) { p.tumble += dt * (0.8 + this.liftP * 2); p.update(); }
    for (const m of this.podMats) m.emissiveIntensity += this.liftP * 1.5;

    // the charge in flight
    if (this.shot) {
      const s = this.shot;
      s.t += dt;
      if (target) s.to.lerp(target, Math.min(1, dt * 4));
      const u = Math.min(1, s.t / s.T);
      const p = s.from.clone().lerp(s.to, u);
      p.y += Math.sin(u * Math.PI) * (0.5 + s.from.distanceTo(s.to) * 0.12);
      s.m.group.position.copy(this.root.worldToLocal(p));
      s.m.xw += dt * 6; s.m.zw += dt * 4; s.m.tumble += dt * 3; s.m.update();
      if (u >= 1) {
        this.root.remove(s.m.group); s.m.dispose();
        this.onFire?.({ from: s.from, to: s.to.clone(), kind: 'isolate', color: ROLE.area, tier: this.stage === 'mk1' ? 1 : 2, bomblets: this.branch === 'cluster' ? 4 : 0 });
        this.shot = null;
      }
    }
  }

  /** Cell, Vault, Cluster: unseal in stages, charge, launch, reseal. */
  private animateRitual(dt: number, target: THREE.Vector3 | null): void {
    const k = (rate: number) => Math.min(1, dt * rate);
    switch (this.ritual) {
      case 'sealed':
        this.lidP = Math.max(0, this.lidP - dt * 3); this.slideP = Math.max(0, this.slideP - dt * 3); this.liftP = Math.max(0, this.liftP - dt * 3);
        this.spin += (0.6 - this.spin) * k(2);
        if (target && this.cooldown <= 0) this.go('unseal');
        break;
      case 'unseal':
        this.lidP = Math.min(1, this.pt / 0.28);
        this.slideP = Math.min(1, Math.max(0, (this.pt - 0.18) / 0.25));
        if (this.pt >= 0.45) this.go('charge');
        break;
      case 'charge':
        this.liftP = Math.min(1, this.pt / 0.4);
        this.spin += (5 - this.spin) * k(3);
        if (this.pt >= 0.55) {
          if (target) this.launch(target);
          this.go('hold');
        }
        break;
      case 'hold':
        this.spin += (1.5 - this.spin) * k(3);
        if (this.pt >= 0.35) this.go('reseal');
        break;
      case 'reseal':
        this.liftP = Math.max(0, 1 - this.pt / 0.25);
        this.slideP = Math.max(0, 1 - Math.max(0, this.pt - 0.15) / 0.22);
        this.lidP = Math.max(0, 1 - Math.max(0, this.pt - 0.25) / 0.25);
        if (this.pt >= 0.55) this.go('sealed');
        break;
    }
  }

  private launch(target: THREE.Vector3): void {
    const m = new Tesseract(ROLE.area, 0.03, this.stage === 'mk1' ? 3 : 4, 1.2);
    this.root.add(m.group);
    const from = this.coreG.getWorldPosition(new THREE.Vector3());
    this.shot = { m, from, to: target.clone(), t: 0, T: 0.85 };
    this.cooldown = 2.2;
    this.recoil = 1;
    this.flash = 0.25;
  }

  /** Remote: the vault stays sealed; the relay turns to the target, charges, and beams the cage there. */
  private animateRemote(dt: number, target: THREE.Vector3 | null): void {
    this.lidP = 0; this.slideP = 0; this.liftP = 0;
    this.spin += ((target ? 2.2 : 0.6) - this.spin) * Math.min(1, dt * 2);
    if (!this.relay || !this.beam) return;
    if (target) {
      const want = this.yawTo(this.relay, target);
      let d = want - this.relay.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.relay.rotation.y += d * Math.min(1, dt * 3);
      this.aim.copy(target);
      if (this.cooldown <= 0 && Math.abs(d) < 0.08) {
        this.cooldown = 2.2;
        this.beamT = 1;
        this.onFire?.({ from: this.relayTip.getWorldPosition(new THREE.Vector3()), to: target.clone(), kind: 'isolate', color: ROLE.area, tier: 2, bomblets: 0 });
      }
    }
    // charge glow builds over the reload, then the beam fades out slowly (one pulse per shot)
    const charge = target ? 1 - Math.max(0, this.cooldown) / 2.2 : 0;
    if (this.relayMat) this.relayMat.emissiveIntensity += charge * 1.5;
    this.beamT = Math.max(0, this.beamT - dt * 2.2);
    const bm = this.beam.material as THREE.MeshBasicMaterial;
    bm.opacity = 0.7 * this.beamT;
    this.beam.visible = this.beamT > 0.01;
    if (this.beam.visible) {
      const a = this.root.worldToLocal(this.relayTip.getWorldPosition(new THREE.Vector3()));
      const b = this.root.worldToLocal(this.aim.clone());
      const d = b.clone().sub(a);
      this.beam.position.copy(a);
      this.beam.scale.set(1 + (1 - this.beamT) * 1.5, d.length(), 1 + (1 - this.beamT) * 1.5);
      this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    }
  }
}
