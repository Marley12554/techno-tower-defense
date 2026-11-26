/**
 * Uniform spatial hash, rebuilt with a counting sort.
 *
 * Usage per rebuild:
 *   grid.begin();
 *   grid.add(item, minX, minY, maxX, maxY)   // in a fixed item order
 *   grid.build();
 *   grid.forEachInCell(cx, cy, fn)
 *
 * Items keep insertion order inside each bucket, so iteration is deterministic.
 * Every entry stores its true cell coords, so hash collisions never produce
 * false matches.
 */
export class SpatialHash {
  readonly cellSize: number;
  readonly inv: number;
  private mask: number;
  private bucketStart: Int32Array;
  private bucketFill: Int32Array;

  // Pending items (before build)
  private itemCount = 0;
  private itemId = new Int32Array(256);
  private itemRange = new Int32Array(256 * 4);

  // Built entries
  entryCount = 0;
  entryItem = new Int32Array(1024);
  entryCx = new Int32Array(1024);
  entryCy = new Int32Array(1024);

  /** Items covering more cells than this are clamped (guards against huge objects). */
  maxCellsPerItem = 4096;

  constructor(cellSize: number, tableBits = 14) {
    this.cellSize = cellSize;
    this.inv = 1 / cellSize;
    const size = 1 << tableBits;
    this.mask = size - 1;
    this.bucketStart = new Int32Array(size + 1);
    this.bucketFill = new Int32Array(size);
  }

  cellOf(v: number): number {
    return Math.floor(v * this.inv);
  }

  hash(cx: number, cy: number): number {
    return ((Math.imul(cx, 0x8da6b343) ^ Math.imul(cy, 0xd8163841)) >>> 0) & this.mask;
  }

  begin(): void {
    this.itemCount = 0;
  }

  add(item: number, minX: number, minY: number, maxX: number, maxY: number): void {
    if (this.itemCount === this.itemId.length) {
      const n = this.itemId.length * 2;
      const id = new Int32Array(n); id.set(this.itemId); this.itemId = id;
      const rg = new Int32Array(n * 4); rg.set(this.itemRange); this.itemRange = rg;
    }
    const k = this.itemCount++;
    this.itemId[k] = item;
    let x0 = this.cellOf(minX), y0 = this.cellOf(minY);
    let x1 = this.cellOf(maxX), y1 = this.cellOf(maxY);
    // Clamp absurd coverage around the item's min corner.
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > this.maxCellsPerItem) {
      const side = Math.floor(Math.sqrt(this.maxCellsPerItem));
      if (x1 - x0 + 1 > side) x1 = x0 + side - 1;
      if (y1 - y0 + 1 > side) y1 = y0 + side - 1;
    }
    const r = k * 4;
    this.itemRange[r] = x0; this.itemRange[r + 1] = y0;
    this.itemRange[r + 2] = x1; this.itemRange[r + 3] = y1;
  }

  /** Cell range of pending item k (insertion index), [x0,y0,x1,y1]. */
  rangeOf(k: number, out: Int32Array | number[]): void {
    const r = k * 4;
    out[0] = this.itemRange[r]; out[1] = this.itemRange[r + 1];
    out[2] = this.itemRange[r + 2]; out[3] = this.itemRange[r + 3];
  }

  build(): void {
    const start = this.bucketStart;
    start.fill(0);
    let total = 0;
    const rg = this.itemRange;
    for (let k = 0; k < this.itemCount; k++) {
      const r = k * 4;
      for (let cy = rg[r + 1]; cy <= rg[r + 3]; cy++) {
        for (let cx = rg[r]; cx <= rg[r + 2]; cx++) {
          start[this.hash(cx, cy) + 1]++;
          total++;
        }
      }
    }
    for (let b = 1; b < start.length; b++) start[b] += start[b - 1];
    if (total > this.entryItem.length) {
      let n = this.entryItem.length;
      while (n < total) n *= 2;
      this.entryItem = new Int32Array(n);
      this.entryCx = new Int32Array(n);
      this.entryCy = new Int32Array(n);
    }
    const fill = this.bucketFill;
    fill.set(start.subarray(0, fill.length));
    for (let k = 0; k < this.itemCount; k++) {
      const r = k * 4;
      const item = this.itemId[k];
      for (let cy = rg[r + 1]; cy <= rg[r + 3]; cy++) {
        for (let cx = rg[r]; cx <= rg[r + 2]; cx++) {
          const e = fill[this.hash(cx, cy)]++;
          this.entryItem[e] = item;
          this.entryCx[e] = cx;
          this.entryCy[e] = cy;
        }
      }
    }
    this.entryCount = total;
  }

  /** Entry index range [lo, hi) of the bucket for (cx, cy). Filter with entryCx/entryCy. */
  bucketLo(cx: number, cy: number): number {
    return this.bucketStart[this.hash(cx, cy)];
  }
  bucketHi(cx: number, cy: number): number {
    return this.bucketStart[this.hash(cx, cy) + 1];
  }
}
