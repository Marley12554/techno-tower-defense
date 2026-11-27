// Round 5 tower models (Inspector camera-on-yoke), kept only for comparison in the Tower Lab.
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
import { GEN, MAT, ROLE, at, axle, barrel, box, contactShadow, cyl, glow, hexFlat, hexX, joint, lightPool, prism, ring, strut } from '../kit';

const ring_ = ring;

export type Stage = 'mk1' | 'mk2' | 'mk3' | 'cluster1' | 'cluster2' | 'remote1' | 'remote2';

export interface FireEvent { from: THREE.Vector3; to: THREE.Vector3; kind: 'beam' | 'isolate'; color: THREE.Color }

const tmp = new THREE.Vector3();

function wrap(a: number): number { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
/** Turns `cur` toward `want` at up to `rate` rad/s. */
function turn(cur: number, want: number, rate: number, dt: number): number {
  const d = wrap(want - cur);
  const s = rate * dt;
  return cur + Math.max(-s, Math.min(s, d));
}

interface GlowRef { mat: THREE.MeshStandardMaterial; idle: number; active: number }

export abstract class Tower3D {
  readonly root = new THREE.Group();
  /** 0 = idle, 1 = fully alert. Eased, so states blend. */
  alert = 0;
  range = 2.2;
  onFire: ((e: FireEvent) => void) | null = null;
  /** World positions this tower is currently locked onto (the lab draws target brackets). */
  locks: THREE.Vector3[] = [];
  protected glows: GlowRef[] = [];
  protected pool!: THREE.Mesh;
  protected cooldown = 0;
  protected phase = Math.random() * 10;
  protected flash = 0;

  protected addGlow(color: THREE.Color, idle: number, active: number): THREE.MeshStandardMaterial {
    const mat = glow(color, idle);
    this.glows.push({ mat, idle, active });
    return mat;
  }

  protected base(color: THREE.Color, poolR: number, shadowR: number): void {
    this.pool = lightPool(color, poolR);
    this.root.add(this.pool, contactShadow(shadowR));
  }

  /** `targets`: world positions of hostiles in range and in sight, nearest first. */
  update(dt: number, t: number, targets: THREE.Vector3[]): void {
    const want = targets.length ? 1 : 0;
    this.alert += (want - this.alert) * Math.min(1, dt * (want ? 5 : 1.6));
    this.flash = Math.max(0, this.flash - dt * 6);
    for (const g of this.glows) g.mat.emissiveIntensity = g.idle + (g.active - g.idle) * this.alert + this.flash * g.active * 0.6;
    (this.pool.material as THREE.MeshBasicMaterial).opacity = 0.05 + this.alert * 0.16 + this.flash * 0.08;
    this.animate(dt, t, targets);
    this.cooldown -= dt;
  }

  /** Yaw (around +Y) from a local point toward a world target. */
  protected yawTo(obj: THREE.Object3D, target: THREE.Vector3): number {
    obj.getWorldPosition(tmp);
    return Math.atan2(target.x - tmp.x, target.z - tmp.z) - this.root.rotation.y;
  }

  protected abstract animate(dt: number, t: number, targets: THREE.Vector3[]): void;
}

/** Underdamped spring: snaps toward the goal with a little overshoot (the Inspector's twitchy gaze). */
class Spring {
  v = 0;
  constructor(public x = 0) {}
  step(goal: number, k: number, c: number, dt: number, angular = true): number {
    const err = angular ? wrap(goal - this.x) : goal - this.x;
    this.v += (k * err - c * this.v) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

/* ================================================================ INSPECTOR */
/*
 * Personality: nervous, hyper-vigilant. Idle it doesn't sweep, it glances: snaps
 * to a spot, holds, snaps elsewhere, sometimes double-takes. Alert it locks hard,
 * the lens focuses (iris closes), and it fires in short bursts.
 *
 * Mk I  PROBE     gen 1: a mechanical camera on a yoke, one lens
 * Mk II SENTINEL  gen 1: the same camera armored, hooded, longer focusing barrel
 *                 (damage), heat sinks (fire rate), first side sensor pod
 * Mk III ARRAY    gen 2, new technology: ceramic and glass; the camera becomes a
 *                 compound-eye sensor dome with a scan band; the heat sinks evolve
 *                 into liquid-cooled exchange panels; the side pod becomes three
 *                 drones that dock on the plinth and lift off on tethers when alert
 */
interface Drone { g: THREE.Group; dock: THREE.Vector3; lift: number; yaw: Spring; tether: THREE.Mesh; lens: THREE.Object3D; cd: number }

export class Inspector extends Tower3D {
  private yawG = new THREE.Group();
  private pitchG = new THREE.Group();
  private yaw = new Spring();
  private pitch = new Spring();
  private gaze = 0;
  private gazePitch = 0;
  private nextGlance = 0;
  private lensTip = new THREE.Object3D();
  private iris: THREE.Object3D | null = null;
  private focusRing: THREE.Object3D | null = null;
  private scanBand: THREE.Object3D | null = null;
  private pod: { g: THREE.Group; yaw: Spring; gaze: number } | null = null;
  private drones: Drone[] = [];
  private burstLeft = 0;
  private burstT = 0;
  private focus = 0;

  constructor(readonly tier: 1 | 2 | 3) {
    super();
    const col = ROLE.dmg;
    const lensMat = this.addGlow(col, 0.6, 3.6);
    const ledMat = this.addGlow(col, 0.35, 2.2);
    this.base(col, 0.4 + tier * 0.14, 0.24 + tier * 0.08);
    this.range = [2.4, 2.8, 3.2][tier - 1];
    if (tier === 1) this.buildProbe(lensMat, ledMat);
    else if (tier === 2) this.buildSentinel(lensMat, ledMat);
    else this.buildArray(lensMat, this.addGlow(col, 0.25, 1.1));
  }

  /** Lens assembly on the camera body's front face (z = front). Records the tip for beams. */
  private lens(front: number, barrelR: number, barrelLen: number, lensMat: THREE.Material, parent: THREE.Object3D, ring = false): void {
    at(barrel(barrelR, barrelLen, GEN.gunmetalDark), 0, 0, front, parent);
    if (ring) { this.focusRing = joint(at(ring_(barrelR + 0.004, 0.009, GEN.trim), 0, 0, front + barrelLen * 0.62, parent)); }
    joint(at(barrel(barrelR * 0.8, 0.012, lensMat), 0, 0, front + barrelLen - 0.008, parent));
    this.iris = joint(at(ring_(barrelR * 0.62, barrelR * 0.12, GEN.rubber), 0, 0, front + barrelLen + 0.006, parent));
    at(this.lensTip, 0, 0, front + barrelLen + 0.01, parent);
  }

  private buildProbe(lensMat: THREE.Material, ledMat: THREE.Material): void {
    const r = this.root;
    at(hexX(0.2, 0.06, GEN.gunmetal), 0, 0, 0, r);
    joint(at(hexX(0.205, 0.012, GEN.trim), 0, 0.048, 0, r));
    at(cyl(0.065, 0.04, GEN.trim), 0, 0.06, 0, r);
    at(this.yawG, 0, 0.1, 0, r);
    // yoke: bottom bar between two side plates
    at(box(0.222, 0.025, 0.06, GEN.gunmetal, 0.006), 0, 0, 0, this.yawG);
    for (const sx of [-1, 1]) at(box(0.022, 0.15, 0.06, GEN.gunmetal, 0.006), sx * 0.122, 0, 0, this.yawG);
    // camera on a pitch axle
    at(this.pitchG, 0, 0.1, 0, this.yawG);
    at(box(0.2, 0.12, 0.17, GEN.armor, 0.014), 0, -0.06, 0, this.pitchG);
    joint(at(axle(0.018, 0.26, GEN.trim), 0, 0, 0, this.pitchG));
    joint(at(box(0.05, 0.012, 0.012, ledMat, 0.003), -0.05, 0.035, -0.086, this.pitchG));
    this.lens(0.085, 0.048, 0.07, lensMat, this.pitchG);
  }

  private buildSentinel(lensMat: THREE.Material, ledMat: THREE.Material): void {
    const r = this.root;
    at(hexX(0.3, 0.05, GEN.gunmetalDark), 0, 0, 0, r);
    at(hexX(0.24, 0.16, GEN.gunmetal), 0, 0.05, 0, r);
    joint(at(hexX(0.246, 0.016, GEN.trim), 0, 0.195, 0, r));
    joint(at(hexX(0.243, 0.01, ledMat), 0, 0.12, 0, r));
    // heat sinks bolted to the two side flats (fire rate)
    const flat = hexFlat(0.24);
    for (const sx of [-1, 1]) {
      at(box(0.04, 0.13, 0.15, GEN.armor, 0.008), sx * (flat + 0.02), 0.065, 0, r);
      for (let i = 0; i < 5; i++) at(box(0.08, 0.12, 0.012, GEN.fin, 0.003), sx * (flat + 0.04 + 0.04), 0.07, -0.06 + i * 0.03, r);
    }
    at(cyl(0.1, 0.035, GEN.trim), 0, 0.21, 0, r);
    at(this.yawG, 0, 0.245, 0, r);
    at(box(0.29, 0.035, 0.1, GEN.armor, 0.008), 0, 0, 0, this.yawG);
    for (const sx of [-1, 1]) at(box(0.03, 0.2, 0.09, GEN.armor, 0.008), sx * 0.16, 0, 0, this.yawG);
    at(this.pitchG, 0, 0.135, 0, this.yawG);
    at(box(0.26, 0.15, 0.22, GEN.gunmetal, 0.016), 0, -0.075, 0, this.pitchG);
    joint(at(axle(0.022, 0.33, GEN.trim), 0, 0, 0, this.pitchG));
    at(box(0.2, 0.025, 0.12, GEN.armor, 0.006), 0, 0.075, 0.05, this.pitchG); // hood
    joint(at(box(0.07, 0.014, 0.012, ledMat, 0.003), -0.06, 0.03, -0.112, this.pitchG));
    this.lens(0.11, 0.065, 0.1, lensMat, this.pitchG, true);
    // first side sensor pod, on an arm off the right yoke plate
    at(box(0.06, 0.03, 0.04, GEN.armor, 0.006), 0.205, 0.135, 0, this.yawG);
    const pod = at(new THREE.Group(), 0.27, 0.15, 0, this.yawG);
    at(box(0.07, 0.06, 0.08, GEN.gunmetal, 0.01), 0, -0.03, 0, pod);
    at(barrel(0.02, 0.035, GEN.gunmetalDark), 0, 0, 0.04, pod);
    joint(at(barrel(0.015, 0.008, lensMat), 0, 0, 0.07, pod));
    this.pod = { g: pod, yaw: new Spring(), gaze: 0 };
  }

  private buildArray(lensMat: THREE.Material, ledMat: THREE.Material): void {
    const r = this.root;
    // ceramic plinth with an inlaid light ring
    at(prism(8, 0.44, 0.06, GEN.ceramic), 0, 0, 0, r);
    joint(at(new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.005, 6, 8).rotateX(Math.PI / 2).rotateY(Math.PI / 8), ledMat), 0, 0.062, 0, r));
    // drone docks: three charging cradles
    const docks: THREE.Vector3[] = [];
    for (let k = 0; k < 3; k++) {
      const a = Math.PI + (k * Math.PI * 2) / 3;
      const p = new THREE.Vector3(Math.sin(a) * 0.33, 0.06, Math.cos(a) * 0.33);
      at(cyl(0.065, 0.025, GEN.ceramicEdge), p.x, p.y, p.z, r);
      joint(at(ring_(0.045, 0.005, ledMat), p.x, p.y + 0.026, p.z, r));
      docks.push(p.clone().setY(p.y + 0.027));
    }
    // body; the Mk II heat sinks have evolved into liquid-cooled exchange panels
    at(hexX(0.25, 0.14, GEN.ceramic), 0, 0.06, 0, r);
    joint(at(hexX(0.255, 0.012, GEN.ceramicEdge), 0, 0.19, 0, r));
    const flat = hexFlat(0.25);
    for (const sx of [-1, 1]) {
      at(box(0.03, 0.12, 0.16, GEN.ceramicEdge, 0.008), sx * (flat + 0.015), 0.07, 0, r);
      for (const z of [-0.05, 0, 0.05]) joint(at(box(0.005, 0.1, 0.01, ledMat, 0.002), sx * (flat + 0.032), 0.08, z, r));
    }
    // slim column with light inlays
    at(cyl(0.12, 0.2, GEN.ceramic), 0, 0.2, 0, r);
    for (const a of [-0.6, 0, 0.6]) joint(at(box(0.006, 0.17, 0.006, ledMat, 0.002), Math.sin(a) * 0.121, 0.215, Math.cos(a) * 0.121, r));
    at(cyl(0.13, 0.02, GEN.ceramicEdge), 0, 0.4, 0, r);
    // gimballed sensor dome with a compound eye and a sweeping scan band
    at(this.yawG, 0, 0.42, 0, r);
    at(cyl(0.1, 0.025, GEN.ceramicEdge), 0, 0, 0, this.yawG);
    for (const sx of [-1, 1]) at(box(0.025, 0.22, 0.06, GEN.ceramic, 0.008), sx * 0.168, 0.025, 0, this.yawG);
    at(this.pitchG, 0, 0.175, 0, this.yawG);
    const dome = at(new THREE.Mesh(new THREE.SphereGeometry(0.14, 32, 20), GEN.darkGlass), 0, 0, 0, this.pitchG);
    dome.castShadow = true;
    joint(at(axle(0.02, 0.34, GEN.ceramicEdge), 0, 0, 0, this.pitchG));
    const facets = [[0, 0], [0.3, 0], [-0.3, 0], [0.15, 0.26], [-0.15, 0.26], [0.15, -0.26], [-0.15, -0.26]];
    for (const [ax, ay] of facets) {
      const d = new THREE.Vector3(Math.sin(ax), Math.sin(ay), 1).normalize();
      for (const [rad, mat, out] of [[0.042, GEN.ceramicEdge, 0.131], [0.034, lensMat, 0.139]] as const) {
        const f = joint(new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 0.012, 6), mat));
        f.position.copy(d).multiplyScalar(out);
        f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
        this.pitchG.add(f);
      }
    }
    this.scanBand = joint(at(new THREE.Mesh(new THREE.TorusGeometry(0.146, 0.004, 6, 48), ledMat), 0, 0, 0, this.pitchG));
    at(this.lensTip, 0, 0, 0.15, this.pitchG);
    // emitter spike on the right fork
    at(cyl(0.008, 0.13, GEN.trim), 0.168, 0.245, 0, this.yawG);
    at(new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), ledMat), 0.168, 0.38, 0, this.yawG);
    // drones
    const tetherMat = new THREE.MeshBasicMaterial({ color: ROLE.dmg.clone().multiplyScalar(1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const dock of docks) {
      const g = at(new THREE.Group(), dock.x, dock.y, dock.z, r);
      at(hexX(0.05, 0.03, GEN.ceramic), 0, 0, 0, g);
      joint(at(hexX(0.034, 0.01, GEN.ceramicEdge), 0, 0.03, 0, g));
      joint(at(ring_(0.03, 0.006, ledMat), 0, 0.002, 0, g));
      const lens = at(new THREE.Object3D(), 0, 0.016, 0.078, g);
      at(barrel(0.014, 0.025, GEN.gunmetalDark), 0, 0.016, 0.049, g);
      joint(at(barrel(0.011, 0.006, lensMat), 0, 0.016, 0.07, g));
      const tether = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), tetherMat.clone());
      tether.castShadow = false;
      r.add(tether);
      this.drones.push({ g, dock, lift: 0, yaw: new Spring(), tether, lens, cd: Math.random() });
    }
  }

  protected animate(dt: number, t: number, targets: THREE.Vector3[]): void {
    const target = targets[0] ?? null;
    this.locks.length = 0;
    // gaze: glances while idle, hard lock when alert
    if (target) {
      this.gaze = this.yawTo(this.yawG, target);
      this.yawG.getWorldPosition(tmp);
      this.gazePitch = Math.atan2(tmp.y + 0.12 - target.y, Math.hypot(target.x - tmp.x, target.z - tmp.z));
    } else if (t >= this.nextGlance) {
      const double = Math.random() < 0.3;
      this.gaze = (Math.random() * 2 - 1) * 1.35;
      this.gazePitch = -0.1 + Math.random() * 0.35;
      this.nextGlance = t + (double ? 0.18 + Math.random() * 0.15 : 0.6 + Math.random() * 1.3);
    }
    const [k, c] = target ? [420, 30] : [170, 13];
    this.yawG.rotation.y = this.yaw.step(this.gaze, k, c, dt);
    this.pitchG.rotation.x = this.pitch.step(this.gazePitch, k * 0.8, c, dt, false);
    const onTarget = target && Math.abs(wrap(this.gaze - this.yaw.x)) < 0.12;
    if (onTarget) this.locks.push(target!);
    // focus: the iris closes down while locked, the focus ring turns
    this.focus += ((onTarget ? 1 : 0) - this.focus) * Math.min(1, dt * 8);
    if (this.iris) this.iris.scale.setScalar(1 - this.focus * 0.45);
    if (this.focusRing) this.focusRing.rotation.z += dt * this.focus * 6;
    if (this.scanBand) { this.scanBand.rotation.y = Math.sin(t * (target ? 4 : 1.4)) * 1.2; }
    // bursts
    if (onTarget && this.burstLeft === 0 && this.cooldown <= 0 && this.focus > 0.7) { this.burstLeft = [2, 3, 4][this.tier - 1]; this.burstT = 0; }
    if (this.burstLeft > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0 && target) {
        this.burstLeft--;
        this.burstT = 0.075;
        this.flash = 1;
        this.onFire?.({ from: this.lensTip.getWorldPosition(new THREE.Vector3()), to: target.clone(), kind: 'beam', color: ROLE.dmg });
        if (this.burstLeft === 0) this.cooldown = [0.9, 0.75, 0.6][this.tier - 1];
      } else if (!target) this.burstLeft = 0;
    }
    // Mk II side pod: its own glances when idle, follows the head's target when alert
    if (this.pod) {
      const p = this.pod;
      if (target) p.gaze = this.yawTo(p.g, target) - this.yaw.x;
      else if (Math.random() < dt * 0.8) p.gaze = (Math.random() * 2 - 1) * 1.2;
      p.g.rotation.y = p.yaw.step(p.gaze, 260, 18, dt);
    }
    // Mk III drones: lift off when alert, each watches a different hostile
    this.drones.forEach((d, i) => {
      d.lift += ((this.alert > 0.5 ? 1 : 0) - d.lift) * Math.min(1, dt * 1.8);
      const e = d.lift * d.lift * (3 - 2 * d.lift);
      const ang = Math.atan2(d.dock.x, d.dock.z) + Math.sin(t * 0.6 + i * 2.1) * 0.25 * e;
      const rad = 0.33 + 0.18 * e;
      d.g.position.set(Math.sin(ang) * rad, d.dock.y + e * (0.5 + 0.035 * Math.sin(t * 2.3 + i)), Math.cos(ang) * rad);
      const tg = targets.length ? targets[i % targets.length] : null;
      const want = tg ? this.yawTo(d.g, tg) : (e > 0.05 ? Math.sin(t * 0.9 + i * 2) * 1.5 : ang);
      d.g.rotation.y = d.yaw.step(want, 200, 16, dt);
      // tether from the dock to the drone
      const a = d.dock, b = d.g.position;
      d.tether.position.copy(a).add(b).multiplyScalar(0.5);
      d.tether.scale.set(1, Math.max(0.001, a.distanceTo(b)), 1);
      d.tether.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmp.copy(b).sub(a).normalize());
      (d.tether.material as THREE.MeshBasicMaterial).opacity = e > 0.05 ? e * (0.55 + 0.25 * Math.sin(t * 20 + i)) : 0;
      d.cd -= dt;
      if (tg && e > 0.9 && d.cd <= 0) {
        d.cd = 0.8 + Math.random() * 0.3;
        this.locks.push(tg);
        this.onFire?.({ from: d.lens.getWorldPosition(new THREE.Vector3()), to: tg.clone(), kind: 'beam', color: ROLE.dmg });
      }
    });
  }
}

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

export function buildTower(kind: 'inspector' | 'limiter' | 'sandbox', stage: Stage): Tower3D {
  const tier = (stage === 'mk1' ? 1 : stage === 'mk2' ? 2 : 3) as 1 | 2 | 3;
  if (kind === 'inspector') return new Inspector(tier);
  if (kind === 'limiter') return new RateLimiter(tier);
  return new Sandbox(stage as Exclude<Stage, 'mk3'>);
}
