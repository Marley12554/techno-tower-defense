/**
 * Pre-rendered sprites. Glow is baked in with shadowBlur once, at build time,
 * so the per-frame cost is a plain drawImage. Rebuilt when the cell size changes.
 */
import type { MalwareKind, TowerKind } from '../game/types';
import { C, MALWARE_COLOR, TOWER_COLOR, rgba } from './palette';

export interface Sprite {
  c: HTMLCanvasElement;
  /** Size in CSS px. Drawn centered. */
  w: number;
  h: number;
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** Builds a square sprite of `size` CSS px plus glow padding, origin at the center. */
export function make(size: number, dpr: number, draw: (g: CanvasRenderingContext2D, s: number) => void, padK = 0.6): Sprite {
  const W = size * (1 + padK);
  const c = canvas(W * dpr, W * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  g.translate(W / 2, W / 2);
  draw(g, size);
  return { c, w: W, h: W };
}

/** A copy of a sprite with every opaque pixel tinted (hit flash, invalid ghost). */
function tinted(sp: Sprite, color: string, k = 1): Sprite {
  const c = canvas(sp.c.width, sp.c.height);
  const g = c.getContext('2d')!;
  g.drawImage(sp.c, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = k;
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return { c, w: sp.w, h: sp.h };
}

function poly(g: CanvasRenderingContext2D, pts: number[]): void {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
}

function ngon(g: CanvasRenderingContext2D, n: number, r: number, rot = 0): void {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.closePath();
}

function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
export { rrect };

/* ------------------------------------------------------------------ towers */

function drawTowerBase(g: CanvasRenderingContext2D, kind: TowerKind, s: number): void {
  const col = TOWER_COLOR[kind];
  // Pins: short traces out to the cell corners, where the board's vias are.
  g.strokeStyle = rgba(col, 0.45);
  g.lineWidth = s * 0.045;
  g.lineCap = 'round';
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    g.beginPath();
    g.moveTo(sx * s * 0.3, sy * s * 0.3);
    g.lineTo(sx * s * 0.47, sy * s * 0.47);
    g.stroke();
    g.fillStyle = rgba(col, 0.7);
    g.beginPath();
    g.arc(sx * s * 0.47, sy * s * 0.47, s * 0.05, 0, Math.PI * 2);
    g.fill();
  }
  g.shadowColor = col;
  g.shadowBlur = s * 0.28;
  rrect(g, -s * 0.36, -s * 0.36, s * 0.72, s * 0.72, s * 0.12);
  g.fillStyle = '#08111e';
  g.fill();
  g.lineWidth = s * 0.05;
  g.strokeStyle = col;
  g.stroke();
  g.shadowBlur = 0;
  // Inner bevel
  rrect(g, -s * 0.29, -s * 0.29, s * 0.58, s * 0.58, s * 0.08);
  g.lineWidth = s * 0.02;
  g.strokeStyle = rgba(col, 0.25);
  g.stroke();
  g.lineWidth = s * 0.035;
  if (kind === 'filter') {
    ngon(g, 6, s * 0.22, Math.PI / 6);
    g.strokeStyle = rgba(col, 0.8);
    g.stroke();
    ngon(g, 6, s * 0.13, Math.PI / 6);
    g.fillStyle = rgba(col, 0.18);
    g.fill();
  } else if (kind === 'throttle') {
    for (const [r, a] of [[0.25, 0.4], [0.17, 0.7]]) {
      g.beginPath();
      g.arc(0, 0, s * r, 0, Math.PI * 2);
      g.strokeStyle = rgba(col, a);
      g.stroke();
    }
  } else {
    ngon(g, 8, s * 0.27, Math.PI / 8);
    g.strokeStyle = rgba(col, 0.8);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, s * 0.19, 0, Math.PI * 2);
    g.fillStyle = '#050c09';
    g.fill();
  }
}

function drawTowerHead(g: CanvasRenderingContext2D, kind: TowerKind, s: number): void {
  const col = TOWER_COLOR[kind];
  g.shadowColor = col;
  g.shadowBlur = s * 0.22;
  if (kind === 'filter') {
    poly(g, [s * 0.3, 0, -s * 0.15, s * 0.17, -s * 0.06, 0, -s * 0.15, -s * 0.17]);
    g.fillStyle = col;
    g.fill();
    g.shadowBlur = 0;
    g.beginPath();
    g.moveTo(-s * 0.02, 0);
    g.lineTo(s * 0.24, 0);
    g.strokeStyle = C.white;
    g.lineWidth = s * 0.035;
    g.lineCap = 'round';
    g.stroke();
  } else if (kind === 'throttle') {
    g.lineWidth = s * 0.05;
    g.strokeStyle = col;
    g.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      g.beginPath();
      g.arc(0, 0, s * 0.11, a, a + 1.3);
      g.stroke();
    }
    g.shadowBlur = s * 0.3;
    g.beginPath();
    g.arc(0, 0, s * 0.05, 0, Math.PI * 2);
    g.fillStyle = C.white;
    g.fill();
  } else {
    // Mortar tube seen from above, barrel stub pointing +x.
    rrect(g, 0, -s * 0.065, s * 0.27, s * 0.13, s * 0.04);
    g.fillStyle = '#0b2219';
    g.fill();
    g.lineWidth = s * 0.035;
    g.strokeStyle = col;
    g.stroke();
    g.beginPath();
    g.arc(0, 0, s * 0.15, 0, Math.PI * 2);
    g.fillStyle = '#0b2219';
    g.fill();
    g.lineWidth = s * 0.05;
    g.stroke();
    g.shadowBlur = 0;
    g.beginPath();
    g.arc(0, 0, s * 0.075, 0, Math.PI * 2);
    g.fillStyle = '#020604';
    g.fill();
  }
}

/* ----------------------------------------------------------------- malware */

function drawMalware(g: CanvasRenderingContext2D, kind: MalwareKind, r: number, flash: boolean, seg = false): void {
  const col = flash ? '#ffffff' : MALWARE_COLOR[kind];
  g.shadowColor = flash ? '#ffffff' : col;
  g.shadowBlur = seg ? r * 0.5 : r * 1.0;
  if (kind === 'worm') {
    const k = seg ? 0.62 : 1;
    poly(g, [r * 1.35 * k, 0, 0, r * 0.9 * k, -r * 1.1 * k, 0, 0, -r * 0.9 * k]);
    g.fillStyle = col;
    g.fill();
    g.shadowBlur = 0;
    if (!seg) {
      poly(g, [r * 0.6, 0, 0, r * 0.36, -r * 0.4, 0, 0, -r * 0.36]);
      g.fillStyle = flash ? col : '#ffd6ff';
      g.fill();
    }
  } else if (kind === 'spyware') {
    poly(g, [r * 1.55, 0, -r * 1.05, r * 1.0, -r * 0.45, 0, -r * 1.05, -r * 1.0]);
    g.fillStyle = col;
    g.fill();
    g.shadowBlur = 0;
    g.beginPath();
    g.arc(r * 0.25, 0, r * 0.34, 0, Math.PI * 2);
    g.fillStyle = flash ? col : '#fff6dc';
    g.fill();
    g.beginPath();
    g.arc(r * 0.33, 0, r * 0.15, 0, Math.PI * 2);
    g.fillStyle = flash ? col : '#3a2500';
    g.fill();
  } else {
    // Trojan: a dull, harmless-looking shell around a hot core.
    g.shadowBlur = r * 0.8;
    ngon(g, 6, r * 1.2, 0);
    g.fillStyle = flash ? col : '#1a2230';
    g.fill();
    g.lineWidth = r * 0.22;
    g.strokeStyle = flash ? col : '#8ea4bf';
    g.stroke();
    g.shadowColor = flash ? '#fff' : MALWARE_COLOR.trojan;
    g.shadowBlur = r * 1.2;
    g.beginPath();
    g.arc(0, 0, r * 0.48, 0, Math.PI * 2);
    g.fillStyle = flash ? col : MALWARE_COLOR.trojan;
    g.fill();
  }
}

/* -------------------------------------------------------------------- core */

function drawCoreBase(g: CanvasRenderingContext2D, s: number): void {
  // s = 2 cells
  g.shadowColor = C.cyan;
  g.shadowBlur = s * 0.2;
  rrect(g, -s * 0.44, -s * 0.44, s * 0.88, s * 0.88, s * 0.1);
  g.fillStyle = '#061424';
  g.fill();
  g.lineWidth = s * 0.03;
  g.strokeStyle = C.cyan;
  g.stroke();
  g.shadowBlur = 0;
  // Server rack slots
  g.fillStyle = rgba(C.cyan, 0.1);
  for (let k = 0; k < 4; k++) {
    rrect(g, -s * 0.36, -s * 0.36 + k * s * 0.19, s * 0.72, s * 0.13, s * 0.02);
    g.fill();
  }
  g.fillStyle = rgba(C.green, 0.8);
  for (let k = 0; k < 4; k++) {
    g.beginPath();
    g.arc(s * 0.3, -s * 0.295 + k * s * 0.19, s * 0.018, 0, Math.PI * 2);
    g.fill();
  }
}

function drawCoreGem(g: CanvasRenderingContext2D, s: number): void {
  g.shadowColor = C.cyan;
  g.shadowBlur = s * 0.35;
  poly(g, [0, -s * 0.2, s * 0.2, 0, 0, s * 0.2, -s * 0.2, 0]);
  g.fillStyle = '#9ff4ff';
  g.fill();
  g.shadowBlur = 0;
  poly(g, [0, -s * 0.1, s * 0.1, 0, 0, s * 0.1, -s * 0.1, 0]);
  g.fillStyle = '#ffffff';
  g.fill();
}

/* ------------------------------------------------------------------- set */

export interface SpriteSet {
  cell: number;
  base: Record<TowerKind, Sprite>;
  head: Record<TowerKind, Sprite>;
  ghostBad: Record<TowerKind, Sprite>;
  body: Record<MalwareKind, Sprite>;
  flash: Record<MalwareKind, Sprite>;
  wormSeg: Sprite;
  coreBase: Sprite;
  coreGem: Sprite;
  glow: Map<string, Sprite>;
  dpr: number;
}

const KINDS: TowerKind[] = ['filter', 'throttle', 'mortar'];
const MKINDS: [MalwareKind, number][] = [['worm', 0.2], ['spyware', 0.2], ['trojan', 0.34]];

export function buildSprites(cell: number, dpr: number): SpriteSet {
  const base = {} as Record<TowerKind, Sprite>;
  const head = {} as Record<TowerKind, Sprite>;
  const ghostBad = {} as Record<TowerKind, Sprite>;
  for (const k of KINDS) {
    base[k] = make(cell, dpr, (g, s) => drawTowerBase(g, k, s));
    head[k] = make(cell, dpr, (g, s) => drawTowerHead(g, k, s));
    // The invalid ghost is base and head merged, tinted red.
    const merged = make(cell, dpr, (g, s) => { drawTowerBase(g, k, s); drawTowerHead(g, k, s); });
    ghostBad[k] = tinted(merged, C.danger, 0.75);
  }
  const body = {} as Record<MalwareKind, Sprite>;
  const flash = {} as Record<MalwareKind, Sprite>;
  for (const [k, rad] of MKINDS) {
    const r = rad * cell;
    // Tight bounds: these are drawn hundreds of times a frame, so every pixel of padding is fill cost.
    body[k] = make(r * 3, dpr, (g) => drawMalware(g, k, r, false), 0.75);
    flash[k] = make(r * 3, dpr, (g) => drawMalware(g, k, r, true), 0.75);
  }
  const wr = 0.2 * cell;
  const wormSeg = make(wr * 1.8, dpr, (g) => drawMalware(g, 'worm', wr, false, true), 0.6);
  const coreBase = make(cell * 2, dpr, (g, s) => drawCoreBase(g, s), 0.4);
  const coreGem = make(cell * 2, dpr, (g, s) => drawCoreGem(g, s), 0.4);
  return { cell, base, head, ghostBad, body, flash, wormSeg, coreBase, coreGem, glow: new Map(), dpr };
}

/** Soft round glow in a color, cached. `size` is the CSS px diameter of the bright part. */
export function glowSprite(set: SpriteSet, color: string): Sprite {
  let sp = set.glow.get(color);
  if (sp) return sp;
  const size = 32;
  const c = canvas(size * 2 * set.dpr, size * 2 * set.dpr);
  const g = c.getContext('2d')!;
  const R = size * set.dpr;
  const grd = g.createRadialGradient(R, R, 0, R, R, R);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, rgba(color, 0.95));
  grd.addColorStop(0.45, rgba(color, 0.35));
  grd.addColorStop(1, rgba(color, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  sp = { c, w: size * 2, h: size * 2 };
  set.glow.set(color, sp);
  return sp;
}

/** Small canvas icon for DOM cards and chips. */
export function iconCanvas(kind: TowerKind | MalwareKind, px: number): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = canvas(px * dpr, px * dpr);
  c.style.width = c.style.height = `${px}px`;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  g.translate(px / 2, px / 2);
  if (kind === 'filter' || kind === 'throttle' || kind === 'mortar') {
    const s = px * 0.78;
    drawTowerBase(g, kind, s);
    g.rotate(-Math.PI / 4);
    drawTowerHead(g, kind, s);
  } else {
    const r = px * (kind === 'trojan' ? 0.26 : 0.24);
    drawMalware(g, kind, r, false);
  }
  return c;
}
