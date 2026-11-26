/**
 * The simulation. No DOM. Fixed step (DT), deterministic for a given seed and
 * command sequence. The UI calls commands (place, sell, upgrade, startWave)
 * between steps; the renderer reads state and drains `events`.
 */
import { Rng } from '@engine/index';
import { Board, CORE, SPAWN, BLOCK, CAP } from './board';
import { MALWARE, TOWERS, statsFor } from './data';
import type { LevelData, MalwareDef, MalwareKind, Targeting, TowerDef, TowerKind, TowerStats } from './types';

export const DT = 1 / 60;
/** Fraction of the spend returned on sell once a wave has run since placing. */
export const SELL_RATE = 0.7;

export interface Malware {
  id: number;
  kind: MalwareKind;
  def: MalwareDef;
  /** Position on the route (cell units). The drawn/hit position adds ox, oy. */
  x: number;
  y: number;
  ox: number;
  oy: number;
  /** Cell it last stood on and cell it's heading to. */
  from: number;
  to: number;
  dir: number;
  hp: number;
  maxHp: number;
  reward: number;
  wave: number;
  slow: number;
  amp: number;
  alive: boolean;
  flash: number;
  age: number;
}

export interface Tower {
  id: number;
  kind: TowerKind;
  def: TowerDef;
  cx: number;
  cy: number;
  cell: number;
  /** Bought upgrade ids, in order. */
  path: string[];
  stats: TowerStats;
  cd: number;
  /** Aim angle in radians (Filter head, Mortar tube). */
  angle: number;
  targeting: Targeting;
  /** Bits put in so far (build + upgrades). */
  spent: number;
  /** Placed during the current build phase: sells for a full refund. */
  fresh: boolean;
  kills: number;
  dealt: number;
  /** Sim time it was placed (drives the integration animation). */
  born: number;
  /** Sim time of its last shot (recoil, muzzle flash). */
  fired: number;
}

export interface Bolt {
  x: number;
  y: number;
  target: Malware;
  lx: number;
  ly: number;
  dmg: number;
  speed: number;
  from: Tower;
}

export interface Shell {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  T: number;
  dmg: number;
  splash: number;
  bomblets: number;
  bombletDmg: number;
  bombletSplash: number;
  from: Tower;
  small: boolean;
}

export type SimEvent =
  | { type: 'place'; tower: Tower }
  | { type: 'sell'; tower: Tower; refund: number }
  | { type: 'upgrade'; tower: Tower; id: string }
  | { type: 'fire'; tower: Tower }
  | { type: 'impact'; x: number; y: number; r: number; dmg: number; small: boolean }
  | { type: 'hit'; m: Malware; dmg: number }
  | { type: 'kill'; m: Malware }
  | { type: 'burst'; m: Malware }
  | { type: 'leak'; m: Malware; stole: number }
  | { type: 'spawn'; port: number }
  | { type: 'waveStart'; wave: number; early: number }
  | { type: 'waveClear'; wave: number; bonus: number }
  | { type: 'route' }
  | { type: 'end'; result: 'win' | 'lose' };

export interface PlacementCheck {
  ok: boolean;
  /** The layout is legal (it may still be unaffordable). */
  legal: boolean;
  reason: string;
  cost: number;
  /** Routes malware would take after this placement (legal placements only). */
  routes: number[][] | null;
  /** Change in total route length, in cells. */
  delta: number;
}

interface Queued {
  t: number;
  kind: MalwareKind;
  port: number;
  hp: number;
  wave: number;
}

export class Sim {
  readonly level: LevelData;
  readonly board: Board;
  readonly rng: Rng;
  time = 0;
  bits: number;
  integrity: number;
  readonly maxIntegrity: number;
  readonly towers: Tower[] = [];
  malware: Malware[] = [];
  bolts: Bolt[] = [];
  shells: Shell[] = [];
  events: SimEvent[] = [];
  /** Waves started so far. The next wave to start is waves[waveIndex]. */
  waveIndex = 0;
  readonly waveCount: number;
  result: 'win' | 'lose' | null = null;
  /** Current routes, one per spawn port. */
  routes: number[][] = [];
  /** Bumped every time the grid changes. */
  gridVersion = 0;
  /** Totals for the end screen. */
  kills = 0;
  leaked = 0;
  stolen = 0;
  earned = 0;

  private queue: Queued[] = [];
  private qHead = 0;
  private waveAlive: number[];
  private wavePending: number[];
  private nextId = 1;
  private scratch: Int32Array;

  constructor(level: LevelData, seed = 1) {
    this.level = level;
    this.board = new Board(level.grid);
    this.rng = new Rng(seed);
    this.bits = level.startBits;
    this.integrity = level.integrity;
    this.maxIntegrity = level.integrity;
    this.waveCount = level.waves.length;
    this.waveAlive = new Array(this.waveCount).fill(0);
    this.wavePending = new Array(this.waveCount).fill(0);
    this.scratch = new Int32Array(this.board.n);
    this.refreshRoutes();
  }

  /* ---------------------------------------------------------------- queries */

  get buildPhase(): boolean {
    return this.qHead >= this.queue.length && this.malware.length === 0;
  }

  /** Spawning for every started wave is done. */
  get spawnsDone(): boolean { return this.qHead >= this.queue.length; }

  /** Fraction of queued spawns still to come (0 when nothing is queued). */
  spawnProgress(): number {
    const total = this.queue.length;
    return total ? (total - this.qHead) / total : 0;
  }

  canStartWave(): boolean {
    return !this.result && this.waveIndex < this.waveCount && this.spawnsDone;
  }

  /** Bonus for calling the next wave while malware is still on the board. */
  earlyBonus(): number {
    return this.malware.length > 0 ? 5 + (this.waveIndex + 1) : 0;
  }

  clearBonus(wave: number): number { return 10 + 2 * (wave + 1); }

  waveHp(kind: MalwareKind, wave: number, mul = 1): number {
    return Math.round(MALWARE[kind].hp * (1 + this.level.hpGrowth * wave) * mul);
  }

  /** Total route length over all ports. */
  routeLength(routes = this.routes): number {
    let n = 0;
    for (const r of routes) n += r.length;
    return n;
  }

  towerAtCell(cx: number, cy: number): Tower | null {
    if (!this.board.inBounds(cx, cy)) return null;
    const k = this.board.towerAt[this.board.idx(cx, cy)];
    return k >= 0 ? this.towers[k] : null;
  }

  sellValue(t: Tower): number { return t.fresh ? t.spent : Math.floor(t.spent * SELL_RATE); }

  /** Upgrades the tower can buy next (siblings of a fork exclude each other). */
  nextUpgrades(t: Tower) {
    const last = t.path.length ? t.path[t.path.length - 1] : null;
    return t.def.upgrades.filter((u) => u.parent === last);
  }

  private malwareOnCell(i: number): boolean {
    for (const m of this.malware) if (m.from === i || m.to === i) return true;
    return false;
  }

  /** Whether `kind` can go at (cx, cy), and what the routes would become. */
  checkPlacement(kind: TowerKind, cx: number, cy: number): PlacementCheck {
    const cost = TOWERS[kind].cost;
    const bad = (reason: string): PlacementCheck => ({ ok: false, legal: false, reason, cost, routes: null, delta: 0 });
    const b = this.board;
    if (!b.inBounds(cx, cy)) return bad('Off the grid');
    const i = b.idx(cx, cy);
    const t = b.terrain[i];
    if (t === CORE) return bad('That\'s the Core');
    if (t === SPAWN) return bad('Spawn port');
    if (t === BLOCK || t === CAP) return bad('Component in the way');
    if (b.towerAt[i] >= 0) return bad('Occupied');
    if (this.malwareOnCell(i)) return bad('Malware in the way');
    b.computeDist(this.scratch, i);
    if (!b.allSpawnsReach(this.scratch)) return bad('Blocks the only route');
    for (const m of this.malware) {
      if (this.scratch[m.to] < 0 || this.scratch[m.from] < 0) return bad('Would trap malware');
    }
    const routes = b.spawns.map((_, s) => b.route(s, this.scratch));
    const delta = this.routeLength(routes) - this.routeLength();
    if (cost > this.bits) {
      return { ok: false, legal: true, reason: `Need ${cost - this.bits} more bits`, cost, routes, delta };
    }
    return { ok: true, legal: true, reason: '', cost, routes, delta };
  }

  /* --------------------------------------------------------------- commands */

  place(kind: TowerKind, cx: number, cy: number): Tower | null {
    if (this.result) return null;
    const c = this.checkPlacement(kind, cx, cy);
    if (!c.ok) return null;
    const def = TOWERS[kind];
    const cell = this.board.idx(cx, cy);
    const t: Tower = {
      id: this.nextId++, kind, def, cx, cy, cell, path: [], stats: statsFor(kind, []),
      cd: 0.15, angle: -Math.PI / 2, targeting: 'first', spent: def.cost, fresh: this.buildPhase,
      kills: 0, dealt: 0, born: this.time, fired: -10,
    };
    this.bits -= def.cost;
    this.towers.push(t);
    this.board.towerAt[cell] = this.towers.length - 1;
    this.gridChanged();
    this.events.push({ type: 'place', tower: t });
    return t;
  }

  sell(t: Tower): number {
    const k = this.towers.indexOf(t);
    if (k < 0 || this.result) return 0;
    const refund = this.sellValue(t);
    this.bits += refund;
    this.towers.splice(k, 1);
    this.board.towerAt.fill(-1);
    this.towers.forEach((tw, j) => { this.board.towerAt[tw.cell] = j; });
    this.gridChanged();
    this.events.push({ type: 'sell', tower: t, refund });
    return refund;
  }

  upgrade(t: Tower, id: string): boolean {
    if (this.result) return false;
    const u = this.nextUpgrades(t).find((x) => x.id === id);
    if (!u || u.cost > this.bits) return false;
    this.bits -= u.cost;
    t.spent += u.cost;
    t.path.push(id);
    t.stats = statsFor(t.kind, t.path);
    this.events.push({ type: 'upgrade', tower: t, id });
    return true;
  }

  setTargeting(t: Tower, mode: Targeting): void { t.targeting = mode; }

  startWave(): boolean {
    if (!this.canStartWave()) return false;
    const w = this.waveIndex;
    const early = this.earlyBonus();
    if (early) { this.bits += early; this.earned += early; }
    const def = this.level.waves[w];
    const ports = this.board.spawns.length;
    let alt = 0;
    const entries: Queued[] = [];
    for (const g of def.groups) {
      for (let k = 0; k < g.count; k++) {
        const port = g.spawn !== undefined ? Math.min(g.spawn, ports - 1) : alt++ % ports;
        entries.push({ t: this.time + (g.at ?? 0) + k * g.every, kind: g.type, port, hp: this.waveHp(g.type, w, g.hp ?? 1), wave: w });
      }
    }
    entries.sort((a, b) => a.t - b.t);
    // Drop finished entries so the queue doesn't grow forever.
    this.queue = this.queue.slice(this.qHead).concat(entries);
    this.qHead = 0;
    this.wavePending[w] = entries.length;
    for (const t of this.towers) t.fresh = false;
    this.waveIndex++;
    this.events.push({ type: 'waveStart', wave: w, early });
    return true;
  }

  /* ------------------------------------------------------------------- step */

  step(): void {
    if (this.result) return;
    this.time += DT;
    this.spawnDue();
    this.applyFields();
    this.moveMalware();
    if (this.result) return;
    this.towersAct();
    this.moveBolts();
    this.moveShells();
    this.sweep();
    this.checkEnd();
  }

  private gridChanged(): void {
    const b = this.board;
    b.computeDist(b.dist);
    // Malware between two cells turns around if the new route runs back the way it came.
    for (const m of this.malware) {
      if (b.dist[m.from] >= 0 && b.dist[m.from] < b.dist[m.to]) {
        const f = m.from;
        m.from = m.to;
        m.to = f;
        m.dir = 3 - m.dir;
      }
    }
    this.gridVersion++;
    this.refreshRoutes();
    this.events.push({ type: 'route' });
  }

  private refreshRoutes(): void {
    this.routes = this.board.spawns.map((_, s) => this.board.route(s));
  }

  private spawnDue(): void {
    while (this.qHead < this.queue.length && this.queue[this.qHead].t <= this.time) {
      const q = this.queue[this.qHead++];
      this.wavePending[q.wave]--;
      const cell = this.board.spawns[q.port];
      this.spawnMalware(q.kind, cell, this.board.spawnDir(cell), q.hp, MALWARE[q.kind].reward, q.wave, null);
      this.events.push({ type: 'spawn', port: q.port });
    }
  }

  private spawnMalware(kind: MalwareKind, cell: number, dir: number, hp: number, reward: number, wave: number, at: Malware | null): Malware {
    const def = MALWARE[kind];
    const b = this.board;
    const spread = kind === 'trojan' ? 0 : 0.16;
    const m: Malware = {
      id: this.nextId++, kind, def,
      x: b.cx(cell) + 0.5, y: b.cy(cell) + 0.5,
      ox: this.rng.range(-spread, spread), oy: this.rng.range(-spread, spread),
      from: cell, to: cell, dir, hp, maxHp: hp, reward, wave,
      slow: 0, amp: 1, alive: true, flash: 0, age: 0,
    };
    if (at) {
      // Burst children inherit the parent's spot on the route.
      m.x = at.x; m.y = at.y; m.from = at.from; m.to = at.to; m.dir = at.dir;
      const along = this.rng.range(-0.35, 0.2);
      const DXs = [1, 0, 0, -1], DYs = [0, 1, -1, 0];
      m.x -= DXs[at.dir] * along;
      m.y -= DYs[at.dir] * along;
    } else {
      const nx = b.next(cell, dir);
      if (nx >= 0) { m.to = nx; m.dir = b.dirOf(cell, nx); }
    }
    this.malware.push(m);
    this.waveAlive[wave]++;
    return m;
  }

  private applyFields(): void {
    const fields = this.towers.filter((t) => t.stats.slow > 0);
    for (const m of this.malware) {
      m.slow = 0;
      m.amp = 1;
      if (!fields.length) continue;
      const px = m.x + m.ox, py = m.y + m.oy;
      for (const t of fields) {
        const dx = px - (t.cx + 0.5), dy = py - (t.cy + 0.5);
        const r = t.stats.range + m.def.radius;
        if (dx * dx + dy * dy <= r * r) {
          if (t.stats.slow > m.slow) m.slow = t.stats.slow;
          if (t.stats.amp > m.amp) m.amp = t.stats.amp;
        }
      }
    }
  }

  private moveMalware(): void {
    const b = this.board;
    for (const m of this.malware) {
      if (!m.alive) continue;
      m.age += DT;
      if (m.flash > 0) m.flash = Math.max(0, m.flash - DT * 6);
      let move = m.def.speed * (1 - m.slow) * DT;
      for (let guard = 0; move > 1e-9 && guard < 8; guard++) {
        const tx = b.cx(m.to) + 0.5, ty = b.cy(m.to) + 0.5;
        const dx = tx - m.x, dy = ty - m.y;
        const d = Math.abs(dx) + Math.abs(dy);
        if (d > move) {
          m.x += (dx / d) * move;
          m.y += (dy / d) * move;
          break;
        }
        m.x = tx;
        m.y = ty;
        move -= d;
        m.from = m.to;
        if (b.terrain[m.to] === CORE) { this.leak(m); break; }
        const nx = b.next(m.to, m.dir);
        if (nx < 0) break;
        m.dir = b.dirOf(m.to, nx);
        m.to = nx;
      }
      if (this.result) return;
    }
  }

  private leak(m: Malware): void {
    m.alive = false;
    this.waveAlive[m.wave]--;
    this.leaked++;
    this.integrity = Math.max(0, this.integrity - m.def.leak);
    const stole = Math.min(this.bits, m.def.steal);
    this.bits -= stole;
    this.stolen += stole;
    this.events.push({ type: 'leak', m, stole });
    if (this.integrity <= 0) {
      this.result = 'lose';
      this.events.push({ type: 'end', result: 'lose' });
    }
  }

  /** Cells (manhattan) left before the Core. Lower = further along. */
  remaining(m: Malware): number {
    const b = this.board;
    const tx = b.cx(m.to) + 0.5, ty = b.cy(m.to) + 0.5;
    return b.dist[m.to] + Math.abs(tx - m.x) + Math.abs(ty - m.y);
  }

  /** Where `m` will be after `t` seconds at its current speed, following the flow field. */
  predict(m: Malware, t: number): [number, number] {
    const b = this.board;
    let x = m.x, y = m.y, to = m.to, dir = m.dir;
    let move = m.def.speed * (1 - m.slow) * t;
    for (let guard = 0; move > 1e-9 && guard < 32; guard++) {
      const tx = b.cx(to) + 0.5, ty = b.cy(to) + 0.5;
      const dx = tx - x, dy = ty - y;
      const d = Math.abs(dx) + Math.abs(dy);
      if (d > move) { x += (dx / d) * move; y += (dy / d) * move; break; }
      x = tx; y = ty; move -= d;
      if (b.terrain[to] === CORE) break;
      const nx = b.next(to, dir);
      if (nx < 0) break;
      dir = b.dirOf(to, nx);
      to = nx;
    }
    return [x + m.ox, y + m.oy];
  }

  private pick(t: Tower, minR: number, maxR: number): Malware | null {
    const cx = t.cx + 0.5, cy = t.cy + 0.5;
    let best: Malware | null = null;
    let score = 0;
    for (const m of this.malware) {
      if (!m.alive) continue;
      const dx = m.x + m.ox - cx, dy = m.y + m.oy - cy;
      const d2 = dx * dx + dy * dy;
      const rr = maxR + m.def.radius;
      if (d2 > rr * rr || d2 < minR * minR) continue;
      let s: number;
      switch (t.targeting) {
        case 'first': s = -this.remaining(m); break;
        case 'last': s = this.remaining(m); break;
        case 'strong': s = m.hp * 1000 - this.remaining(m); break;
        default: s = -d2;
      }
      if (!best || s > score) { best = m; score = s; }
    }
    return best;
  }

  private towersAct(): void {
    for (const t of this.towers) {
      if (t.stats.rate <= 0) continue;
      t.cd -= DT;
      const s = t.stats;
      const target = this.pick(t, s.minRange, s.range);
      const cx = t.cx + 0.5, cy = t.cy + 0.5;
      if (target && t.kind === 'filter') t.angle = Math.atan2(target.y + target.oy - cy, target.x + target.ox - cx);
      if (t.cd > 0 || !target) continue;
      t.cd = 1 / s.rate;
      t.fired = this.time;
      if (t.kind === 'filter') {
        this.bolts.push({ x: cx, y: cy, target, lx: target.x + target.ox, ly: target.y + target.oy, dmg: s.damage, speed: s.projSpeed, from: t });
      } else if (t.kind === 'mortar') {
        const [px, py] = this.predict(target, s.flight);
        t.angle = Math.atan2(py - cy, px - cx);
        this.shells.push({
          x0: cx, y0: cy, x1: px, y1: py, t: 0, T: s.flight, dmg: s.damage, splash: s.splash,
          bomblets: s.bomblets, bombletDmg: s.bombletDmg, bombletSplash: s.bombletSplash, from: t, small: false,
        });
      }
      this.events.push({ type: 'fire', tower: t });
    }
  }

  private damage(m: Malware, dmg: number, from: Tower): void {
    if (!m.alive) return;
    const d = dmg * m.amp;
    m.hp -= d;
    m.flash = 1;
    from.dealt += Math.min(d, m.hp + d);
    this.events.push({ type: 'hit', m, dmg: d });
    if (m.hp <= 0) this.kill(m, from);
  }

  private kill(m: Malware, from: Tower): void {
    m.alive = false;
    this.waveAlive[m.wave]--;
    this.bits += m.reward;
    this.earned += m.reward;
    this.kills++;
    from.kills++;
    this.events.push({ type: 'kill', m });
    const burst = m.def.burst;
    if (burst) {
      for (let k = 0; k < burst.count; k++) {
        this.spawnMalware(burst.kind, m.to, m.dir, this.waveHp(burst.kind, m.wave, burst.hpMul), burst.reward, m.wave, m);
      }
      this.events.push({ type: 'burst', m });
    }
  }

  private moveBolts(): void {
    const out: Bolt[] = [];
    for (const b of this.bolts) {
      if (b.target.alive) { b.lx = b.target.x + b.target.ox; b.ly = b.target.y + b.target.oy; }
      const dx = b.lx - b.x, dy = b.ly - b.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const step = b.speed * DT;
      if (d <= step + 0.05) {
        if (b.target.alive) this.damage(b.target, b.dmg, b.from);
        continue;
      }
      b.x += (dx / d) * step;
      b.y += (dy / d) * step;
      out.push(b);
    }
    this.bolts = out;
  }

  private moveShells(): void {
    const out: Shell[] = [];
    const landed: Shell[] = [];
    for (const s of this.shells) {
      s.t += DT;
      if (s.t >= s.T) landed.push(s);
      else out.push(s);
    }
    this.shells = out;
    for (const s of landed) {
      let total = 0;
      for (const m of this.malware) {
        if (!m.alive) continue;
        const dx = m.x + m.ox - s.x1, dy = m.y + m.oy - s.y1;
        const r = s.splash + m.def.radius;
        if (dx * dx + dy * dy <= r * r) { total += s.dmg * m.amp; this.damage(m, s.dmg, s.from); }
      }
      this.events.push({ type: 'impact', x: s.x1, y: s.y1, r: s.splash, dmg: total, small: s.small });
      for (let k = 0; k < s.bomblets; k++) {
        const a = (k / s.bomblets) * Math.PI * 2 + this.rng.range(-0.4, 0.4);
        const r = this.rng.range(0.45, 1.05);
        this.shells.push({
          x0: s.x1, y0: s.y1, x1: s.x1 + Math.cos(a) * r, y1: s.y1 + Math.sin(a) * r, t: 0, T: 0.3,
          dmg: s.bombletDmg, splash: s.bombletSplash, bomblets: 0, bombletDmg: 0, bombletSplash: 0, from: s.from, small: true,
        });
      }
    }
  }

  private sweep(): void {
    if (this.malware.some((m) => !m.alive)) this.malware = this.malware.filter((m) => m.alive);
    for (let w = 0; w < this.waveIndex; w++) {
      if (this.wavePending[w] === 0 && this.waveAlive[w] === 0) {
        this.wavePending[w] = -1; // paid
        const bonus = this.clearBonus(w);
        this.bits += bonus;
        this.earned += bonus;
        this.events.push({ type: 'waveClear', wave: w, bonus });
      }
    }
  }

  private checkEnd(): void {
    if (this.result) return;
    if (this.waveIndex >= this.waveCount && this.spawnsDone && this.malware.length === 0) {
      this.result = 'win';
      this.events.push({ type: 'end', result: 'win' });
    }
  }

  stars(): number {
    if (this.result !== 'win') return 0;
    const [three, two] = this.level.stars;
    return this.integrity >= three ? 3 : this.integrity >= two ? 2 : 1;
  }
}
