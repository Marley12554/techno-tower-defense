/**
 * Inspector, design A: the curious camera-bot.
 *
 * A small camera on a yoke whose big round lens is its eye. Curious and a bit
 * puppy-like: it tilts its head when it glances at something, its iris darts
 * around inside the lens, it blinks with two little shutter-lids, and when a
 * hostile appears it perks up with a bounce, leans in and casts its light field.
 *
 * The core body is the same size at every tier; tiers add modules around it:
 * Mk I  PROBE     camera, yoke, lens, shutters
 * Mk II SENTINEL  + focus ring (damage), heat sink packs (rate), status light,
 *                 a buddy eye-pod on an arm off the yoke
 * Mk III ARRAY    + telephoto collar, cheek armor, glowing seams, antenna,
 *                 three eye-pods that fly free
 */
import * as THREE from 'three';
import { GEN, ROLE, at, axle, box, cyl, hexFlat, hexX, joint, ring } from './kit';
import { FIELD_STYLE, LightField } from './field';
import { EyePods } from './pods';
import { Spring, Tower3D, tmp, wrap } from './core';

// One core size for every tier.
const BASE_R = 0.2, BASE_H = 0.07, CW = 0.24, CH = 0.16, CD = 0.2, LENS_R = 0.072;

export class InspectorCute extends Tower3D {
  private yawG = new THREE.Group();
  private pitchG = new THREE.Group();
  private irisG = new THREE.Group();
  private pupil = new THREE.Object3D();
  private upper = new THREE.Group();
  private lower = new THREE.Group();
  private focusRing: THREE.Object3D | null = null;
  private yaw = new Spring();
  private pitch = new Spring();
  private roll = new Spring();
  private hop = new Spring();
  private irisX = new Spring();
  private irisY = new Spring();
  private look = 0;
  private lookPitch = 0.05;
  private tilt = 0;
  private nextGlance = 0;
  private nextBlink = 2;
  private blinkT = -1;
  private surprise = 0;
  private hadTarget = false;
  private open = 0.85;
  private field: LightField;
  private tick = 0;
  private pods: EyePods;
  private status: THREE.MeshStandardMaterial | null = null;

  constructor(readonly tier: 1 | 2 | 3) {
    super();
    const col = ROLE.dmg;
    const irisMat = this.addGlow(col, 1.1, 3.6);
    const seamMat = this.addGlow(col, 0.25, 1.2);
    this.base(col, 0.48 + tier * 0.06, 0.28);
    this.range = [2.4, 2.8, 3.2][tier - 1];
    this.field = new LightField(col, FIELD_STYLE[(['mk1', 'mk2', 'mk3'] as const)[tier - 1]]);
    this.root.add(this.field.group);
    this.pods = new EyePods(this, irisMat, tier === 3 ? seamMat : null);
    const r = this.root, T = tier;

    // base (same size every tier)
    if (T === 3) joint(at(hexX(BASE_R + 0.06, 0.022, GEN.gunmetalDark), 0, 0, 0, r));
    at(hexX(BASE_R, BASE_H, GEN.gunmetal), 0, 0, 0, r);
    joint(at(hexX(BASE_R + 0.005, 0.012, GEN.trim), 0, BASE_H - 0.012, 0, r));
    if (T === 3) joint(at(hexX(BASE_R + 0.003, 0.007, seamMat), 0, 0.03, 0, r));
    if (T >= 2) {
      const flat = hexFlat(BASE_R);
      for (const sx of [-1, 1]) {
        at(box(0.03, 0.055, 0.11, GEN.armor, 0.008), sx * (flat + 0.015), 0.006, 0, r);
        for (let i = 0; i < 4; i++) at(box(0.05, 0.05, 0.01, GEN.fin, 0.003), sx * (flat + 0.03 + 0.025), 0.008, -0.04 + i * 0.027, r);
      }
    }
    at(cyl(0.08, 0.035, GEN.trim), 0, BASE_H, 0, r);

    // yoke
    at(this.yawG, 0, BASE_H + 0.035, 0, r);
    at(box(0.25, 0.025, 0.07, GEN.gunmetal, 0.012), 0, 0, 0, this.yawG);
    for (const sx of [-1, 1]) at(box(0.026, 0.17, 0.07, GEN.gunmetal, 0.012), sx * 0.138, 0, 0, this.yawG);

    // camera body on a pitch axle (rounded: it's a friendly little thing)
    at(this.pitchG, 0, 0.12, 0, this.yawG);
    at(box(CW, CH, CD, GEN.armor, 0.065), 0, -CH / 2, 0, this.pitchG);
    joint(at(axle(0.02, 0.3, GEN.trim), 0, 0, 0, this.pitchG));
    // lens = the eye: barrel, bezel, dark glass dome, an iris that can look around inside it
    const lz = CD / 2;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(LENS_R, LENS_R, 0.04, 32).rotateX(Math.PI / 2).translate(0, 0, 0.02), GEN.gunmetalDark);
    barrel.castShadow = true;
    at(barrel, 0, 0, lz - 0.004, this.pitchG);
    joint(at(new THREE.Mesh(new THREE.TorusGeometry(LENS_R + 0.002, 0.01, 10, 40), GEN.trim), 0, 0, lz + 0.036, this.pitchG));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(LENS_R * 0.9, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), GEN.darkGlass);
    joint(at(dome, 0, 0, lz + 0.036, this.pitchG));
    at(this.irisG, 0, 0, lz + 0.036 + LENS_R * 0.9 + 0.002, this.pitchG);
    joint(at(new THREE.Mesh(new THREE.CircleGeometry(LENS_R * 0.42, 32), irisMat), 0, 0, 0, this.irisG));
    joint(at(new THREE.Mesh(new THREE.CircleGeometry(LENS_R * 0.17, 24), new THREE.MeshBasicMaterial({ color: '#010203' })), 0, 0, 0.001, this.irisG));
    joint(at(new THREE.Mesh(new THREE.SphereGeometry(LENS_R * 0.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' })), LENS_R * 0.2, LENS_R * 0.22, 0.002, this.irisG));
    at(this.pupil, 0, 0, 0.01, this.irisG);
    // curved lids around the lens dome: they blink, squint and retract into the camera when open
    const lidMat = new THREE.MeshStandardMaterial({ color: '#4a5561', metalness: 0.5, roughness: 0.32, side: THREE.DoubleSide });
    const lr = LENS_R * 0.9 * 1.1;
    at(this.upper, 0, 0, lz + 0.036, this.pitchG);
    at(this.lower, 0, 0, lz + 0.036, this.pitchG);
    joint(at(new THREE.Mesh(new THREE.SphereGeometry(lr, 32, 12, 0, Math.PI * 2, 0, 1.35), lidMat), 0, 0, 0, this.upper)).castShadow = true;
    joint(at(new THREE.Mesh(new THREE.SphereGeometry(lr * 0.99, 32, 10, 0, Math.PI * 2, Math.PI - 1.15, 1.15), lidMat), 0, 0, 0, this.lower)).castShadow = true;

    if (T >= 2) {
      this.focusRing = joint(at(ring(LENS_R + 0.012, 0.009, GEN.trim), 0, 0, lz + 0.018, this.pitchG));
      this.focusRing.rotation.x = Math.PI / 2;
      this.status = this.addGlow(ROLE.dmg, 0.4, 2);
      joint(at(new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), this.status), -CW * 0.32, CH * 0.3, -CD / 2 - 0.002, this.pitchG));
      if (T === 2) {
        // a buddy pod on an arm off the right yoke plate
        at(box(0.05, 0.022, 0.03, GEN.armor, 0.006), 0.151 + 0.025, 0.12, 0, this.yawG);
        this.pods.add(this.yawG, new THREE.Vector3(0.151 + 0.05 + 0.03, 0.12, 0), new THREE.Vector3(1, 0, 0), 0.032, false);
      }
    }
    if (T === 3) {
      // telephoto collar, cheek armor, seams, antenna
      joint(at(new THREE.Mesh(new THREE.TorusGeometry(LENS_R + 0.016, 0.014, 10, 40), GEN.gunmetal), 0, 0, lz + 0.006, this.pitchG));
      joint(at(new THREE.Mesh(new THREE.TorusGeometry(LENS_R + 0.017, 0.004, 6, 40), seamMat), 0, 0, lz + 0.022, this.pitchG));
      for (const sx of [-1, 1]) {
        // thin armor plating: it has to fit in the gap between the camera and the yoke
        at(box(0.0045, CH * 0.8, CD * 0.7, GEN.gunmetal, 0.002), sx * (CW / 2 + 0.0025), -CH * 0.4, -0.01, this.pitchG);
        joint(at(box(0.003, CH * 0.5, 0.006, seamMat, 0.001), sx * (CW / 2 + 0.0035), -CH * 0.25, CD * 0.28, this.pitchG));
      }
      at(cyl(0.006, 0.1, GEN.trim), CW * 0.28, CH / 2 - 0.005, -CD * 0.25, this.pitchG);
      at(new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), seamMat), CW * 0.28, CH / 2 + 0.1, -CD * 0.25, this.pitchG);
      // three pods: one in a cup on each yoke plate, one on top of the camera
      for (const sx of [-1, 1]) this.pods.add(this.yawG, new THREE.Vector3(sx * (0.151 + 0.03), 0.1, 0), new THREE.Vector3(sx, 0, 0), 0.034, true);
      this.pods.add(this.pitchG, new THREE.Vector3(-CW * 0.12, CH / 2 + 0.008, -CD * 0.12), new THREE.Vector3(0, 1, 0), 0.034, true);
    }
  }

  protected animate(dt: number, t: number, targets: THREE.Vector3[]): void {
    const target = targets[0] ?? null;
    this.locks.length = 0;
    const root = this.root.position;
    if (target) {
      this.look = Math.atan2(target.x - root.x, target.z - root.z);
      this.lookPitch = 0.38; // leans in
      this.tilt = 0;
      if (!this.hadTarget) { this.surprise = 0.45; this.hop.v += 1.6; } // perk up with a little bounce
    } else if (t >= this.nextGlance) {
      this.look = this.yaw.x + (Math.random() * 2 - 1) * 1.3;
      this.lookPitch = -0.1 + Math.random() * 0.3;
      this.tilt = Math.random() < 0.55 ? (Math.random() < 0.5 ? -1 : 1) * (0.18 + Math.random() * 0.14) : 0; // curious head tilt
      this.nextGlance = t + 0.8 + Math.random() * 1.8;
    }
    this.hadTarget = !!target;
    const [k, c] = target ? [300, 22] : [120, 10];
    this.yawG.rotation.y = this.yaw.step(this.look, k, c, dt);
    this.pitchG.rotation.x = this.pitch.step(this.lookPitch, k, c, dt, false);
    this.pitchG.rotation.z = this.roll.step(this.tilt, 90, 9, dt, false);
    this.yawG.position.y = BASE_H + 0.035 + Math.max(0, this.hop.step(0, 220, 9, dt, false)) * 0.03;
    // the iris looks around inside the lens a little ahead of the head
    const lead = target ? 0 : wrap(this.look - this.yaw.x);
    this.irisG.position.x = this.irisX.step(Math.max(-1, Math.min(1, lead)) * LENS_R * 0.28, 300, 20, dt, false);
    this.irisG.position.y = this.irisY.step((this.lookPitch - this.pitch.x) * -LENS_R * 0.6, 300, 20, dt, false);
    const locked = !!target && Math.abs(wrap(this.look - this.yaw.x)) < 0.14;
    // shutter-lids: blink when idle, fly open on first sight, focus squint while locked
    this.surprise = Math.max(0, this.surprise - dt);
    if (!target && t >= this.nextBlink) { this.blinkT = 0; this.nextBlink = t + (Math.random() < 0.25 ? 0.3 : 2.4 + Math.random() * 2.8); }
    let open = target ? (this.surprise > 0 ? 1 : 0.72) : 0.85;
    if (this.blinkT >= 0) { this.blinkT += dt; if (this.blinkT < 0.09) open = 0; if (this.blinkT > 0.18) this.blinkT = -1; }
    this.open += (open - this.open) * Math.min(1, dt * 22);
    this.upper.rotation.x = 0.27 + (-0.62 - 0.27) * this.open;
    this.lower.rotation.x = -0.38 + (0.5 + 0.38) * this.open;
    if (this.focusRing) this.focusRing.rotation.z += dt * (locked ? 4 : 0.2);
    if (this.status) this.status.emissiveIntensity = target ? 2 : 0.4 + 0.4 * (Math.sin(t * 2) > 0.8 ? 1 : 0);

    this.field.intensity += ((locked ? 1 : 0) - this.field.intensity) * Math.min(1, dt * (locked ? 5 : 4));
    const eyePos = this.pupil.getWorldPosition(new THREE.Vector3()).sub(root);
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
