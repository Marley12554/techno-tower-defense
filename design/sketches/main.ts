/**
 * Round 9 concept sketches: three directions per tower, each a Mk I > Mk III
 * transformation strip plus an attack vignette. Drawn as animated light-line
 * sketches with a tiny orthographic 3D projector (same tilt as the game).
 */
type V = [number, number, number];
const EL = (50 * Math.PI) / 180, CE = Math.cos(EL), SE = Math.sin(EL);
const COL = { dmg: '#46c8ff', area: '#35e0b2', sup: '#a58bff', hot: '#ff4d4f' };

interface C { g: CanvasRenderingContext2D; cx: number; cy: number; s: number; t: number; col: string; w: number; h: number }

const rx = (p: V, a: number): V => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
const ry = (p: V, a: number): V => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
const rz = (p: V, a: number): V => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const rot = (p: V, a: V): V => ry(rx(rz(p, a[2]), a[0]), a[1]);
function P(c: C, p: V): [number, number, number] { return [c.cx + p[0] * c.s, c.cy - (p[1] * CE - p[2] * SE) * c.s, p[1] * SE + p[2] * CE]; }
function rgba(hex: string, a: number): string { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }

/** A line of light: depth fades the far side so shapes read in 3D. */
function seg(c: C, a: V, b: V, col = c.col, w = 1.3, alpha = 1): void {
  const pa = P(c, a), pb = P(c, b);
  const d = 0.55 + 0.45 * Math.max(-1, Math.min(1, (pa[2] + pb[2]) * 0.9));
  const g = c.g;
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = rgba(col, 0.16 * d * alpha); g.lineWidth = w * 4; g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); g.stroke();
  g.strokeStyle = rgba(col, 0.9 * d * alpha); g.lineWidth = w; g.stroke();
  g.globalCompositeOperation = 'source-over';
}
function poly(c: C, pts: V[], col = c.col, w = 1.2, closed = true, alpha = 1): void { for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) seg(c, pts[i], pts[(i + 1) % pts.length], col, w, alpha); }
function fill(c: C, pts: V[], col = c.col, a = 0.12): void {
  const g = c.g; g.globalCompositeOperation = 'lighter'; g.fillStyle = rgba(col, a); g.beginPath();
  pts.forEach((p, i) => { const q = P(c, p); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
  g.closePath(); g.fill(); g.globalCompositeOperation = 'source-over';
}
function dot(c: C, p: V, r: number, col = c.col, a = 1): void {
  const q = P(c, p), g = c.g; g.globalCompositeOperation = 'lighter';
  const grd = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], r * c.s * 3);
  grd.addColorStop(0, rgba('#ffffff', a)); grd.addColorStop(0.25, rgba(col, 0.8 * a)); grd.addColorStop(1, rgba(col, 0));
  g.fillStyle = grd; g.beginPath(); g.arc(q[0], q[1], r * c.s * 3, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over';
}
function ring(c: C, ctr: V, r: number, a: V, col = c.col, w = 1.3, n = 48, alpha = 1): void {
  const pts: V[] = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; pts.push(add(ctr, rot([Math.cos(t) * r, 0, Math.sin(t) * r], a))); }
  poly(c, pts, col, w, true, alpha);
}
function octa(c: C, ctr: V, r: number, a: V, col = c.col, faces = true): void {
  const v: V[] = [[0, r * 1.25, 0], [0, -r * 1.25, 0], [r, 0, 0], [-r, 0, 0], [0, 0, r], [0, 0, -r]].map((p) => add(ctr, rot(p as V, a)));
  const F = [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 2, 4], [1, 4, 3], [1, 3, 5], [1, 5, 2]];
  if (faces) for (const f of F) fill(c, f.map((i) => v[i]), col, 0.07);
  for (const [i, j] of [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [4, 3], [3, 5], [5, 2]]) seg(c, v[i], v[j], col, 1.1);
}
function cube(c: C, ctr: V, r: number, a: V, col = c.col, w = 1.2, faces = 0): V[] {
  const v: V[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push(add(ctr, rot([x * r, y * r, z * r], a)));
  if (faces) for (const f of [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]]) fill(c, f.map((i) => v[i]), col, faces);
  for (const [i, j] of [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(c, v[i], v[j], col, w);
  return v;
}
/** The shared dark hardware base: a hex plinth with a lit inlay. */
function base(c: C, r = 0.36, h = 0.1, nodes = 0): void {
  const g = c.g;
  const top: V[] = [], bot: V[] = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; top.push([Math.cos(a) * r, 0, Math.sin(a) * r]); bot.push([Math.cos(a) * r, -h, Math.sin(a) * r]); }
  const face = (pts: V[], col: string) => { g.fillStyle = col; g.beginPath(); pts.forEach((p, i) => { const q = P(c, p); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); g.fill(); };
  for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; if (top[i][2] + top[j][2] > -0.05) face([top[i], top[j], bot[j], bot[i]], i % 2 ? '#141a21' : '#1a212a'); }
  face(top, '#232b35');
  g.strokeStyle = 'rgba(200,215,230,0.25)'; g.lineWidth = 1; g.beginPath(); top.forEach((p, i) => { const q = P(c, p); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); g.stroke();
  ring(c, [0, 0.002, 0], r * 0.72, [0, 0, 0], c.col, 0.8, 36, 0.55);
  for (let k = 0; k < nodes; k++) { const a = (k / nodes) * Math.PI * 2 + c.t * 0.2; const p: V = [Math.cos(a) * r * 0.86, 0.01, Math.sin(a) * r * 0.86]; dot(c, p, 0.018); }
}
function shadow(c: C, y: number, r: number): void {
  const q = P(c, [0, 0.003, 0]); const g = c.g; g.globalCompositeOperation = 'lighter';
  const grd = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], r * c.s);
  grd.addColorStop(0, rgba(c.col, 0.18 * Math.min(1, 1 / (y + 0.2)))); grd.addColorStop(1, rgba(c.col, 0));
  g.fillStyle = grd; g.beginPath(); g.ellipse(q[0], q[1], r * c.s, r * c.s * CE, 0, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over';
}
const bob = (c: C, k = 1) => 0.025 * Math.sin(c.t * 1.6 * k);

/* ================================================================ INSPECTOR */
// I-A Armillary core: a crystal inside rings. Ring > gimbal > armillary sphere; crystal > faceted > node lattice.
function armillary(c: C, tier: number): void {
  base(c, 0.36, 0.1, tier === 3 ? 3 : 0);
  const y = 0.62 + bob(c), t = c.t, ctr: V = [0, y, 0];
  shadow(c, y, 0.5);
  if (tier === 1) { octa(c, ctr, 0.13, [0, t * 0.6, 0]); ring(c, ctr, 0.27, [0.45, t * 0.8, 0]); dot(c, ctr, 0.03); }
  if (tier === 2) {
    octa(c, ctr, 0.14, [0, t * 0.6, 0]); octa(c, ctr, 0.075, [0, -t * 1.1 + 0.4, 0], '#ffffff', false);
    ring(c, ctr, 0.29, [Math.PI / 2, t * 0.9, 0]); ring(c, ctr, 0.33, [0.25, -t * 0.7, Math.PI / 2 * 0.9]);
    for (let k = 0; k < 6; k++) { const a = t * 1.4 + (k / 6) * Math.PI * 2; dot(c, add(ctr, [Math.cos(a) * 0.2, Math.sin(a * 2) * 0.03, Math.sin(a) * 0.2]), 0.012); }
  }
  if (tier === 3) {
    const n: V[] = [[0, 0.17, 0], [0, -0.17, 0], [0.14, 0, 0], [-0.14, 0, 0], [0, 0, 0.14], [0, 0, -0.14]].map((p) => add(ctr, rot(p as V, [0.3, t * 0.5, 0])));
    for (const p of n) { seg(c, ctr, p, '#ffffff', 0.8, 0.6); dot(c, p, 0.022); }
    for (const [i, j] of [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5]]) seg(c, n[i], n[j], c.col, 0.9);
    dot(c, ctr, 0.035);
    ring(c, ctr, 0.33, [0, t * 0.4, 0]); ring(c, ctr, 0.33, [Math.PI / 2, t * 0.4, 0]); ring(c, ctr, 0.33, [Math.PI / 2, t * 0.4 + Math.PI / 3, 0]); ring(c, ctr, 0.33, [Math.PI / 2, t * 0.4 - Math.PI / 3, 0]);
    ring(c, ctr, 0.42, [0.4, -t * 0.6, 0.2], c.col, 1, 60, 0.8);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + t * 0.2; seg(c, [Math.cos(a) * 0.31, 0.01, Math.sin(a) * 0.31], add(ctr, [Math.cos(a) * 0.3, -0.2, Math.sin(a) * 0.3]), c.col, 0.6, 0.45); }
  }
}
// I-B Decoder prism: a prism that splits data into readouts. Prism > three orbiting prisms > double helix of shards around a light column.
function prismShard(c: C, ctr: V, h: number, r: number, a: V): void {
  const top: V[] = [], bot: V[] = [];
  for (let i = 0; i < 3; i++) { const t = (i / 3) * Math.PI * 2; top.push(add(ctr, rot([Math.cos(t) * r, h / 2, Math.sin(t) * r], a))); bot.push(add(ctr, rot([Math.cos(t) * r, -h / 2, Math.sin(t) * r], a))); }
  for (let i = 0; i < 3; i++) { fill(c, [top[i], top[(i + 1) % 3], bot[(i + 1) % 3], bot[i]], c.col, 0.06); seg(c, top[i], bot[i]); }
  poly(c, top); poly(c, bot);
}
function decoder(c: C, tier: number): void {
  base(c);
  const t = c.t, y = 0.6 + bob(c, 0.8);
  shadow(c, y, 0.45);
  if (tier === 1) { prismShard(c, [0, y, 0], 0.5, 0.09, [0, t * 0.5, 0]); seg(c, [0, y - 0.3, 0], [0, y + 0.3, 0], '#ffffff', 0.8, 0.5); }
  if (tier === 2) {
    seg(c, [0, 0.05, 0], [0, y + 0.32, 0], '#ffffff', 1.1, 0.8); dot(c, [0, y + 0.32, 0], 0.02);
    for (let k = 0; k < 3; k++) { const a = t * 0.7 + (k / 3) * Math.PI * 2; prismShard(c, [Math.cos(a) * 0.2, y, Math.sin(a) * 0.2], 0.4, 0.06, [0, -a, 0.2]); }
  }
  if (tier === 3) {
    seg(c, [0, 0.05, 0], [0, y + 0.42, 0], '#ffffff', 1.6, 0.9);
    ring(c, [0, y + 0.42, 0], 0.12, [0, t, 0], '#ffffff', 1, 32, 0.8);
    for (let k = 0; k < 7; k++) {
      const u = k / 6, a = t * 0.9 + u * Math.PI * 2, hy = 0.22 + u * 0.7;
      for (const off of [0, Math.PI]) prismShard(c, [Math.cos(a + off) * 0.21, hy, Math.sin(a + off) * 0.21], 0.11, 0.03, [0, -(a + off), 0.35]);
    }
  }
}
// I-C Neural node: filaments that reach out and pull data back. Node > linked triad > neural canopy.
function filament(c: C, from: V, dir: V, len: number, phase: number, col = c.col): V {
  const pts: V[] = [from];
  let p = from;
  for (let i = 1; i <= 6; i++) { const u = i / 6; const w = Math.sin(c.t * 2 + phase + u * 3) * 0.03 * u; p = add(from, [dir[0] * len * u + w, dir[1] * len * u + Math.sin(u * Math.PI) * 0.04, dir[2] * len * u - w]); pts.push(p); }
  poly(c, pts, col, 1, false);
  dot(c, p, 0.014, col);
  return p;
}
function neural(c: C, tier: number): void {
  base(c);
  const t = c.t, y = 0.5 + bob(c, 0.7), ctr: V = [0, y, 0];
  shadow(c, y, 0.5);
  const fan = (center: V, n: number, len: number, ph: number) => { for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + ph; filament(c, center, [Math.cos(a) * 0.8, 0.6, Math.sin(a) * 0.8], len, k + ph); } };
  if (tier === 1) { dot(c, ctr, 0.04); fan(ctr, 3, 0.28, 0.3); seg(c, [0, 0.02, 0], ctr, c.col, 0.8, 0.5); }
  if (tier === 2) {
    const nodes: V[] = [0, 1, 2].map((k) => { const a = (k / 3) * Math.PI * 2 + t * 0.15; return add(ctr, [Math.cos(a) * 0.17, Math.sin(t + k) * 0.02, Math.sin(a) * 0.17]); });
    nodes.forEach((n, i) => { seg(c, n, nodes[(i + 1) % 3], '#ffffff', 0.9, 0.6); dot(c, n, 0.032); fan(n, 2, 0.22, i * 2 + 0.5); seg(c, [0, 0.02, 0], n, c.col, 0.6, 0.4); });
    const u = (t * 0.8) % 1; const a = nodes[0], b = nodes[1]; dot(c, [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u], 0.016, '#ffffff');
  }
  if (tier === 3) {
    const top: V = [0, y + 0.12, 0];
    dot(c, top, 0.045);
    const ringN: V[] = [];
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + t * 0.12; const p: V = [Math.cos(a) * 0.3, y + Math.sin(t * 1.3 + k) * 0.03, Math.sin(a) * 0.3]; ringN.push(p); }
    ringN.forEach((p, i) => { seg(c, top, p, '#ffffff', 0.8, 0.55); seg(c, p, ringN[(i + 1) % 6], c.col, 0.8); dot(c, p, 0.024); filament(c, p, [p[0] * 1.5, 0.5, p[2] * 1.5], 0.2, i); seg(c, [p[0] * 0.5, 0.02, p[2] * 0.5], p, c.col, 0.5, 0.3); });
    for (let k = 0; k < 3; k++) { const u = (t * 0.6 + k / 3) % 1; const a = ringN[k * 2]; dot(c, [top[0] + (a[0] - top[0]) * u, top[1] + (a[1] - top[1]) * u, top[2] + (a[2] - top[2]) * u], 0.014, '#ffffff'); }
  }
}

/* ============================================================= RATE LIMITER */
// R-A Governor: a spinning centrifugal governor. One arm pair > twin counter-rotating governors > full gyroscope.
function governor(c: C, tier: number): void {
  base(c);
  const t = c.t, top = 0.85;
  shadow(c, 0.5, 0.5);
  seg(c, [0, 0.02, 0], [0, top, 0], '#ffffff', 1, 0.6);
  const arms = (y: number, spin: number, len: number, open: number) => {
    for (const s of [0, Math.PI]) {
      const a = spin + s; const tip: V = [Math.cos(a) * len * Math.sin(open), y - len * Math.cos(open), Math.sin(a) * len * Math.sin(open)];
      seg(c, [0, y, 0], tip); dot(c, tip, 0.035);
      seg(c, [0, y - 0.25, 0], [tip[0] * 0.5, (tip[1] + y - 0.25) / 2, tip[2] * 0.5], c.col, 0.8, 0.6);
    }
    ring(c, [0, y - 0.25, 0], 0.04, [0, 0, 0], c.col, 1, 16);
  };
  if (tier === 1) arms(top, t * 2.4, 0.3, 0.75 + 0.1 * Math.sin(t));
  if (tier === 2) { arms(top, t * 2.6, 0.3, 0.8); arms(top - 0.3, -t * 2.2, 0.24, 0.7); ring(c, [0, 0.45, 0], 0.08, [0, 0, 0], '#ffffff', 1, 24); }
  if (tier === 3) {
    const ctr: V = [0, 0.62 + bob(c), 0];
    dot(c, ctr, 0.04);
    ring(c, ctr, 0.18, [t * 2.1, 0, 0]); ring(c, ctr, 0.25, [0, 0, t * 1.6]); ring(c, ctr, 0.32, [Math.PI / 2, t * 1.2, 0]);
    ring(c, [0, 0.03, 0], 0.4, [0, 0, 0], c.col, 0.8, 48, 0.5 + 0.3 * Math.sin(t * 3));
  }
}
// R-B Hourglass: flow through a narrow neck. Hourglass > caged hourglass with turning bands > vortex funnel with a halo.
function hourglass(c: C, tier: number): void {
  base(c);
  const t = c.t, y = 0.55;
  shadow(c, y, 0.45);
  const glass = (r: number, h: number, a: number) => {
    const topR: V[] = [], botR: V[] = [];
    for (let i = 0; i < 6; i++) { const u = (i / 6) * Math.PI * 2 + a; topR.push([Math.cos(u) * r, y + h, Math.sin(u) * r]); botR.push([Math.cos(u) * r, y - h, Math.sin(u) * r]); }
    poly(c, topR); poly(c, botR);
    for (let i = 0; i < 6; i++) { seg(c, topR[i], [0, y, 0], c.col, 0.9); seg(c, botR[i], [0, y, 0], c.col, 0.9); }
    for (let k = 0; k < 5; k++) { const u = ((t * 0.5 + k / 5) % 1); dot(c, [0, y + h * 0.7 - u * h * 1.4, 0], 0.01, '#ffffff', 0.9); }
  };
  if (tier === 1) glass(0.17, 0.25, t * 0.3);
  if (tier === 2) { glass(0.17, 0.25, t * 0.3); ring(c, [0, y + 0.12, 0], 0.27, [0.3, t * 0.9, 0]); ring(c, [0, y - 0.12, 0], 0.27, [-0.3, -t * 0.9, 0]); }
  if (tier === 3) {
    for (let k = 0; k < 4; k++) {
      const pts: V[] = [];
      for (let i = 0; i <= 30; i++) { const u = i / 30; const r = 0.03 + 0.3 * u * u; const a = t * 1.5 + k * Math.PI / 2 + u * 6; pts.push([Math.cos(a) * r, y + u * 0.35, Math.sin(a) * r]); }
      poly(c, pts, c.col, 1, false);
      const pts2 = pts.map((p) => [p[0] * 0.7, y - (p[1] - y) * 0.7, p[2] * 0.7] as V); poly(c, pts2, c.col, 0.8, false, 0.6);
    }
    ring(c, [0, y + 0.45, 0], 0.22, [0, t * 0.5, 0], '#ffffff', 1.2, 48); dot(c, [0, y, 0], 0.035);
  }
}
// R-C Damping coil: a coil that drags traffic. Stacked coil > twin coils with an arc > toroidal field.
function coil(c: C, tier: number): void {
  base(c);
  const t = c.t;
  shadow(c, 0.5, 0.5);
  const stack = (x: number, n: number, r: number) => { for (let k = 0; k < n; k++) { const y = 0.2 + k * 0.12; const pulse = 0.5 + 0.5 * Math.sin(t * 4 - k); ring(c, [x, y, 0], r, [0, 0, 0], c.col, 1 + pulse * 0.6, 32, 0.5 + pulse * 0.5); } };
  if (tier === 1) { stack(0, 4, 0.17); seg(c, [0, 0.02, 0], [0, 0.6, 0], '#ffffff', 0.8, 0.4); }
  if (tier === 2) {
    stack(-0.15, 4, 0.11); stack(0.15, 4, 0.11);
    const pts: V[] = []; for (let i = 0; i <= 16; i++) { const u = i / 16; pts.push([-0.15 + 0.3 * u + (Math.random() - 0.5) * 0.02, 0.62 + Math.sin(u * Math.PI) * 0.12, (Math.random() - 0.5) * 0.02]); }
    poly(c, pts, '#ffffff', 1, false);
  }
  if (tier === 3) {
    const ctr: V = [0, 0.5 + bob(c), 0], R = 0.24, r0 = 0.1;
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2 + t * 0.6; ring(c, add(ctr, [Math.cos(a) * R, 0, Math.sin(a) * R]), r0, [0, -a, Math.PI / 2], c.col, 0.8, 20, 0.7); }
    ring(c, ctr, R, [0, t, 0], '#ffffff', 1.1, 48);
    dot(c, ctr, 0.03);
  }
}

/* ================================================================== SANDBOX */
// S-A Containment cube: Mk I cube > Mk II nested cubes > Cluster: splits into eight cells | Remote: unfolds into a gate.
function cubes(c: C, stage: string): void {
  base(c);
  const t = c.t, y = 0.55 + bob(c), ctr: V = [0, y, 0];
  shadow(c, y, 0.45);
  if (stage === 'mk1') { cube(c, ctr, 0.15, [0.5, t * 0.6, 0.3], c.col, 1.2, 0.04); dot(c, ctr, 0.03); }
  if (stage === 'mk2') { cube(c, ctr, 0.2, [0.4, t * 0.5, 0.2], c.col, 1.2, 0.03); cube(c, ctr, 0.1, [0.4, -t * 1.1, 0.6], '#ffffff', 1); dot(c, ctr, 0.03); }
  if (stage === 'cluster') {
    for (const x of [-1, 1]) for (const yy of [-1, 1]) for (const z of [-1, 1]) {
      const open = 0.13 + 0.03 * Math.sin(t * 2);
      const p = add(ctr, rot([x * open, yy * open, z * open], [0.4, t * 0.4, 0.2]));
      cube(c, p, 0.07, [0.4, t * 0.4 + x, 0.2], c.col, 1, 0.04);
    }
    dot(c, ctr, 0.035);
  }
  if (stage === 'remote') {
    const g: V = [0, 0.62, 0];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const p0 = add(g, rot([Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0], [0, 0, 0]));
      const p1 = add(g, rot([Math.cos(a + Math.PI / 2) * 0.26, Math.sin(a + Math.PI / 2) * 0.26, 0], [0, 0, 0]));
      seg(c, p0, p1, c.col, 1.6);
      fill(c, [g, p0, p1], c.col, 0.03 + 0.03 * Math.sin(t * 3 + k));
    }
    ring(c, g, 0.18, [Math.PI / 2, 0, t], '#ffffff', 1, 40);
    seg(c, [-0.18, 0.03, -0.05], [-0.22, 0.4, 0], c.col, 1.2); seg(c, [0.18, 0.03, -0.05], [0.22, 0.4, 0], c.col, 1.2);
    for (let k = 0; k < 3; k++) { const u = (t * 0.7 + k / 3) % 1; dot(c, [0, 0.62, u * 0.6], 0.015, '#ffffff', 1 - u); }
  }
}
// S-B Singularity: a contained gravity well. Sphere and ring > caged well > Cluster: orbiting mini wells | Remote: a lens disc that reaches far.
function singularity(c: C, stage: string): void {
  base(c);
  const t = c.t, y = 0.55 + bob(c), ctr: V = [0, y, 0];
  shadow(c, y, 0.45);
  const well = (p: V, r: number, k = 1) => {
    const q = P(c, p), g = c.g; g.fillStyle = '#020305'; g.beginPath(); g.arc(q[0], q[1], r * c.s, 0, Math.PI * 2); g.fill();
    ring(c, p, r * 1.05, [0, 0, 0], '#ffffff', 0.8, 32, 0.6);
    ring(c, p, r * 1.9, [0.35, t * 1.5 * k, 0], c.col, 1.3, 48);
  };
  if (stage === 'mk1') well(ctr, 0.08);
  if (stage === 'mk2') { well(ctr, 0.09); ring(c, ctr, 0.3, [Math.PI / 2, t * 0.4, 0], c.col, 1, 48, 0.8); ring(c, ctr, 0.3, [Math.PI / 2, t * 0.4 + Math.PI / 2, 0], c.col, 1, 48, 0.8); }
  if (stage === 'cluster') { for (let k = 0; k < 4; k++) { const a = t * 0.8 + (k / 4) * Math.PI * 2; well(add(ctr, [Math.cos(a) * 0.22, Math.sin(a * 2) * 0.04, Math.sin(a) * 0.22]), 0.045, 1.6); } ring(c, ctr, 0.22, [0, 0, 0], c.col, 0.7, 48, 0.5); }
  if (stage === 'remote') {
    const g: V = [0, 0.6, 0];
    for (let k = 0; k < 5; k++) ring(c, g, 0.08 + k * 0.06, [Math.PI / 2 - 0.15, 0, 0], k ? c.col : '#ffffff', 1, 48, 1 - k * 0.15);
    well(g, 0.05);
    for (let k = 0; k < 3; k++) { const u = (t * 0.7 + k / 3) % 1; ring(c, add(g, [0, 0, 0.1 + u * 0.5]), 0.1 * (1 - u * 0.5), [Math.PI / 2, 0, 0], c.col, 1, 32, 1 - u); }
  }
}
// S-C Quarantine capsule: a sealed vial. Capsule > capsule with containment bands > Cluster: a rack of capsules | Remote: a capsule rail.
function capsuleShape(c: C, ctr: V, r: number, h: number, a: number, col = c.col): void {
  const top: V[] = [], bot: V[] = [];
  for (let i = 0; i < 10; i++) { const u = (i / 10) * Math.PI * 2 + a; top.push(add(ctr, [Math.cos(u) * r, h / 2, Math.sin(u) * r])); bot.push(add(ctr, [Math.cos(u) * r, -h / 2, Math.sin(u) * r])); }
  poly(c, top, col); poly(c, bot, col);
  for (let i = 0; i < 10; i += 2) seg(c, top[i], bot[i], col, 0.8, 0.6);
  octa(c, ctr, r * 0.55, [0, a * 2, 0], '#ffffff', false);
  dot(c, add(ctr, [0, h / 2 + r * 0.5, 0]), 0.012, col); dot(c, add(ctr, [0, -h / 2 - r * 0.5, 0]), 0.012, col);
}
function capsule(c: C, stage: string): void {
  base(c);
  const t = c.t, y = 0.5 + bob(c), ctr: V = [0, y, 0];
  shadow(c, y, 0.45);
  if (stage === 'mk1') capsuleShape(c, ctr, 0.09, 0.32, t * 0.5);
  if (stage === 'mk2') { capsuleShape(c, ctr, 0.09, 0.34, t * 0.5); ring(c, add(ctr, [0, 0.1, 0]), 0.16, [0.2, t * 1.2, 0]); ring(c, add(ctr, [0, -0.1, 0]), 0.16, [-0.2, -t * 1.2, 0]); }
  if (stage === 'cluster') { for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + t * 0.3; capsuleShape(c, add(ctr, [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2]), 0.055, 0.24, t + k); } ring(c, add(ctr, [0, -0.15, 0]), 0.24, [0, t * 0.3, 0], c.col, 0.8, 48, 0.6); }
  if (stage === 'remote') {
    seg(c, [-0.06, 0.03, -0.1], [-0.06, 0.62, 0.25], c.col, 1.4); seg(c, [0.06, 0.03, -0.1], [0.06, 0.62, 0.25], c.col, 1.4);
    for (let k = 0; k < 6; k++) { const u = k / 5; ring(c, [0, 0.05 + u * 0.57, -0.1 + u * 0.35], 0.09, [0.55, 0, 0], c.col, 0.9, 20, 0.7); }
    const u = (t * 0.6) % 1; capsuleShape(c, [0, 0.1 + u * 0.55, -0.08 + u * 0.33], 0.05, 0.16, t * 2);
  }
}

/* ================================================================== ATTACKS */
function linkAndPacket(c: C, px: number): V {
  const g = c.g; const a = P(c, [-0.6, 0.002, 0.08]), b = P(c, [1.4, 0.002, 0.08]);
  g.strokeStyle = 'rgba(255,77,79,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  const p: V = [px, 0.16, 0.08];
  octa(c, p, 0.07, [0, c.t * 2, 0], COL.hot, true); ring(c, p, 0.11, [0.3, c.t * 2, 0], COL.hot, 0.8, 24, 0.6);
  return p;
}
function attack(c: C, kind: string): void {
  const t = c.t, s0 = c.s;
  // tower on the left, smaller
  c.cx -= c.w * 0.24; c.s = s0 * 0.7;
  const draw: Record<string, () => void> = { armillary: () => armillary(c, 2), decoder: () => decoder(c, 2), neural: () => neural(c, 2), governor: () => governor(c, 2), hourglass: () => hourglass(c, 2), coil: () => coil(c, 2), cubes: () => cubes(c, 'mk2'), singularity: () => singularity(c, 'mk2'), capsule: () => capsule(c, 'mk2') };
  draw[kind]();
  const src: V = [0, kind === 'governor' ? 0.6 : 0.6, 0];
  const sp = P(c, src);
  c.cx += c.w * 0.24; c.s = s0;
  // packet on the right
  const px = 0.32 + 0.12 * Math.sin(t * 0.6);
  const pk = linkAndPacket(c, px);
  const pkp = P(c, pk);
  const g = c.g;
  const toW = (x: number, y: number): V => [(x - c.cx) / c.s, -(y - c.cy) / (c.s * CE), 0];
  const from = toW(sp[0], sp[1]);
  const lerp = (u: number): V => [from[0] + (pk[0] - from[0]) * u, from[1] + (pk[1] - from[1]) * u, (pk[2]) * u];
  g.save();
  if (kind === 'armillary' || kind === 'neural') {
    // a thread pulls the packet's shell into the core as glyphs
    const pts: V[] = []; for (let i = 0; i <= 20; i++) { const u = i / 20; const p = lerp(u); pts.push([p[0], p[1] + Math.sin(u * Math.PI) * 0.12 + Math.sin(t * 6 + u * 9) * 0.01, p[2]]); }
    poly(c, pts, c.col, 0.8, false, 0.8);
    for (let k = 0; k < 5; k++) { const u = 1 - ((t * 0.8 + k / 5) % 1); const p = pts[Math.round(u * 20)]; const q = P(c, p); g.fillStyle = rgba('#ffffff', 0.9); g.fillRect(q[0] - 1.5, q[1] - 1.5, 3, 3); }
  } else if (kind === 'decoder') {
    seg(c, pk, lerp(0.02), '#ffffff', 0.9, 0.8);
    for (let k = 0; k < 5; k++) seg(c, lerp(0.02), add(lerp(0.02), [-0.1 + k * 0.05, 0.25, 0]), ['#46c8ff', '#7dffda', '#ffffff', '#a58bff', '#46c8ff'][k], 0.8, 0.8);
  } else if (kind === 'governor' || kind === 'hourglass' || kind === 'coil') {
    // a slowing field ripples over the link; the packet drags
    for (let k = 0; k < 3; k++) { const u = (t * 0.5 + k / 3) % 1; ring(c, [pk[0], 0.004, pk[2]], 0.05 + u * 0.3, [0, 0, 0], c.col, 1, 40, 1 - u); }
    for (let k = 1; k < 4; k++) octa(c, [pk[0] - k * 0.06, pk[1], pk[2]], 0.05, [0, t * 2, 0], COL.hot, false);
    seg(c, lerp(0.05), [pk[0], 0.3, pk[2]], c.col, 0.7, 0.5);
  } else {
    // containment closes around the packet, then collapses
    const u = (t * 0.5) % 1;
    const sz = u < 0.6 ? 0.2 - u * 0.12 : 0.13 * (1 - (u - 0.6) / 0.4);
    if (kind === 'cubes') cube(c, pk, sz, [0.3, t, 0.2], c.col, 1.2, 0.05);
    else if (kind === 'singularity') { ring(c, pk, sz * 1.5, [0.3, t * 3, 0], c.col, 1.2); dot(c, pk, 0.02, '#ffffff'); }
    else { capsuleShape(c, pk, sz * 0.5, sz * 1.6, t); }
    seg(c, lerp(0.03), pk, c.col, 0.6, 0.4);
  }
  g.restore();
  void pkp;
}

/* ===================================================================== PAGE */
interface Dir { key: string; name: string; what: string; attack: string; path: string; stages: [string, (c: C) => void][] }
const TOWERS: { title: string; role: string; col: string; tool: string; dirs: Dir[] }[] = [
  {
    title: 'INSPECTOR', role: 'DAMAGE', col: COL.dmg, tool: 'Deep packet inspection: intercepts traffic, opens packets, reads what is inside.',
    dirs: [
      { key: 'armillary', name: 'A · Armillary core', what: 'A crystal core held in rotating rings: a reading engine.', attack: 'A thread reaches into the hostile; its shell unravels into glyphs that flow into the core.', path: 'One ring splits into gimbal rings, then becomes a full armillary sphere. The crystal goes simple > faceted > a lattice of nodes.', stages: [['MK I', (c) => armillary(c, 1)], ['MK II', (c) => armillary(c, 2)], ['MK III', (c) => armillary(c, 3)]] },
      { key: 'decoder', name: 'B · Decoder prism', what: 'Prisms that split a data stream into readouts, like light into a spectrum.', attack: 'Pulls a line of data out of the hostile into the prism, which fans it out into readout lines.', path: 'One prism splits into three orbiting a light column, then into a double helix of shards spiralling up it.', stages: [['MK I', (c) => decoder(c, 1)], ['MK II', (c) => decoder(c, 2)], ['MK III', (c) => decoder(c, 3)]] },
      { key: 'neural', name: 'C · Neural node', what: 'A node with filaments, like a neuron in the network that feels for traffic.', attack: 'A filament stretches to the hostile and pulses its data back to the node.', path: 'One node becomes a linked triad, then a canopy: a ring of nodes around a crown with filaments everywhere.', stages: [['MK I', (c) => neural(c, 1)], ['MK II', (c) => neural(c, 2)], ['MK III', (c) => neural(c, 3)]] },
    ],
  },
  {
    title: 'RATE LIMITER', role: 'SUPPORT', col: COL.sup, tool: 'Caps how fast traffic may flow: everything passing through slows down.',
    dirs: [
      { key: 'governor', name: 'A · Governor', what: 'A spinning centrifugal governor: the classic machine that limits speed.', attack: 'Spins up, arms swing out, and a slowing field ripples over the link; hostiles drag.', path: 'One arm pair becomes twin counter-rotating governors, then the arms close into a full gyroscope.', stages: [['MK I', (c) => governor(c, 1)], ['MK II', (c) => governor(c, 2)], ['MK III', (c) => governor(c, 3)]] },
      { key: 'hourglass', name: 'B · Hourglass', what: 'Flow squeezed through a narrow neck: time and bandwidth rationed.', attack: 'A slowing field ripples over the link; hostiles leave a dragged trail.', path: 'An hourglass gains turning containment bands, then becomes a vortex funnel under a halo.', stages: [['MK I', (c) => hourglass(c, 1)], ['MK II', (c) => hourglass(c, 2)], ['MK III', (c) => hourglass(c, 3)]] },
      { key: 'coil', name: 'C · Damping coil', what: 'An electromagnetic coil that drags on anything moving through its field.', attack: 'Field lines reach over the link; hostiles inside it bunch up.', path: 'A stacked coil splits into twin coils with an arc between, then closes into a toroidal field.', stages: [['MK I', (c) => coil(c, 1)], ['MK II', (c) => coil(c, 2)], ['MK III', (c) => coil(c, 3)]] },
    ],
  },
  {
    title: 'SANDBOX', role: 'AREA', col: COL.area, tool: 'Isolates suspicious code where it cannot do harm, then detonates it there.',
    dirs: [
      { key: 'cubes', name: 'A · Containment cube', what: 'A cube of light that holds a payload in isolation.', attack: 'A cube snaps closed around the hostile and collapses with it inside.', path: 'A cube becomes nested cubes; then either splits into eight cells (Cluster) or unfolds into a gate that reaches far (Remote).', stages: [['MK I', (c) => cubes(c, 'mk1')], ['MK II', (c) => cubes(c, 'mk2')], ['CLUSTER', (c) => cubes(c, 'cluster')], ['REMOTE', (c) => cubes(c, 'remote')]] },
      { key: 'singularity', name: 'B · Singularity', what: 'A contained gravity well: isolation taken to the extreme.', attack: 'The hostile spirals into a small well and is crushed.', path: 'A well with an accretion ring gets a containment cage; then splits into orbiting wells (Cluster) or becomes a lens disc (Remote).', stages: [['MK I', (c) => singularity(c, 'mk1')], ['MK II', (c) => singularity(c, 'mk2')], ['CLUSTER', (c) => singularity(c, 'cluster')], ['REMOTE', (c) => singularity(c, 'remote')]] },
      { key: 'capsule', name: 'C · Quarantine capsule', what: 'A sealed vial, like a lab sample under quarantine.', attack: 'A capsule forms around the hostile and seals.', path: 'A capsule gains containment bands; then becomes a rack of capsules (Cluster) or a capsule rail (Remote).', stages: [['MK I', (c) => capsule(c, 'mk1')], ['MK II', (c) => capsule(c, 'mk2')], ['CLUSTER', (c) => capsule(c, 'cluster')], ['REMOTE', (c) => capsule(c, 'remote')]] },
    ],
  },
];

interface Tile { cv: HTMLCanvasElement; g: CanvasRenderingContext2D; col: string; draw: (c: C) => void; visible: boolean }
const tiles: Tile[] = [];
const root = document.getElementById('root')!;
const io = new IntersectionObserver((es) => { for (const e of es) { const t = tiles.find((x) => x.cv === e.target); if (t) t.visible = e.isIntersecting; } });
for (const tw of TOWERS) {
  const sec = document.createElement('section');
  sec.innerHTML = `<h2>${tw.title}<small style="color:${tw.col}">${tw.role}</small></h2><div class="tool">${tw.tool}</div>`;
  for (const d of tw.dirs) {
    const row = document.createElement('div');
    row.className = 'dir';
    row.innerHTML = `<div class="txt"><b style="color:${tw.col}">${d.name}</b><p>${d.what}</p><p><span class="tag">ATTACK</span>${d.attack}</p><p><span class="tag">UPGRADES</span>${d.path}</p></div><div class="tiles"></div>`;
    const box = row.querySelector('.tiles')!;
    const add = (label: string, draw: (c: C) => void, atk = false) => {
      const el = document.createElement('div');
      el.className = `tile${atk ? ' atk' : ''}`;
      const cv = document.createElement('canvas');
      el.append(cv);
      el.insertAdjacentHTML('beforeend', `<span>${label}</span>`);
      box.append(el);
      const g = cv.getContext('2d')!;
      const tile: Tile = { cv, g, col: tw.col, draw, visible: false };
      tiles.push(tile);
      io.observe(cv);
    };
    for (const [label, draw] of d.stages) add(label, draw);
    add('ATTACK', (c) => attack(c, d.key), true);
    sec.append(row);
  }
  root.append(sec);
}

const dpr = Math.min(2, window.devicePixelRatio || 1);
function frame(now: number): void {
  requestAnimationFrame(frame);
  const t = now / 1000;
  for (const tile of tiles) {
    if (!tile.visible) continue;
    const w = tile.cv.clientWidth, h = tile.cv.clientHeight;
    if (tile.cv.width !== Math.round(w * dpr)) { tile.cv.width = Math.round(w * dpr); tile.cv.height = Math.round(h * dpr); }
    const g = tile.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const c: C = { g, cx: w / 2, cy: h * 0.7, s: Math.min(w * 0.75, h) * 0.8, t, col: tile.col, w, h };
    tile.draw(c);
  }
}
requestAnimationFrame(frame);
document.body.dataset.ready = '1';
