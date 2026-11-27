/**
 * Shared 3D construction kit: materials and part builders. Every part is built
 * with its origin at the bottom center, so stacking is just "put it on top of
 * the previous part's height", and nothing floats or clips by accident.
 *
 * Units: one board cell = 1. +Y is up, +Z faces the camera (the front).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const ROLE = {
  dmg: new THREE.Color('#46c8ff'),
  area: new THREE.Color('#35e0b2'),
  sup: new THREE.Color('#a58bff'),
  hot: new THREE.Color('#ff4d4f'),
  ice: new THREE.Color('#cfe6ff'),
};

/** Industrial materials: one construction language for every tower. */
export const MAT = {
  body: new THREE.MeshStandardMaterial({ color: '#46505c', metalness: 0.5, roughness: 0.45 }),
  plate: new THREE.MeshStandardMaterial({ color: '#58626f', metalness: 0.55, roughness: 0.38 }),
  heavy: new THREE.MeshStandardMaterial({ color: '#68737f', metalness: 0.6, roughness: 0.32 }),
  dark: new THREE.MeshStandardMaterial({ color: '#232a32', metalness: 0.4, roughness: 0.6 }),
  well: new THREE.MeshStandardMaterial({ color: '#050709', metalness: 0.1, roughness: 0.9 }),
  fin: new THREE.MeshStandardMaterial({ color: '#8893a0', metalness: 0.75, roughness: 0.28 }),
  glass: new THREE.MeshStandardMaterial({ color: '#0a1a22', metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.55 }),
};

/** A per-tower emissive material, so each tower can light up on its own. */
export function glow(color: THREE.Color, intensity = 1.5): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#0b0f14', emissive: color.clone(), emissiveIntensity: intensity, metalness: 0, roughness: 0.4 });
}

function finish<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return o;
}

/** Bevelled box, origin at bottom center. */
export function box(w: number, h: number, d: number, mat: THREE.Material, r = 0.015): THREE.Mesh {
  const rr = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const g = new RoundedBoxGeometry(w, h, d, 2, Math.max(0.001, rr));
  g.translate(0, h / 2, 0);
  return finish(new THREE.Mesh(g, mat));
}

/** Regular prism (6 = hex, 8 = octagon), flat side facing the camera. Origin at bottom center. */
export function prism(sides: number, r: number, h: number, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r, r, h, sides);
  g.rotateY(Math.PI / sides);
  g.translate(0, h / 2, 0);
  return finish(new THREE.Mesh(g, mat));
}

export function cyl(r: number, h: number, mat: THREE.Material, seg = 28, rTop = r): THREE.Mesh {
  const g = new THREE.CylinderGeometry(rTop, r, h, seg);
  g.translate(0, h / 2, 0);
  return finish(new THREE.Mesh(g, mat));
}

/** A ring lying flat (like a collar), centered at its own origin. */
export function ring(r: number, tube: number, mat: THREE.Material, seg = 40): THREE.Mesh {
  const g = new THREE.TorusGeometry(r, tube, 10, seg);
  g.rotateX(Math.PI / 2);
  return finish(new THREE.Mesh(g, mat));
}

/** Round beam between two points (struts, braces, pipes). */
export function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 10);
  const m = finish(new THREE.Mesh(g, mat));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

/** Places an object and returns it, for terse assembly code. */
export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, parent?: THREE.Object3D): T {
  o.position.set(x, y, z);
  parent?.add(o);
  return o;
}

/** A soft additive light pool on the board under an emissive part. Opacity is driven by the tower state. */
let poolTex: THREE.Texture | null = null;
export function lightPool(color: THREE.Color, radius: number): THREE.Mesh {
  if (!poolTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    poolTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: poolTex, color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.004;
  m.renderOrder = 1;
  return m;
}

/** Fake contact shadow: a dark soft disc right under a part, grounding it on the board. */
export function contactShadow(radius: number): THREE.Mesh {
  const m = lightPool(new THREE.Color('#000000'), radius);
  const mat = m.material as THREE.MeshBasicMaterial;
  mat.blending = THREE.NormalBlending;
  mat.color.set('#000000');
  mat.opacity = 0.55;
  m.position.y = 0.003;
  return m;
}
