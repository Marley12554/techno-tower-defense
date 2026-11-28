/**
 * Inspector (round 10): the v3 2D Array built in 3D, worked backwards so every
 * tier is an earlier stage of the same machine. Nothing appears that isn't in
 * Mk III, and nothing that appears is ever removed.
 *
 * Part            Mk I PROBE          Mk II SENTINEL                 Mk III ARRAY
 * head + lens     round head, lens    + inner lens ring              + second ring        (damage)
 * column          short pedestal      becomes armored lower stage    + upper stage        (range)
 * cooling         -                   vents in the lower stage       vents lit            (fire rate)
 * conduits        lit footing trim    + up the lower stage           + up both stages     (power)
 * radar pods      -                   1 on a post with a strut       3                    (targets)
 * plinth          hex footing         + low octagon (carries pod)    + wide lit foot
 * collar / halo   -                   collar ring on the head        collar projects halo
 * antenna         -                   short mast                     mast telescopes up
 *
 * No face, no aiming head: the lens is set into the top of a fixed body and
 * targeting shows through light. Personality is nervous equipment: radar bars
 * spin a little too fast and stutter, quick scan pings, a flickering lens; on a
 * hostile the bars snap to its bearing and sweep across it, the iris tightens,
 * the halo contracts, and the lens fires in short bursts.
 */
import * as THREE from 'three';
import { GEN, ROLE, at, box, cyl, hexFlat, hexX, joint, prism, ring, strut } from './kit';
import { Spring, Tower3D, wrap } from './core';

const D = Math.PI / 180;
/** Where things sit, so later tiers keep earlier parts exactly in place. */
const FOOT_H = 0.03, OCT_H = 0.035, FOOTING_H = 0.035, NECK_H = 0.035, HEAD_R = 0.12, HEAD_H = 0.055;
const POD_R = 0.32, POD_POST_H = 0.2;
/** Pod bearings (theta: x = sin, z = cos). Mk II's pod is front-right; Mk III adds back and front-left. */
const POD_THETA = [60 * D, 180 * D, 300 * D];

interface Pod { spin: THREE.Group; slot: THREE.MeshStandardMaterial; yaw: Spring; speed: number; stutter: number; sweep: number }

export class Inspector extends Tower3D {
  private lensMat: THREE.MeshStandardMaterial;
  private irises: THREE.Object3D[] = [];
  private lensTip = new THREE.Object3D();
  private pods: Pod[] = [];
  private halo: THREE.Group | null = null;
  private haloY = 0;
  private haloMats: THREE.MeshBasicMaterial[] = [];
  private ping: THREE.Mesh;
  private pingT = 1;
  private nextPing = 0;
  private trace: THREE.Mesh;
  private focus = 0;
  private flicker = 0;
  private nextFlicker = 0;
  private burst = 0;
  private shotT = 0;

  constructor(readonly tier: 1 | 2 | 3) {
    super();
    const col = ROLE.dmg, T = tier, r = this.root;
    this.lensMat = this.addGlow(col, 0.55, 3.2);
    const trimMat = this.addGlow(col, 0.5, 2.2);
    const ventMat = this.addGlow(col, 0.25, 1.6);
    const studMat = this.addGlow(col, 0.6, 2.6);
    this.base(col, [0.5, 0.65, 0.8][T - 1], [0.26, 0.36, 0.44][T - 1]);
    this.range = [2.4, 2.8, 3.2][T - 1];

    /* ------------------------------------------------------------- plinth */
    let y = 0;
    if (T === 3) { // wide foot with rim lights, under Mk II's octagon
      at(prism(8, 0.46, FOOT_H, GEN.gunmetalDark), 0, 0, 0, r);
      this.rim(8, 0.46, FOOT_H, GEN.gunmetal);
      for (let i = 0; i < 8; i++) {
        const a = (i + 0.5) * 45 * D;
        const s = joint(at(box(0.05, 0.006, 0.012, studMat, 0.002), Math.sin(a) * 0.415, FOOT_H - 0.002, Math.cos(a) * 0.415, r));
        s.rotation.y = a;
      }
      y = FOOT_H;
    }
    const plinthTop = T >= 2 ? y + OCT_H : 0;
    if (T >= 2) {
      at(prism(8, 0.38, OCT_H, GEN.gunmetalDark), 0, y, 0, r);
      joint(at(prism(8, 0.383, 0.006, GEN.trim), 0, y + OCT_H - 0.01, 0, r));
      this.rim(8, 0.38, y + OCT_H, GEN.trim);
      y += OCT_H;
    }
    // Mk I's hex footing stays at every tier, with its lit trim
    at(hexX(0.23, FOOTING_H, GEN.armor), 0, y, 0, r);
    joint(at(hexX(0.233, 0.006, GEN.trim), 0, y + FOOTING_H - 0.009, 0, r));
    joint(at(hexX(0.232, 0.005, trimMat), 0, y + 0.01, 0, r)); // inlaid light strip
    this.rim(6, 0.23, y + FOOTING_H, GEN.trim);
    y += FOOTING_H;

    /* ------------------------------------------------------------- column */
    // Mk I: a short pedestal. Mk II: it becomes the armored lower stage (taller, vented, conduits).
    const lowR = T === 1 ? 0.17 : 0.2, lowH = T === 1 ? 0.09 : 0.17;
    const lowY = y;
    at(hexX(lowR, lowH, T === 1 ? GEN.gunmetal : GEN.armor), 0, y, 0, r);
    joint(at(hexX(lowR + 0.003, 0.008, GEN.trim), 0, y + lowH - 0.011, 0, r));
    if (T >= 2) {
      joint(at(hexX(lowR + 0.002, 0.006, GEN.rubber), 0, y + 0.045, 0, r)); // panel seam
      // vents on the two front faces
      for (const k of [0, 5]) {
        const face = this.face(lowR, k, y, r);
        for (let i = 0; i < 4; i++) {
          joint(at(box(0.014, 0.075, 0.006, GEN.rubber, 0.002), -0.042 + i * 0.028, 0.065, 0, face));
          if (T === 3) joint(at(box(0.006, 0.06, 0.007, ventMat, 0.001), -0.042 + i * 0.028, 0.072, 0, face));
        }
      }
      this.conduits(lowR, y, lowH, trimMat);
    }
    y += lowH;
    if (T === 3) { // upper stage telescopes out of the lower one
      const upR = 0.15, upH = 0.14;
      joint(at(hexX(upR + 0.012, 0.012, GEN.trim), 0, y, 0, r)); // telescoping collar
      at(hexX(upR, upH, GEN.armor), 0, y, 0, r);
      joint(at(hexX(upR + 0.003, 0.008, GEN.trim), 0, y + upH - 0.011, 0, r));
      this.conduits(upR, y, upH, trimMat);
      y += upH;
    }

    /* --------------------------------------------------------- head + lens */
    at(cyl(0.065, NECK_H, GEN.trim, 24), 0, y, 0, r);
    y += NECK_H;
    const headY = y;
    at(cyl(HEAD_R, HEAD_H, GEN.armor, 40), 0, y, 0, r);
    joint(at(ring(HEAD_R, 0.006, GEN.trim), 0, y + HEAD_H, 0, r));
    joint(at(box(0.05, 0.008, 0.006, trimMat, 0.002), 0, y + 0.02, HEAD_R, r)); // status light
    y += HEAD_H;
    joint(at(cyl(0.092, 0.006, GEN.rubber, 40), 0, y - 0.003, 0, r)); // lens well
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.072, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.lensMat);
    dome.scale.y = 0.45;
    joint(at(dome, 0, y, 0, r));
    this.irises.push(joint(at(ring(0.04, 0.0065, GEN.rubber), 0, y + 0.026, 0, r)));
    if (T >= 2) joint(at(ring(0.077, 0.005, GEN.trim), 0, y + 0.002, 0, r));
    if (T === 3) {
      joint(at(ring(0.086, 0.003, studMat), 0, y + 0.002, 0, r));
      this.irises.push(joint(at(ring(0.022, 0.004, GEN.rubber), 0, y + 0.031, 0, r)));
    }
    at(this.lensTip, 0, y + 0.034, 0, r);

    /* ------------------------------------------------------ collar + halo */
    if (T >= 2) {
      joint(at(ring(HEAD_R + 0.014, 0.011, GEN.gunmetal), 0, headY + HEAD_H * 0.45, 0, r));
      if (T === 3) {
        // the collar's three emitters project the halo
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + 30 * D;
          joint(at(box(0.016, 0.018, 0.016, studMat, 0.003), Math.sin(a) * (HEAD_R + 0.014), headY + HEAD_H * 0.45 + 0.008, Math.cos(a) * (HEAD_R + 0.014), r));
        }
        this.haloY = y + 0.15;
        this.halo = at(new THREE.Group(), 0, this.haloY, 0, r);
        const hot = col.clone().multiplyScalar(1.6);
        const core = new THREE.MeshBasicMaterial({ color: hot, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
        const soft = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
        this.haloMats.push(core, soft);
        const g1 = new THREE.TorusGeometry(0.2, 0.0045, 6, 72); g1.rotateX(Math.PI / 2);
        const g2 = new THREE.TorusGeometry(0.2, 0.018, 8, 72); g2.rotateX(Math.PI / 2);
        this.halo.add(new THREE.Mesh(g1, core), new THREE.Mesh(g2, soft));
        // three tick marks riding the halo, so its spin reads
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const tick = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.008), core);
          tick.position.set(Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2);
          tick.rotation.y = a;
          this.halo.add(tick);
        }
      }
    }

    /* ----------------------------------------------------------- antenna */
    if (T >= 2) {
      const a = 240 * D, ar = lowR * 0.88;
      const ax = Math.sin(a) * ar, az = Math.cos(a) * ar, ay = lowY + lowH;
      at(cyl(0.012, 0.012, GEN.trim, 12), ax, ay, az, r);
      at(cyl(0.007, 0.13, GEN.gunmetal, 8), ax, ay + 0.012, az, r);
      let tip = ay + 0.142;
      if (T === 3) { joint(at(cyl(0.0045, 0.13, GEN.trim, 8), ax, tip - 0.01, az, r)); tip += 0.12; }
      at(new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), studMat), ax, tip + 0.006, az, r);
    }

    /* ---------------------------------------------------------- radar pods */
    const nPods = T === 1 ? 0 : T === 2 ? 1 : 3;
    for (let i = 0; i < nPods; i++) {
      const th = POD_THETA[i], px = Math.sin(th) * POD_R, pz = Math.cos(th) * POD_R;
      at(cyl(0.03, 0.012, GEN.trim, 16), px, plinthTop, pz, r); // foot
      at(cyl(0.018, POD_POST_H, GEN.gunmetal, 12), px, plinthTop + 0.012, pz, r);
      const top = plinthTop + 0.012 + POD_POST_H;
      at(cyl(0.034, 0.022, GEN.armor, 20), px, top, pz, r); // turntable
      // strut back to the lower stage, so the pod is braced to the body
      const flat = hexFlat(lowR);
      const a = new THREE.Vector3(Math.sin(th) * flat * 0.92, lowY + lowH * 0.72, Math.cos(th) * flat * 0.92);
      const b = new THREE.Vector3(px - Math.sin(th) * 0.016, top - 0.04, pz - Math.cos(th) * 0.016);
      r.add(joint(strut(a, b, 0.009, GEN.gunmetal)));
      // the spinning array bar
      const spin = at(new THREE.Group(), px, top + 0.022, pz, r);
      at(cyl(0.01, 0.018, GEN.trim, 10), 0, 0, 0, spin);
      at(box(0.18, 0.042, 0.024, GEN.armor, 0.006), 0, 0.018, 0, spin);
      const slot = glowFor(this, col);
      for (const s of [-1, 1]) {
        joint(at(box(0.15, 0.014, 0.004, slot, 0.0015), 0, 0.032, s * 0.0125, spin));
        for (let k = 0; k < 5; k++) joint(at(box(0.003, 0.016, 0.005, GEN.rubber, 0.001), -0.06 + k * 0.03, 0.031, s * 0.0125, spin));
      }
      const yaw = new Spring(Math.random() * Math.PI * 2);
      this.pods.push({ spin, slot, yaw, speed: 3 + Math.random(), stutter: 0, sweep: Math.random() * 10 });
    }

    /* ------------------------------------------------- scan ping + trace */
    const pg = new THREE.RingGeometry(0.975, 1, 72); pg.rotateX(-Math.PI / 2);
    this.ping = at(new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })), 0, 0.006, 0, r);
    this.ping.renderOrder = 2;
    const tg = new THREE.CylinderGeometry(0.0035, 0.0035, 1, 6); tg.translate(0, 0.5, 0);
    this.trace = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.trace.visible = false;
    r.add(this.trace);
  }

  /** A group sitting on face k of a hex (flats at ±X) at height y, local +Z = the face's outward normal. */
  private face(rad: number, k: number, y: number, parent: THREE.Object3D): THREE.Group {
    const a = (60 * k + 30) * D, f = hexFlat(rad);
    const g = at(new THREE.Group(), Math.sin(a) * f, y, Math.cos(a) * f, parent);
    g.rotation.y = a;
    return g;
  }

  /** A thin machined rim along the top edges of a hex (flats at ±X) or an octagon (flat to the camera). */
  private rim(sides: 6 | 8, rad: number, yTop: number, mat: THREE.Material): void {
    const n = sides, ap = rad * Math.cos(Math.PI / n), len = 2 * rad * Math.sin(Math.PI / n);
    const off = n === 6 ? Math.PI / 6 : 0;
    for (let k = 0; k < n; k++) {
      const a = off + (k * 2 * Math.PI) / n;
      const m = joint(at(box(len * 0.98, 0.004, 0.009, mat, 0.0015), Math.sin(a) * (ap - 0.005), yTop - 0.001, Math.cos(a) * (ap - 0.005), this.root));
      m.rotation.y = a;
    }
  }

  /** Lit conduits up the two front-side edges of a hex stage. */
  private conduits(rad: number, y: number, h: number, mat: THREE.Material): void {
    for (const a of [60 * D, -60 * D]) joint(at(box(0.009, h - 0.02, 0.009, mat, 0.002), Math.sin(a) * (rad + 0.002), y + 0.01, Math.cos(a) * (rad + 0.002), this.root));
  }

  protected animate(dt: number, t: number, targets: THREE.Vector3[]): void {
    const target = targets[0] ?? null;
    this.locks.length = 0;

    // radar bars: idle = spinning a bit too fast, with stutters; alert = snap to the bearing and sweep across it
    let aligned = this.pods.length === 0;
    for (const p of this.pods) {
      if (target) {
        p.sweep += dt * 7;
        const want = this.yawTo(p.spin, target) + Math.sin(p.sweep) * 0.32 * (1 - this.focus * 0.8);
        p.spin.rotation.y = p.yaw.step(want, 380, 26, dt);
        if (Math.abs(wrap(want - p.yaw.x)) < 0.4) aligned = true;
      } else {
        p.stutter -= dt;
        if (p.stutter < -1.5 - Math.random() * 3) p.stutter = 0.12 + Math.random() * 0.25;
        const v = p.stutter > 0 ? 0 : p.speed;
        p.yaw.v += (v - p.yaw.v) * Math.min(1, dt * (p.stutter > 0 ? 14 : 3));
        p.yaw.x += p.yaw.v * dt;
        p.spin.rotation.y = p.yaw.x;
      }
      p.slot.emissiveIntensity = 0.6 + this.alert * 2.4 + (target ? 0.6 * Math.abs(Math.cos(p.sweep)) : 0);
    }
    const locked = !!target && this.alert > 0.6 && aligned;
    this.focus += ((locked ? 1 : 0) - this.focus) * Math.min(1, dt * 7);
    for (const ir of this.irises) ir.scale.setScalar(1 - this.focus * 0.45 + (target ? 0 : this.flicker * 0.15));

    // the lens polls: quick nervous flickers when idle
    if (t >= this.nextFlicker) { this.flicker = 1; this.nextFlicker = t + (Math.random() < 0.35 ? 0.08 + Math.random() * 0.1 : 0.5 + Math.random() * 1.6); }
    this.flicker = Math.max(0, this.flicker - dt * 9);
    this.lensMat.emissiveIntensity += this.flicker * (1 - this.alert) * 1.6;

    // scan pings: a ring sweeps the board out to range; rapid while a hostile is near
    if (t >= this.nextPing) { this.pingT = 0; this.nextPing = t + (target ? 0.55 : 1.4 + Math.random() * 1.6); }
    this.pingT = Math.min(1, this.pingT + dt * (target ? 2.2 : 1.6));
    this.ping.scale.setScalar(0.25 + this.pingT * (this.range - 0.25));
    (this.ping.material as THREE.MeshBasicMaterial).opacity = 0.14 * (1 - this.pingT) * (1 - this.pingT);

    // halo: idles slow and wide; spins up and contracts when locked
    if (this.halo) {
      this.halo.rotation.y += dt * (0.5 + this.alert * 2.5 + this.focus * 3);
      this.halo.scale.setScalar(1 - this.focus * 0.18 + Math.sin(t * 2.2) * 0.015);
      this.halo.position.y = this.haloY + this.focus * 0.03;
      this.haloMats[0].opacity = 0.45 + this.alert * 0.35 + this.focus * 0.2;
      this.haloMats[1].opacity = 0.08 + this.alert * 0.12 + this.flash * 0.15;
    }

    // tracking trace from the lens while locked, then short bursts of fire
    const tm = this.trace.material as THREE.MeshBasicMaterial;
    tm.opacity += ((locked ? 0.28 : 0) - tm.opacity) * Math.min(1, dt * 10);
    this.trace.visible = tm.opacity > 0.01 && !!target;
    if (target) {
      const a = this.lensTip.position, b = this.root.worldToLocal(target.clone());
      const d = b.clone().sub(a);
      this.trace.position.copy(a);
      this.trace.scale.set(1, d.length(), 1);
      this.trace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    }
    if (locked && target) {
      this.locks.push(target);
      if (this.cooldown <= 0 && this.burst === 0) { this.burst = [2, 3, 3][this.tier - 1]; this.cooldown = [1.0, 0.8, 0.6][this.tier - 1]; this.shotT = 0; }
    }
    if (this.burst > 0) {
      this.shotT -= dt;
      if (this.shotT <= 0 && target) {
        this.burst--;
        this.shotT = 0.085;
        this.flash = 0.5;
        this.onFire?.({ from: this.lensTip.getWorldPosition(new THREE.Vector3()), to: target.clone(), kind: 'beam', color: ROLE.dmg, tier: this.tier });
      } else if (!target) this.burst = 0;
    }
  }
}

/** A radar slot material that the pod drives itself (not blended by the tower's alert). */
function glowFor(_t: Inspector, col: THREE.Color): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#0b0f14', emissive: col.clone(), emissiveIntensity: 0.6, metalness: 0, roughness: 0.4 });
}
