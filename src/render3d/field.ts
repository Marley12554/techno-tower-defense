/**
 * The Inspector's attack: a cone of light cast from its eye onto a hostile,
 * ending in a vibrating inspection field. Scan lines run down the cone and
 * sweep through the field; they are what wears the hostile down. Higher tiers
 * get more lines, a scan grid, and a bright core beam.
 */
import * as THREE from 'three';

const coneVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const coneFrag = /* glsl */ `
uniform float uTime; uniform float uOpacity; uniform float uLines; uniform float uSpeed; uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float along = vUv.y;                                   // 1 at the eye, 0 at the target
  float body = smoothstep(0.0, 0.2, along) * (0.25 + 0.75 * along);
  float stripe = smoothstep(0.86, 1.0, fract(along * uLines + uTime * uSpeed));
  float vib = 0.82 + 0.18 * sin(uTime * 61.0 + along * 37.0);
  float a = uOpacity * (0.16 * body + 0.7 * stripe * smoothstep(0.0, 0.1, along)) * vib;
  gl_FragColor = vec4(uColor * (1.0 + 1.6 * stripe), a);
}`;
const poolFrag = /* glsl */ `
uniform float uTime; uniform float uOpacity; uniform float uGrid; uniform float uRings; uniform vec3 uColor;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float edge = smoothstep(1.0, 0.7, r);
  float rings = 0.5 + 0.5 * sin(r * 26.0 - uTime * 15.0);
  float rim = smoothstep(0.06, 0.0, abs(r - 0.9));
  float scanY = 1.0 - smoothstep(0.0, 0.04, abs(fract(vUv.y - uTime * 0.9) - 0.5));
  float scanX = 1.0 - smoothstep(0.0, 0.04, abs(fract(vUv.x + uTime * 0.7) - 0.5));
  float shimmer = 0.8 + 0.2 * hash(floor(vUv * 36.0) + floor(uTime * 24.0));
  float a = uOpacity * shimmer * (edge * (0.18 + 0.22 * rings * uRings) + rim * 0.55 + edge * (scanY * 0.9 + scanX * uGrid * 0.9));
  gl_FragColor = vec4(uColor * (1.0 + scanY + scanX * uGrid), a);
}`;

export interface FieldStyle { opacity: number; lines: number; speed: number; pool: number; grid: number; rings: number; core: boolean; coneR: number }

export const FIELD_STYLE: Record<'mk1' | 'mk2' | 'mk3' | 'drone', FieldStyle> = {
  mk1: { opacity: 0.6, lines: 3, speed: 2.4, pool: 0.22, grid: 0, rings: 0.4, core: false, coneR: 0.11 },
  mk2: { opacity: 0.8, lines: 5, speed: 3.4, pool: 0.27, grid: 0, rings: 1, core: false, coneR: 0.14 },
  mk3: { opacity: 1, lines: 8, speed: 4.6, pool: 0.32, grid: 1, rings: 1, core: true, coneR: 0.16 },
  drone: { opacity: 0.55, lines: 3, speed: 3, pool: 0.15, grid: 0, rings: 0.6, core: false, coneR: 0.07 },
};

function mat(frag: string, color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: coneVert,
    fragmentShader: frag,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uLines: { value: 4 }, uSpeed: { value: 3 }, uGrid: { value: 0 }, uRings: { value: 1 }, uColor: { value: color.clone() } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** One light field. Lives in a non-rotating parent (the tower root); positions are in that parent's space. */
export class LightField {
  readonly group = new THREE.Group();
  private cone: THREE.Mesh;
  private core: THREE.Mesh | null = null;
  private pool: THREE.Mesh;
  private coneMat: THREE.ShaderMaterial;
  private poolMat: THREE.ShaderMaterial;
  /** 0..1, eased by the owner. */
  intensity = 0;

  constructor(color: THREE.Color, readonly style: FieldStyle) {
    this.coneMat = mat(coneFrag, color);
    this.coneMat.uniforms.uLines.value = style.lines;
    this.coneMat.uniforms.uSpeed.value = style.speed;
    this.cone = new THREE.Mesh(new THREE.CylinderGeometry(0.012, style.coneR, 1, 28, 1, true), this.coneMat);
    this.cone.renderOrder = 5;
    this.group.add(this.cone);
    if (style.core) {
      const cm = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      this.core = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 8, 1, true), cm);
      this.core.renderOrder = 6;
      this.group.add(this.core);
    }
    this.poolMat = mat(poolFrag, color);
    this.poolMat.uniforms.uGrid.value = style.grid;
    this.poolMat.uniforms.uRings.value = style.rings;
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(style.pool * 2, style.pool * 2), this.poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.renderOrder = 4;
    this.group.add(this.pool);
    this.group.visible = false;
  }

  /** `from`: the eye, `to`: the hostile (both in the parent's space). */
  update(from: THREE.Vector3, to: THREE.Vector3, t: number): void {
    const on = this.intensity > 0.01;
    this.group.visible = on;
    if (!on) return;
    const k = this.intensity;
    const ground = new THREE.Vector3(to.x, 0.012, to.z);
    const aim = new THREE.Vector3(to.x, to.y * 0.5, to.z); // the cone lands between the packet and its field
    const len = from.distanceTo(aim);
    this.cone.position.copy(from).add(aim).multiplyScalar(0.5);
    this.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(aim).normalize());
    this.cone.scale.set(1, len, 1);
    this.coneMat.uniforms.uTime.value = t;
    this.coneMat.uniforms.uOpacity.value = this.style.opacity * k;
    if (this.core) {
      const l2 = from.distanceTo(to);
      this.core.position.copy(from).add(to).multiplyScalar(0.5);
      this.core.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(to).normalize());
      this.core.scale.set(1 + 0.6 * Math.sin(t * 47), l2, 1 + 0.6 * Math.sin(t * 47));
      (this.core.material as THREE.MeshBasicMaterial).opacity = 0.9 * k;
    }
    // the field vibrates: a fast jitter in size on top of the shader's rings and shimmer
    this.pool.position.copy(ground);
    this.pool.scale.setScalar(k * (1 + 0.05 * Math.sin(t * 53) + 0.03 * Math.sin(t * 31)));
    this.poolMat.uniforms.uTime.value = t;
    this.poolMat.uniforms.uOpacity.value = this.style.opacity * k;
  }
}
