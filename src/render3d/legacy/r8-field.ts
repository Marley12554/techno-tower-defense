/**
 * The Inspector's attack: light cast from its eye onto a hostile, like a beam
 * through faint haze. Not a solid cone: soft rays fan out from the lens, a thin
 * mist drifts through them, the light is densest along the middle and fades at
 * the edges, and it lands in a soft spot on the board where a faint scan line
 * sweeps across the hostile. Higher tiers cast more rays and denser light.
 */
import * as THREE from 'three';

const shaftVert = /* glsl */ `
varying vec2 vUv;
varying float vFacing;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  // how squarely we look through this part of the shaft: dense in the middle, thin at the edges
  vFacing = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;
const shaftFrag = /* glsl */ `
uniform float uTime; uniform float uOpacity; uniform float uRays; uniform float uMist; uniform vec3 uColor;
varying vec2 vUv;
varying float vFacing;
float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise1(float x) { float i = floor(x), f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float noise2(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i.x + i.y * 57.0), b = hash(i.x + 1.0 + i.y * 57.0), c = hash(i.x + (i.y + 1.0) * 57.0), d = hash(i.x + 1.0 + (i.y + 1.0) * 57.0);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y); }
void main() {
  float along = vUv.y;                                     // 1 at the lens, 0 at the target
  float falloff = pow(along, 0.6) * smoothstep(0.0, 0.08, along);
  // rays: thin streaks around the shaft that flicker slowly
  float a1 = vUv.x * uRays;
  float rays = pow(noise1(a1 + uTime * 0.15), 3.0) * (0.6 + 0.4 * noise1(a1 * 1.7 - uTime * 0.6));
  // haze drifting down the light
  float mist = noise2(vec2(vUv.x * 9.0, along * 4.0 - uTime * 0.5)) * noise2(vec2(vUv.x * 4.0 + 3.1, along * 2.0 - uTime * 0.25));
  float body = pow(vFacing, 1.6);
  float a = uOpacity * falloff * body * (0.06 + 0.5 * rays + uMist * 0.35 * mist);
  gl_FragColor = vec4(uColor * (1.0 + rays * 0.6), a);
}`;
const spotVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const spotFrag = /* glsl */ `
uniform float uTime; uniform float uOpacity; uniform float uScan; uniform vec3 uColor;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float spot = pow(1.0 - r, 1.6);
  float scan = (1.0 - smoothstep(0.0, 0.05, abs(fract(vUv.y - uTime * 0.55) - 0.5))) * smoothstep(1.0, 0.3, r);
  float grain = 0.88 + 0.12 * hash(floor(vUv * 28.0) + floor(uTime * 10.0));
  float a = uOpacity * grain * (0.55 * spot + uScan * 0.45 * scan);
  gl_FragColor = vec4(uColor * (1.0 + scan * uScan), a);
}`;

export interface FieldStyle { opacity: number; rays: number; mist: number; scan: number; spot: number; core: boolean; coneR: number }

export const FIELD_STYLE: Record<'mk1' | 'mk2' | 'mk3' | 'drone', FieldStyle> = {
  mk1: { opacity: 0.55, rays: 7, mist: 0.6, scan: 0.35, spot: 0.2, core: false, coneR: 0.12 },
  mk2: { opacity: 0.7, rays: 10, mist: 0.8, scan: 0.55, spot: 0.24, core: false, coneR: 0.14 },
  mk3: { opacity: 0.85, rays: 14, mist: 1, scan: 0.75, spot: 0.28, core: true, coneR: 0.16 },
  drone: { opacity: 0.45, rays: 5, mist: 0.5, scan: 0.2, spot: 0.13, core: false, coneR: 0.065 },
};

function mat(vert: string, frag: string, color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uRays: { value: 8 }, uMist: { value: 1 }, uScan: { value: 0.5 }, uColor: { value: color.clone() } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** One cast of light. Lives in a non-rotating parent (the tower root); positions are in that parent's space. */
export class LightField {
  readonly group = new THREE.Group();
  private shaft: THREE.Mesh;
  private core: THREE.Mesh | null = null;
  private spot: THREE.Mesh;
  private shaftMat: THREE.ShaderMaterial;
  private spotMat: THREE.ShaderMaterial;
  /** 0..1, eased by the owner. */
  intensity = 0;

  constructor(color: THREE.Color, readonly style: FieldStyle) {
    this.shaftMat = mat(shaftVert, shaftFrag, color);
    this.shaftMat.uniforms.uRays.value = style.rays;
    this.shaftMat.uniforms.uMist.value = style.mist;
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.01, style.coneR, 1, 48, 1, true), this.shaftMat);
    this.shaft.renderOrder = 5;
    this.group.add(this.shaft);
    if (style.core) {
      // Mk III: one bright, thin ray down the middle
      const cm = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      this.core = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1, 6, 1, true), cm);
      this.core.renderOrder = 6;
      this.group.add(this.core);
    }
    this.spotMat = mat(spotVert, spotFrag, color);
    this.spotMat.uniforms.uScan.value = style.scan;
    this.spot = new THREE.Mesh(new THREE.PlaneGeometry(style.spot * 2, style.spot * 2), this.spotMat);
    this.spot.rotation.x = -Math.PI / 2;
    this.spot.renderOrder = 4;
    this.group.add(this.spot);
    this.group.visible = false;
  }

  /** `from`: the lens, `to`: the hostile (both in the parent's space). */
  update(from: THREE.Vector3, to: THREE.Vector3, t: number): void {
    const on = this.intensity > 0.01;
    this.group.visible = on;
    if (!on) return;
    const k = this.intensity;
    const ground = new THREE.Vector3(to.x, 0.012, to.z);
    const aim = new THREE.Vector3(to.x, to.y * 0.45, to.z); // the light lands around the hostile and its spot
    const len = from.distanceTo(aim);
    this.shaft.position.copy(from).add(aim).multiplyScalar(0.5);
    this.shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(aim).normalize());
    this.shaft.scale.set(1, len, 1);
    this.shaftMat.uniforms.uTime.value = t;
    this.shaftMat.uniforms.uOpacity.value = this.style.opacity * k;
    if (this.core) {
      const l2 = from.distanceTo(to);
      this.core.position.copy(from).add(to).multiplyScalar(0.5);
      this.core.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(to).normalize());
      this.core.scale.set(1, l2, 1);
      (this.core.material as THREE.MeshBasicMaterial).opacity = (0.45 + 0.1 * Math.sin(t * 9)) * k;
    }
    this.spot.position.copy(ground);
    this.spot.scale.setScalar(k * (1 + 0.015 * Math.sin(t * 7)));
    this.spotMat.uniforms.uTime.value = t;
    this.spotMat.uniforms.uOpacity.value = this.style.opacity * k;
  }
}
