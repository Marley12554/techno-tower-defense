/**
 * Tower Lab: every tower stage in live 3D on a board, with a test malware packet
 * looping past so you can watch towers wake up, track, fire and go back to idle.
 * Design review tool; the tower models themselves live in src/render3d.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildTower, type FireEvent, type Stage, type Tower3D } from '../../src/render3d/towers';
import { ROLE, contactShadow, glow, lightPool } from '../../src/render3d/kit';
import { showCompromised } from './compromised';

/* ------------------------------------------------------------------ setup */
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0c0f');
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);

scene.add(new THREE.HemisphereLight('#b8cbe0', '#0a0c10', 0.9));
const key = new THREE.DirectionalLight('#f2f6ff', 3.2);
key.position.set(-6, 11, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6, near: 1, far: 40 });
key.shadow.bias = -0.0006;
key.shadow.normalBias = 0.02;
scene.add(key);
const rim = new THREE.DirectionalLight('#7fa8ff', 0.5);
rim.position.set(6, 4, -8);
scene.add(rim);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.35, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ------------------------------------------------------------------ board */
const BW = 12.6, BD = 6.2;
function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#141a21'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(210,225,240,0.22)'; g.fillRect(0, 0, 3, 3);
  g.strokeStyle = 'rgba(210,225,240,0.035)'; g.strokeRect(0.5, 0.5, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(BW, BD);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const board = new THREE.Mesh(new THREE.BoxGeometry(BW, 0.3, BD), [
  new THREE.MeshStandardMaterial({ color: '#0c0f13', metalness: 0.3, roughness: 0.8 }),
  new THREE.MeshStandardMaterial({ color: '#0c0f13', metalness: 0.3, roughness: 0.8 }),
  new THREE.MeshStandardMaterial({ map: dotTexture(), metalness: 0.25, roughness: 0.85 }),
  new THREE.MeshStandardMaterial({ color: '#08090c' }),
  new THREE.MeshStandardMaterial({ color: '#0e1216', metalness: 0.3, roughness: 0.8 }),
  new THREE.MeshStandardMaterial({ color: '#0e1216', metalness: 0.3, roughness: 0.8 }),
]);
board.position.y = -0.15;
board.receiveShadow = true;
scene.add(board);

/* ------------------------------------------------------------- the route */
// A closed loop: between the two rows (left to right), then behind the back row.
const loop = [new THREE.Vector2(-5.6, 0), new THREE.Vector2(5.6, 0), new THREE.Vector2(5.6, -2.45), new THREE.Vector2(-5.6, -2.45)];
function chamfered(pts: THREE.Vector2[], c: number): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i - 1 + pts.length) % pts.length], p = pts[i], b = pts[(i + 1) % pts.length];
    out.push(p.clone().add(a.clone().sub(p).normalize().multiplyScalar(c)), p.clone().add(b.clone().sub(p).normalize().multiplyScalar(c)));
  }
  return out;
}
const route = chamfered(loop, 0.45);
const segLen = route.map((p, i) => p.distanceTo(route[(i + 1) % route.length]));
const total = segLen.reduce((a, b) => a + b, 0);
function along(d: number, out: THREE.Vector3): THREE.Vector3 {
  d = ((d % total) + total) % total;
  for (let i = 0; i < route.length; i++) {
    if (d <= segLen[i]) { const a = route[i], b = route[(i + 1) % route.length]; const k = d / segLen[i]; return out.set(a.x + (b.x - a.x) * k, 0, a.y + (b.y - a.y) * k); }
    d -= segLen[i];
  }
  return out.set(route[0].x, 0, route[0].y);
}
/** Flat strip along the route: one plane per straight piece, overlapping at the joints. */
function ribbon(width: number, y: number, mat: THREE.Material): THREE.Group {
  const grp = new THREE.Group();
  for (let i = 0; i < route.length; i++) {
    const a = route[i], b = route[(i + 1) % route.length];
    const len = a.distanceTo(b);
    const geo = new THREE.PlaneGeometry(len + width * 0.42, width);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((a.x + b.x) / 2, y, (a.y + b.y) / 2);
    m.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
    m.receiveShadow = true;
    m.renderOrder = 2;
    grp.add(m);
  }
  return grp;
}
// The traffic channel: a dark recessed strip with a faint hot line down the middle.
scene.add(ribbon(0.52, 0.0025, new THREE.MeshStandardMaterial({ color: '#040506', roughness: 0.95, metalness: 0.05 })));
scene.add(ribbon(0.6, 0.0012, new THREE.MeshStandardMaterial({ color: '#1a2028', roughness: 0.6, metalness: 0.4 })));
scene.add(ribbon(0.03, 0.008, new THREE.MeshBasicMaterial({ color: '#ff4d4f', transparent: true, opacity: 0.7, depthWrite: false })));
scene.add(ribbon(0.2, 0.006, new THREE.MeshBasicMaterial({ color: '#ff2a3a', transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false })));

/* ------------------------------------------------------------------ towers */
interface Slot { tower: Tower3D; name: string; nick: string; x: number; z: number; color: string }
const slots: Slot[] = [];
const COLS = [-4.4, -2.65, -0.9, 0.9, 2.65, 4.4];
const top: [string, Stage, string, string][] = [
  ['inspector', 'mk1', 'INSPECTOR MK I', 'PROBE'], ['inspector', 'mk2', 'MK II', 'SENTINEL'], ['inspector', 'mk3', 'MK III', 'ARRAY'],
  ['limiter', 'mk1', 'RATE LIMITER MK I', 'GATE'], ['limiter', 'mk2', 'MK II', 'CLAMP'], ['limiter', 'mk3', 'MK III', 'CHOKEPOINT'],
];
const bottom: [string, Stage, string, string][] = [
  ['sandbox', 'mk1', 'SANDBOX MK I', 'CELL'], ['sandbox', 'mk2', 'MK II', 'VAULT'], ['sandbox', 'cluster1', 'CLUSTER I', '4 PODS'],
  ['sandbox', 'cluster2', 'CLUSTER II', '6 PODS'], ['sandbox', 'remote1', 'REMOTE I', 'RELAY'], ['sandbox', 'remote2', 'REMOTE II', 'UPLINK'],
];
const ROW_Z = [-1.25, 1.35];
[top, bottom].forEach((row, r) => row.forEach(([kind, stage, name, nick], i) => {
  const tower = buildTower(kind as 'inspector' | 'limiter' | 'sandbox', stage);
  tower.root.position.set(COLS[i], 0, ROW_Z[r]);
  scene.add(tower.root);
  tower.onFire = onFire;
  slots.push({ tower, name, nick, x: COLS[i], z: ROW_Z[r], color: kind === 'inspector' ? '#46c8ff' : kind === 'limiter' ? '#a58bff' : '#35e0b2' });
}));

/* ---------------------------------------------------------- test malware */
// A layered packet: each hit strips a shell, the last one shatters, and it respawns.
const packet = new THREE.Group();
scene.add(packet);
const coreMat = glow(ROLE.hot, 3.2);
const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), coreMat);
packet.add(core);
const shellMats: THREE.MeshStandardMaterial[] = [];
const shells: THREE.Mesh[] = [];
for (let k = 0; k < 3; k++) {
  const m = new THREE.MeshStandardMaterial({ color: '#2a0b0d', emissive: ROLE.hot, emissiveIntensity: 0.9 - k * 0.2, transparent: true, opacity: 0.42 - k * 0.08, metalness: 0.2, roughness: 0.3, depthWrite: false });
  shellMats.push(m);
  const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.1 + k * 0.055, 0), m);
  shells.push(s);
  packet.add(s);
}
const pShadow = contactShadow(0.16); scene.add(pShadow);
const pPool = lightPool(ROLE.hot, 0.55); scene.add(pPool);
let layers = 3, hits = 0, dist = 0, alive = true, respawnAt = 0;
const ppos = new THREE.Vector3();

/* ----------------------------------------------------------------- effects */
interface Fx { obj: THREE.Object3D; t: number; T: number; update: (k: number) => void }
const fx: Fx[] = [];
function addFx(obj: THREE.Object3D, T: number, update: (k: number) => void): void { scene.add(obj); fx.push({ obj, t: 0, T, update }); }
function additive(color: THREE.Color, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}
function onFire(e: FireEvent): void {
  if (!alive) return;
  const to = e.to.clone().setY(0.28);
  if (e.kind === 'beam') {
    const len = e.from.distanceTo(to);
    const g = new THREE.CylinderGeometry(0.012, 0.012, len, 6);
    const m = additive(e.color.clone().multiplyScalar(2.2));
    const beam = new THREE.Mesh(g, m);
    beam.position.copy(e.from).add(to).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(e.from).normalize());
    addFx(beam, 0.14, (k) => { m.opacity = 1 - k; beam.scale.set(1 + k * 2, 1, 1 + k * 2); });
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), additive(e.color.clone().multiplyScalar(2)));
    spark.position.copy(to);
    addFx(spark, 0.18, (k) => { (spark.material as THREE.MeshBasicMaterial).opacity = 1 - k; spark.scale.setScalar(1 + k * 2); });
    hit(1);
  } else {
    // isolation field: a containment box snaps around the target, then collapses
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: e.color.clone().multiplyScalar(2.5), transparent: true }));
    const fill = new THREE.Mesh(geo, additive(e.color, 0.12));
    const grp = new THREE.Group(); grp.add(edges, fill);
    grp.position.copy(to);
    addFx(grp, 0.6, (k) => {
      const s = k < 0.25 ? 0.25 + (k / 0.25) * 0.4 : 0.65 - (k - 0.25) * 0.5;
      grp.scale.setScalar(s);
      (edges.material as THREE.LineBasicMaterial).opacity = 1 - k * k;
      (fill.material as THREE.MeshBasicMaterial).opacity = 0.14 * (1 - k);
    });
    hit(3);
  }
}
function hit(n: number): void {
  hits += n;
  for (const m of shellMats) m.emissiveIntensity = 2.5;
  if (hits >= 5) { hits = 0; layers--; if (layers <= 0) shatter(); }
}
function shatter(): void {
  alive = false;
  respawnAt = performance.now() + 900;
  const c = packet.position.clone();
  for (let i = 0; i < 14; i++) {
    const f = new THREE.Mesh(new THREE.TetrahedronGeometry(0.03 + Math.random() * 0.02), additive(new THREE.Color('#ffb08a'), 1));
    f.position.copy(c);
    const v = new THREE.Vector3((Math.random() - 0.5) * 2.4, Math.random() * 1.6 + 0.4, (Math.random() - 0.5) * 2.4);
    const spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0);
    addFx(f, 0.7, (k) => { f.position.set(c.x + v.x * k * 0.7, c.y + v.y * k * 0.7 - 1.6 * k * k * 0.5, c.z + v.z * k * 0.7); f.rotation.set(spin.x * k, spin.y * k, 0); (f.material as THREE.MeshBasicMaterial).opacity = 1 - k; });
  }
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), additive(new THREE.Color('#ffd2b0'), 1));
  flash.position.copy(c);
  addFx(flash, 0.25, (k) => { flash.scale.setScalar(1 + k * 2.5); (flash.material as THREE.MeshBasicMaterial).opacity = 1 - k; });
}

/* ------------------------------------------------------------------ camera */
let azim = 0, elev = THREE.MathUtils.degToRad(50), turntable = false, slow = false, hostiles = true;
const HOME = new THREE.Vector3(0, 0.2, 0.15);
const focus = HOME.clone(), focusGoal = HOME.clone();
let zoom = 1, zoomGoal = 1;
function placeCamera(): void {
  const d = 30;
  camera.position.set(focus.x + Math.sin(azim) * Math.cos(elev) * d, focus.y + Math.sin(elev) * d, focus.z + Math.cos(azim) * Math.cos(elev) * d);
  camera.lookAt(focus);
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
}
function resize(): void {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  const aspect = w / h;
  let halfW = BW / 2 + 0.3, halfH = halfW / aspect;
  if (halfH < 3.55) { halfH = 3.55; halfW = halfH * aspect; }
  Object.assign(camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
placeCamera();

// Drag rotates, wheel / pinch zooms, tap a tower to fly in on it, tap empty board to go back.
let drag: { x: number; y: number; a: number; e: number; moved: boolean } | null = null;
const touches = new Map<number, { x: number; y: number }>();
let pinch0 = 0, pinchZoom = 1;
canvas.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); pinchZoom = zoomGoal; drag = null; return; }
  drag = { x: e.clientX, y: e.clientY, a: azim, e: elev, moved: false };
});
canvas.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) { const [a, b] = [...touches.values()]; zoomGoal = THREE.MathUtils.clamp(pinchZoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch0, 0.8, 6); return; }
  if (!drag) return;
  if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true;
  azim = drag.a - (e.clientX - drag.x) * 0.008;
  elev = THREE.MathUtils.clamp(drag.e + (e.clientY - drag.y) * 0.006, THREE.MathUtils.degToRad(20), THREE.MathUtils.degToRad(85));
  placeCamera();
});
const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
canvas.addEventListener('pointerup', (e) => {
  touches.delete(e.pointerId);
  if (drag && !drag.moved) {
    ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
    if (ray.ray.intersectPlane(ground, hitP)) {
      let best: Slot | null = null, bd = 0.9;
      for (const sl of slots) { const d = Math.hypot(hitP.x - sl.x, hitP.z - sl.z); if (d < bd) { bd = d; best = sl; } }
      if (best) { focusGoal.set(best.x, 0.3, best.z); zoomGoal = 3.6; }
      else { focusGoal.copy(HOME); zoomGoal = 1; }
    }
  }
  drag = null;
});
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomGoal = THREE.MathUtils.clamp(zoomGoal * Math.pow(1.0015, -e.deltaY), 0.8, 6); }, { passive: false });

const $ = (id: string) => document.getElementById(id)!;
$('hostiles').addEventListener('click', () => { hostiles = !hostiles; $('hostiles').classList.toggle('on', hostiles); });
$('turn').addEventListener('click', () => {
  turntable = !turntable;
  $('turn').classList.toggle('on', turntable);
  if (!turntable) { azim = 0; elev = THREE.MathUtils.degToRad(50); }
});
$('slow').addEventListener('click', () => { slow = !slow; $('slow').classList.toggle('on', slow); });
$('gameover').addEventListener('click', () => showCompromised({ waves: 9, of: 15, vector: 'WAN-2 · SPYWARE', kills: 214, earned: 1260, onRetry: () => {}, onMenu: () => {} }));

/* ------------------------------------------------------------------ labels */
const labelsEl = $('labels');
const labelEls = slots.map((s) => { const el = document.createElement('div'); el.className = 'lbl'; el.innerHTML = `<b style="color:${s.color}">${s.name}</b><span>${s.nick}</span>`; labelsEl.append(el); return el; });
const v = new THREE.Vector3();
function placeLabels(): void {
  slots.forEach((s, i) => {
    v.set(s.x, 0, s.z + 0.62).project(camera);
    const el = labelEls[i];
    el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
  });
}

/* -------------------------------------------------------------------- loop */
let last = performance.now();
let tAcc = 0;
function frame(now: number): void {
  requestAnimationFrame(frame);
  // Camera moves in real time; the scene can run in slow motion.
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const dt = slow ? realDt * 0.3 : realDt;
  tAcc += dt;
  if (turntable && !drag) azim += realDt * 0.35;
  focus.lerp(focusGoal, Math.min(1, realDt * 5));
  zoom += (zoomGoal - zoom) * Math.min(1, realDt * 5);
  placeCamera();

  // packet
  if (!alive && now >= respawnAt) { alive = true; layers = 3; hits = 0; dist = 0; }
  packet.visible = alive && hostiles;
  if (hostiles) {
    dist += dt * 1.25;
    along(dist, ppos);
    packet.position.set(ppos.x, 0.28 + Math.sin(tAcc * 3) * 0.025, ppos.z);
    shells.forEach((s, k) => { s.visible = k < layers; s.rotation.y += dt * (0.8 + k * 0.5); s.rotation.x += dt * 0.4; });
    const shrink = 0.7 + 0.3 * (layers / 3);
    packet.scale.setScalar(shrink);
    coreMat.emissive.copy(ROLE.hot).lerp(new THREE.Color('#ffd9a8'), 1 - layers / 3);
    for (const m of shellMats) m.emissiveIntensity += (0.8 - m.emissiveIntensity) * Math.min(1, dt * 6);
  }
  pShadow.visible = pPool.visible = packet.visible;
  pShadow.position.set(packet.position.x, 0.003, packet.position.z);
  pPool.position.set(packet.position.x, 0.004, packet.position.z);

  for (const s of slots) {
    const inRange = packet.visible && Math.hypot(packet.position.x - s.x, packet.position.z - s.z) <= s.tower.range;
    s.tower.update(dt, tAcc, inRange ? packet.position : null);
  }
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.t += dt;
    const k = Math.min(1, f.t / f.T);
    f.update(k);
    if (k >= 1) { scene.remove(f.obj); fx.splice(i, 1); }
  }
  placeLabels();
  composer.render();
  frames++;
  if (now - fpsAt > 1000) { fpsEl.textContent = `${Math.round((frames * 1000) / (now - fpsAt))} FPS`; frames = 0; fpsAt = now; }
}
let frames = 0, fpsAt = performance.now();
const fpsEl = document.getElementById('fps')!;
requestAnimationFrame(frame);
(window as unknown as { __lab: unknown }).__lab = { slots, scene, ready: true, focusOn: (i: number, z = 3.6) => { focusGoal.set(slots[i].x, 0.3, slots[i].z); zoomGoal = z; }, setView: (a: number, el: number) => { azim = a; elev = el; } };
document.body.dataset.ready = '1';
