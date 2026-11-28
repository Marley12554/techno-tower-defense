/**
 * Tower Lab: one tower lineage at a time in live 3D, with invincible test packets
 * looping past so you can watch each tower's personality: idle, waking up,
 * tracking, firing. The far side of the loop runs through a covered tunnel
 * behind a wall, out of sight. Design review tool; models live in src/render3d.
 *
 *   ?lineage=inspector|limiter|sandbox   ?check   (logs clipping parts)
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildTower, type FireEvent, type Stage } from '../../src/render3d/towers';
import { buildTower as buildR6 } from '../../src/render3d/legacy/r6';
import { InspectorCamera } from '../../src/render3d/legacy/r8-camera';
import { InspectorRobot } from '../../src/render3d/legacy/r8-robot';
import { buildTower as buildR5 } from '../../src/render3d/legacy/r5';
import { buildTower as buildR4 } from '../../src/render3d/legacy/r4';
import { GEN, ROLE, box, contactShadow, findClipping, glow, lightPool } from '../../src/render3d/kit';
import { showCompromised } from './compromised';

type Lineage = 'inspector' | 'limiter' | 'sandbox';
const LINEAGES: Record<Lineage, { label: string; color: string; redone: boolean; stages: [Stage, string, string][] }> = {
  inspector: { label: 'INSPECTOR', color: '#46c8ff', redone: true, stages: [['mk1', 'MK I', 'PROBE'], ['mk2', 'MK II', 'SENTINEL'], ['mk3', 'MK III', 'ARRAY']] },
  limiter: { label: 'RATE LIMITER', color: '#a58bff', redone: false, stages: [['mk1', 'MK I', 'GATE'], ['mk2', 'MK II', 'CLAMP'], ['mk3', 'MK III', 'CHOKEPOINT']] },
  sandbox: { label: 'SANDBOX', color: '#35e0b2', redone: false, stages: [['mk1', 'MK I', 'CELL'], ['mk2', 'MK II', 'VAULT'], ['cluster1', 'CLUSTER I', '4 PODS'], ['cluster2', 'CLUSTER II', '6 PODS'], ['remote1', 'REMOTE I', 'RELAY'], ['remote2', 'REMOTE II', 'UPLINK']] },
};
/* Older rounds stay viewable for comparison, behind the ⋯ menu. */
type Version = 'current' | 'r8a' | 'r8b' | 'r6' | 'r5' | 'r4';
const VERSIONS: Record<Lineage, { id: Version | '2d'; label: string }[]> = {
  inspector: [{ id: 'current', label: 'Current (round 10 · v3 Array lineage)' }, { id: 'r8a', label: 'Round 8 A · camera on a yoke' }, { id: 'r8b', label: 'Round 8 B · anxious robot' }, { id: 'r6', label: 'Round 6 · eye in a socket' }, { id: 'r5', label: 'Round 5 · camera on a yoke' }, { id: 'r4', label: 'Round 4 · first 3D' }, { id: '2d', label: 'Original 2D frames' }],
  limiter: [{ id: 'current', label: 'Current (round 4)' }, { id: '2d', label: 'Original 2D frames' }],
  sandbox: [{ id: 'current', label: 'Current (round 4)' }, { id: '2d', label: 'Original 2D frames' }],
};
let version: Version = 'current';
/** What the lab needs from any tower, whichever round it comes from. */
interface LabTower { root: THREE.Group; range: number; locks: THREE.Vector3[]; onFire: ((e: FireEvent) => void) | null; update(dt: number, t: number, targets: THREE.Vector3[]): void }
function makeTower(kind: Lineage, stage: Stage): LabTower {
  const tier = (stage === 'mk1' ? 1 : stage === 'mk2' ? 2 : 3) as 1 | 2 | 3;
  if (version === 'r8a' && kind === 'inspector') return new InspectorCamera(tier) as unknown as LabTower;
  if (version === 'r8b' && kind === 'inspector') return new InspectorRobot(tier) as unknown as LabTower;
  if (version === 'r6') return buildR6(kind, stage) as unknown as LabTower;
  if (version === 'r5') return buildR5(kind, stage) as unknown as LabTower;
  if (version === 'r4') {
    const old = buildR4(kind, stage);
    const w: LabTower = { root: old.root, range: old.range, locks: [], onFire: null, update: (dt, t, ts) => old.update(dt, t, ts[0] ?? null) };
    old.onFire = (e) => w.onFire?.(e);
    return w;
  }
  return buildTower(kind, stage) as unknown as LabTower;
}
const params = new URLSearchParams(location.search);
let lineage: Lineage = (params.get('lineage') as Lineage) || 'inspector';
const CHECK = params.has('check');

/* ------------------------------------------------------------------ setup */
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0c0f');
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
const pmrem = new THREE.PMREMGenerator(renderer);
// a soft studio environment so metal and glass have something to reflect
{
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
  const geo = sky.geometry as THREE.BufferGeometry;
  const cols: number[] = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 10; const c = new THREE.Color('#0b0e12').lerp(new THREE.Color('#9fb6cf'), Math.max(0, y) ** 1.5); cols.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(sky);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  panel.position.set(-4, 6, 4); panel.lookAt(0, 0, 0); env.add(panel);
  scene.environment = pmrem.fromScene(env, 0.04).texture;
  scene.environmentIntensity = 0.8;
}
scene.add(new THREE.HemisphereLight('#b8cbe0', '#0a0c10', 0.45));
const key = new THREE.DirectionalLight('#f4f7ff', 3.0);
key.position.set(-6, 11, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6, near: 1, far: 40 });
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
scene.add(key);
const rim = new THREE.DirectionalLight('#8fb4ff', 1.6); // cool rim from behind: separates silhouettes from the board
rim.position.set(4, 5, -9);
scene.add(rim);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ------------------------------------------------------- per-lineage world */
let world = new THREE.Group();
scene.add(world);
interface Slot { tower: LabTower; name: string; nick: string; x: number; z: number }
let slots: Slot[] = [];
let BW = 9, BD = 5.4;
const TRACK_Z = 1.45, WALL_Z = -1.2, TUNNEL_Z = -2.05;
let route: THREE.Vector2[] = [];
let segLen: number[] = [];
let total = 1;

function dotTexture(w: number, d: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#141a21'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(210,225,240,0.22)'; g.fillRect(0, 0, 3, 3);
  g.strokeStyle = 'rgba(210,225,240,0.035)'; g.strokeRect(0.5, 0.5, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w, d);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function along(d: number, out: THREE.Vector3): THREE.Vector3 {
  d = ((d % total) + total) % total;
  for (let i = 0; i < route.length; i++) {
    if (d <= segLen[i]) { const a = route[i], b = route[(i + 1) % route.length]; const k = d / segLen[i]; return out.set(a.x + (b.x - a.x) * k, 0, a.y + (b.y - a.y) * k); }
    d -= segLen[i];
  }
  return out.set(route[0].x, 0, route[0].y);
}
function strip(width: number, y: number, mat: THREE.Material, parent: THREE.Object3D): void {
  for (let i = 0; i < route.length; i++) {
    const a = route[i], b = route[(i + 1) % route.length];
    const len = a.distanceTo(b);
    const geo = new THREE.PlaneGeometry(len + width * 0.42, width);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((a.x + b.x) / 2, y, (a.y + b.y) / 2);
    m.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
    m.receiveShadow = true;
    parent.add(m);
  }
}
function inTunnel(p: THREE.Vector3): boolean { return p.z < WALL_Z - 0.35 && Math.abs(p.x) < BW / 2 - 0.9; }

function buildWorld(): void {
  scene.remove(world);
  world.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
  world = new THREE.Group();
  scene.add(world);
  const L = LINEAGES[lineage];
  const n = L.stages.length;
  const spacing = n > 3 ? 1.85 : 2.3;
  BW = Math.max(8.4, n * spacing + 1.6);
  BD = 5.6;
  const board = new THREE.Mesh(new THREE.BoxGeometry(BW, 0.3, BD), [
    new THREE.MeshStandardMaterial({ color: '#0c0f13' }), new THREE.MeshStandardMaterial({ color: '#0c0f13' }),
    new THREE.MeshStandardMaterial({ map: dotTexture(BW, BD), metalness: 0.25, roughness: 0.85 }), new THREE.MeshStandardMaterial({ color: '#08090c' }),
    new THREE.MeshStandardMaterial({ color: '#0e1216' }), new THREE.MeshStandardMaterial({ color: '#0e1216' }),
  ]);
  board.position.set(0, -0.15, -0.35);
  board.receiveShadow = true;
  world.add(board);
  // loop: front straight (visible), down the sides, back through the tunnel
  const xe = BW / 2 - 0.55, c = 0.45;
  const corners = [new THREE.Vector2(-xe, TRACK_Z), new THREE.Vector2(xe, TRACK_Z), new THREE.Vector2(xe, TUNNEL_Z), new THREE.Vector2(-xe, TUNNEL_Z)];
  route = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[(i + 3) % 4], p = corners[i], b = corners[(i + 1) % 4];
    route.push(p.clone().add(a.clone().sub(p).normalize().multiplyScalar(c)), p.clone().add(b.clone().sub(p).normalize().multiplyScalar(c)));
  }
  segLen = route.map((p, i) => p.distanceTo(route[(i + 1) % route.length]));
  total = segLen.reduce((a, b) => a + b, 0);
  strip(0.6, 0.0012, new THREE.MeshStandardMaterial({ color: '#1a2028', roughness: 0.6, metalness: 0.4 }), world);
  strip(0.52, 0.0025, new THREE.MeshStandardMaterial({ color: '#040506', roughness: 0.95, metalness: 0.05 }), world);
  strip(0.03, 0.008, new THREE.MeshBasicMaterial({ color: '#ff4d4f', transparent: true, opacity: 0.6, depthWrite: false }), world);
  strip(0.2, 0.006, new THREE.MeshBasicMaterial({ color: '#ff2a3a', transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false }), world);
  // wall between the towers and the far track, with a light line along its top
  const wall = box(BW - 0.5, 0.3, 0.1, GEN.armor, 0.02);
  wall.position.set(0, 0, WALL_Z);
  world.add(wall);
  const line = new THREE.Mesh(new THREE.BoxGeometry(BW - 0.6, 0.006, 0.012), glow(ROLE.ice, 0.5));
  line.position.set(0, 0.303, WALL_Z + 0.04);
  world.add(line);
  // covered tunnel over the far straight
  const tunnel = box(BW - 1.7, 0.16, 0.72, GEN.gunmetal, 0.03);
  tunnel.position.set(0, 0, TUNNEL_Z);
  world.add(tunnel);
  for (const sx of [-1, 1]) { const mouth = box(0.08, 0.2, 0.8, GEN.trim, 0.01); mouth.position.set(sx * (BW / 2 - 0.85), 0, TUNNEL_Z); world.add(mouth); }
  // towers
  slots.forEach((s) => s.tower.root.parent?.remove(s.tower.root));
  slots = L.stages.map(([stage, name, nick], i) => {
    const tower = makeTower(lineage, stage);
    const x = (i - (n - 1) / 2) * spacing;
    tower.root.position.set(x, 0, 0);
    world.add(tower.root);
    tower.onFire = onFire;
    return { tower, name, nick, x, z: 0 };
  });
  // labels
  labelsEl.innerHTML = '';
  labelEls = slots.map((s, i) => {
    const el = document.createElement('div');
    el.className = 'lbl';
    el.innerHTML = `<b style="color:${L.color}">${i === 0 ? L.label + ' ' : ''}${s.name}</b><span>${s.nick}</span>`;
    labelsEl.append(el);
    return el;
  });
  solo = null;
  updateNote();
  renderVersionMenu();
  packets.forEach((p, i) => { p.dist = (i / packets.length) * total; });
  focusGoal.copy(HOME); zoomGoal = 1;
  resize();
  if (CHECK) {
    const report = slots.map((s) => ({ tower: `${L.label} ${s.name}`, clips: findClipping(s.tower.root) }));
    console.log('CLIPCHECK ' + JSON.stringify(report));
  }
}

/* ---------------------------------------------------------- test packets */
// Invincible: hits strip layers, layers regrow, nothing dies. Shows layered health without emptying the board.
interface Packet { g: THREE.Group; core: THREE.Mesh; coreMat: THREE.MeshStandardMaterial; shells: THREE.Mesh[]; mats: THREE.MeshStandardMaterial[]; shadow: THREE.Mesh; pool: THREE.Mesh; layers: number; hits: number; regrow: number; dist: number; pos: THREE.Vector3 }
const packets: Packet[] = [];
for (let i = 0; i < 1; i++) {
  const g = new THREE.Group();
  const coreMat = glow(ROLE.hot, 3.2);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), coreMat);
  g.add(core);
  const shells: THREE.Mesh[] = [], mats: THREE.MeshStandardMaterial[] = [];
  for (let k = 0; k < 3; k++) {
    const m = new THREE.MeshStandardMaterial({ color: '#2a0b0d', emissive: ROLE.hot, emissiveIntensity: 0.9 - k * 0.2, transparent: true, opacity: 0.42 - k * 0.08, metalness: 0.2, roughness: 0.3, depthWrite: false });
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.1 + k * 0.055, 0), m);
    mats.push(m); shells.push(s); g.add(s);
  }
  const shadow = contactShadow(0.16), pool = lightPool(ROLE.hot, 0.5);
  scene.add(g, shadow, pool);
  packets.push({ g, core, coreMat, shells, mats, shadow, pool, layers: 3, hits: 0, regrow: 0, dist: 0, pos: g.position });
}

/* ----------------------------------------------------------------- effects */
interface Fx { obj: THREE.Object3D; t: number; T: number; update: (k: number) => void }
const fx: Fx[] = [];
function addFx(obj: THREE.Object3D, T: number, update: (k: number) => void): void { scene.add(obj); fx.push({ obj, t: 0, T, update }); }
const additive = (color: THREE.Color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
function nearestPacket(p: THREE.Vector3): Packet | null {
  let best: Packet | null = null, bd = 0.6;
  for (const k of packets) { const d = k.pos.distanceTo(p); if (d < bd) { bd = d; best = k; } }
  return best;
}
function onFire(e: FireEvent): void {
  const to = e.to.clone();
  const pk = nearestPacket(to);
  if (e.kind === 'field') {
    if (pk) { hit(pk, 1); burstShards(pk.pos, (e.tier ?? 1) + 1); }
    return;
  }
  if (e.kind === 'beam') {
    const len = e.from.distanceTo(to);
    const m = additive(e.color.clone().multiplyScalar(2.2));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, len, 6), m);
    beam.position.copy(e.from).add(to).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(e.from).normalize());
    addFx(beam, 0.1, (k) => { m.opacity = 1 - k; beam.scale.set(1 + k * 1.5, 1, 1 + k * 1.5); });
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), additive(e.color.clone().multiplyScalar(2)));
    spark.position.copy(to);
    addFx(spark, 0.15, (k) => { (spark.material as THREE.MeshBasicMaterial).opacity = 1 - k; spark.scale.setScalar(1 + k * 2); });
    if (pk) hit(pk, 1);
  } else {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: e.color.clone().multiplyScalar(2.5), transparent: true }));
    const fill = new THREE.Mesh(geo, additive(e.color, 0.12));
    const grp = new THREE.Group(); grp.add(edges, fill);
    grp.position.copy(to);
    addFx(grp, 0.6, (k) => { grp.scale.setScalar(k < 0.25 ? 0.25 + (k / 0.25) * 0.4 : 0.65 - (k - 0.25) * 0.5); (edges.material as THREE.LineBasicMaterial).opacity = 1 - k * k; (fill.material as THREE.MeshBasicMaterial).opacity = 0.14 * (1 - k); });
    if (pk) hit(pk, 3);
  }
}
function hit(p: Packet, n: number): void {
  p.hits += n;
  p.regrow = 1.8;
  for (const m of p.mats) m.emissiveIntensity = 2.5;
  if (p.hits >= 5) {
    p.hits = 0;
    if (p.layers > 1) { p.layers--; burstShards(p.pos, 6); }
    else burstShards(p.pos, 3);
  }
}
function burstShards(c0: THREE.Vector3, n: number): void {
  const c = c0.clone();
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(new THREE.TetrahedronGeometry(0.025 + Math.random() * 0.015), additive(new THREE.Color('#ffb08a')));
    const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.3 + 0.3, (Math.random() - 0.5) * 2);
    addFx(f, 0.5, (k) => { f.position.set(c.x + v.x * k * 0.6, c.y + v.y * k * 0.6 - 0.6 * k * k, c.z + v.z * k * 0.6); f.rotation.set(k * 9, k * 7, 0); (f.material as THREE.MeshBasicMaterial).opacity = 1 - k; });
  }
}
/* Target brackets: four corners that face the camera, wherever a tower is locked on. */
const brackets: THREE.LineSegments[] = [];
function bracket(): THREE.LineSegments {
  const s = 0.17, k = 0.07, p: number[] = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.push(sx * s, sy * s, 0, sx * s, sy * (s - k), 0, sx * s, sy * s, 0, sx * (s - k), sy * s, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: ROLE.dmg.clone().multiplyScalar(1.8), transparent: true, depthTest: false }));
  l.renderOrder = 10;
  scene.add(l);
  return l;
}

/* ------------------------------------------------------------------ camera */
let azim = 0, elev = THREE.MathUtils.degToRad(48), turntable = false, slow = false, hostiles = true;
const HOME = new THREE.Vector3(0, 0.3, -0.1);
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
  let halfW = BW / 2 + 0.2, halfH = halfW / aspect;
  if (halfH < 2.75) { halfH = 2.75; halfW = halfH * aspect; }
  Object.assign(camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// One finger / left mouse: pan. Two fingers / right mouse / shift: rotate. Pinch / wheel: zoom.
// Tap a tower: zoom in and solo it (only it engages). Tap empty board: back to the full view.
let drag: { x: number; y: number; lx: number; ly: number; rotate: boolean; moved: boolean } | null = null;
const touches = new Map<number, { x: number; y: number }>();
let pinch0 = 0, pinchZoom = 1, mid0 = { x: 0, y: 0 }, azim0 = 0, elev0 = 0;
let solo: number | null = null;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    pinch0 = Math.hypot(a.x - b.x, a.y - b.y); pinchZoom = zoomGoal;
    mid0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; azim0 = azim; elev0 = elev;
    drag = null;
    return;
  }
  drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, rotate: e.button === 2 || e.shiftKey, moved: false };
});
function pan(dx: number, dy: number): void {
  const upp = (camera.top - camera.bottom) / camera.zoom / innerHeight;
  const rx = Math.cos(azim), rz = -Math.sin(azim), fx = -Math.sin(azim), fz = -Math.cos(azim);
  const k = upp / Math.max(0.3, Math.sin(elev));
  focusGoal.x += -rx * dx * upp + fx * dy * k;
  focusGoal.z += -rz * dx * upp + fz * dy * k;
  focusGoal.x = THREE.MathUtils.clamp(focusGoal.x, -BW / 2, BW / 2);
  focusGoal.z = THREE.MathUtils.clamp(focusGoal.z, -BD / 2, BD / 2);
  focus.copy(focusGoal);
}
canvas.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    zoomGoal = THREE.MathUtils.clamp(pinchZoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch0, 0.8, 6);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    azim = azim0 - (mx - mid0.x) * 0.008;
    elev = THREE.MathUtils.clamp(elev0 + (my - mid0.y) * 0.006, THREE.MathUtils.degToRad(15), THREE.MathUtils.degToRad(85));
    return;
  }
  if (!drag) return;
  if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 10) drag.moved = true;
  const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly;
  drag.lx = e.clientX; drag.ly = e.clientY;
  if (!drag.moved) return;
  if (drag.rotate) { azim -= dx * 0.008; elev = THREE.MathUtils.clamp(elev + dy * 0.006, THREE.MathUtils.degToRad(15), THREE.MathUtils.degToRad(85)); }
  else pan(dx, dy);
});
const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
canvas.addEventListener('pointerup', (e) => {
  touches.delete(e.pointerId);
  if (drag && !drag.moved) {
    ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
    if (ray.ray.intersectPlane(ground, hitP)) {
      let best = -1, bd = 0.95;
      slots.forEach((sl, i) => { const d = Math.hypot(hitP.x - sl.x, hitP.z - sl.z); if (d < bd) { bd = d; best = i; } });
      setSolo(best >= 0 ? best : null);
    }
  }
  drag = null;
});
canvas.addEventListener('pointercancel', (e) => { touches.delete(e.pointerId); drag = null; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomGoal = THREE.MathUtils.clamp(zoomGoal * Math.pow(1.0015, -e.deltaY), 0.8, 6); }, { passive: false });
function setSolo(i: number | null): void {
  solo = i;
  if (i === null) { focusGoal.copy(HOME); zoomGoal = 1; }
  else { focusGoal.set(slots[i].x, 0.35, slots[i].z); zoomGoal = Math.max(zoomGoal, 2.4); }
  updateNote();
}

const $ = (id: string) => document.getElementById(id)!;
$('hostiles').addEventListener('click', () => { hostiles = !hostiles; $('hostiles').classList.toggle('on', hostiles); });
$('turn').addEventListener('click', () => { turntable = !turntable; $('turn').classList.toggle('on', turntable); if (!turntable) { azim = 0; elev = THREE.MathUtils.degToRad(48); } });
$('slow').addEventListener('click', () => { slow = !slow; $('slow').classList.toggle('on', slow); });
$('gameover').addEventListener('click', () => showCompromised({ waves: 9, of: 15, vector: 'WAN-2 · SPYWARE', kills: 214, earned: 1260, onRetry: () => {}, onMenu: () => {} }));
document.querySelectorAll<HTMLButtonElement>('[data-lineage]').forEach((b) => {
  b.classList.toggle('on', b.dataset.lineage === lineage);
  b.addEventListener('click', () => {
    lineage = b.dataset.lineage as Lineage;
    version = 'current';
    document.querySelectorAll('[data-lineage]').forEach((x) => x.classList.toggle('on', x === b));
    buildWorld();
  });
});

function updateNote(): void {
  const L = LINEAGES[lineage];
  const vLabel = VERSIONS[lineage].find((x) => x.id === version)?.label ?? '';
  const parts: string[] = [];
  if (version !== 'current') parts.push(`COMPARING · ${vLabel.toUpperCase()}`);
  else if (!L.redone) parts.push('NOT REDONE YET · OLD MODELS');
  if (solo !== null && slots[solo]) parts.push(`SOLO · ${slots[solo].name} · TAP EMPTY BOARD TO EXIT`);
  document.getElementById('note')!.textContent = parts.join('   ');
}

/* ------------------------------------------------------------ compare menu */
const menu = $('vermenu');
$('more').addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('open'); });
addEventListener('click', () => menu.classList.remove('open'));
menu.addEventListener('click', (e) => e.stopPropagation());
function renderVersionMenu(): void {
  menu.innerHTML = `<div class="vm-h">COMPARE ${LINEAGES[lineage].label} MODELS</div>`;
  for (const v of VERSIONS[lineage]) {
    const b = document.createElement('button');
    b.className = `vm-i${v.id === version ? ' on' : ''}`;
    b.textContent = v.label;
    b.addEventListener('click', () => {
      menu.classList.remove('open');
      if (v.id === '2d') { open2d(); return; }
      version = v.id;
      buildWorld();
    });
    menu.append(b);
  }
}
$('close2d').addEventListener('click', () => $('frames2d').classList.remove('open'));
/** The 2D sheet is drawn for 1280x720; scale it to fit whatever screen this is. */
function open2d(): void {
  const f = $('frames2d').querySelector('iframe') as HTMLIFrameElement;
  const k = Math.min(innerWidth / 1280, innerHeight / 720);
  Object.assign(f.style, { width: '1280px', height: '720px', transform: `scale(${k})`, transformOrigin: '0 0', position: 'absolute', left: `${(innerWidth - 1280 * k) / 2}px`, top: `${(innerHeight - 720 * k) / 2}px` });
  $('frames2d').classList.add('open');
}

/* ------------------------------------------------------------------ labels */
const labelsEl = $('labels');
let labelEls: HTMLElement[] = [];
const v = new THREE.Vector3();
function placeLabels(): void {
  slots.forEach((s, i) => {
    v.set(s.x, 0, s.z + 0.62).project(camera);
    labelEls[i].style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
    labelEls[i].style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
  });
}

/* -------------------------------------------------------------------- loop */
buildWorld();
let last = performance.now(), tAcc = 0, frames = 0, fpsAt = performance.now();
const fpsEl = $('fps');
function frame(now: number): void {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const dt = slow ? realDt * 0.3 : realDt;
  tAcc += dt;
  if (turntable && !drag) azim += realDt * 0.35;
  focus.lerp(focusGoal, Math.min(1, realDt * 5));
  zoom += (zoomGoal - zoom) * Math.min(1, realDt * 5);
  placeCamera();

  const visible: Packet[] = [];
  for (const p of packets) {
    p.dist += dt * 1.15;
    along(p.dist, p.pos);
    p.pos.y = 0.28 + Math.sin(tAcc * 3 + p.dist) * 0.025;
    const show = hostiles && !inTunnel(p.pos);
    p.g.visible = p.shadow.visible = p.pool.visible = show;
    if (show) visible.push(p);
    p.regrow -= dt;
    if (p.regrow <= 0 && p.layers < 3) { p.layers++; p.regrow = 1.2; }
    p.shells.forEach((s, k) => { s.visible = k < p.layers; s.rotation.y += dt * (0.8 + k * 0.5); s.rotation.x += dt * 0.4; });
    p.g.scale.setScalar(0.7 + 0.3 * (p.layers / 3));
    p.coreMat.emissive.copy(ROLE.hot).lerp(new THREE.Color('#ffd9a8'), 1 - p.layers / 3);
    for (const m of p.mats) m.emissiveIntensity += (0.8 - m.emissiveIntensity) * Math.min(1, dt * 6);
    p.shadow.position.set(p.pos.x, 0.003, p.pos.z);
    p.pool.position.set(p.pos.x, 0.004, p.pos.z);
  }
  // towers see hostiles in range and in front of the wall, nearest first
  const lockSet = new Set<THREE.Vector3>();
  for (const s of slots) {
    const ts = visible
      .filter((p) => p.pos.z > WALL_Z && Math.hypot(p.pos.x - s.x, p.pos.z - s.z) <= s.tower.range)
      .sort((a, b) => Math.hypot(a.pos.x - s.x, a.pos.z - s.z) - Math.hypot(b.pos.x - s.x, b.pos.z - s.z))
      .map((p) => p.pos);
    s.tower.update(dt, tAcc, solo === null || slots[solo] === s ? ts : []);
    for (const l of s.tower.locks) lockSet.add(l);
  }
  const locks = [...lockSet];
  while (brackets.length < locks.length) brackets.push(bracket());
  brackets.forEach((b, i) => {
    b.visible = i < locks.length;
    if (b.visible) { b.position.copy(locks[i]); b.quaternion.copy(camera.quaternion); b.scale.setScalar(1 + 0.08 * Math.sin(tAcc * 12)); }
  });
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
requestAnimationFrame(frame);
(window as unknown as { __lab: unknown }).__lab = {
  get slots() { return slots; },
  focusOn: (i: number, z = 2.6) => { setSolo(i); zoomGoal = z; },
  unsolo: () => setSolo(null),
  setVersion: (v: Version) => { version = v; buildWorld(); },
  setView: (a: number, el: number) => { azim = a; elev = el; },
  setLineage: (l: Lineage) => { lineage = l; buildWorld(); },
  /** Test hook: puts the hostile on the front straight just before tower i. */
  parkNear: (i: number) => {
    const v = new THREE.Vector3();
    let best = 0, bd = 1e9;
    for (let d = 0; d < total; d += 0.05) { along(d, v); if (v.z <= WALL_Z) continue; const dd = Math.hypot(v.x - slots[i].x, v.z - slots[i].z); if (dd < bd) { bd = dd; best = d; } }
    packets[0].dist = best - 0.5;
  },
};
document.body.dataset.ready = '1';
