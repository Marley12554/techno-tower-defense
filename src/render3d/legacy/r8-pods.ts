/**
 * Round eye-pods: small spherical sensors with a big lens. They sit in cups on
 * a tower; flying pods (Mk III) lift out when the tower is alert, hover around
 * it watching their own hostile, cast a small light field, and dock when quiet.
 * Shared by both Inspector designs.
 */
import * as THREE from 'three';
import { GEN, ROLE, at, eyeCap, joint, ring } from '../kit';
import { FIELD_STYLE, LightField } from './r8-field';
import { Spring, wrap, type Tower3D } from '../core';

interface Pod { g: THREE.Group; cup: THREE.Object3D; yaw: Spring; pitch: Spring; lift: number; field: LightField; pupil: THREE.Object3D; tick: number; flies: boolean; gaze: number }

export class EyePods {
  private pods: Pod[] = [];
  constructor(private tower: Tower3D, private irisMat: THREE.Material, private seamMat: THREE.Material | null) {}

  /**
   * Adds a cup at `pos` on `parent` opening toward `dir` (local), with a pod in it.
   * Docked pods ride with the parent; flying pods live in the tower root.
   */
  add(parent: THREE.Object3D, pos: THREE.Vector3, dir: THREE.Vector3, r: number, flies: boolean): void {
    const cup = at(new THREE.Group(), pos.x, pos.y, pos.z, parent);
    const bowl = joint(new THREE.Mesh(new THREE.SphereGeometry(r * 1.24, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2a323b', metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide })));
    bowl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    bowl.castShadow = true;
    cup.add(bowl);
    const g = new THREE.Group();
    joint(at(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), GEN.armor), 0, 0, 0, g)).castShadow = true;
    const lens = at(new THREE.Group(), 0, 0, r * 0.42, g);
    joint(at(new THREE.Mesh(new THREE.SphereGeometry(r * 0.72, 22, 14), GEN.darkGlass), 0, 0, 0, lens));
    joint(at(eyeCap(r * 0.725, 0.6, this.irisMat), 0, 0, 0, lens));
    joint(at(eyeCap(r * 0.73, 0.24, new THREE.MeshBasicMaterial({ color: '#010203' })), 0, 0, 0, lens));
    joint(at(new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' })), r * 0.2, r * 0.22, r * 0.66, lens));
    if (this.seamMat) joint(at(ring(r * 1.01, r * 0.06, this.seamMat), 0, 0, 0, g));
    const pupil = at(new THREE.Object3D(), 0, 0, r * 1.2, g);
    if (flies) this.tower.root.add(g); else cup.add(g);
    const field = new LightField(ROLE.dmg, FIELD_STYLE.drone);
    this.tower.root.add(field.group);
    this.pods.push({ g, cup, yaw: new Spring(), pitch: new Spring(), lift: 0, field, pupil, tick: Math.random() * 0.4, flies, gaze: 0 });
  }

  private local(o: THREE.Object3D, out = new THREE.Vector3()): THREE.Vector3 {
    return o.getWorldPosition(out).sub(this.tower.root.position);
  }

  /** `headYaw`: yaw of the part docked pods ride on, so their own aim is relative to it. */
  update(dt: number, t: number, targets: THREE.Vector3[], headYaw: number): void {
    const root = this.tower.root.position;
    const tmp = new THREE.Vector3();
    this.pods.forEach((p, i) => {
      const tg = targets.length ? targets[i % targets.length] : null;
      if (p.flies) {
        p.lift += ((this.tower.alert > 0.5 ? 1 : 0) - p.lift) * Math.min(1, dt * 1.6);
        const e = p.lift * p.lift * (3 - 2 * p.lift);
        const dock = this.local(p.cup);
        const toward = tg ? Math.atan2(tg.x - root.x, tg.z - root.z) : Math.atan2(dock.x, dock.z || 0.001);
        const ang = toward + (i - 1) * 0.95 + Math.sin(t * 0.7 + i * 2) * 0.18;
        const hover = new THREE.Vector3(Math.sin(ang) * 0.56, 0.6 + 0.04 * Math.sin(t * 2.2 + i * 1.7), Math.cos(ang) * 0.56);
        p.g.position.lerpVectors(dock, hover, e);
      }
      const pp = this.local(p.g);
      let gy: number, gp: number;
      if (tg) {
        const dx = tg.x - root.x - pp.x, dz = tg.z - root.z - pp.z;
        gy = Math.atan2(dx, dz);
        gp = Math.atan2(pp.y - tg.y, Math.hypot(dx, dz));
      } else {
        if (Math.random() < dt * 0.9) p.gaze = headYaw + (Math.random() * 2 - 1) * 1.3;
        gy = p.gaze; gp = 0.15;
      }
      const parentYaw = p.flies ? 0 : headYaw;
      p.g.rotation.y = p.yaw.step(gy - parentYaw, 300, 20, dt);
      p.g.rotation.x = p.pitch.step(gp, 300, 20, dt, false);
      const aimed = !!tg && (!p.flies || p.lift > 0.85) && Math.abs(wrap(gy - parentYaw - p.yaw.x)) < 0.2;
      p.field.intensity += ((aimed ? 1 : 0) - p.field.intensity) * Math.min(1, dt * 5);
      const from = this.local(p.pupil);
      p.field.update(from, tg ? tmp.copy(tg).sub(root) : from, t + i);
      p.tick -= dt;
      if (aimed && tg && p.tick <= 0 && p.field.intensity > 0.6) {
        p.tick = 0.5;
        this.tower.onFire?.({ from: from.clone().add(root), to: tg.clone(), kind: 'field', color: ROLE.dmg, tier: 1 });
      }
    });
  }
}
