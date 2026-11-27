/**
 * Tower models, built from real geometry, plus their live behavior.
 *
 * Design rules (see CLAUDE.md):
 *  1. Nothing is removed between tiers: parts grow, get armored, or evolve in place.
 *  2. Every visual change maps to what the upgrade does (optics = damage,
 *     cooling = fire rate, height = range, pod count = bomblet count).
 *  3. Every part has a mount. Only energy (beams, fields) floats.
 *  4. One industrial construction language.
 *  5. Footprint and height only grow.
 *
 * Behavior: every tower blends between idle (scanning, dim) and alert (locked
 * on, lit, deployed) and reports shots through `onFire` for the effects layer.
 */
import * as THREE from 'three';
import { MAT, ROLE, at, box, cyl, glow, prism, ring, strut } from './kit';
import { Tower3D, turn, type FireEvent, type Stage } from './core';
import { InspectorCute } from './inspector-cute';
import { InspectorRobot } from './inspector-robot';

export { Tower3D, type FireEvent, type Stage };
export type InspectorVariant = 'cute' | 'robot';

/* ============================================================= RATE LIMITER */
/*
 * Mk I  GATE        drum + iris (slow)
 * Mk II CLAMP       clamp arms grip the drum (stronger slow), more blades,
 *                   core on a short collar that lifts when hostiles enter
 * Mk III CHOKEPOINT the clamp blocks extend into pylons (range), solid collar
 *                   ring on top of them, stacked drums, telescoping pedestal
 */
export class RateLimiter extends Tower3D {
  private blades: THREE.Group[] = [];
  private pedestal: THREE.Mesh[] = [];
  private core: THREE.Mesh;
  private coreBaseY: number;
  private coreRise: number;
  private field: THREE.Mesh;
  private open = 0;

  constructor(readonly tier: 1 | 2 | 3) {
    super();
    const col = ROLE.sup;
    const coreMat = this.addGlow(col, 0.6, 3.4);
    const trim = this.addGlow(col, 0.2, 1.8);
    const bladeMat = new THREE.MeshStandardMaterial({ color: '#2a2638', metalness: 0.7, roughness: 0.3 });
    this.base(col, 0.45 + tier * 0.12, 0.26 + tier * 0.07);
    this.range = [1.8, 2.1, 2.4][tier - 1];
    const r = this.root;
    let top: number, irisR: number;

    if (tier === 1) {
      at(cyl(0.23, 0.12, MAT.body), 0, 0, 0, r);
      top = 0.12; irisR = 0.19;
    } else if (tier === 2) {
      at(cyl(0.36, 0.05, MAT.dark), 0, 0, 0, r);
      at(cyl(0.25, 0.17, MAT.body), 0, 0.05, 0, r);
      at(ring(0.252, 0.01, trim), 0, 0.11, 0, r);
      top = 0.22; irisR = 0.21;
    } else {
      at(prism(8, 0.46, 0.06, MAT.dark), 0, 0, 0, r);
      at(cyl(0.31, 0.13, MAT.body), 0, 0.06, 0, r);
      at(ring(0.312, 0.011, trim), 0, 0.125, 0, r);
      at(cyl(0.25, 0.13, MAT.plate), 0, 0.19, 0, r);
      top = 0.32; irisR = 0.21;
    }
    // vent slits around the front of the drum (Mk II+)
    if (tier >= 2) {
      const dr = 0.25, vy = tier === 2 ? 0.12 : 0.22;
      for (let i = 0; i < 9; i++) { const a = -1.1 + (i * 2.2) / 8; const v = at(box(0.016, 0.06, 0.012, MAT.well, 0.003), Math.sin(a) * (dr + 0.002), vy, Math.cos(a) * (dr + 0.002), r); v.rotation.y = a; }
    }
    // clamp blocks at the four diagonals: short at Mk II, extended into pylons at Mk III
    if (tier >= 2) {
      const R = tier === 2 ? 0.3 : 0.38, h = tier === 2 ? 0.25 : 0.56, y0 = tier === 2 ? 0.05 : 0.06;
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        const g = at(new THREE.Group(), Math.sin(a) * R, y0, Math.cos(a) * R, r);
        g.rotation.y = a;
        at(box(0.09, h, 0.09, MAT.heavy, 0.012), 0, 0, 0, g);
        // jaw reaching in to grip the drum rim
        const jawY = tier === 2 ? h - 0.04 : 0.26;
        at(box(0.06, 0.04, 0.12, MAT.heavy, 0.008), 0, jawY, -0.08, g);
        at(box(0.016, h * 0.7, 0.008, trim, 0.003), 0, h * 0.15, 0.047, g);
      }
      if (tier === 3) { // solid collar resting on the pylon tops
        at(ring(0.38, 0.04, MAT.heavy, 48), 0, 0.62 + 0.04, 0, r);
        at(ring(0.38, 0.014, trim, 48), 0, 0.62 + 0.085, 0, r);
      }
    }
    // iris: housing ring and blades that sweep open as the tower wakes up
    at(ring(irisR, 0.022, MAT.heavy), 0, top + 0.01, 0, r);
    const n = [6, 8, 10][tier - 1];
    for (let i = 0; i < n; i++) {
      const g = at(new THREE.Group(), 0, top + 0.012, 0, r);
      g.rotation.y = (i / n) * Math.PI * 2;
      const pivot = at(new THREE.Group(), 0, 0, irisR * 0.92, g);
      const blade = at(box(irisR * 0.5, 0.008, irisR * 0.95, bladeMat, 0.002), irisR * 0.18, 0, -irisR * 0.45, pivot);
      blade.castShadow = false;
      this.blades.push(pivot);
    }
    // core on a pedestal that rises with the alert (telescoping at Mk III)
    this.coreBaseY = top + 0.02;
    this.coreRise = [0.03, 0.12, 0.34][tier - 1];
    const segs = [1, 1, 3][tier - 1];
    for (let i = 0; i < segs; i++) { const p = at(cyl(0.05 - i * 0.012, 0.13, i ? MAT.heavy : MAT.plate), 0, this.coreBaseY - 0.13, 0, r); this.pedestal.push(p); }
    this.core = at(new THREE.Mesh(new THREE.SphereGeometry([0.035, 0.045, 0.055][tier - 1], 16, 12), coreMat), 0, this.coreBaseY + 0.03, 0, r);
    // the slowing field on the ground
    this.field = new THREE.Mesh(new THREE.RingGeometry(this.range - 0.05, this.range, 64), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.field.rotation.x = -Math.PI / 2;
    this.field.position.y = 0.006;
    r.add(this.field);
  }

  protected animate(dt: number, t: number, _targets: THREE.Vector3[]): void {
    this.open += (this.alert - this.open) * Math.min(1, dt * 3);
    const breathe = 0.08 * Math.sin(t * 1.4 + this.phase) * (1 - this.alert);
    for (const p of this.blades) p.rotation.y = -0.15 - (this.open * 0.9 + breathe);
    const rise = this.coreRise * this.open;
    this.pedestal.forEach((p, i) => { p.position.y = this.coreBaseY - 0.13 + rise * ((i + 1) / this.pedestal.length); });
    this.core.position.y = this.coreBaseY + 0.03 + rise + Math.sin(t * 3 + this.phase) * 0.006 * this.alert;
    const m = this.field.material as THREE.MeshBasicMaterial;
    m.opacity = this.alert * (0.3 + 0.2 * Math.sin(t * 4));
  }
}

/* ================================================================== SANDBOX */
/*
 * Mk I  CELL        containment box with a core in a well
 * Mk II VAULT       reinforced: plate, bands, four corner pillars (bigger payload), sliding lid
 * CLUSTER I         each pillar grows a containment pod, piped to the vault (4 bomblets = 4 pods)
 * CLUSTER II        pods become reinforced chambers, two more pillars+pods (6 bomblets = 6 pods)
 * REMOTE I          rear mount + relay mast braced to the back pillars, tracking dish (range)
 * REMOTE II         the four pillars extend into the legs of a lattice uplink with a big dish
 */
export class Sandbox extends Tower3D {
  private core: THREE.Mesh;
  private coreY: number;
  private coreRise: number;
  private lids: THREE.Mesh[] = [];
  private lidX = 0;
  private minis: THREE.Mesh[] = [];
  private dishYaw: THREE.Group | null = null;
  private dishPitch: THREE.Group | null = null;
  private beacon: THREE.MeshStandardMaterial | null = null;
  private yaw = 0;

  constructor(readonly stage: Exclude<Stage, 'mk3'>) {
    super();
    const col = ROLE.area;
    const coreMat = this.addGlow(col, 0.6, 3.2);
    const trim = this.addGlow(col, 0.22, 1.6);
    const big = stage !== 'mk1';
    this.base(col, big ? 0.75 : 0.5, big ? 0.42 : 0.28);
    this.range = stage.startsWith('remote') ? (stage === 'remote2' ? 3.6 : 3.1) : 2.4;
    const r = this.root;

    if (!big) {
      at(box(0.42, 0.2, 0.36, MAT.body, 0.02), 0, 0, 0, r);
      at(box(0.26, 0.02, 0.22, MAT.well, 0.004), 0, 0.19, 0, r);
      this.coreY = 0.26; this.coreRise = 0.05;
      this.core = at(new THREE.Mesh(new THREE.OctahedronGeometry(0.055), coreMat), 0, this.coreY, 0, r);
      return;
    }

    const cluster2 = stage === 'cluster2', remote = stage.startsWith('remote');
    // plate grows to carry whatever the branch adds
    const plateW = cluster2 ? 0.92 : 0.7, plateD = remote ? 0.82 : 0.62, plateZ = remote ? -0.09 : 0;
    at(box(plateW, 0.05, plateD, MAT.dark, 0.01), 0, 0, plateZ, r);
    // vault body with reinforcing bands and a lit front strip
    at(box(0.5, 0.26, 0.44, MAT.body, 0.02), 0, 0.05, 0, r);
    for (const by of [0.11, 0.21]) at(box(0.508, 0.022, 0.448, MAT.dark, 0.006), 0, 0.05 + by - 0.05, 0, r);
    at(box(0.32, 0.016, 0.01, trim, 0.004), 0, 0.17, 0.222, r);
    // well, sliding lid, core
    at(box(0.3, 0.02, 0.26, MAT.well, 0.004), 0, 0.3, 0, r);
    for (const sx of [-1, 1]) { const lid = at(box(0.152, 0.022, 0.27, MAT.plate, 0.006), sx * 0.077, 0.31, 0, r); this.lids.push(lid); }
    this.coreY = 0.32; this.coreRise = remote ? 0.1 : 0.16;
    this.core = at(new THREE.Mesh(new THREE.OctahedronGeometry(0.07), coreMat), 0, this.coreY, 0, r);

    // pillars: four corners, plus two flank pillars at Cluster II
    const pillars: [number, number][] = [[-0.27, -0.23], [0.27, -0.23], [-0.27, 0.23], [0.27, 0.23]];
    if (cluster2) pillars.push([-0.42, 0], [0.42, 0]);
    const pillarH = 0.36;
    for (const [px, pz] of pillars) {
      at(box(0.1, pillarH, 0.1, MAT.heavy, 0.012), px, 0.05, pz, r);
      if (stage === 'mk2' || remote) at(box(0.06, 0.014, 0.06, trim, 0.004), px, 0.05 + pillarH, pz, r);
    }

    if (stage === 'cluster1' || cluster2) {
      // each pillar carries a containment pod, piped into the vault
      const s = cluster2 ? 0.17 : 0.13;
      for (const [px, pz] of pillars) {
        const py = 0.05 + pillarH;
        at(box(s, s * 0.75, s, cluster2 ? MAT.heavy : MAT.plate, 0.012), px, py, pz, r);
        if (cluster2) for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) at(box(0.025, s * 0.85, 0.025, MAT.fin, 0.004), px + qx * s * 0.48, py - 0.01, pz + qz * s * 0.48, r);
        at(box(s * 0.6, 0.012, s * 0.6, MAT.well, 0.003), px, py + s * 0.75 - 0.008, pz, r);
        const mini = at(new THREE.Mesh(new THREE.OctahedronGeometry(s * 0.2), coreMat), px, py + s * 0.75 + 0.02, pz, r);
        this.minis.push(mini);
        // pipe from the vault's top edge to the pod
        const vx = Math.sign(px) * 0.2 * (Math.abs(px) > 0.3 ? 1.1 : 1), vz = Math.sign(pz) * 0.17;
        const a = new THREE.Vector3(vx, 0.29, pz === 0 ? 0 : vz), b = new THREE.Vector3(px - Math.sign(px) * s * 0.4, py + s * 0.3, pz === 0 ? 0 : pz - Math.sign(pz) * s * 0.3);
        r.add(strut(a, b, cluster2 ? 0.024 : 0.018, MAT.heavy));
        r.add(strut(a, b, 0.008, trim));
      }
    }

    if (remote) {
      const two = stage === 'remote2';
      const mount = at(new THREE.Group(), 0, 0.05, -0.36, r);
      at(box(0.26, 0.14, 0.16, MAT.heavy, 0.012), 0, 0, 0, mount);
      let dishY: number, dishZ: number, dishR: number;
      if (!two) {
        // relay mast on its own reinforced mount, braced to the two back pillars
        at(cyl(0.032, 0.62, MAT.heavy), 0, 0.14, 0, mount);
        at(box(0.014, 0.5, 0.012, trim, 0.003), 0, 0.2, 0.033, mount);
        for (const sx of [-1, 1]) r.add(strut(new THREE.Vector3(0, 0.6, -0.36), new THREE.Vector3(sx * 0.27, 0.41, -0.23), 0.016, MAT.heavy));
        dishY = 0.05 + 0.14 + 0.62; dishZ = -0.36; dishR = 0.15;
      } else {
        // lattice uplink: the four pillars continue upward as its legs
        const topY = 1.02, tz = -0.08;
        const tops = [[-0.1, tz - 0.08], [0.1, tz - 0.08], [-0.1, tz + 0.08], [0.1, tz + 0.08]];
        const legs = pillars.slice(0, 4).map(([px, pz], i) => [new THREE.Vector3(px, 0.05 + pillarH, pz), new THREE.Vector3(tops[i][0], topY, tops[i][1])] as const);
        for (const [a, b] of legs) r.add(strut(a, b, 0.022, MAT.heavy));
        const lerp = (a: THREE.Vector3, b: THREE.Vector3, k: number) => a.clone().lerp(b, k);
        const sides: [number, number][] = [[0, 1], [2, 3], [0, 2], [1, 3]];
        for (const [i, j] of sides) for (const k of [0.15, 0.45]) {
          r.add(strut(lerp(legs[i][0], legs[i][1], k), lerp(legs[j][0], legs[j][1], k + 0.3), 0.009, MAT.fin));
          r.add(strut(lerp(legs[j][0], legs[j][1], k), lerp(legs[i][0], legs[i][1], k + 0.3), 0.009, MAT.fin));
        }
        at(box(0.3, 0.05, 0.26, MAT.heavy, 0.01), 0, topY, tz, r);
        r.add(strut(new THREE.Vector3(0, 0.33, -0.1), new THREE.Vector3(0, topY, tz), 0.01, trim)); // power conduit up the frame
        this.beacon = glow(ROLE.hot, 1);
        at(new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), this.beacon), 0.12, topY + 0.07, tz - 0.1, r);
        at(cyl(0.008, 0.05, MAT.fin), 0.12, topY + 0.02, tz - 0.1, r);
        dishY = topY + 0.05; dishZ = tz; dishR = 0.25;
      }
      // tracking dish: yaw ring, pitch hinge, reflector, feed horn
      this.dishYaw = at(new THREE.Group(), 0, dishY, dishZ, r);
      at(cyl(0.05, 0.03, MAT.heavy), 0, 0, 0, this.dishYaw);
      this.dishPitch = at(new THREE.Group(), 0, 0.06, 0, this.dishYaw);
      const refl = new THREE.Mesh(new THREE.SphereGeometry(dishR, 28, 10, 0, Math.PI * 2, 0, 0.75), MAT.plate);
      refl.material = new THREE.MeshStandardMaterial({ color: '#3a434e', metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide });
      refl.rotation.x = -Math.PI / 2;
      refl.position.z = dishR * 0.95;
      refl.castShadow = true;
      this.dishPitch.add(refl);
      this.dishPitch.add(strut(new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(0, 0, dishR * 0.75), 0.008, MAT.fin));
      at(new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), coreMat), 0, 0, dishR * 0.78, this.dishPitch);
      this.dishPitch.rotation.x = -0.45;
    }
  }

  protected animate(dt: number, t: number, targets: THREE.Vector3[]): void {
    const target = targets[0] ?? null;
    // lid slides open, core lifts out of the well, pod cores lift too
    this.lidX += (this.alert - this.lidX) * Math.min(1, dt * 4);
    this.lids.forEach((l, i) => { l.position.x = (i ? 1 : -1) * (0.077 + this.lidX * 0.13); });
    this.core.position.y = this.coreY + this.coreRise * this.alert + Math.sin(t * 2 + this.phase) * 0.008;
    this.core.rotation.y += dt * (0.6 + this.alert * 3);
    this.minis.forEach((m, i) => { m.position.y += ((m.userData.y0 ??= m.position.y) + 0.04 * this.alert - m.position.y) * Math.min(1, dt * 5); m.rotation.y += dt * (1 + this.alert * 4 + i * 0.1); });
    if (this.dishYaw && this.dishPitch) {
      const want = target ? this.yawTo(this.dishYaw, target) : Math.sin(t * 0.35 + this.phase) * 0.9 + Math.PI;
      this.yaw = turn(this.yaw, want, target ? 3 : 0.6, dt);
      this.dishYaw.rotation.y = this.yaw;
      this.dishPitch.rotation.x = -0.45 - 0.25 * this.alert;
    }
    if (this.beacon) this.beacon.emissiveIntensity = Math.sin(t * 3) > 0.6 ? 3 : 0.2;
    if (target && this.alert > 0.8 && this.cooldown <= 0) {
      this.cooldown = this.stage === 'cluster2' ? 1.5 : this.stage.startsWith('remote') ? 2.2 : 1.8;
      this.flash = 1;
      this.onFire?.({ from: this.core.getWorldPosition(new THREE.Vector3()), to: target.clone(), kind: 'isolate', color: ROLE.area });
    }
  }
}

export function buildTower(kind: 'inspector' | 'limiter' | 'sandbox', stage: Stage, variant: InspectorVariant = 'cute'): Tower3D {
  const tier = (stage === 'mk1' ? 1 : stage === 'mk2' ? 2 : 3) as 1 | 2 | 3;
  if (kind === 'inspector') return variant === 'robot' ? new InspectorRobot(tier) : new InspectorCute(tier);
  if (kind === 'limiter') return new RateLimiter(tier);
  return new Sandbox(stage as Exclude<Stage, 'mk3'>);
}
