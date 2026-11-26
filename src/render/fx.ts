/** Pooled effects: particles, shockwave rings, floating text and bit tokens. All in CSS px. */
import { FONT, rgba } from './palette';
import { glowSprite, type SpriteSet } from './sprites';

const MAXP = 1600;

export class Fx {
  // Particles (struct of arrays)
  private px = new Float32Array(MAXP);
  private py = new Float32Array(MAXP);
  private vx = new Float32Array(MAXP);
  private vy = new Float32Array(MAXP);
  private life = new Float32Array(MAXP);
  private max = new Float32Array(MAXP);
  private size = new Float32Array(MAXP);
  private drag = new Float32Array(MAXP);
  /** 0 = square pixel, 1 = glow dot, 2 = streak */
  private shape = new Uint8Array(MAXP);
  private col: string[] = new Array(MAXP).fill('#fff');
  private n = 0;

  rings: { x: number; y: number; r0: number; r1: number; t: number; T: number; col: string; w: number }[] = [];
  texts: { x: number; y: number; s: string; t: number; T: number; col: string; size: number }[] = [];
  /** Bits flying to the counter. */
  tokens: { x: number; y: number; x0: number; y0: number; t: number; T: number; cx: number; cy: number }[] = [];
  onToken: (() => void) | null = null;

  clear(): void {
    this.n = 0;
    this.rings.length = 0;
    this.texts.length = 0;
    this.tokens.length = 0;
  }

  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, col: string, shape = 0, drag = 3): void {
    let i = this.n;
    if (i >= MAXP) i = (Math.random() * MAXP) | 0; // overwrite a random one rather than drop
    else this.n++;
    this.px[i] = x; this.py[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.col[i] = col;
    this.shape[i] = shape; this.drag[i] = drag;
  }

  burst(x: number, y: number, n: number, speed: number, life: number, size: number, col: string, shape = 0): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.4), size * (0.6 + Math.random() * 0.6), col, shape);
    }
  }

  ring(x: number, y: number, r0: number, r1: number, T: number, col: string, w = 2): void {
    if (this.rings.length > 120) this.rings.shift();
    this.rings.push({ x, y, r0, r1, t: 0, T, col, w });
  }

  text(x: number, y: number, s: string, col: string, size = 14, T = 0.9): void {
    if (this.texts.length > 40) this.texts.shift();
    this.texts.push({ x, y, s, t: 0, T, col, size });
  }

  token(x: number, y: number, cx: number, cy: number): void {
    if (this.tokens.length > 80) return;
    this.tokens.push({ x, y, x0: x, y0: y, t: 0, T: 0.55 + Math.random() * 0.2, cx, cy });
  }

  update(dt: number): void {
    let j = 0;
    for (let i = 0; i < this.n; i++) {
      const l = this.life[i] - dt;
      if (l <= 0) continue;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      if (j !== i) {
        this.px[j] = this.px[i]; this.py[j] = this.py[i]; this.size[j] = this.size[i];
        this.max[j] = this.max[i]; this.col[j] = this.col[i]; this.shape[j] = this.shape[i]; this.drag[j] = this.drag[i];
      }
      this.vx[j] = this.vx[i] * d;
      this.vy[j] = this.vy[i] * d;
      this.px[j] += this.vx[j] * dt;
      this.py[j] += this.vy[j] * dt;
      this.life[j] = l;
      j++;
    }
    this.n = j;
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.T);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter((t) => t.t < t.T);
    const keep = [];
    for (const k of this.tokens) {
      k.t += dt;
      if (k.t >= k.T) { this.onToken?.(); continue; }
      const u = k.t / k.T;
      const e = u * u * (3 - 2 * u);
      // Arc up first, then home in on the counter.
      k.x = k.x0 + (k.cx - k.x0) * e;
      k.y = k.y0 + (k.cy - k.y0) * e - Math.sin(u * Math.PI) * 40;
      keep.push(k);
    }
    this.tokens = keep;
  }

  draw(g: CanvasRenderingContext2D, sp: SpriteSet): void {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.n; i++) {
      const a = this.life[i] / this.max[i];
      const s = this.size[i];
      g.globalAlpha = Math.min(1, a * 1.4);
      if (this.shape[i] === 1) {
        const gs = glowSprite(sp, this.col[i]);
        const d = s * 3 * (0.5 + a * 0.5);
        g.drawImage(gs.c, this.px[i] - d / 2, this.py[i] - d / 2, d, d);
      } else if (this.shape[i] === 2) {
        g.strokeStyle = this.col[i];
        g.lineWidth = s * 0.5;
        g.beginPath();
        g.moveTo(this.px[i], this.py[i]);
        g.lineTo(this.px[i] - this.vx[i] * 0.04, this.py[i] - this.vy[i] * 0.04);
        g.stroke();
      } else {
        g.fillStyle = this.col[i];
        g.fillRect(this.px[i] - s / 2, this.py[i] - s / 2, s, s);
      }
    }
    for (const r of this.rings) {
      const u = r.t / r.T;
      const e = 1 - (1 - u) * (1 - u);
      g.globalAlpha = (1 - u) * 0.9;
      g.strokeStyle = r.col;
      g.lineWidth = r.w * (1 - u * 0.6);
      g.beginPath();
      g.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, Math.PI * 2);
      g.stroke();
    }
    const bit = glowSprite(sp, '#5dffc8');
    for (const k of this.tokens) {
      g.globalAlpha = 1;
      g.drawImage(bit.c, k.x - 9, k.y - 9, 18, 18);
    }
    g.restore();
    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const t of this.texts) {
      const u = t.t / t.T;
      g.globalAlpha = u < 0.7 ? 1 : (1 - u) / 0.3;
      const pop = u < 0.12 ? 0.7 + (u / 0.12) * 0.45 : 1.15 - Math.min(0.15, (u - 0.12) * 0.6);
      g.font = `700 ${t.size * pop}px ${FONT}`;
      const y = t.y - u * 22;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.strokeText(t.s, t.x, y);
      g.fillStyle = t.col;
      g.fillText(t.s, t.x, y);
    }
    g.restore();
  }

  /** A short horizontal glitch slice, used for de-rez deaths. */
  slice(x: number, y: number, w: number, col: string): void {
    this.spawn(x - w * 0.3, y + (Math.random() - 0.5) * 6, 260, 0, 0.12, w * 0.5, rgba(col, 1), 2, 0);
    this.spawn(x + w * 0.3, y + (Math.random() - 0.5) * 6, -260, 0, 0.12, w * 0.5, rgba(col, 1), 2, 0);
  }
}
