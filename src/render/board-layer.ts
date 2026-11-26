/** The static board: substrate, grid, vias, components and spawn ports. Redrawn only on resize. */
import { BLOCK, CAP, CORE, SPAWN, type Board } from '../game/board';
import type { Layout } from './layout';
import { C, MONO, rgba } from './palette';
import { rrect } from './sprites';

export function buildBoardLayer(board: Board, L: Layout): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.ceil(L.w * L.dpr);
  c.height = Math.ceil(L.h * L.dpr);
  const g = c.getContext('2d')!;
  g.scale(L.dpr, L.dpr);
  const s = L.cell;
  const bw = board.cols * s, bh = board.rows * s;

  // Backdrop: near-black with a faint cool bloom behind the board.
  g.fillStyle = C.bg;
  g.fillRect(0, 0, L.w, L.h);
  const cx = L.ox + bw / 2, cy = L.oy + bh / 2;
  const bloom = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(bw, bh) * 0.8);
  bloom.addColorStop(0, 'rgba(20,60,110,0.22)');
  bloom.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = bloom;
  g.fillRect(0, 0, L.w, L.h);
  // Scanlines across the whole backdrop.
  g.fillStyle = 'rgba(120,180,255,0.018)';
  for (let y = 0; y < L.h; y += 3) g.fillRect(0, y, L.w, 1);

  // Substrate
  g.save();
  g.shadowColor = 'rgba(45,226,255,0.25)';
  g.shadowBlur = s * 0.6;
  g.fillStyle = C.substrate;
  g.fillRect(L.ox, L.oy, bw, bh);
  g.restore();

  // Grid lines
  g.strokeStyle = C.grid;
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= board.cols; x++) { g.moveTo(L.ox + x * s + 0.5, L.oy); g.lineTo(L.ox + x * s + 0.5, L.oy + bh); }
  for (let y = 0; y <= board.rows; y++) { g.moveTo(L.ox, L.oy + y * s + 0.5); g.lineTo(L.ox + bw, L.oy + y * s + 0.5); }
  g.stroke();

  // Vias at cell corners: where towers plug in.
  g.fillStyle = C.via;
  const vr = Math.max(1, s * 0.045);
  for (let y = 1; y < board.rows; y++) {
    for (let x = 1; x < board.cols; x++) {
      g.beginPath();
      g.arc(L.ox + x * s, L.oy + y * s, vr, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Frame with corner brackets
  g.strokeStyle = C.frame;
  g.lineWidth = 1;
  g.strokeRect(L.ox - 0.5, L.oy - 0.5, bw + 1, bh + 1);
  g.strokeStyle = C.cyan;
  g.lineWidth = 2;
  const k = s * 0.6;
  for (const [x, y, dx, dy] of [[L.ox, L.oy, 1, 1], [L.ox + bw, L.oy, -1, 1], [L.ox, L.oy + bh, 1, -1], [L.ox + bw, L.oy + bh, -1, -1]]) {
    g.beginPath();
    g.moveTo(x - dx * 3, y + dy * k);
    g.lineTo(x - dx * 3, y - dy * 3);
    g.lineTo(x + dx * k, y - dy * 3);
    g.stroke();
  }

  // Components: group blocked cells into chips.
  const seen = new Uint8Array(board.n);
  let label = 1;
  for (let i = 0; i < board.n; i++) {
    if (seen[i] || board.terrain[i] !== BLOCK) continue;
    let x0 = board.cols, y0 = board.rows, x1 = -1, y1 = -1;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      const x = board.cx(j), y = board.cy(j);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (!board.inBounds(nx, ny)) continue;
        const q = board.idx(nx, ny);
        if (!seen[q] && board.terrain[q] === BLOCK) { seen[q] = 1; stack.push(q); }
      }
    }
    drawChip(g, L.ox + x0 * s, L.oy + y0 * s, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s, s, `U${label++}`);
  }
  for (let i = 0; i < board.n; i++) {
    const x = L.ox + board.cx(i) * s, y = L.oy + board.cy(i) * s;
    if (board.terrain[i] === CAP) drawCap(g, x + s / 2, y + s / 2, s);
    else if (board.terrain[i] === SPAWN) drawPort(g, x, y, s, board.spawnDir(i));
    else if (board.terrain[i] === CORE) {
      g.fillStyle = 'rgba(45,226,255,0.05)';
      g.fillRect(x + 1, y + 1, s - 2, s - 2);
    }
  }
  return c;
}

function drawChip(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: number, label: string): void {
  const inset = s * 0.14;
  const bx = x + inset, by = y + inset, bw = w - inset * 2, bh = h - inset * 2;
  // Pins on the long sides
  g.fillStyle = C.pin;
  const vertical = h >= w;
  const n = Math.max(2, Math.round((vertical ? h : w) / s) * 2);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    if (vertical) {
      const py = by + t * bh - s * 0.04;
      g.fillRect(x + s * 0.03, py, inset, s * 0.08);
      g.fillRect(bx + bw, py, inset - s * 0.03, s * 0.08);
    } else {
      const px = bx + t * bw - s * 0.04;
      g.fillRect(px, y + s * 0.03, s * 0.08, inset);
      g.fillRect(px, by + bh, s * 0.08, inset - s * 0.03);
    }
  }
  const grd = g.createLinearGradient(bx, by, bx, by + bh);
  grd.addColorStop(0, C.compHi);
  grd.addColorStop(1, C.comp);
  rrect(g, bx, by, bw, bh, s * 0.06);
  g.fillStyle = grd;
  g.fill();
  g.strokeStyle = C.compEdge;
  g.lineWidth = 1.5;
  g.stroke();
  // Pin-1 notch and label
  g.beginPath();
  g.arc(bx + s * 0.16, by + s * 0.16, s * 0.05, 0, Math.PI * 2);
  g.fillStyle = C.compEdge;
  g.fill();
  g.fillStyle = C.compText;
  g.font = `600 ${Math.max(8, s * 0.24)}px ${MONO}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, bx + bw / 2, by + bh / 2);
}

function drawCap(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.beginPath();
  g.arc(x, y, s * 0.36, 0, Math.PI * 2);
  g.fillStyle = '#0d1420';
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = C.compEdge;
  g.stroke();
  g.beginPath();
  g.arc(x, y, s * 0.36, -Math.PI * 0.8, -Math.PI * 0.2);
  g.lineWidth = s * 0.1;
  g.strokeStyle = '#1e2a3d';
  g.stroke();
  g.beginPath();
  g.arc(x, y, s * 0.14, 0, Math.PI * 2);
  g.fillStyle = '#121b29';
  g.fill();
}

/** Spawn port: a hot bracket on the board edge with chevrons pointing in. */
function drawPort(g: CanvasRenderingContext2D, x: number, y: number, s: number, dir: number): void {
  g.save();
  g.translate(x + s / 2, y + s / 2);
  g.rotate([0, Math.PI / 2, -Math.PI / 2, Math.PI][dir]);
  g.fillStyle = rgba(C.route, 0.12);
  g.fillRect(-s / 2, -s / 2, s, s);
  g.shadowColor = C.route;
  g.shadowBlur = s * 0.3;
  g.strokeStyle = C.route;
  g.lineWidth = Math.max(1.5, s * 0.06);
  g.beginPath();
  g.moveTo(-s * 0.2, -s * 0.46);
  g.lineTo(-s * 0.46, -s * 0.46);
  g.lineTo(-s * 0.46, s * 0.46);
  g.lineTo(-s * 0.2, s * 0.46);
  g.stroke();
  g.lineWidth = Math.max(1.5, s * 0.07);
  for (const ox of [-0.12, 0.12]) {
    g.beginPath();
    g.moveTo(s * (ox - 0.08), -s * 0.18);
    g.lineTo(s * (ox + 0.1), 0);
    g.lineTo(s * (ox - 0.08), s * 0.18);
    g.stroke();
  }
  g.restore();
}
