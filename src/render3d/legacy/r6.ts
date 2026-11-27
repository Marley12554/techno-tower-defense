// Round 6 tower models (Inspector eye-in-a-socket), kept only for comparison in the Tower Lab.
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
import { GEN, MAT, ROLE, at, box, contactShadow, cyl, glow, hexFlat, hexX, joint, lightPool, prism, ring, strut } from '../kit';
import { FIELD_STYLE, LightField } from './r6-field';

const ring_ = ring;

export type Stage = 'mk1' | 'mk2' | 'mk3' | 'cluster1' | 'cluster2' | 'remote1' | 'remote2';

export interface FireEvent { from: THREE.Vector3; to: THREE.Vector3; kind: 'beam' | 'isolate' | 'field'; color: THREE.Color; tier?: number }

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
 * Personality: nervous and hyper-vigilant. A fixed armored body; the helmet head
 * turns slowly while the eye darts in its socket (eyes lead, the head follows).
 * Idle it is half-lidded, glancing and blinking; when a hostile shows up the
 * lids snap wide, then narrow into a focused squint while it casts its
 * inspection light field. The scan lines in the field wear the hostile down.
 *
 * One family across all tiers (gunmetal helmet on a hex body), each built on the last:
 * Mk I  PROBE     helmet, one eye in a socket, lids
 * Mk II SENTINEL  + armored body, heat sinks (rate), brow plate, mechanical iris
 *                 ring (damage), a spherical eye-pod docked in a cup on the helmet
 * Mk III ARRAY    + crown collar, glowing seams, double iris, liquid-cooled radiators;
 *                 the pod becomes three eye-pods that fly free and cast their own fields
 */
class Eye {
  readonly socket = new THREE.Group();
  readonly ball = new THREE.Group();
  readonly pupil = new THREE.Object3D();
  private upper = new THREE.Group();
  private lower = new THREE.Group();
  private irises: THREE.Mesh[] = [];
  yaw = new Spring();
  pitch = new Spring();
  open = 0.45;

  constructor(r: number, irisMat: THREE.Material, double: boolean) {
    joint(this.socket.add(ring_(r * 1.17, r * 0.2, GEN.gunmetalDark)).children[0]);
    this.socket.add(this.ball);
    const eyeMat = new THREE.MeshPhysicalMaterial({ color: '#0c1116', metalness: 0.2, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04 });
    joint(at(new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), eyeMat), 0, 0, 0, this.ball)).castShadow = true;
    const iris = joint(at(new THREE.Mesh(new THREE.TorusGeometry(r * 0.52, r * 0.13, 10, 36), irisMat), 0, 0, r * 0.84, this.ball));
    this.irises.push(iris);
    if (double) this.irises.push(joint(at(new THREE.Mesh(new THREE.TorusGeometry(r * 0.3, r * 0.08, 8, 28), irisMat), 0, 0, r * 0.95, this.ball)));
    joint(at(new THREE.Mesh(new THREE.CircleGeometry(r * 0.24, 24), new THREE.MeshBasicMaterial({ color: '#010203' })), 0, 0, r * 0.975, this.ball));
    joint(at(new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' })), r * 0.26, r * 0.28, r * 0.92, this.ball));
    at(this.pupil, 0, 0, r * 1.05, this.ball);
    // armored lids: caps of a slightly larger sphere that swing over the eye
    const lidMat = new THREE.MeshStandardMaterial({ color: '#46515d', metalness: 0.55, roughness: 0.32, side: THREE.DoubleSide });
    joint(at(new THREE.Mesh(new THREE.SphereGeometry(r * 1.1, 28, 12, 0, Math.PI * 2, 0, 1.25), lidMat), 0, 0, 0, this.upper)).castShadow = true;
    joint(at(new THREE.Mesh(new THREE.SphereGeometry(r * 1.08, 28, 10, 0, Math.PI * 2, Math.PI - 1.05, 1.05), lidMat), 0, 0, 0, this.lower)).castShadow = true;
    this.socket.add(this.upper, this.lower);
  }

  pose(dt: number, yaw: number, pitch: number, open: number, irisScale: number, fast: boolean): void {
    const [k, c] = fast ? [520, 34] : [230, 15];
    this.ball.rotation.y = this.yaw.step(Math.max(-0.75, Math.min(0.75, yaw)), k, c, dt);
    this.ball.rotation.x = this.pitch.step(Math.max(-0.5, Math.min(0.5, pitch)), k, c, dt, false);
    this.open += (open - this.open) * Math.min(1, dt * 22);
    this.upper.rotation.x = 0.62 + (-0.42 - 0.62) * this.open;
    this.lower.rotation.x = -0.5 + (0.25 + 0.5) * this.open;
    for (const ir of this.irises) ir.scale.setScalar(ir.scale.x + (irisScale - ir.scale.x) * Math.min(1, dt * 10));
    if (this.irises[1]) { this.irises[0].rotation.z += dt * 1.5; this.irises[1].rotation.z -= dt * 2.4; }
  }
}

interface EyePod { g: THREE.Group; cup: THREE.Object3D; yaw: Spring; pitch: Spring; lift: number; field: LightField | null; pupil: THREE.Object3D; tick: number; flies: boolean; gaze: number }

export class Inspector extends Tower3D {
  private head = new THREE.Group();
  private eye!: Eye;
  private headYaw = new Spring();
  private look = 0;
  private lookPitch = 0.1;
  private nextGlance = 0;
  private nextBlink = 2;
  private blinkT = -1;
  private surprise = 0;
  private searchUntil = 0;
  private hadTarget = false;
  private field: LightField;
  private tick = 0;
  private pods: EyePod[] = [];
  private irisRing: THREE.Object3D | null = null;

  constructor(readonly tier: 1 | 2 | 3) {
    super();
    const col = ROLE.dmg;
    const irisMat = this.addGlow(col, 0.9, 3.8);
    const seamMat = this.addGlow(col, 0.25, 1.3);
    this.base(col, 0.38 + tier * 0.14, 0.24 + tier * 0.08);
    this.range = [2.4, 2.8, 3.2][tier - 1];
    this.field = new LightField(col, FIELD_STYLE[(['mk1', 'mk2', 'mk3'] as const)[tier - 1]]);
    this.root.add(this.field.group);
    this.build(irisMat, seamMat);
  }

  private build(irisMat: THREE.Material, seamMat: THREE.Material): void {
    const r = this.root, T = this.tier;
    // body
    let neckY: number;
    if (T === 1) {
      at(hexX(0.2, 0.07, GEN.gunmetal), 0, 0, 0, r);
      joint(at(hexX(0.205, 0.012, GEN.trim), 0, 0.058, 0, r));
      neckY = 0.07;
    } else {
      const big = T === 3;
      const baseR = big ? 0.38 : 0.3, bodyR = big ? 0.29 : 0.24, bodyH = big ? 0.16 : 0.14;
      at(hexX(baseR, 0.05, GEN.gunmetalDark), 0, 0, 0, r);
      if (big) joint(at(hexX(baseR + 0.005, 0.012, GEN.trim), 0, 0.04, 0, r));
      at(hexX(bodyR, bodyH, GEN.gunmetal), 0, 0.05, 0, r);
      joint(at(hexX(bodyR + 0.006, 0.014, GEN.trim), 0, 0.05 + bodyH - 0.014, 0, r));
      for (const y of big ? [0.09, 0.15] : [0.11]) joint(at(hexX(bodyR + 0.003, 0.008, seamMat), 0, y, 0, r));
      // heat sinks on the side flats (Mk II), grown into liquid-cooled radiators (Mk III)
      const flat = hexFlat(bodyR), fins = big ? 7 : 5, bw = big ? 0.05 : 0.04, fh = big ? 0.12 : 0.1;
      for (const sx of [-1, 1]) {
        at(box(bw, fh + 0.01, big ? 0.18 : 0.15, GEN.armor, 0.008), sx * (flat + bw / 2), 0.06, 0, r);
        for (let i = 0; i < fins; i++) at(box(0.08, fh, 0.012, GEN.fin, 0.003), sx * (flat + bw + 0.04), 0.065, (big ? -0.075 : -0.06) + i * (big ? 0.025 : 0.03), r);
        if (big) joint(at(box(0.006, fh, 0.006, seamMat, 0.002), sx * (flat + bw / 2), 0.065, 0.092, r));
      }
      neckY = 0.05 + bodyH;
    }
    const neckR = [0.075, 0.1, 0.12][T - 1], neckH = [0.03, 0.03, 0.035][T - 1];
    at(cyl(neckR, neckH, GEN.trim), 0, neckY, 0, r);
    at(this.head, 0, neckY + neckH, 0, r);

    // helmet with the eye socket in its front, tilted up so the eye reads from above
    const hw = [0.22, 0.3, 0.36][T - 1], hh = [0.15, 0.19, 0.22][T - 1], hd = [0.2, 0.26, 0.3][T - 1];
    at(box(hw, hh, hd, GEN.armor, [0.05, 0.06, 0.07][T - 1]), 0, 0, 0, this.head);
    const eyeR = [0.052, 0.068, 0.082][T - 1];
    this.eye = new Eye(eyeR, irisMat, T === 3);
    at(this.eye.socket, 0, hh * 0.6, hd / 2 - eyeR * 0.45, this.head);
    this.eye.socket.rotation.x = -0.5;
    if (T >= 2) {
      // brow plate: gives it a heavier, watchful squint
      at(box(hw * 0.88, 0.035, 0.09, GEN.gunmetal, 0.01), 0, hh - 0.002, hd / 2 - 0.035, this.head);
      // mechanical iris ring around the socket (turns while it focuses)
      const ringG = new THREE.Group();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const b = joint(box(0.018, 0.012, 0.01, GEN.trim, 0.003)); b.position.set(Math.cos(a) * eyeR * 1.42, Math.sin(a) * eyeR * 1.42 - 0.006, 0); b.rotation.z = a; ringG.add(b); }
      this.eye.socket.add(ringG);
      this.irisRing = ringG;
    }
    if (T === 3) {
      joint(at(ring_(eyeR * 1.42, 0.02, GEN.trim), 0, 0, -0.005, this.eye.socket));
      joint(at(box(hw * 0.66, 0.006, 0.01, seamMat, 0.002), 0, hh - 0.016, hd / 2 + 0.012, this.head));
      for (const sx of [-1, 1]) {
        at(box(0.02, 0.1, 0.06, GEN.gunmetal, 0.005), sx * 0.1, hh, -hd * 0.32, this.head);
        at(new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), seamMat), sx * 0.1, hh + 0.105, -hd * 0.32, this.head);
      }
    }

    // spherical eye-pods in cups on the helmet: one at Mk II, three that fly at Mk III
    const cups: [number, number, number, 'side' | 'top'][] = T === 2 ? [[hw / 2 + 0.012, hh * 0.5, 0.02, 'side']]
      : T === 3 ? [[-(hw / 2 + 0.014), hh * 0.5, 0.02, 'side'], [hw / 2 + 0.014, hh * 0.5, 0.02, 'side'], [0, hh + 0.012, -hd * 0.08, 'top']] : [];
    for (const [cx, cy, cz, kind] of cups) {
      const podR = T === 3 ? 0.04 : 0.036;
      const cup = new THREE.Group();
      at(cup, cx, cy, cz, this.head);
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(podR * 1.22, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2a323b', metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }));
      if (kind === 'side') bowl.rotation.z = cx > 0 ? Math.PI / 2 : -Math.PI / 2;
      joint(bowl).castShadow = true;
      cup.add(bowl);
      const g = new THREE.Group();
      joint(at(new THREE.Mesh(new THREE.SphereGeometry(podR, 24, 16), GEN.armor), 0, 0, 0, g)).castShadow = true;
      joint(at(new THREE.Mesh(new THREE.SphereGeometry(podR * 0.66, 20, 12), GEN.darkGlass), 0, 0, podR * 0.5, g));
      joint(at(new THREE.Mesh(new THREE.TorusGeometry(podR * 0.36, podR * 0.1, 8, 24), irisMat), 0, 0, podR * 1.06, g));
      if (T === 3) joint(at(ring_(podR * 1.01, podR * 0.06, seamMat), 0, 0, 0, g));
      const pupil = at(new THREE.Object3D(), 0, 0, podR * 1.2, g);
      const flies = T === 3;
      if (flies) r.add(g); else cup.add(g);
      let field: LightField | null = null;
      field = new LightField(ROLE.dmg, FIELD_STYLE.drone);
      r.add(field.group);
      this.pods.push({ g, cup, yaw: new Spring(), pitch: new Spring(), lift: 0, field, pupil, tick: Math.random() * 0.4, flies, gaze: 0 });
    }
  }

  private local(o: THREE.Object3D, out = new THREE.Vector3()): THREE.Vector3 {
    return o.getWorldPosition(out).sub(this.root.position);
  }

  protected animate(dt: number, t: number, targets: THREE.Vector3[]): void {
    const target = targets[0] ?? null;
    this.locks.length = 0;
    const root = this.root.position;
    // where to look: the hostile, or a nervous glance somewhere
    if (target) {
      this.look = Math.atan2(target.x - root.x, target.z - root.z);
      this.lookPitch = 0.25;
      if (!this.hadTarget) this.surprise = 0.35; // lids snap wide on first sight
      this.searchUntil = t + 1.6;
    } else if (t >= this.nextGlance) {
      const searching = t < this.searchUntil;
      const double = Math.random() < 0.3;
      this.look = this.headYaw.x + (Math.random() * 2 - 1) * (searching ? 1.6 : 1.1);
      this.lookPitch = -0.15 + Math.random() * 0.4;
      this.nextGlance = t + (searching ? 0.25 + Math.random() * 0.25 : double ? 0.2 : 0.6 + Math.random() * 1.4);
    }
    this.hadTarget = !!target;
    // eyes lead, the head follows slowly
    this.head.rotation.y = this.headYaw.step(this.look, target ? 22 : 9, target ? 9 : 6, dt);
    const eyeYaw = wrap(this.look - this.head.rotation.y);
    this.surprise = Math.max(0, this.surprise - dt);
    // blinks: quick, sometimes doubled; not while focused
    if (!target && t >= this.nextBlink) { this.blinkT = 0; this.nextBlink = t + (Math.random() < 0.25 ? 0.3 : 2 + Math.random() * 3); }
    let open = target ? (this.surprise > 0 ? 1 : 0.6) : 0.45;
    if (this.blinkT >= 0) { this.blinkT += dt; open = this.blinkT < 0.07 ? 0 : open; if (this.blinkT > 0.14) this.blinkT = -1; }
    const locked = !!target && Math.abs(eyeYaw) < 0.75 && Math.abs(wrap(this.look - this.head.rotation.y - this.eye.yaw.x)) < 0.18;
    this.eye.pose(dt, eyeYaw, -this.lookPitch + 0.5, open, locked ? 0.72 : 1, !!target);
    if (this.irisRing) this.irisRing.rotation.z += dt * (locked ? 3 : 0.3);

    // the light field: on while locked, eased in and out
    this.field.intensity += ((locked ? 1 : 0) - this.field.intensity) * Math.min(1, dt * (locked ? 6 : 4));
    const eyePos = this.local(this.eye.pupil);
    if (target) this.field.update(eyePos, tmp.copy(target).sub(root), t); else this.field.update(eyePos, eyePos, t);
    if (locked && target) {
      this.locks.push(target);
      this.tick -= dt;
      if (this.tick <= 0 && this.field.intensity > 0.6) {
        this.tick = [0.3, 0.22, 0.16][this.tier - 1];
        this.flash = 0.5;
        this.onFire?.({ from: eyePos.clone().add(root), to: target.clone(), kind: 'field', color: ROLE.dmg, tier: this.tier });
      }
    }

    // eye-pods
    this.pods.forEach((p, i) => {
      const tg = targets.length ? targets[i % targets.length] : null;
      if (p.flies) {
        p.lift += ((this.alert > 0.5 ? 1 : 0) - p.lift) * Math.min(1, dt * 1.6);
        const e = p.lift * p.lift * (3 - 2 * p.lift);
        const dock = this.local(p.cup);
        const base = Math.atan2(dock.x, dock.z || 0.001) + (i - 1) * 0.5;
        const toward = tg ? Math.atan2(tg.x - root.x, tg.z - root.z) : base;
        const ang = toward + (i - 1) * 0.9 + Math.sin(t * 0.7 + i * 2) * 0.2;
        const hover = new THREE.Vector3(Math.sin(ang) * 0.58, 0.62 + 0.04 * Math.sin(t * 2.2 + i * 1.7), Math.cos(ang) * 0.58);
        p.g.position.lerpVectors(dock, hover, e);
      }
      const pp = this.local(p.g);
      let gy: number, gp: number;
      if (tg) { gy = Math.atan2(tg.x - root.x - pp.x, tg.z - root.z - pp.z); gp = Math.atan2(pp.y - tg.y, Math.hypot(tg.x - root.x - pp.x, tg.z - root.z - pp.z)); }
      else { if (Math.random() < dt * 0.9) p.gaze = this.head.rotation.y + (Math.random() * 2 - 1) * 1.4; gy = p.gaze; gp = 0.15; }
      const parentYaw = p.flies ? 0 : this.head.rotation.y;
      p.g.rotation.y = p.yaw.step(gy - parentYaw, 300, 20, dt);
      p.g.rotation.x = p.pitch.step(gp, 300, 20, dt, false);
      const aimed = !!tg && (!p.flies || p.lift > 0.85) && Math.abs(wrap(gy - parentYaw - p.yaw.x)) < 0.2;
      if (p.field) {
        p.field.intensity += ((aimed ? 1 : 0) - p.field.intensity) * Math.min(1, dt * 5);
        const from = this.local(p.pupil);
        p.field.update(from, tg ? tmp.copy(tg).sub(root) : from, t + i);
        p.tick -= dt;
        if (aimed && tg && p.tick <= 0 && p.field.intensity > 0.6) {
          p.tick = 0.45;
          this.onFire?.({ from: from.clone().add(root), to: tg.clone(), kind: 'field', color: ROLE.dmg, tier: 1 });
        }
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
