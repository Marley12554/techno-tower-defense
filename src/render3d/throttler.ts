/**
 * Throttler (round 10): a heavy iris valve that pinches the link. Calm, heavy,
 * inevitable: it never looks at anything. Four-fold symmetry (the Inspector is
 * three-fold). Designed backwards from Mk IV DEADLOCK (deadbolts on the pylon
 * heads, later), so nothing here is a dead end.
 *
 * Part          Mk I GATE             Mk II CLAMP                    Mk III CHOKEPOINT
 * iris drum     drum, 6-blade iris    same drum, 8 blades, vents     + inner counter-rotating iris   (slow)
 * core          glows in the iris     rises on a spindle when alert  spindle telescopes into the ring
 * bolts > arms  4 bolt heads          bolts become 4 clamp arms      arms telescope up into pylons    (range)
 * energy ring   -                     -                              thin ring held by the pylon tips (+25% dmg)
 * base          plinth                + wide base ring               + conduits up the pylons
 *
 * The drum is the same size at every tier (no pedestal growth). Behavior:
 * idle, the iris breathes slowly and the field drifts inward; with a hostile
 * near, the core rises slowly, the iris closes in three heavy steps, the field
 * tightens and the ring draws in.
 */
import * as THREE from 'three';
import { GEN, MAT, ROLE, at, box, cyl, joint, ring } from './kit';
import { Tower3D } from './core';

const D = Math.PI / 180;
const DRUM_R = 0.17, DRUM_H = 0.12, PLINTH_R = 0.22, PLINTH_H = 0.04, BASE_H = 0.03, ARM_R = 0.255, IRIS_R = 0.155;
/** Iris: cover plate inner edge, blade length; open = blades hidden under the cover, closed = a small hole round the spindle. */
const COVER_R = 0.095, IRIS_L = 0.075;

const FIELD_VS = `varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
/** Thin bands drifting inward toward the tower: traffic being compressed. */
const FIELD_FS = `
uniform float uT; uniform float uOpacity; uniform vec3 uColor; varying vec2 vP;
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float f = fract(r * 3.0 + uT);
  float band = smoothstep(0.9, 0.97, f) * smoothstep(1.0, 0.97, f);
  float fade = smoothstep(0.15, 0.5, r) * smoothstep(1.0, 0.75, r);
  float rim = smoothstep(0.975, 0.99, r) * smoothstep(1.0, 0.99, r);
  gl_FragColor = vec4(uColor * (band * fade + rim * 0.5) * uOpacity, 1.0);
}`;

export class Throttler extends Tower3D {
  private blades: { m: THREE.Object3D; th: number; dir: 1 | -1 }[] = [];
  private coreMat: THREE.MeshStandardMaterial;
  private coreG = new THREE.Group();
  private coreY0: number;
  private coreRise: number;
  private spindles: THREE.Object3D[] = [];
  private field: THREE.Mesh;
  private fieldU = { uT: { value: 0 }, uOpacity: { value: 0.035 }, uColor: { value: ROLE.sup.clone() } };
  private ringG: THREE.Group | null = null;
  private ringMats: THREE.MeshBasicMaterial[] = [];
  private steps = 0;
  private stepT = 0;
  private close = 0;
  private rise = 0;
  private breath = Math.random() * 6;
  private drift = 0;

  constructor(readonly tier: 1 | 2 | 3) {
    super();
    const col = ROLE.sup, T = tier, r = this.root;
    this.coreMat = this.addGlow(col, 0.6, 3.0);
    const trimMat = this.addGlow(col, 0.35, 1.8);
    const padMat = this.addGlow(col, 0.5, 2.6);
    const bladeMat = new THREE.MeshStandardMaterial({ color: '#4a4660', metalness: 0.75, roughness: 0.28 });
    this.base(col, [0.45, 0.6, 0.7][T - 1], [0.26, 0.34, 0.36][T - 1]);
    this.range = [1.7, 2.0, 2.3][T - 1];

    /* -------------------------------------------------------------- base */
    let y = 0;
    if (T >= 2) {
      at(cyl(0.31, BASE_H, GEN.gunmetalDark, 48), 0, 0, 0, r);
      joint(at(ring(0.31, 0.005, GEN.trim, 64), 0, BASE_H - 0.004, 0, r));
      y = BASE_H;
    }
    const y0 = y;
    at(cyl(PLINTH_R, PLINTH_H, GEN.gunmetal, 48), 0, y, 0, r);
    joint(at(ring(PLINTH_R, 0.005, GEN.trim, 64), 0, y + PLINTH_H - 0.004, 0, r));
    joint(at(ring(PLINTH_R + 0.001, 0.004, trimMat, 64), 0, y + 0.014, 0, r)); // inlaid light
    y += PLINTH_H;
    // Mk I's bolt heads: at Mk II the clamp arms mount on them
    for (let k = 0; k < 4; k++) {
      const a = 45 * D + k * 90 * D;
      joint(at(cyl(0.016, 0.01, GEN.trim, 12), Math.sin(a) * 0.2, y, Math.cos(a) * 0.2, r));
    }

    /* -------------------------------------------------------------- drum */
    const drumY = y;
    at(cyl(DRUM_R, DRUM_H, GEN.armor, 48), 0, y, 0, r);
    joint(at(ring(DRUM_R + 0.002, 0.005, GEN.rubber, 64), 0, y + 0.03, 0, r));
    if (T >= 2) { // vents around the drum
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const v = joint(at(box(0.014, 0.045, 0.006, MAT.well, 0.002), Math.sin(a) * (DRUM_R + 0.001), y + 0.045, Math.cos(a) * (DRUM_R + 0.001), r));
        v.rotation.y = a;
      }
    }
    y += DRUM_H;
    const top = y;
    joint(at(ring(DRUM_R, 0.011, GEN.trim, 64), 0, top, 0, r));
    joint(at(cyl(IRIS_R, 0.004, MAT.well, 40), 0, top - 0.003, 0, r));

    /* ------------------------------------------------------------- iris */
    // blades slide in from under an annular cover plate, twisting as they close (a real iris)
    const layer = (n: number, yy: number, dir: 1 | -1) => {
      for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI * 2 + (dir < 0 ? Math.PI / n : 0);
        const m = at(box(0.07, 0.004, IRIS_L, bladeMat, 0.0015), 0, yy + i * 0.0006, 0, r);
        m.castShadow = false;
        m.rotation.z = dir * 0.04;
        this.blades.push({ m, th, dir });
      }
    };
    layer(T === 1 ? 6 : 8, top + 0.002, 1);
    if (T === 3) layer(8, top - 0.0035, -1);
    const cg = new THREE.RingGeometry(COVER_R, DRUM_R, 64); cg.rotateX(-Math.PI / 2);
    const cover = at(new THREE.Mesh(cg, GEN.armor), 0, top + 0.009, 0, r);
    cover.receiveShadow = true;
    joint(at(ring(COVER_R, 0.004, GEN.trim, 64), 0, top + 0.009, 0, r));

    /* -------------------------------------------------- core on a spindle */
    this.coreY0 = top - 0.025;
    this.coreRise = [0.06, 0.1, 0.2][T - 1];
    at(this.coreG, 0, this.coreY0, 0, r);
    at(new THREE.Mesh(new THREE.SphereGeometry(0.036, 20, 14), this.coreMat), 0, 0.036, 0, this.coreG);
    joint(at(ring(0.036, 0.005, GEN.trim), 0, 0.036, 0, this.coreG));
    // spindle segments (one per tier, telescoping) hang below the core into the drum
    for (let i = 0; i < T; i++) {
      const s = joint(at(cyl(0.013 - i * 0.002, 0.1, i % 2 ? GEN.trim : GEN.gunmetal, 12), 0, -0.1, 0, this.coreG));
      this.spindles.push(s);
    }

    /* --------------------------------------------- clamp arms and pylons */
    if (T >= 2) {
      for (let k = 0; k < 4; k++) {
        const a = 45 * D + k * 90 * D;
        const g = at(new THREE.Group(), Math.sin(a) * ARM_R, y0, Math.cos(a) * ARM_R, r);
        g.rotation.y = a;
        const armH = top - y0 + 0.01;
        joint(at(box(0.055, armH, 0.055, GEN.armor, 0.008), 0, 0, 0, g)); // joint: on the diagonal, the round plinth's bounding box falsely overlaps it
        joint(at(box(0.06, 0.008, 0.06, GEN.trim, 0.002), 0, armH - 0.012, 0, g));
        // jaw reaching in to grip the drum, with a rubber pad on the drum
        const jawY = drumY - y0 + DRUM_H * 0.5 - 0.02;
        const reach = ARM_R - DRUM_R - 0.0275;
        joint(at(box(0.042, 0.04, reach + 0.004, MAT.heavy, 0.005), 0, jawY, -0.0275 - reach / 2, g));
        joint(at(box(0.046, 0.046, 0.006, GEN.rubber, 0.002), 0, jawY - 0.003, -(ARM_R - DRUM_R) + 0.001, g));
        joint(at(box(0.012, armH * 0.55, 0.004, trimMat, 0.002), 0, armH * 0.2, 0.0285, g)); // status strip
        if (T === 3) {
          // the arm telescopes up into a pylon whose tip emitter holds the ring
          const pH = 0.24;
          joint(at(box(0.046, 0.014, 0.046, GEN.trim, 0.003), 0, armH, 0, g));
          at(box(0.038, pH, 0.038, GEN.gunmetal, 0.006), 0, armH + 0.014, 0, g);
          joint(at(box(0.008, pH - 0.04, 0.004, trimMat, 0.002), 0, armH + 0.03, 0.0195, g)); // conduit
          const tipY = armH + 0.014 + pH;
          const head = joint(at(box(0.05, 0.035, 0.05, GEN.armor, 0.006), 0, tipY - 0.035, 0, g));
          head.rotation.x = 0;
          joint(at(box(0.03, 0.02, 0.006, padMat, 0.002), 0, tipY - 0.028, -0.0255, g)); // emitter pad
        }
      }
      if (T === 3) {
        const ringY = y0 + (top - y0 + 0.01) + 0.014 + 0.24 - 0.018;
        this.ringG = at(new THREE.Group(), 0, ringY, 0, r);
        const R = ARM_R - 0.03;
        const core = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.8), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
        const soft = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
        const glint = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.4), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
        this.ringMats.push(core, soft, glint);
        const t1 = new THREE.TorusGeometry(R, 0.0032, 6, 96); t1.rotateX(Math.PI / 2);
        const t2 = new THREE.TorusGeometry(R, 0.014, 8, 96); t2.rotateX(Math.PI / 2);
        const t3 = new THREE.TorusGeometry(R, 0.0055, 6, 24, 0.7); t3.rotateX(Math.PI / 2); // a bright arc that travels round
        this.ringG.add(new THREE.Mesh(t1, core), new THREE.Mesh(t2, soft), new THREE.Mesh(t3, glint));
      }
    }

    /* ------------------------------------------------------ ground field */
    const fg = new THREE.PlaneGeometry(2, 2); fg.rotateX(-Math.PI / 2);
    this.field = at(new THREE.Mesh(fg, new THREE.ShaderMaterial({ uniforms: this.fieldU, vertexShader: FIELD_VS, fragmentShader: FIELD_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })), 0, 0.005, 0, r);
    this.field.scale.setScalar(this.range);
    this.field.renderOrder = 2;
  }

  protected animate(dt: number, t: number, targets: THREE.Vector3[]): void {
    const near = targets.length > 0;
    this.locks.length = 0;

    // the iris closes in three heavy steps while a hostile is near, and opens back the same way
    this.stepT -= dt;
    if (this.stepT <= 0) {
      if (near && this.steps < 3) { this.steps++; this.stepT = 0.6; }
      else if (!near && this.steps > 0) { this.steps--; this.stepT = 0.45; }
    }
    this.close += (this.steps / 3 - this.close) * Math.min(1, dt * 7);
    this.breath += dt * Math.PI * 2 * 0.14;
    const b = 0.5 + 0.5 * Math.sin(this.breath);
    const c = Math.min(1, this.close + 0.08 * b * (1 - this.close));
    const rho = COVER_R + IRIS_L / 2 - c * (COVER_R - 0.02); // blade center radius: hidden under the cover > pinched
    for (const { m, th, dir } of this.blades) {
      m.position.x = Math.sin(th) * rho; m.position.z = Math.cos(th) * rho;
      m.rotation.y = th + dir * (0.25 + 0.55 * c);
    }

    // the core rises slowly on its spindle
    this.rise += ((near ? 1 : 0) - this.rise) * Math.min(1, dt * 1.1);
    const e = this.rise * this.rise * (3 - 2 * this.rise);
    this.coreG.position.y = this.coreY0 + this.coreRise * e;
    this.spindles.forEach((s, i) => { s.position.y = -0.1 - (this.coreRise * e * i) / Math.max(1, this.spindles.length); });
    this.coreMat.emissiveIntensity += b * 0.5 * (1 - this.alert);

    // field: drifts inward slowly; faster and brighter while throttling
    this.drift += dt * (0.12 + this.alert * 0.22);
    this.fieldU.uT.value = this.drift;
    this.fieldU.uOpacity.value = 0.035 + this.alert * 0.07 + b * 0.01;

    // energy ring (Mk III): turns slowly, draws in and brightens while throttling
    if (this.ringG) {
      this.ringG.rotation.y += dt * (0.25 + this.alert * 0.5);
      this.ringG.scale.setScalar(1 - this.alert * 0.05);
      this.ringMats[0].opacity = 0.55 + this.alert * 0.35;
      this.ringMats[1].opacity = 0.1 + this.alert * 0.12 + b * 0.03;
    }
    void t;
  }
}
