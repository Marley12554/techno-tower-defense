/**
 * The grid: terrain, tower occupancy and the flow field malware follows.
 *
 * The flow field is a BFS distance (in steps) from every walkable cell to the
 * nearest Core cell, 4-connected. Malware always steps to a neighbor one step
 * closer, preferring to keep going straight, so routes come out as clean
 * L-shaped circuit traces instead of staircases.
 */

export const OPEN = 0;
export const BLOCK = 1;
export const CAP = 2;
export const CORE = 3;
export const SPAWN = 4;

/** E, S, N, W. Fixed order keeps tie-breaks deterministic. */
export const DX = [1, 0, 0, -1];
export const DY = [0, 1, -1, 0];

export class Board {
  readonly cols: number;
  readonly rows: number;
  readonly n: number;
  readonly terrain: Uint8Array;
  /** Tower index per cell, -1 when empty. Maintained by the sim. */
  readonly towerAt: Int32Array;
  readonly spawns: number[] = [];
  readonly core: number[] = [];
  /** Current flow field. -1 = can't reach the Core. */
  dist: Int32Array;
  private queue: Int32Array;

  constructor(grid: readonly string[]) {
    this.rows = grid.length;
    this.cols = grid[0].length;
    this.n = this.cols * this.rows;
    this.terrain = new Uint8Array(this.n);
    this.towerAt = new Int32Array(this.n).fill(-1);
    this.dist = new Int32Array(this.n);
    this.queue = new Int32Array(this.n);
    for (let y = 0; y < this.rows; y++) {
      if (grid[y].length !== this.cols) throw new Error(`grid row ${y} has ${grid[y].length} cells, expected ${this.cols}`);
      for (let x = 0; x < this.cols; x++) {
        const ch = grid[y][x];
        const i = y * this.cols + x;
        if (ch === '#') this.terrain[i] = BLOCK;
        else if (ch === 'o') this.terrain[i] = CAP;
        else if (ch === 'C') { this.terrain[i] = CORE; this.core.push(i); }
        else if (ch === 'S') { this.terrain[i] = SPAWN; this.spawns.push(i); }
        else if (ch === '.') this.terrain[i] = OPEN;
        else throw new Error(`unknown grid char '${ch}' at ${x},${y}`);
      }
    }
    if (!this.core.length) throw new Error('grid has no Core');
    if (!this.spawns.length) throw new Error('grid has no spawn');
    this.computeDist(this.dist);
  }

  idx(cx: number, cy: number): number { return cy * this.cols + cx; }
  cx(i: number): number { return i % this.cols; }
  cy(i: number): number { return (i / this.cols) | 0; }
  inBounds(cx: number, cy: number): boolean { return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows; }

  /** Open terrain with nothing on it: the only kind of cell a tower can go on. */
  buildable(i: number): boolean { return this.terrain[i] === OPEN && this.towerAt[i] < 0; }

  walkable(i: number, extraBlocked = -1): boolean {
    const t = this.terrain[i];
    return t !== BLOCK && t !== CAP && this.towerAt[i] < 0 && i !== extraBlocked;
  }

  /** BFS from the Core into `out`. `extraBlocked` pretends one more cell is a tower. */
  computeDist(out: Int32Array, extraBlocked = -1): void {
    out.fill(-1);
    const q = this.queue;
    let head = 0, tail = 0;
    for (const c of this.core) { out[c] = 0; q[tail++] = c; }
    const W = this.cols, H = this.rows;
    while (head < tail) {
      const i = q[head++];
      const x = i % W, y = (i / W) | 0;
      const d = out[i] + 1;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (out[j] !== -1 || !this.walkable(j, extraBlocked)) continue;
        out[j] = d;
        q[tail++] = j;
      }
    }
  }

  /**
   * Next cell from `i`, one step closer to the Core. Prefers direction `pref`
   * (index into DX/DY) so routes stay straight. Returns -1 at the Core or if stuck.
   */
  next(i: number, pref: number, dist: Int32Array = this.dist): number {
    const d = dist[i];
    if (d <= 0) return -1;
    const x = i % this.cols, y = (i / this.cols) | 0;
    let best = -1;
    for (let s = -1; s < 4; s++) {
      const k = s < 0 ? pref : s;
      if (k < 0) continue;
      const nx = x + DX[k], ny = y + DY[k];
      if (!this.inBounds(nx, ny)) continue;
      const j = ny * this.cols + nx;
      if (dist[j] === d - 1) { best = j; break; }
    }
    return best;
  }

  /** Direction index from cell a to neighbor b. */
  dirOf(a: number, b: number): number {
    const dx = this.cx(b) - this.cx(a), dy = this.cy(b) - this.cy(a);
    for (let k = 0; k < 4; k++) if (DX[k] === dx && DY[k] === dy) return k;
    return 0;
  }

  /** Initial heading out of a spawn port: away from the nearest board edge. */
  spawnDir(i: number): number {
    const x = this.cx(i), y = this.cy(i);
    const dl = x, dr = this.cols - 1 - x, dt = y, db = this.rows - 1 - y;
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) return 0;
    if (m === dr) return 3;
    if (m === dt) return 1;
    return 2;
  }

  /** The cell sequence malware from spawn `s` will walk, Core cell included. */
  route(s: number, dist: Int32Array = this.dist): number[] {
    let i = this.spawns[s];
    const out = [i];
    if (dist[i] < 0) return out;
    let pref = this.spawnDir(i);
    for (let guard = 0; guard < this.n; guard++) {
      const j = this.next(i, pref, dist);
      if (j < 0) break;
      pref = this.dirOf(i, j);
      out.push(j);
      i = j;
    }
    return out;
  }

  /** True when every spawn can reach the Core under `dist`. */
  allSpawnsReach(dist: Int32Array): boolean {
    for (const s of this.spawns) if (dist[s] < 0) return false;
    return true;
  }
}
