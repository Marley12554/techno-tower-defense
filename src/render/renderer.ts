/**
 * Draws the board, routes, towers, malware and effects. Reads sim state and
 * turns sim events into effects and sounds. Never mutates the sim.
 */
import type { Sim, Tower, PlacementCheck, SimEvent } from '../game/sim';
import type { TowerKind, TowerStats } from '../game/types';
import { TOWERS } from '../game/data';
import { buildBoardLayer } from './board-layer';
import { Fx } from './fx';
import { computeLayout, type Layout } from './layout';
import { C, FONT, MALWARE_COLOR, TOWER_COLOR, rgba } from './palette';
import { buildSprites, glowSprite, rrect, type Sprite, type SpriteSet } from './sprites';
import type { Sound } from '../ui/audio';

export interface Ghost {
  kind: TowerKind;
  /** Pointer position (CSS px), already offset for touch. */
  x: number;
  y: number;
  /** Snapped cell, or null when off the board. */
  cell: [number, number] | null;
  check: PlacementCheck | null;
}

export interface View {
  selected: Tower | null;
  /** Stats to preview on the selected tower (upgrade hover). */
  preview: TowerStats | null;
  hoverTower: Tower | null;
  hoverCell: [number, number] | null;
  ghost: Ghost | null;
}

const DIR_ANGLE = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
const REROUTE_T = 0.55;

type Pt = [number, number];

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  L!: Layout;
  private sp!: SpriteSet;
  private layer: HTMLCanvasElement | null = null;
  /** Board layer with the settled route glow baked in. Rebuilt when the route changes. */
  private composite: HTMLCanvasElement | null = null;
  private compositeFor = -1;
  /** Resolution cap; lowered automatically when frames run slow. */
  dprCap = 2;
  private slowFrames = 0;
  private vignette: HTMLCanvasElement | null = null;
  readonly fx = new Fx();
  sound: Sound | null = null;
  /** Real seconds since start (animations that run while paused too). */
  now = 0;

  /** Screen position of the bits counter, for flying tokens. */
  counter: Pt = [0, 0];
  private boardFor: Sim | null = null;

  private gridVersion = -1;
  private routesPx: Pt[][] = [];
  private oldRoutesPx: Pt[][] = [];
  private rerouteAt = -10;
  private born = new Map<number, number>();
  private edges: [Tower, Tower][] = [];
  private pulses: { a: Tower; b: Tower; at: number; T: number; col: string }[] = [];
  private headAngle = new Map<number, number>();
  private mAngle = new Map<number, number>();
  private lastAmbient = 0;
  private shake = 0;
  private glitch = 0;
  private alarm = 0;
  private coreHit = 0;
  private lostAt: number[] = [];
  /** Ghosts flying back to the build bar after a cancelled drag. */
  private returning: { kind: TowerKind; x: number; y: number; tx: number; ty: number; t: number }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d', { alpha: false })!;
  }

  /** Recomputes layout and rebuilds cached layers. Call on resize and when a new sim starts. */
  resize(sim: Sim): void {
    const b = sim.board;
    const L = computeLayout(b.cols, b.rows, this.dprCap);
    const sizeChanged = !this.L || L.w !== this.L.w || L.h !== this.L.h || L.dpr !== this.L.dpr || L.cell !== this.L.cell || L.ox !== this.L.ox || L.oy !== this.L.oy;
    this.L = L;
    this.canvas.width = Math.ceil(L.w * L.dpr);
    this.canvas.height = Math.ceil(L.h * L.dpr);
    if (!this.sp || this.sp.cell !== L.cell || this.sp.dpr !== L.dpr) this.sp = buildSprites(L.cell, L.dpr);
    if (sizeChanged || this.boardFor !== sim) {
      this.layer = buildBoardLayer(b, L);
      this.vignette = buildVignette(L);
    }
    if (this.boardFor !== sim) {
      this.boardFor = sim;
      this.fx.clear();
      this.born.clear();
      this.pulses = [];
      this.returning = [];
      this.headAngle.clear();
      this.mAngle.clear();
      this.oldRoutesPx = [];
      this.rerouteAt = -10;
      this.lostAt = [];
    }
    this.gridVersion = -1;
    this.compositeFor = -1;
  }

  /** Call once per frame with real dt. Steps resolution down if frames stay slow. */
  watchPerf(dt: number, sim: Sim): void {
    if (dt > 1 / 40 && dt < 0.1) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > 90 && this.dprCap > 1) {
      this.dprCap = Math.max(1, this.dprCap - 0.5);
      this.slowFrames = 0;
      this.resize(sim);
    }
  }

  /* ----------------------------------------------------------- coordinates */

  X(x: number): number { return this.L.ox + x * this.L.cell; }
  Y(y: number): number { return this.L.oy + y * this.L.cell; }

  /** Screen point -> cell, or null when off the board. */
  cellAt(px: number, py: number): [number, number] | null {
    const cx = Math.floor((px - this.L.ox) / this.L.cell);
    const cy = Math.floor((py - this.L.oy) / this.L.cell);
    if (cx < 0 || cy < 0 || cx >= this.L.cols || cy >= this.L.rows) return null;
    return [cx, cy];
  }

  cellCenter(cx: number, cy: number): Pt {
    return [this.X(cx + 0.5), this.Y(cy + 0.5)];
  }

  /** Ghost flies back to where it came from. */
  returnGhost(kind: TowerKind, x: number, y: number, tx: number, ty: number): void {
    this.returning.push({ kind, x, y, tx, ty, t: 0 });
  }

  /* ---------------------------------------------------------------- events */

  consume(sim: Sim, events: SimEvent[]): void {
    const s = this.L.cell;
    const snd = this.sound;
    for (const e of events) {
      switch (e.type) {
        case 'place': {
          const t = e.tower;
          this.born.set(t.id, this.now);
          const [x, y] = this.cellCenter(t.cx, t.cy);
          const col = TOWER_COLOR[t.kind];
          this.fx.ring(x, y, s * 0.2, s * 0.95, 0.4, col, 3);
          this.fx.ring(x, y, s * 0.4, s * 0.6, 0.18, '#ffffff', 2);
          // Solder sparks at the four corner pins
          for (const [dx, dy] of [[-0.47, -0.47], [0.47, -0.47], [-0.47, 0.47], [0.47, 0.47]]) {
            for (let k = 0; k < 4; k++) {
              const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.6;
              const v = s * (2 + Math.random() * 3);
              this.fx.spawn(x + dx * s, y + dy * s, Math.cos(a) * v, Math.sin(a) * v, 0.25 + Math.random() * 0.2, 2 + Math.random() * 1.5, '#fff3c2', 0, 5);
            }
            this.fx.spawn(x + dx * s, y + dy * s, 0, 0, 0.35, s * 0.18, col, 1, 0);
          }
          this.queueNetworkPulse(sim, t, col);
          snd?.play('place');
          break;
        }
        case 'sell': {
          const t = e.tower;
          const [x, y] = this.cellCenter(t.cx, t.cy);
          const col = TOWER_COLOR[t.kind];
          this.fx.burst(x, y, 18, s * 4, 0.5, 3, col, 0);
          this.fx.ring(x, y, s * 0.5, s * 0.1, 0.25, col, 2);
          this.fx.text(x, y - s * 0.3, `+${e.refund}`, C.bits, 15);
          for (let k = 0; k < Math.min(8, 2 + Math.floor(e.refund / 15)); k++) {
            this.fx.token(x + (Math.random() - 0.5) * s * 0.6, y + (Math.random() - 0.5) * s * 0.6, this.counter[0], this.counter[1]);
          }
          this.born.delete(t.id);
          snd?.play('sell');
          break;
        }
        case 'upgrade': {
          const t = e.tower;
          const [x, y] = this.cellCenter(t.cx, t.cy);
          const col = TOWER_COLOR[t.kind];
          this.fx.ring(x, y, s * 0.3, s * 1.2, 0.5, col, 3);
          for (let k = 0; k < 14; k++) {
            this.fx.spawn(x + (Math.random() - 0.5) * s * 0.7, y + s * 0.3, (Math.random() - 0.5) * s, -s * (2 + Math.random() * 3), 0.6, 2.5, col, 0, 1.5);
          }
          this.queueNetworkPulse(sim, t, '#ffffff');
          snd?.play('upgrade');
          break;
        }
        case 'fire': {
          const t = e.tower;
          if (t.kind === 'filter') snd?.play('zap');
          else if (t.kind === 'mortar') {
            const [x, y] = this.cellCenter(t.cx, t.cy);
            const a = t.angle;
            for (let k = 0; k < 5; k++) this.fx.spawn(x + Math.cos(a) * s * 0.3, y + Math.sin(a) * s * 0.3, Math.cos(a + (Math.random() - 0.5)) * s * 1.5, Math.sin(a + (Math.random() - 0.5)) * s * 1.5, 0.35, s * 0.12, C.green, 1, 4);
            snd?.play('thump');
          }
          break;
        }
        case 'impact': {
          const x = this.X(e.x), y = this.Y(e.y);
          const r = e.r * s;
          if (e.small) {
            this.fx.ring(x, y, r * 0.2, r, 0.25, C.green, 2);
            this.fx.burst(x, y, 5, s * 3, 0.3, 2, '#c8ffe4', 0);
            snd?.play('pop');
          } else {
            this.fx.ring(x, y, r * 0.15, r, 0.35, C.green, 3);
            this.fx.ring(x, y, r * 0.1, r * 0.6, 0.2, '#ffffff', 2);
            this.fx.burst(x, y, 16, s * 5, 0.45, 2.5, C.green, 0);
            this.fx.burst(x, y, 4, s * 1.5, 0.4, s * 0.25, C.green, 1);
            if (e.dmg >= 25) this.fx.text(x, y - r * 0.4, String(Math.round(e.dmg)), '#c8ffe4', 13, 0.7);
            this.shake = Math.max(this.shake, 0.06);
            snd?.play('boom');
          }
          break;
        }
        case 'hit': {
          if (e.m.kind !== 'trojan') break;
          const x = this.X(e.m.x + e.m.ox), y = this.Y(e.m.y + e.m.oy);
          this.fx.spawn(x, y, (Math.random() - 0.5) * s * 3, (Math.random() - 0.5) * s * 3, 0.2, 2, '#ffd0d0', 0, 4);
          break;
        }
        case 'kill': {
          const m = e.m;
          const x = this.X(m.x + m.ox), y = this.Y(m.y + m.oy);
          const col = MALWARE_COLOR[m.kind];
          const big = m.kind === 'trojan';
          this.fx.burst(x, y, big ? 26 : 9, s * (big ? 5 : 3.5), big ? 0.6 : 0.4, big ? 4 : 3, col, 0);
          this.fx.burst(x, y, big ? 6 : 2, s * 1.2, 0.3, s * 0.2, col, 1);
          this.fx.slice(x, y, s * (big ? 1 : 0.6), col);
          this.fx.ring(x, y, s * 0.1, s * (big ? 0.9 : 0.45), big ? 0.35 : 0.2, col, 2);
          this.fx.token(x, y, this.counter[0], this.counter[1]);
          this.mAngle.delete(m.id);
          snd?.play(big ? 'crack' : 'kill');
          break;
        }
        case 'burst': {
          const x = this.X(e.m.x), y = this.Y(e.m.y);
          this.fx.ring(x, y, s * 0.2, s * 1.4, 0.45, MALWARE_COLOR.worm, 3);
          this.fx.text(x, y - s * 0.5, 'PAYLOAD', MALWARE_COLOR.worm, 11, 0.8);
          snd?.play('burst');
          break;
        }
        case 'leak': {
          const [cx, cy] = this.coreCenter(sim);
          this.glitch = Math.max(this.glitch, 0.28);
          this.alarm = 1;
          this.shake = Math.max(this.shake, 0.22);
          this.coreHit = 1;
          for (let k = 0; k < e.m.def.leak; k++) this.lostAt.push(this.now);
          this.fx.burst(cx, cy, 20, s * 5, 0.5, 3, C.danger, 0);
          this.fx.ring(cx, cy, s * 0.6, s * 1.8, 0.45, C.danger, 3);
          this.fx.text(cx, cy - s * 1.1, `-${e.m.def.leak}`, C.danger, 18, 1);
          if (e.stole > 0) {
            this.fx.text(cx, cy + s * 1.2, `-${e.stole} bits stolen`, C.amber, 13, 1.3);
            snd?.play('steal');
          }
          this.mAngle.delete(e.m.id);
          snd?.play('alarm');
          break;
        }
        case 'spawn': {
          const i = sim.board.spawns[e.port];
          const [x, y] = this.cellCenter(sim.board.cx(i), sim.board.cy(i));
          this.fx.ring(x, y, s * 0.2, s * 0.7, 0.3, C.route, 2);
          break;
        }
        default:
          break;
      }
    }
  }

  private queueNetworkPulse(sim: Sim, from: Tower, col: string): void {
    // Light runs out along the traces, hop by hop.
    const adj = (t: Tower) => sim.towers.filter((o) => Math.abs(o.cx - t.cx) + Math.abs(o.cy - t.cy) === 1);
    const seen = new Set<Tower>([from]);
    let frontier = [from];
    for (let hop = 0; hop < 4 && frontier.length; hop++) {
      const next: Tower[] = [];
      for (const a of frontier) {
        for (const b of adj(a)) {
          if (seen.has(b)) continue;
          seen.add(b);
          next.push(b);
          this.pulses.push({ a, b, at: this.now + 0.18 + hop * 0.14, T: 0.16, col });
        }
      }
      frontier = next;
    }
  }

  private coreCenter(sim: Sim): Pt {
    let x = 0, y = 0;
    for (const c of sim.board.core) { x += sim.board.cx(c) + 0.5; y += sim.board.cy(c) + 0.5; }
    return [this.X(x / sim.board.core.length), this.Y(y / sim.board.core.length)];
  }

  /* ----------------------------------------------------------------- draw */

  draw(sim: Sim, view: View, dt: number, paused: boolean): void {
    this.now += dt;
    const fdt = paused ? 0 : dt;
    const g = this.g;
    const L = this.L;
    if (sim.gridVersion !== this.gridVersion) this.onGridChange(sim);

    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const settled = this.now - this.rerouteAt >= REROUTE_T;
    const previewing = !!(view.ghost?.check?.legal && view.ghost.check.routes);
    const useComposite = settled && !previewing;
    if (useComposite && this.compositeFor !== sim.gridVersion) this.buildComposite(sim);
    const base = useComposite ? this.composite : this.layer;
    if (base) g.drawImage(base, 0, 0, L.w, L.h);

    const sh = this.shake;
    BASE.k = L.dpr; BASE.e = 0; BASE.f = 0;
    if (sh > 0) {
      const k = sh * 26;
      BASE.e = (Math.random() - 0.5) * k * L.dpr;
      BASE.f = (Math.random() - 0.5) * k * L.dpr;
      g.setTransform(BASE.k, 0, 0, BASE.k, BASE.e, BASE.f);
    }

    this.drawRoutes(sim, view);
    this.drawCore(sim);
    this.drawFields(sim);
    this.drawRanges(sim, view);
    this.drawNetwork(sim);
    this.drawTowers(sim, view);
    this.drawMalware(sim, fdt);
    this.drawProjectiles(sim);
    this.fx.update(fdt + (paused ? 0 : 0));
    this.fx.draw(g, this.sp);
    this.drawGhost(sim, view.ghost);
    this.drawReturning(dt);

    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    this.drawScreenFx(sim, dt);

    this.shake = Math.max(0, this.shake - dt);
    this.glitch = Math.max(0, this.glitch - dt);
    this.alarm = Math.max(0, this.alarm - dt * 1.4);
    this.coreHit = Math.max(0, this.coreHit - dt * 3);
  }

  private onGridChange(sim: Sim): void {
    const first = this.gridVersion < 0;
    this.gridVersion = sim.gridVersion;
    const next = sim.routes.map((r) => this.routeToPx(sim, r));
    if (!first && !samePaths(next, this.routesPx)) {
      this.oldRoutesPx = this.routesPx;
      this.rerouteAt = this.now;
      this.sound?.play('reroute');
    }
    this.routesPx = next;
    this.edges = [];
    for (let i = 0; i < sim.towers.length; i++) {
      for (let j = i + 1; j < sim.towers.length; j++) {
        const a = sim.towers[i], b = sim.towers[j];
        if (Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy) === 1) this.edges.push([a, b]);
      }
    }
  }

  /** Cell route -> screen polyline with 45 degree chamfered corners, like a PCB trace. */
  private routeToPx(sim: Sim, route: number[]): Pt[] {
    const b = sim.board;
    const s = this.L.cell;
    const pts: Pt[] = route.map((i) => this.cellCenter(b.cx(i), b.cy(i)));
    if (pts.length < 2) return pts;
    // Start at the board edge so the trace visibly enters from the port.
    const d0 = DIR_ANGLE[b.spawnDir(route[0])];
    pts[0] = [pts[0][0] - Math.cos(d0) * s * 0.5, pts[0][1] - Math.sin(d0) * s * 0.5];
    // Keep corners only.
    const corners: Pt[] = [pts[0]];
    for (let k = 1; k < pts.length - 1; k++) {
      const a = pts[k - 1], p = pts[k], c = pts[k + 1];
      const cross = (p[0] - a[0]) * (c[1] - p[1]) - (p[1] - a[1]) * (c[0] - p[0]);
      if (Math.abs(cross) > 1e-6) corners.push(p);
    }
    corners.push(pts[pts.length - 1]);
    const out: Pt[] = [corners[0]];
    const ch = s * 0.32;
    for (let k = 1; k < corners.length - 1; k++) {
      const a = corners[k - 1], p = corners[k], c = corners[k + 1];
      const la = Math.hypot(p[0] - a[0], p[1] - a[1]), lc = Math.hypot(c[0] - p[0], c[1] - p[1]);
      const ca = Math.min(ch, la / 2), cc = Math.min(ch, lc / 2);
      out.push([p[0] - ((p[0] - a[0]) / la) * ca, p[1] - ((p[1] - a[1]) / la) * ca]);
      out.push([p[0] + ((c[0] - p[0]) / lc) * cc, p[1] + ((c[1] - p[1]) / lc) * cc]);
    }
    out.push(corners[corners.length - 1]);
    return out;
  }

  private tracePath(pts: Pt[], frac = 1): Pt | null {
    const g = this.g;
    if (pts.length < 2) return null;
    let total = 0;
    for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    let left = total * frac;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    let tip: Pt = pts[0];
    for (let k = 1; k < pts.length; k++) {
      const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      if (l >= left) {
        const u = l > 0 ? left / l : 0;
        tip = [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * u, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * u];
        g.lineTo(tip[0], tip[1]);
        return tip;
      }
      left -= l;
      g.lineTo(pts[k][0], pts[k][1]);
      tip = pts[k];
    }
    return tip;
  }

  private strokeRoute(pts: Pt[], alpha: number, frac = 1, march = true): void {
    const g = this.g;
    const s = this.L.cell;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const layers: [number, number, string][] = [
      [s * 0.5, 0.05, C.route],
      [s * 0.26, 0.12, C.route],
      [s * 0.1, 0.5, C.route],
      [Math.max(1, s * 0.035), 0.9, C.routeHot],
    ];
    let tip: Pt | null = null;
    for (const [w, a, col] of layers) {
      g.globalAlpha = a * alpha;
      g.strokeStyle = col;
      g.lineWidth = w;
      tip = this.tracePath(pts, frac);
      g.stroke();
    }
    if (march) this.marchRoute(pts, alpha, frac);
    if (tip && frac < 1) {
      const gs = glowSprite(this.sp, C.routeHot);
      g.globalAlpha = alpha;
      g.drawImage(gs.c, tip[0] - s * 0.5, tip[1] - s * 0.5, s, s);
    }
    g.globalAlpha = 1;
  }

  private buildComposite(sim: Sim): void {
    const L = this.L;
    if (!this.layer) return;
    if (!this.composite || this.composite.width !== this.layer.width || this.composite.height !== this.layer.height) {
      this.composite = document.createElement('canvas');
      this.composite.width = this.layer.width;
      this.composite.height = this.layer.height;
    }
    const c = this.composite.getContext('2d')!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.layer, 0, 0);
    c.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    const keep = this.g;
    this.g = c;
    for (const p of this.routesPx) this.strokeRoute(p, 1, 1, false);
    this.g = keep;
    this.compositeFor = sim.gridVersion;
  }

  /** Data packets streaming toward the Core. */
  private marchRoute(pts: Pt[], alpha: number, frac = 1): void {
    const g = this.g;
    const s = this.L.cell;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.85 * alpha;
    g.strokeStyle = '#ffd9e6';
    g.lineWidth = Math.max(1.5, s * 0.07);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.setLineDash([s * 0.16, s * 0.64]);
    g.lineDashOffset = -this.now * s * 1.8;
    this.tracePath(pts, frac);
    g.stroke();
    g.restore();
  }

  private drawRoutes(sim: Sim, view: View): void {
    const ghost = view.ghost;
    const preview = ghost?.check?.legal && ghost.check.routes ? ghost.check.routes.map((r) => this.routeToPx(sim, r)) : null;
    const u = (this.now - this.rerouteAt) / REROUTE_T;
    if (u < 1) {
      const e = 1 - Math.pow(1 - u, 3);
      for (const p of this.oldRoutesPx) this.strokeRoute(jitter(p, (1 - u) * 2.5), (1 - u) * 0.6, 1, false);
      for (const p of this.routesPx) this.strokeRoute(p, 1, e, true);
    } else if (preview) {
      for (const p of this.routesPx) this.strokeRoute(p, 0.35);
    } else {
      // Glow is baked into the composite; only the moving packets are live.
      for (const p of this.routesPx) this.marchRoute(p, 1);
    }
    if (preview) {
      const g = this.g;
      const s = this.L.cell;
      g.save();
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.globalCompositeOperation = 'lighter';
      for (const p of preview) {
        g.globalAlpha = 0.25;
        g.strokeStyle = C.route;
        g.lineWidth = s * 0.22;
        this.tracePath(p);
        g.stroke();
        g.globalAlpha = 0.95;
        g.strokeStyle = '#ffe3ee';
        g.lineWidth = Math.max(1.5, s * 0.05);
        g.setLineDash([s * 0.28, s * 0.18]);
        g.lineDashOffset = -this.now * s * 2.4;
        this.tracePath(p);
        g.stroke();
        g.setLineDash([]);
      }
      g.restore();
    }
  }

  private drawCore(sim: Sim): void {
    const g = this.g;
    const s = this.L.cell;
    const [x, y] = this.coreCenter(sim);
    const hit = this.coreHit;
    const jx = hit > 0 ? (Math.random() - 0.5) * s * 0.12 * hit : 0;
    const low = sim.integrity / sim.maxIntegrity;
    draw(g, this.sp.coreBase, x + jx, y);
    // Gem: slow spin, bob, turns red when integrity is low.
    g.save();
    g.translate(x + jx, y + Math.sin(this.now * 2) * s * 0.03);
    g.rotate(this.now * 0.6);
    const gem = this.sp.coreGem;
    g.drawImage(gem.c, -gem.w / 2, -gem.h / 2, gem.w, gem.h);
    g.restore();
    if (low <= 0.35 || hit > 0) {
      const a = Math.max(hit, low <= 0.35 ? 0.35 + 0.25 * Math.sin(this.now * 8) : 0);
      const gs = glowSprite(this.sp, C.danger);
      g.globalAlpha = a;
      g.globalCompositeOperation = 'lighter';
      g.drawImage(gs.c, x - s * 1.2, y - s * 1.2, s * 2.4, s * 2.4);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
    // Integrity ring: one segment per point.
    const n = sim.maxIntegrity;
    const R = s * 1.08;
    const gap = 0.06;
    g.lineWidth = Math.max(2, s * 0.08);
    g.lineCap = 'butt';
    for (let k = 0; k < n; k++) {
      const a0 = -Math.PI / 2 + (k / n) * Math.PI * 2 + gap / 2;
      const a1 = a0 + (Math.PI * 2) / n - gap;
      const lit = k < sim.integrity;
      g.strokeStyle = lit ? (low <= 0.35 ? C.amber : C.cyan) : 'rgba(255,51,85,0.28)';
      g.globalAlpha = lit ? 0.9 : 1;
      g.beginPath();
      g.arc(x, y, R, a0, a1);
      g.stroke();
    }
    // Segments just lost flash out.
    for (let k = 0; k < this.lostAt.length; k++) {
      const age = this.now - this.lostAt[k];
      if (age > 0.6) continue;
      const idx = sim.integrity + k;
      if (idx >= n) continue;
      const a0 = -Math.PI / 2 + (idx / n) * Math.PI * 2 + gap / 2;
      g.globalAlpha = 1 - age / 0.6;
      g.strokeStyle = '#ffffff';
      g.beginPath();
      g.arc(x, y, R + age * s * 0.6, a0, a0 + (Math.PI * 2) / n - gap);
      g.stroke();
    }
    this.lostAt = this.lostAt.filter((t) => this.now - t < 0.6);
    g.globalAlpha = 1;
  }

  private drawFields(sim: Sim): void {
    const g = this.g;
    const s = this.L.cell;
    for (const t of sim.towers) {
      if (t.stats.slow <= 0) continue;
      const [x, y] = this.cellCenter(t.cx, t.cy);
      const R = t.stats.range * s;
      const grow = this.growth(t);
      g.globalAlpha = 0.07 * grow;
      g.fillStyle = C.blue;
      g.beginPath();
      g.arc(x, y, R * grow, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.22 * grow;
      g.strokeStyle = C.blue;
      g.lineWidth = 1;
      g.stroke();
      const u = (this.now * 0.7 + t.id * 0.37) % 1;
      g.globalAlpha = (1 - u) * 0.35 * grow;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, R * u, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  private growth(t: Tower): number {
    const b = this.born.get(t.id);
    if (b === undefined) return 1;
    return Math.min(1, (this.now - b) / 0.35);
  }

  private ring(x: number, y: number, R: number, col: string, minR = 0, dashed = false): void {
    const g = this.g;
    g.save();
    g.globalAlpha = 0.08;
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, R, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.7;
    g.strokeStyle = col;
    g.lineWidth = 1.5;
    if (dashed) { g.setLineDash([6, 5]); g.lineDashOffset = -this.now * 12; }
    g.stroke();
    g.setLineDash([4, 10]);
    g.lineDashOffset = this.now * 10;
    g.globalAlpha = 0.35;
    g.beginPath();
    g.arc(x, y, R + 3, 0, Math.PI * 2);
    g.stroke();
    if (minR > 0) {
      g.setLineDash([3, 4]);
      g.globalAlpha = 0.5;
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath();
      g.arc(x, y, minR, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = C.danger;
      g.stroke();
    }
    g.restore();
  }

  private drawRanges(_sim: Sim, view: View): void {
    const s = this.L.cell;
    const sel = view.selected;
    if (sel) {
      const [x, y] = this.cellCenter(sel.cx, sel.cy);
      const col = TOWER_COLOR[sel.kind];
      this.ring(x, y, sel.stats.range * s, col, sel.stats.minRange * s);
      if (view.preview && view.preview.range !== sel.stats.range) this.ring(x, y, view.preview.range * s, '#ffffff', 0, true);
    } else if (view.hoverTower) {
      const t = view.hoverTower;
      const [x, y] = this.cellCenter(t.cx, t.cy);
      const g = this.g;
      g.globalAlpha = 0.4;
      g.strokeStyle = TOWER_COLOR[t.kind];
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, t.stats.range * s, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
  }

  private drawNetwork(_sim: Sim): void {
    const g = this.g;
    const s = this.L.cell;
    g.lineCap = 'round';
    for (const [a, b] of this.edges) {
      const ga = this.born.get(a.id), gb = this.born.get(b.id);
      const ageA = ga === undefined ? 9 : this.now - ga, ageB = gb === undefined ? 9 : this.now - gb;
      // The newer tower grows its trace out to the older one.
      const [young, old, age] = ageA < ageB ? [a, b, ageA] : [b, a, ageB];
      const f = Math.min(1, Math.max(0, (age - 0.05) / 0.22));
      if (f <= 0) continue;
      const [x0, y0] = this.cellCenter(young.cx, young.cy);
      const [x1, y1] = this.cellCenter(old.cx, old.cy);
      const xe = x0 + (x1 - x0) * f, ye = y0 + (y1 - y0) * f;
      // Offset into two parallel traces, like a bus.
      const nx = -(y1 - y0) / s, ny = (x1 - x0) / s;
      for (const off of [-0.14, 0.14]) {
        g.globalAlpha = 0.18;
        g.strokeStyle = C.cyan;
        g.lineWidth = s * 0.12;
        g.beginPath();
        g.moveTo(x0 + nx * s * off, y0 + ny * s * off);
        g.lineTo(xe + nx * s * off, ye + ny * s * off);
        g.stroke();
        g.globalAlpha = 0.75;
        g.lineWidth = Math.max(1, s * 0.035);
        g.strokeStyle = '#9ff4ff';
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    // Occasional ambient pulse so the network feels alive.
    if (this.edges.length && this.now - this.lastAmbient > 0.9) {
      this.lastAmbient = this.now;
      const [a, b] = this.edges[(Math.random() * this.edges.length) | 0];
      const flip = Math.random() < 0.5;
      this.pulses.push({ a: flip ? a : b, b: flip ? b : a, at: this.now, T: 0.35, col: C.cyan });
    }
    const live = [];
    g.globalCompositeOperation = 'lighter';
    for (const p of this.pulses) {
      const u = (this.now - p.at) / p.T;
      if (u > 1) continue;
      live.push(p);
      if (u < 0) continue;
      const [x0, y0] = this.cellCenter(p.a.cx, p.a.cy);
      const [x1, y1] = this.cellCenter(p.b.cx, p.b.cy);
      const gs = glowSprite(this.sp, p.col);
      const d = s * 0.55;
      g.globalAlpha = Math.sin(u * Math.PI);
      g.drawImage(gs.c, x0 + (x1 - x0) * u - d / 2, y0 + (y1 - y0) * u - d / 2, d, d);
    }
    this.pulses = live;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  private drawTowers(sim: Sim, view: View): void {
    const g = this.g;
    const s = this.L.cell;
    for (const t of sim.towers) {
      const [x, y] = this.cellCenter(t.cx, t.cy);
      const b = this.born.get(t.id);
      const age = b === undefined ? 9 : this.now - b;
      // Solidify: overshoot then settle, glow ramps up.
      let k = 1;
      if (age < 0.28) {
        const u = age / 0.28;
        k = 1 + Math.sin(u * Math.PI) * 0.18 * (1 - u) + (1 - u) * 0.1;
      }
      const glowA = Math.min(1, 0.35 + age * 2.2);
      g.globalAlpha = glowA;
      draw(g, this.sp.base[t.kind], x, y, k);
      g.globalAlpha = 1;
      // Head
      let ang: number;
      if (t.kind === 'throttle') ang = this.now * 1.6 + t.id;
      else {
        const prev = this.headAngle.get(t.id) ?? t.angle;
        ang = lerpAngle(prev, t.angle, 0.35);
        this.headAngle.set(t.id, ang);
      }
      let hx = x, hy = y;
      const since = sim.time - t.fired;
      if (t.kind === 'mortar' && since < 0.3) {
        const r = (1 - since / 0.3) * s * 0.09;
        hx -= Math.cos(ang) * r;
        hy -= Math.sin(ang) * r;
      }
      draw(g, this.sp.head[t.kind], hx, hy, k, ang);
      if (t.kind === 'filter' && since < 0.07) {
        const gs = glowSprite(this.sp, C.cyan);
        const d = s * 0.5;
        g.globalCompositeOperation = 'lighter';
        g.drawImage(gs.c, x + Math.cos(ang) * s * 0.3 - d / 2, y + Math.sin(ang) * s * 0.3 - d / 2, d, d);
        g.globalCompositeOperation = 'source-over';
      }
      // Branch accents on the mortar
      if (t.kind === 'mortar') {
        if (t.path.includes('ma1')) {
          g.fillStyle = C.green;
          for (let q = 0; q < 4; q++) {
            const a = ang + Math.PI / 4 + (q * Math.PI) / 2;
            g.beginPath();
            g.arc(hx + Math.cos(a) * s * 0.2, hy + Math.sin(a) * s * 0.2, s * 0.045, 0, Math.PI * 2);
            g.fill();
          }
        } else if (t.path.includes('mb1')) {
          g.strokeStyle = C.green;
          g.lineWidth = s * 0.06;
          g.beginPath();
          g.moveTo(hx + Math.cos(ang) * s * 0.25, hy + Math.sin(ang) * s * 0.25);
          g.lineTo(hx + Math.cos(ang) * s * 0.42, hy + Math.sin(ang) * s * 0.42);
          g.stroke();
        }
      }
      // Tier pips along the bottom edge
      const n = t.path.length;
      for (let q = 0; q < n; q++) {
        const px = x + (q - (n - 1) / 2) * s * 0.13;
        g.fillStyle = '#ffffff';
        g.fillRect(px - s * 0.035, y + s * 0.27, s * 0.07, s * 0.07);
      }
      // Placement flash
      if (age < 0.16) {
        const gs = glowSprite(this.sp, TOWER_COLOR[t.kind]);
        g.globalAlpha = 1 - age / 0.16;
        g.globalCompositeOperation = 'lighter';
        g.drawImage(gs.c, x - s, y - s, s * 2, s * 2);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
      }
      if (view.selected === t) this.brackets(x, y, s * 0.5, TOWER_COLOR[t.kind]);
    }
  }

  private brackets(x: number, y: number, h: number, col: string): void {
    const g = this.g;
    const k = h * 0.4;
    const o = h + 2 + Math.sin(this.now * 6) * 1.5;
    g.strokeStyle = col;
    g.lineWidth = 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.beginPath();
      g.moveTo(x + sx * o, y + sy * (o - k));
      g.lineTo(x + sx * o, y + sy * o);
      g.lineTo(x + sx * (o - k), y + sy * o);
      g.stroke();
    }
  }

  private drawMalware(sim: Sim, dt: number): void {
    const g = this.g;
    const s = this.L.cell;
    const blend = 1 - Math.exp(-dt * 14);
    for (const m of sim.malware) {
      const x = this.X(m.x + m.ox), y = this.Y(m.y + m.oy);
      const target = DIR_ANGLE[m.dir];
      const prev = this.mAngle.get(m.id);
      const a = prev === undefined ? target : lerpAngle(prev, target, blend);
      this.mAngle.set(m.id, a);
      const k = Math.min(1, m.age / 0.25);
      const scale = 0.4 + 0.6 * k;
      g.globalAlpha = k;
      if (m.slow > 0) {
        g.strokeStyle = rgba(C.blue, 0.8);
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(x, y, m.def.radius * s * 1.6, 0, Math.PI * 2);
        g.stroke();
      }
      if (m.kind === 'worm') {
        const ca = Math.cos(a), sa = Math.sin(a);
        for (const [back, ph] of [[0.33, 1.2], [0.18, 0.6]]) {
          const w = Math.sin(this.now * 11 + m.id + ph) * s * 0.05;
          draw(g, this.sp.wormSeg, x - ca * s * back - sa * w, y - sa * s * back + ca * w, scale, a);
        }
      } else if (m.kind === 'spyware') {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.45 * k * (1 - m.slow);
        g.strokeStyle = MALWARE_COLOR.spyware;
        g.lineWidth = s * 0.1;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x - Math.cos(a) * s * 0.15, y - Math.sin(a) * s * 0.15);
        g.lineTo(x - Math.cos(a) * s * 0.6, y - Math.sin(a) * s * 0.6);
        g.stroke();
        g.restore();
        g.globalAlpha = k;
      }
      draw(g, this.sp.body[m.kind], x, y, scale, m.kind === 'trojan' ? 0 : a);
      if (m.kind === 'trojan') this.trojanCracks(x, y, m.hp / m.maxHp, m.def.radius * s, m.id);
      if (m.flash > 0) {
        g.globalAlpha = m.flash * 0.9;
        draw(g, this.sp.flash[m.kind], x, y, scale, m.kind === 'trojan' ? 0 : a);
      }
      g.globalAlpha = 1;
      if (m.hp < m.maxHp) {
        const w = s * (m.kind === 'trojan' ? 0.8 : 0.5);
        const hy = y - m.def.radius * s - 6;
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.fillRect(x - w / 2 - 1, hy - 1, w + 2, 4);
        g.fillStyle = MALWARE_COLOR[m.kind];
        g.fillRect(x - w / 2, hy, w * Math.max(0, m.hp / m.maxHp), 2);
      }
    }
  }

  private trojanCracks(x: number, y: number, f: number, r: number, id: number): void {
    if (f > 0.7) return;
    const g = this.g;
    g.strokeStyle = MALWARE_COLOR.trojan;
    g.lineWidth = 1.5;
    g.globalAlpha = 0.9;
    const n = f > 0.4 ? 2 : 4;
    for (let k = 0; k < n; k++) {
      const a = id * 1.7 + k * 1.9;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45);
      g.lineTo(x + Math.cos(a + 0.3) * r * 0.85, y + Math.sin(a + 0.3) * r * 0.85);
      g.lineTo(x + Math.cos(a - 0.1) * r * 1.15, y + Math.sin(a - 0.1) * r * 1.15);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  private drawProjectiles(sim: Sim): void {
    const g = this.g;
    const s = this.L.cell;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    const head = glowSprite(this.sp, C.cyan);
    for (const b of sim.bolts) {
      const x = this.X(b.x), y = this.Y(b.y);
      const dx = b.lx - b.x, dy = b.ly - b.y;
      const d = Math.hypot(dx, dy) || 1;
      g.globalAlpha = 0.9;
      g.strokeStyle = C.cyan;
      g.lineWidth = Math.max(1.5, s * 0.06);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - (dx / d) * s * 0.42, y - (dy / d) * s * 0.42);
      g.stroke();
      const hd = s * 0.42;
      g.drawImage(head.c, x - hd / 2, y - hd / 2, hd, hd);
    }
    const shell = glowSprite(this.sp, C.green);
    for (const sh of sim.shells) {
      const u = sh.t / sh.T;
      const gx = this.X(sh.x0 + (sh.x1 - sh.x0) * u), gy = this.Y(sh.y0 + (sh.y1 - sh.y0) * u);
      const dist = Math.hypot(sh.x1 - sh.x0, sh.y1 - sh.y0);
      const H = s * (sh.small ? 0.35 : 0.5 + dist * 0.22);
      const hgt = H * 4 * u * (1 - u);
      // Landing marker
      if (!sh.small) {
        g.globalAlpha = 0.25 + 0.45 * u;
        g.strokeStyle = C.green;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(this.X(sh.x1), this.Y(sh.y1), sh.splash * s * (1.15 - u * 0.25), 0, Math.PI * 2);
        g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.35;
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(gx, gy, s * 0.12, s * 0.07, 0, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 1;
      const d = s * (sh.small ? 0.35 : 0.6);
      g.drawImage(shell.c, gx - d / 2, gy - hgt - d / 2, d, d);
    }
    g.restore();
  }

  private drawGhost(_sim: Sim, ghost: Ghost | null): void {
    if (!ghost) return;
    const g = this.g;
    const s = this.L.cell;
    const L = this.L;
    const col = TOWER_COLOR[ghost.kind];
    if (!ghost.cell || !ghost.check) {
      g.globalAlpha = 0.6;
      draw(g, this.sp.base[ghost.kind], ghost.x, ghost.y, 0.9);
      draw(g, this.sp.head[ghost.kind], ghost.x, ghost.y, 0.9, -Math.PI / 4);
      g.globalAlpha = 1;
      return;
    }
    const [cx, cy] = ghost.cell;
    const c = ghost.check;
    const [x, y] = this.cellCenter(cx, cy);
    const ok = c.ok;
    const tone = ok ? col : C.danger;
    // Crosshair along the row and column, so the target stays readable under a finger.
    g.fillStyle = rgba(tone, 0.07);
    g.fillRect(L.ox, this.Y(cy), L.cols * s, s);
    g.fillRect(this.X(cx), L.oy, s, L.rows * s);
    // Range
    const st = TOWERS[ghost.kind].base;
    this.ring(x, y, st.range * s, tone, st.minRange * s);
    // Cell outline
    g.strokeStyle = tone;
    g.lineWidth = 2;
    g.globalAlpha = 0.9;
    rrect(g, this.X(cx) + 2, this.Y(cy) + 2, s - 4, s - 4, s * 0.12);
    g.stroke();
    g.globalAlpha = 1;
    // Sprite
    const bob = Math.sin(this.now * 7) * 0.03;
    if (ok) {
      g.globalAlpha = 0.62;
      draw(g, this.sp.base[ghost.kind], x, y, 1 + bob);
      draw(g, this.sp.head[ghost.kind], x, y, 1 + bob, -Math.PI / 4);
    } else {
      g.globalAlpha = 0.7;
      draw(g, this.sp.ghostBad[ghost.kind], x, y, 1);
    }
    g.globalAlpha = 1;
    // Label pill
    let text: string;
    if (!ok) text = c.reason;
    else if (c.delta > 0) text = `Route +${c.delta}`;
    else text = `${c.cost} bits`;
    const pillCol = !ok ? C.danger : c.delta > 0 ? C.routeHot : col;
    g.font = `700 ${Math.max(11, Math.min(15, s * 0.38))}px ${FONT}`;
    const tw = g.measureText(text).width + 16;
    const th = Math.max(20, s * 0.55);
    let py = this.Y(cy) - th - 6;
    if (py < L.oy - th * 0.3) py = this.Y(cy + 1) + 6;
    let px = x - tw / 2;
    px = Math.max(L.ox + 2, Math.min(L.ox + L.cols * s - tw - 2, px));
    rrect(g, px, py, tw, th, th / 2);
    g.fillStyle = 'rgba(4,8,16,0.88)';
    g.fill();
    g.strokeStyle = pillCol;
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = pillCol;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, px + tw / 2, py + th / 2 + 1);
  }

  private drawReturning(dt: number): void {
    const g = this.g;
    const keep = [];
    for (const r of this.returning) {
      r.t += dt / 0.22;
      if (r.t >= 1) continue;
      keep.push(r);
      const e = r.t * r.t;
      g.globalAlpha = (1 - r.t) * 0.7;
      const x = r.x + (r.tx - r.x) * e, y = r.y + (r.ty - r.y) * e;
      draw(this.g, this.sp.base[r.kind], x, y, 1 - r.t * 0.6);
    }
    g.globalAlpha = 1;
    this.returning = keep;
  }

  private drawScreenFx(sim: Sim, _dt: number): void {
    const g = this.g;
    const L = this.L;
    const low = sim.integrity / sim.maxIntegrity;
    const base = !sim.result && low <= 0.35 ? 0.18 + 0.1 * Math.sin(this.now * 5) : 0;
    const a = Math.max(this.alarm * 0.7, base);
    if (a > 0.01 && this.vignette) {
      g.globalAlpha = a;
      g.drawImage(this.vignette, 0, 0, L.w, L.h);
      g.globalAlpha = 1;
    }
    if (this.glitch > 0) {
      // Slice the frame into offset bands: a corrupted-signal look.
      const k = this.glitch / 0.28;
      g.setTransform(1, 0, 0, 1, 0, 0);
      const W = this.canvas.width, H = this.canvas.height;
      for (let n = 0; n < 5; n++) {
        const y = Math.random() * H;
        const h = (4 + Math.random() * 22) * L.dpr;
        const dx = (Math.random() - 0.5) * 30 * L.dpr * k;
        g.drawImage(this.canvas, 0, y, W, h, dx, y, W, h);
      }
      g.globalAlpha = 0.12 * k;
      g.globalCompositeOperation = 'lighter';
      g.drawImage(this.canvas, 4 * L.dpr * k, 0, W, H, 0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    }
  }
}

/** Current frame's base transform (dpr scale plus shake), so rotated draws can skip getTransform(). */
const BASE = { k: 1, e: 0, f: 0 };

function draw(g: CanvasRenderingContext2D, sp: Sprite, x: number, y: number, k = 1, a = 0): void {
  const w = sp.w * k, h = sp.h * k;
  if (a === 0) {
    g.drawImage(sp.c, x - w / 2, y - h / 2, w, h);
    return;
  }
  const c = Math.cos(a) * BASE.k, s = Math.sin(a) * BASE.k;
  g.setTransform(c, s, -s, c, BASE.e + x * BASE.k, BASE.f + y * BASE.k);
  g.drawImage(sp.c, -w / 2, -h / 2, w, h);
  g.setTransform(BASE.k, 0, 0, BASE.k, BASE.e, BASE.f);
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function jitter(pts: Pt[], amt: number): Pt[] {
  return pts.map(([x, y]) => [x + (Math.random() - 0.5) * amt, y + (Math.random() - 0.5) * amt]);
}

function samePaths(a: Pt[][], b: Pt[][]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].length !== b[i].length) return false;
    for (let k = 0; k < a[i].length; k++) if (a[i][k][0] !== b[i][k][0] || a[i][k][1] !== b[i][k][1]) return false;
  }
  return true;
}

function buildVignette(L: Layout): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const k = 0.5; // half resolution is plenty for a soft gradient
  c.width = Math.ceil(L.w * k);
  c.height = Math.ceil(L.h * k);
  const g = c.getContext('2d')!;
  const R = Math.hypot(c.width, c.height) / 2;
  const grd = g.createRadialGradient(c.width / 2, c.height / 2, R * 0.45, c.width / 2, c.height / 2, R);
  grd.addColorStop(0, 'rgba(255,30,60,0)');
  grd.addColorStop(1, 'rgba(255,30,60,0.85)');
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

