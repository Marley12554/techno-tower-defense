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
  float body = smoothstep(0.0, 0.25, along) * (0.3 + 0.7 * along);
  float stripe = smoothstep(0.9, 1.0, fract(along * uLines + uTime * uSpeed)) * smoothstep(0.0, 0.15, along);
  float vib = 0.93 + 0.07 * sin(uTime * 40.0 + along * 20.0);
  float a = uOpacity * (0.13 * body + 0.4 * stripe) * vib;
  gl_FragColor = vec4(uColor * (1.0 + 1.1 * stripe), a);
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
  float rings = 0.5 + 0.5 * sin(r * 16.0 - uTime * 6.0);
  float rim = smoothstep(0.06, 0.0, abs(r - 0.9));
  float scanY = 1.0 - smoothstep(0.0, 0.035, abs(fract(vUv.y - uTime * 0.6) - 0.5));
  float scanX = 1.0 - smoothstep(0.0, 0.035, abs(fract(vUv.x + uTime * 0.45) - 0.5));
  float shimmer = 0.9 + 0.1 * hash(floor(vUv * 30.0) + floor(uTime * 12.0));
  float a = uOpacity * shimmer * (edge * (0.16 + 0.14 * rings * uRings) + rim * 0.4 + edge * (scanY * 0.6 + scanX * uGrid * 0.45));
  gl_FragColor = vec4(uColor * (1.0 + scanY + scanX * uGrid), a);
}`;

export interface FieldStyle { opacity: number; lines: number; speed: number; pool: number; grid: number; rings: number; core: boolean; coneR: number }

export const FIELD_STYLE: Record<'mk1' | 'mk2' | 'mk3' | 'drone', FieldStyle> = {
  mk1: { opacity: 0.6, lines: 1, speed: 0.9, pool: 0.22, grid: 0, rings: 0.3, core: false, coneR: 0.11 },
  mk2: { opacity: 0.75, lines: 2, speed: 1.1, pool: 0.26, grid: 0, rings: 0.6, core: false, coneR: 0.13 },
  mk3: { opacity: 0.9, lines: 3, speed: 1.3, pool: 0.3, grid: 1, rings: 0.8, core: true, coneR: 0.15 },
  drone: { opacity: 0.45, lines: 1, speed: 1, pool: 0.14, grid: 0, rings: 0.4, core: false, coneR: 0.06 },
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
      this.core.scale.set(1 + 0.25 * Math.sin(t * 30), l2, 1 + 0.25 * Math.sin(t * 30));
      (this.core.material as THREE.MeshBasicMaterial).opacity = 0.6 * k;
    }
    // the field vibrates: a fast jitter in size on top of the shader's rings and shimmer
    this.pool.position.copy(ground);
    this.pool.scale.setScalar(k * (1 + 0.025 * Math.sin(t * 37) + 0.015 * Math.sin(t * 23)));
    this.poolMat.uniforms.uTime.value = t;
    this.poolMat.uniforms.uOpacity.value = this.style.opacity * k;
  }
}
