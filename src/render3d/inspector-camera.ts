/**
 * Inspector, design A: round 5's camera on a yoke, made coherent.
 *
 * Mk I is round 5's Probe unchanged. Round 5's problems were fixed without
 * changing its look: Mk II no longer becomes a bigger camera on a tall body (it
 * keeps Mk I's camera and base and bolts round 5's Mk II modules onto them),
 * and Mk III stays gunmetal and builds on Mk II, with round eye-pods instead of
 * hexagon drones. Personality is round 5's: nervous snap-glances with
 * double-takes, a hard lock with the iris closing down to focus.
 *
 * Mk I  PROBE     camera, yoke, lens                                 (round 5)
 * Mk II SENTINEL  + hood, longer focusing barrel with a focus ring (damage),
 *                 heat sinks on the base (rate), status band, a side eye-pod
 * Mk III ARRAY    + multi-element lens, telephoto collar, cheek armor, lit seams,
 *                 coolant lines, antenna, skirt plate; three eye-pods that fly
 */
import * as THREE from 'three';
import { GEN, ROLE, at, axle, barrel, box, cyl, hexFlat, hexX, joint, ring } from './kit';
import { FIELD_STYLE, LightField } from './field';
import { EyePods } from './pods';
import { Spring, Tower3D, tmp, wrap } from './core';

export class InspectorCamera extends Tower3D {
  private yawG = new THREE.Group();
  private pitchG = new THREE.Group();
  private yaw = new Spring();
  private pitch = new Spring();
  private gaze = 0;
  private gazePitch = 0;
  private nextGlance = 0;
  private lensTip = new THREE.Object3D();
  private irises: THREE.Object3D[] = [];
  private focusRing: THREE.Object3D | null = null;
  private focus = 0;
  private field: LightField;
  private tick = 0;
  private pods: EyePods;

  constructor(readonly tier: 1 | 2 | 3) {
    super();
    const col = ROLE.dmg;
    const lensMat = this.addGlow(col, 0.6, 3.6);
    const ledMat = this.addGlow(col, 0.35, 2.2);
    const seamMat = this.addGlow(col, 0.25, 1.2);
    this.base(col, 0.45 + tier * 0.06, 0.26);
    this.range = [2.4, 2.8, 3.2][tier - 1];
    this.field = new LightField(col, FIELD_STYLE[(['mk1', 'mk2', 'mk3'] as const)[tier - 1]]);
    this.root.add(this.field.group);
    this.pods = new EyePods(this, lensMat, tier === 3 ? seamMat : null);
    const r = this.root, T = tier;

    // base and turntable (round 5's Probe; same at every tier)
    if (T === 3) joint(at(hexX(0.26, 0.02, GEN.gunmetalDark), 0, 0, 0, r));
    at(hexX(0.2, 0.06, GEN.gunmetal), 0, 0, 0, r);
    joint(at(hexX(0.205, 0.012, GEN.trim), 0, 0.048, 0, r));
    if (T >= 2) {
      joint(at(hexX(0.203, 0.008, ledMat), 0, 0.026, 0, r));
      const flat = hexFlat(0.2);
      for (const sx of [-1, 1]) {
        at(box(0.03, 0.05, 0.12, GEN.armor, 0.006), sx * (flat + 0.015), 0.004, 0, r);
        for (let i = 0; i < 4; i++) at(box(0.05, 0.045, 0.01, GEN.fin, 0.003), sx * (flat + 0.03 + 0.025), 0.006, -0.045 + i * 0.03, r);
        if (T === 3) joint(at(box(0.005, 0.044, 0.005, seamMat, 0.002), sx * (flat + 0.015), 0.008, 0.062, r));
      }
    }
    at(cyl(0.065, 0.04, GEN.trim), 0, 0.06, 0, r);

    // yoke
    at(this.yawG, 0, 0.1, 0, r);
    at(box(0.222, 0.025, 0.06, GEN.gunmetal, 0.006), 0, 0, 0, this.yawG);
    for (const sx of [-1, 1]) at(box(0.022, 0.15, 0.06, GEN.gunmetal, 0.006), sx * 0.122, 0, 0, this.yawG);

    // camera on its pitch axle
    at(this.pitchG, 0, 0.1, 0, this.yawG);
    at(box(0.2, 0.12, 0.17, GEN.armor, 0.014), 0, -0.06, 0, this.pitchG);
    joint(at(axle(0.018, 0.26, GEN.trim), 0, 0, 0, this.pitchG));
    joint(at(box(0.05, 0.012, 0.012, ledMat, 0.003), -0.05, 0.035, -0.086, this.pitchG));
    // lens: barrel (longer from Mk II), glass, iris
    const front = 0.085, br = 0.048, blen = T === 1 ? 0.07 : 0.1;
    at(barrel(br, blen, GEN.gunmetalDark), 0, 0, front, this.pitchG);
    joint(at(barrel(br * 0.8, 0.012, lensMat), 0, 0, front + blen - 0.008, this.pitchG));
    this.irises.push(joint(at(ring(br * 0.62, br * 0.12, GEN.rubber), 0, 0, front + blen + 0.006, this.pitchG)));
    at(this.lensTip, 0, 0, front + blen + 0.01, this.pitchG);
    if (T >= 2) {
      at(box(0.16, 0.02, 0.1, GEN.armor, 0.005), 0, 0.06, 0.035, this.pitchG); // hood
      this.focusRing = joint(at(ring(br + 0.004, 0.009, GEN.trim), 0, 0, front + blen * 0.62, this.pitchG));
      // side eye-pod on an arm off the right yoke plate
      if (T === 2) {
        at(box(0.05, 0.022, 0.03, GEN.armor, 0.005), 0.133 + 0.025, 0.1, 0, this.yawG);
        this.pods.add(this.yawG, new THREE.Vector3(0.133 + 0.05 + 0.03, 0.1, 0), new THREE.Vector3(1, 0, 0), 0.03, false);
      }
    }
    if (T === 3) {
      // multi-element lens: a second inner element and a telephoto collar with a lit seam
      joint(at(ring(br + 0.01, 0.012, GEN.gunmetal), 0, 0, front + blen * 0.25, this.pitchG));
      joint(at(ring(br + 0.011, 0.003, seamMat), 0, 0, front + blen * 0.25 + 0.012, this.pitchG));
      this.irises.push(joint(at(ring(br * 0.36, br * 0.08, GEN.rubber), 0, 0, front + blen + 0.008, this.pitchG)));
      // thin cheek armor (fits the gap to the yoke) with lit seams
      for (const sx of [-1, 1]) {
        at(box(0.006, 0.1, 0.13, GEN.gunmetal, 0.002), sx * 0.103, -0.05, -0.005, this.pitchG);
        joint(at(box(0.003, 0.06, 0.005, seamMat, 0.001), sx * 0.1065, -0.03, 0.05, this.pitchG));
      }
      joint(at(box(0.12, 0.004, 0.005, seamMat, 0.001), 0, 0.058, -0.086, this.pitchG));
      at(cyl(0.006, 0.09, GEN.trim), 0.06, 0.06, -0.05, this.pitchG);
      at(new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), seamMat), 0.06, 0.155, -0.05, this.pitchG);
      // three flying eye-pods: cups on both yoke plates and on top of the camera
      for (const sx of [-1, 1]) this.pods.add(this.yawG, new THREE.Vector3(sx * (0.133 + 0.03), 0.09, 0), new THREE.Vector3(sx, 0, 0), 0.03, true);
      this.pods.add(this.pitchG, new THREE.Vector3(-0.04, 0.06 + 0.008, -0.03), new THREE.Vector3(0, 1, 0), 0.03, true);
    }
  }

  protected animate(dt: number, t: number, targets: THREE.Vector3[]): void {
    const target = targets[0] ?? null;
    this.locks.length = 0;
    const root = this.root.position;
    // round 5's gaze: nervous snap-glances with double-takes when idle, a hard lock when alert
    if (target) {
      this.gaze = Math.atan2(target.x - root.x, target.z - root.z);
      this.yawG.getWorldPosition(tmp);
      this.gazePitch = Math.atan2(tmp.y + 0.1 - target.y, Math.hypot(target.x - tmp.x, target.z - tmp.z));
    } else if (t >= this.nextGlance) {
      const double = Math.random() < 0.3;
      this.gaze = (Math.random() * 2 - 1) * 1.35;
      this.gazePitch = -0.1 + Math.random() * 0.35;
      this.nextGlance = t + (double ? 0.18 + Math.random() * 0.15 : 0.6 + Math.random() * 1.3);
    }
    const [k, c] = target ? [420, 30] : [170, 13];
    this.yawG.rotation.y = this.yaw.step(this.gaze, k, c, dt);
    this.pitchG.rotation.x = this.pitch.step(this.gazePitch, k * 0.8, c, dt, false);
    const locked = !!target && Math.abs(wrap(this.gaze - this.yaw.x)) < 0.14;
    this.focus += ((locked ? 1 : 0) - this.focus) * Math.min(1, dt * 8);
    for (const ir of this.irises) ir.scale.setScalar(1 - this.focus * 0.45);
    if (this.focusRing) this.focusRing.rotation.z += dt * this.focus * 6;

    this.field.intensity += ((locked ? 1 : 0) - this.field.intensity) * Math.min(1, dt * (locked ? 5 : 4));
    const eyePos = this.lensTip.getWorldPosition(new THREE.Vector3()).sub(root);
    this.field.update(eyePos, target ? tmp.copy(target).sub(root) : eyePos, t);
    if (locked && target) {
      this.locks.push(target);
      this.tick -= dt;
      if (this.tick <= 0 && this.field.intensity > 0.6) {
        this.tick = [0.32, 0.25, 0.19][this.tier - 1];
        this.flash = 0.4;
        this.onFire?.({ from: eyePos.clone().add(root), to: target.clone(), kind: 'field', color: ROLE.dmg, tier: this.tier });
      }
    }
    this.pods.update(dt, t, targets, this.yawG.rotation.y);
  }
}
