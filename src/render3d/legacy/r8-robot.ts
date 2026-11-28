/**
 * Inspector, design B: the anxious security robot.
 *
 * A fixed hex body and a helmet head that turns slowly; one big eye sits in a
 * socket and darts ahead of the head. Armored lids close over the whole
 * eyeball. A brow plate does the acting: raised and worried while searching,
 * lowered and stern when it locks on. Wide-eyed and blinky when idle.
 *
 * The core body is the same size at every tier; tiers add modules around it:
 * Mk I  PROBE     body, helmet, eye, lids, small brow
 * Mk II SENTINEL  + heat sink packs (rate), armored brow, mechanical bezel ring (damage),
 *                 one eye-pod docked on the helmet
 * Mk III ARRAY    + crown bezel, glowing seams, coolant lines, sensor fins, armored skirt,
 *                 three eye-pods that fly free
 */
import * as THREE from 'three';
import { GEN, ROLE, at, box, cyl, eyeCap, hexFlat, hexX, joint, ring } from '../kit';
import { FIELD_STYLE, LightField } from './r8-field';
import { EyePods } from './r8-pods';
import { Spring, Tower3D, tmp, wrap } from '../core';

// One core size for every tier.
const BASE_R = 0.26, BODY_R = 0.21, BODY_H = 0.12, HW = 0.27, HH = 0.18, HD = 0.23, EYE_R = 0.085;

export class InspectorRobot extends Tower3D {
  private head = new THREE.Group();
  private socket = new THREE.Group();
  private ball = new THREE.Group();
  private pupil = new THREE.Object3D();
  private upper = new THREE.Group();
  private lower = new THREE.Group();
  private brow = new THREE.Group();
  private bezel: THREE.Object3D | null = null;
  private iris: THREE.Object3D;
  private headYaw = new Spring();
  private eyeYaw = new Spring();
  private eyePitch = new Spring();
  private browY = new Spring();
  private browTilt = new Spring();
  private open = 0.8;
  private look = 0;
  private lookPitch = 0.1;
  private nextGlance = 0;
  private nextBlink = 1.5;
  private blinkT = -1;
  private surprise = 0;
  private searchUntil = 0;
  private hadTarget = false;
  private field: LightField;
  private tick = 0;
  private pods: EyePods;

  constructor(readonly tier: 1 | 2 | 3) {
    super();
    const col = ROLE.dmg;
    const irisMat = this.addGlow(col, 1.1, 3.6);
    const seamMat = this.addGlow(col, 0.25, 1.2);
    this.base(col, 0.5 + tier * 0.06, 0.3);
    this.range = [2.4, 2.8, 3.2][tier - 1];
    this.field = new LightField(col, FIELD_STYLE[(['mk1', 'mk2', 'mk3'] as const)[tier - 1]]);
    this.root.add(this.field.group);
    this.pods = new EyePods(this, irisMat, tier === 3 ? seamMat : null);
    const r = this.root, T = this.tier;

    // body (same size every tier)
    if (T === 3) at(hexX(BASE_R + 0.06, 0.03, GEN.gunmetalDark), 0, 0, 0, r); // armored skirt
    at(hexX(BASE_R, 0.06, GEN.gunmetalDark), 0, T === 3 ? 0.03 : 0, 0, r);
    const b0 = T === 3 ? 0.09 : 0.06;
    at(hexX(BODY_R, BODY_H, GEN.gunmetal), 0, b0, 0, r);
    joint(at(hexX(BODY_R + 0.006, 0.014, GEN.trim), 0, b0 + BODY_H - 0.014, 0, r));
    if (T >= 2) joint(at(hexX(BODY_R + 0.003, 0.008, seamMat), 0, b0 + 0.05, 0, r));
    if (T === 3) joint(at(hexX(BASE_R + 0.004, 0.008, seamMat), 0, 0.075, 0, r));
    if (T >= 2) {
      // heat sink packs bolted to the side flats
      const flat = hexFlat(BODY_R);
      for (const sx of [-1, 1]) {
        at(box(0.035, 0.1, 0.13, GEN.armor, 0.008), sx * (flat + 0.0175), b0 + 0.01, 0, r);
        for (let i = 0; i < 5; i++) at(box(0.06, 0.09, 0.01, GEN.fin, 0.003), sx * (flat + 0.035 + 0.03), b0 + 0.015, -0.05 + i * 0.025, r);
        if (T === 3) joint(at(box(0.006, 0.09, 0.006, seamMat, 0.002), sx * (flat + 0.0175), b0 + 0.015, 0.068, r));
      }
    }
    at(cyl(0.085, 0.03, GEN.trim), 0, b0 + BODY_H, 0, r);
    at(this.head, 0, b0 + BODY_H + 0.03, 0, r);

    // helmet with a big eye that sticks out of its socket
    at(box(HW, HH, HD, GEN.armor, 0.065), 0, 0, 0, this.head);
    at(this.socket, 0, HH * 0.5, HD / 2 - EYE_R * 0.2, this.head);
    this.socket.rotation.x = -0.35;
    joint(at(ring(EYE_R * 1.13, EYE_R * 0.13, GEN.gunmetalDark), 0, 0, EYE_R * 0.12, this.socket));
    this.socket.add(this.ball);
    const eyeMat = new THREE.MeshPhysicalMaterial({ color: '#0b1218', metalness: 0.15, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04 });
    joint(at(new THREE.Mesh(new THREE.SphereGeometry(EYE_R, 32, 20), eyeMat), 0, 0, 0, this.ball)).castShadow = true;
    // a big filled iris reads from across the board; dark pupil and a catchlight make it an eye
    this.iris = joint(at(eyeCap(EYE_R * 1.004, 0.55, irisMat), 0, 0, 0, this.ball));
    joint(at(eyeCap(EYE_R * 1.009, 0.22, new THREE.MeshBasicMaterial({ color: '#010203' })), 0, 0, 0, this.ball));
    joint(at(new THREE.Mesh(new THREE.SphereGeometry(EYE_R * 0.09, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' })), EYE_R * 0.24, EYE_R * 0.27, EYE_R * 0.93, this.ball));
    at(this.pupil, 0, 0, EYE_R * 1.02, this.ball);
    // lids: shells just outside the eyeball, they meet in the middle to close it completely
    const lidMat = new THREE.MeshStandardMaterial({ color: '#4a5561', metalness: 0.5, roughness: 0.32, side: THREE.DoubleSide });
    joint(at(new THREE.Mesh(new THREE.SphereGeometry(EYE_R * 1.07, 32, 14, 0, Math.PI * 2, 0, 1.4), lidMat), 0, 0, 0, this.upper)).castShadow = true;
    joint(at(new THREE.Mesh(new THREE.SphereGeometry(EYE_R * 1.06, 32, 12, 0, Math.PI * 2, Math.PI - 1.2, 1.2), lidMat), 0, 0, 0, this.lower)).castShadow = true;
    this.socket.add(this.upper, this.lower);
    // the brow: small at Mk I, armored from Mk II, with a lit seam at Mk III
    at(this.brow, 0, HH + 0.004, HD / 2 - 0.04, this.head);
    const bw = T === 1 ? 0.16 : 0.22, bh = T === 1 ? 0.022 : 0.032;
    at(box(bw, bh, T === 1 ? 0.06 : 0.08, T === 1 ? GEN.gunmetal : GEN.gunmetalDark, 0.01), 0, 0, 0, this.brow);
    if (T === 3) joint(at(box(bw * 0.7, 0.006, 0.01, seamMat, 0.002), 0, 0.002, (T === 3 ? 0.08 : 0.06) / 2 + 0.004, this.brow));
    if (T >= 2) {
      // mechanical bezel ring around the socket
      const g = new THREE.Group();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const b = joint(box(0.016, 0.01, 0.01, GEN.trim, 0.003)); b.position.set(Math.cos(a) * EYE_R * 1.36, Math.sin(a) * EYE_R * 1.36 - 0.005, EYE_R * 0.08); b.rotation.z = a; g.add(b); }
      this.socket.add(g);
      this.bezel = g;
    }
    if (T === 3) {
      joint(at(ring(EYE_R * 1.55, 0.016, GEN.trim), 0, 0, EYE_R * 0.02, this.socket));
      for (const sx of [-1, 1]) {
        at(box(0.018, 0.09, 0.05, GEN.gunmetal, 0.005), sx * 0.085, HH, -HD * 0.3, this.head);
        at(new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), seamMat), sx * 0.085, HH + 0.095, -HD * 0.3, this.head);
      }
    }
    // eye-pods in cups: one at Mk II, three that fly at Mk III
    const podR = 0.036;
    if (T === 2) this.pods.add(this.head, new THREE.Vector3(HW / 2 + 0.012, HH * 0.45, 0.01), new THREE.Vector3(1, 0, 0), podR, false);
    if (T === 3) {
      this.pods.add(this.head, new THREE.Vector3(-(HW / 2 + 0.012), HH * 0.45, 0.01), new THREE.Vector3(-1, 0, 0), podR, true);
      this.pods.add(this.head, new THREE.Vector3(HW / 2 + 0.012, HH * 0.45, 0.01), new THREE.Vector3(1, 0, 0), podR, true);
      this.pods.add(this.head, new THREE.Vector3(0, HH + 0.01, -HD * 0.05), new THREE.Vector3(0, 1, 0), podR, true);
    }
  }

  protected animate(dt: number, t: number, targets: THREE.Vector3[]): void {
    const target = targets[0] ?? null;
    this.locks.length = 0;
    const root = this.root.position;
    if (target) {
      this.look = Math.atan2(target.x - root.x, target.z - root.z);
      this.lookPitch = 0.3;
      if (!this.hadTarget) this.surprise = 0.4;
      this.searchUntil = t + 1.8;
    } else if (t >= this.nextGlance) {
      const searching = t < this.searchUntil;
      this.look = this.headYaw.x + (Math.random() * 2 - 1) * (searching ? 1.6 : 1.1);
      this.lookPitch = -0.1 + Math.random() * 0.35;
      this.nextGlance = t + (searching ? 0.22 + Math.random() * 0.2 : Math.random() < 0.3 ? 0.18 : 0.5 + Math.random() * 1.2);
    }
    this.hadTarget = !!target;
    const searching = !target && t < this.searchUntil;
    // eyes lead, the head follows
    this.head.rotation.y = this.headYaw.step(this.look, target ? 22 : 8, target ? 9 : 5.5, dt);
    const ey = Math.max(-0.7, Math.min(0.7, wrap(this.look - this.head.rotation.y)));
    const [k, c] = target ? [520, 34] : [260, 15];
    this.ball.rotation.y = this.eyeYaw.step(ey, k, c, dt);
    this.ball.rotation.x = this.eyePitch.step(Math.max(-0.45, Math.min(0.45, 0.35 - this.lookPitch)), k, c, dt, false);
    const locked = !!target && Math.abs(wrap(this.look - this.head.rotation.y - this.eyeYaw.x)) < 0.16;
    // lids: wide and blinky when idle (anxious), wide open on first sight, focused squint while locked
    this.surprise = Math.max(0, this.surprise - dt);
    if (!target && t >= this.nextBlink) { this.blinkT = 0; this.nextBlink = t + (Math.random() < 0.3 ? 0.28 : 1.6 + Math.random() * 2.6); }
    let open = target ? (this.surprise > 0 ? 1 : 0.62) : 0.85;
    if (this.blinkT >= 0) { this.blinkT += dt; if (this.blinkT < 0.08) open = 0; if (this.blinkT > 0.16) this.blinkT = -1; }
    this.open += (open - this.open) * Math.min(1, dt * 24);
    this.upper.rotation.x = 0.22 + (-0.55 - 0.22) * this.open;
    this.lower.rotation.x = -0.34 + (0.42 + 0.34) * this.open;
    // brow: up and worried when searching or surprised, down and stern when locked
    const browUp = this.surprise > 0 ? 0.03 : searching ? 0.022 : locked ? -0.012 : 0.008;
    const browTilt = locked ? 0.35 : searching ? -0.25 : 0;
    this.brow.position.y = HH + 0.004 + this.browY.step(browUp, 200, 18, dt, false);
    this.brow.rotation.x = this.browTilt.step(browTilt, 200, 18, dt, false);
    const is = this.iris.scale.x + ((locked ? 0.78 : 1) - this.iris.scale.x) * Math.min(1, dt * 10);
    this.iris.scale.set(is, is, 1);
    if (this.bezel) this.bezel.rotation.z += dt * (locked ? 2.5 : 0.25);

    // light field
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
    this.pods.update(dt, t, targets, this.head.rotation.y);
  }
}
