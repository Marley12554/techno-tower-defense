/** One map being played: fixed-step sim, rendering, placement input, HUD and inspector. */
import { Runner } from '@engine/index';
import { DT, Sim, type Tower } from '../game/sim';
import { TOWERS, TOWER_ORDER } from '../game/data';
import { Bot } from '../game/bot';
import type { LevelData, TowerKind } from '../game/types';
import { Renderer, type Ghost, type View } from '../render/renderer';
import { Hud } from './hud';
import { Inspector } from './inspector';
import { getSound } from './audio';
import type { SaveData } from '../meta/save';

export interface PlayHooks {
  onEnd(sim: Sim): void;
  onPause(): void;
  persist(): void;
}

interface Drag {
  kind: TowerKind;
  pointerId: number;
  sx: number;
  sy: number;
  moved: boolean;
  touch: boolean;
  /** Started on a build card (vs. on the board while armed). */
  fromCard: HTMLElement | null;
}

const TAP_SLOP = 8;

export class Play {
  readonly sim: Sim;
  private runner: Runner;
  private raf = 0;
  private last = 0;
  paused = false;
  private ended = false;
  private endAt = 0;
  private speed = 1;
  private hud: Hud | null = null;
  private inspector: Inspector | null = null;
  private view: View = { selected: null, preview: null, hoverTower: null, hoverCell: null, ghost: null };
  private drag: Drag | null = null;
  private armed: TowerKind | null = null;
  private lastSnapCell = '';
  private bot: Bot | null = null;
  private canvasDown: { id: number; x: number; y: number; touch: boolean } | null = null;
  private disposers: (() => void)[] = [];

  constructor(
    private renderer: Renderer,
    private root: HTMLElement,
    level: LevelData,
    private hooks: PlayHooks | null,
    private save: SaveData | null,
    demo = false,
  ) {
    this.sim = new Sim(level, demo ? 7 : (Date.now() & 0xffff) + 1);
    this.runner = new Runner(() => this.tick(), { dt: DT, budgetMs: 12, maxStepsPerFrame: 8 });
    renderer.resize(this.sim);
    renderer.sound = demo ? null : getSound();
    if (demo) {
      this.bot = new Bot();
    } else {
      this.hud = new Hud(root, this.sim, {
        pause: () => this.requestPause(),
        speed: () => this.toggleSpeed(),
        startWave: () => this.startWave(),
        cardDown: (k, e, el) => this.cardDown(k, e, el),
      });
      this.inspector = new Inspector(root, {
        upgrade: (t, id) => { if (this.sim.upgrade(t, id)) this.flush(); },
        sell: (t) => { this.sim.sell(t); this.select(null); this.flush(); },
        target: (t, m) => this.sim.setTargeting(t, m),
        close: () => this.select(null),
        preview: (s) => { this.view.preview = s; },
        sound: (n) => getSound().play(n),
      });
      renderer.fx.onToken = () => { this.hud?.bump(); getSound().play('coin'); };
      this.bindInput();
      this.coachStep();
    }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    if (import.meta.env.DEV && !demo) {
      // Test hook for the screenshot script: board geometry and the live sim.
      (window as unknown as { __ttd: () => unknown }).__ttd = () => ({ ...this.renderer.L, sim: undefined });
      (window as unknown as { __sim: Sim }).__sim = this.sim;
      (window as unknown as { __r: Renderer }).__r = this.renderer;
    }
  }

  /* ---------------------------------------------------------------- input */

  private on<K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn as EventListener, opts);
    this.disposers.push(() => target.removeEventListener(type, fn as EventListener, opts));
  }

  private bindInput(): void {
    const cv = this.renderer.canvas;
    this.on(window, 'pointermove', (e) => this.pointerMove(e));
    this.on(window, 'pointerup', (e) => this.pointerUp(e));
    this.on(window, 'pointercancel', (e) => this.pointerCancel(e));
    this.on(cv, 'pointerdown', (e) => this.canvasPointerDown(e));
    this.on(cv, 'contextmenu', (e) => { e.preventDefault(); this.disarm(); this.select(null); });
    this.on(cv, 'pointerleave', () => { this.view.hoverCell = null; this.view.hoverTower = null; if (!this.drag && this.armed) this.view.ghost = null; });
    this.on(window, 'keydown', (e) => this.key(e));
    this.on(window, 'resize', () => this.resize());
    this.on(window, 'orientationchange', () => this.resize());
    const vis = () => { if (document.hidden && !this.ended) this.requestPause(); };
    document.addEventListener('visibilitychange', vis);
    this.disposers.push(() => document.removeEventListener('visibilitychange', vis));
  }

  private resize(): void {
    this.renderer.resize(this.sim);
    if (this.view.selected) this.openInspector(this.view.selected);
  }

  /** Touch drags hold the ghost above the finger so it stays visible. */
  private ghostPoint(x: number, y: number, touch: boolean, moved: boolean): [number, number] {
    if (!touch || !moved) return [x, y];
    return [x, y - Math.max(22, this.renderer.L.cell * 0.7)];
  }

  private cardDown(kind: TowerKind, e: PointerEvent, el: HTMLElement): void {
    if (this.ended || e.button > 0) return;
    e.preventDefault();
    getSound().unlock();
    try { el.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
    this.select(null);
    this.drag = { kind, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, touch: e.pointerType === 'touch', fromCard: el };
    el.classList.add('press');
  }

  private canvasPointerDown(e: PointerEvent): void {
    if (this.ended || e.button > 0) return;
    getSound().unlock();
    const touch = e.pointerType === 'touch';
    const cell = this.renderer.cellAt(e.clientX, e.clientY);
    if (this.armed && cell && this.sim.towerAtCell(cell[0], cell[1])) this.disarm();
    if (this.armed) {
      // Armed: the board behaves like a drag source too.
      this.drag = { kind: this.armed, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, touch, fromCard: null };
      this.updateGhost(e.clientX, e.clientY);
      return;
    }
    this.canvasDown = { id: e.pointerId, x: e.clientX, y: e.clientY, touch };
  }

  private pointerMove(e: PointerEvent): void {
    const d = this.drag;
    if (d && e.pointerId === d.pointerId) {
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > TAP_SLOP) {
        d.moved = true;
        if (d.fromCard) {
          document.body.classList.add('dragging');
          getSound().play('pickup');
          this.disarm();
        }
      }
      if (d.moved || !d.fromCard) this.updateGhost(e.clientX, e.clientY);
      return;
    }
    if (e.pointerType === 'mouse') {
      const cell = this.renderer.cellAt(e.clientX, e.clientY);
      this.view.hoverCell = cell;
      this.view.hoverTower = cell ? this.sim.towerAtCell(cell[0], cell[1]) : null;
      if (this.armed) this.updateGhost(e.clientX, e.clientY, this.armed);
      this.renderer.canvas.style.cursor = this.view.hoverTower && !this.armed ? 'pointer' : 'default';
    }
  }

  private updateGhost(px: number, py: number, kind?: TowerKind): void {
    const d = this.drag;
    const k = kind ?? d?.kind;
    if (!k) return;
    const [x, y] = this.ghostPoint(px, py, d?.touch ?? false, d?.moved ?? false);
    const cell = this.renderer.cellAt(x, y);
    const check = cell ? this.sim.checkPlacement(k, cell[0], cell[1]) : null;
    const g: Ghost = { kind: k, x, y, cell, check };
    this.view.ghost = g;
    const key = cell ? `${cell[0]},${cell[1]}` : '';
    if (key && key !== this.lastSnapCell) getSound().play('snap');
    this.lastSnapCell = key;
  }

  private pointerUp(e: PointerEvent): void {
    const d = this.drag;
    if (d && e.pointerId === d.pointerId) {
      this.drag = null;
      d.fromCard?.classList.remove('press');
      document.body.classList.remove('dragging');
      if (d.fromCard && !d.moved) {
        // A tap on a card arms it for tap-to-place.
        if (this.armed === d.kind) this.disarm();
        else this.arm(d.kind);
        return;
      }
      this.drop(d, e.clientX, e.clientY);
      return;
    }
    const c = this.canvasDown;
    if (c && c.id === e.pointerId) {
      this.canvasDown = null;
      if (Math.hypot(e.clientX - c.x, e.clientY - c.y) > TAP_SLOP * 2) return;
      // Tapping the selected tower keeps it open; tap empty board or × to close.
      this.select(this.towerNear(e.clientX, e.clientY));
    }
  }

  /** Tower under a tap, with some slack: fingers land off-center on small cells. */
  private towerNear(px: number, py: number): Tower | null {
    const cell = this.renderer.cellAt(px, py);
    const exact = cell ? this.sim.towerAtCell(cell[0], cell[1]) : null;
    if (exact) return exact;
    const reach = this.renderer.L.cell * 0.85;
    let best: Tower | null = null;
    let bestD = reach * reach;
    for (const t of this.sim.towers) {
      const [x, y] = this.renderer.cellCenter(t.cx, t.cy);
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  private pointerCancel(e: PointerEvent): void {
    const d = this.drag;
    if (d && e.pointerId === d.pointerId) {
      this.drag = null;
      d.fromCard?.classList.remove('press');
      document.body.classList.remove('dragging');
      this.view.ghost = null;
    }
    if (this.canvasDown?.id === e.pointerId) this.canvasDown = null;
  }

  private drop(d: Drag, px: number, py: number): void {
    const [x, y] = this.ghostPoint(px, py, d.touch, d.moved);
    const cell = this.renderer.cellAt(x, y);
    const back = this.cardCenter(d.kind);
    if (cell) {
      const tower = this.sim.place(d.kind, cell[0], cell[1]);
      if (tower) {
        this.flush();
        this.coachStep();
        if (this.armed && TOWERS[this.armed].cost > this.sim.bits) this.disarm();
        // A mouse keeps its ghost while armed (it follows hover); a finger lifts it.
        if (!this.armed || d.touch) this.view.ghost = null;
        return;
      }
      getSound().play('invalid');
      const [cx, cy] = this.renderer.cellCenter(cell[0], cell[1]);
      if (!this.armed) this.renderer.returnGhost(d.kind, cx, cy, back[0], back[1]);
      if (!this.armed || d.touch) this.view.ghost = null;
      return;
    }
    if (!this.armed) {
      getSound().play('cancel');
      this.renderer.returnGhost(d.kind, x, y, back[0], back[1]);
    }
    this.view.ghost = null;
  }

  private cardCenter(kind: TowerKind): [number, number] {
    const el = this.hud?.cards.get(kind);
    if (!el) return [0, 0];
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }

  private arm(kind: TowerKind): void {
    this.armed = kind;
    this.hud?.setArmed(kind);
    this.select(null);
    getSound().play('pickup');
  }

  private disarm(): void {
    if (!this.armed) return;
    this.armed = null;
    this.hud?.setArmed(null);
    if (!this.drag) this.view.ghost = null;
  }

  private key(e: KeyboardEvent): void {
    if (this.ended || e.repeat) return;
    if (this.paused) return;
    const n = Number(e.key);
    if (n >= 1 && n <= TOWER_ORDER.length) {
      const k = TOWER_ORDER[n - 1];
      if (this.armed === k) this.disarm(); else this.arm(k);
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.startWave(); }
    else if (e.key === 'Escape') {
      if (this.armed || this.view.selected) { this.disarm(); this.select(null); }
      else this.requestPause();
    } else if (e.key === 'p' || e.key === 'P') this.requestPause();
    else if (e.key === 'f' || e.key === 'F') this.toggleSpeed();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && this.view.selected) {
      this.sim.sell(this.view.selected);
      this.select(null);
      this.flush();
    }
  }

  /* -------------------------------------------------------------- actions */

  private select(t: Tower | null): void {
    const prev = this.view.selected;
    this.view.selected = t;
    this.view.preview = null;
    document.body.classList.toggle('inspecting', !!t);
    if (t) {
      this.disarm();
      this.openInspector(t);
      if (t !== prev) getSound().play('open');
    } else if (prev) {
      this.inspector?.close();
      getSound().play('close');
    }
  }

  private openInspector(t: Tower): void {
    const L = this.renderer.L;
    // Dock over the build panel (not needed while inspecting) so it hides as little of the
    // board as possible. Only if the tower itself would be underneath, dock on the left.
    const W = Math.min(250, L.w * 0.42);
    const edge = L.safe.r + 4;
    const [tx] = this.renderer.cellCenter(t.cx, t.cy);
    const fitsRight = tx + L.cell * 0.7 < L.w - edge - W;
    const top = Math.max(L.safe.t, 4) + 4;
    const maxH = L.h - top - Math.max(L.safe.b, 4) - 4;
    if (fitsRight) this.inspector?.open(t, this.sim, 'right', top, maxH, edge);
    else this.inspector?.open(t, this.sim, 'left', top, maxH, Math.max(8, L.ox + 6));
  }

  private startWave(): void {
    if (this.ended || !this.sim.canStartWave()) return;
    getSound().unlock();
    this.sim.startWave();
    this.flush();
  }

  private toggleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : 1;
    this.runner.speed = this.speed;
    this.hud?.setSpeed(this.speed);
    getSound().play('click');
  }

  private requestPause(): void {
    if (this.ended || this.paused) return;
    this.setPaused(true);
    this.hooks?.onPause();
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.runner.paused = p;
    if (!p) this.last = performance.now();
  }

  /** Drains sim events into effects and UI right away (commands made between steps). */
  private flush(): void {
    const ev = this.sim.events;
    if (!ev.length) return;
    this.renderer.counter = this.hud ? this.hud.counterPos() : [0, 0];
    this.renderer.consume(this.sim, ev);
    if (this.hud) this.uiEvents();
    this.sim.events = [];
  }

  private uiEvents(): void {
    const hud = this.hud!;
    for (const e of this.sim.events) {
      if (e.type === 'waveStart') {
        const final = e.wave === this.sim.waveCount - 1;
        hud.banner(final ? 'Final wave' : `Wave ${e.wave + 1}`, e.early ? `Called early  +${e.early} bits` : 'Incoming', final ? 'final' : 'wave');
        getSound().play('wave');
        if (e.early) getSound().play('early');
        hud.hideBrief();
        this.coachStep();
      } else if (e.type === 'waveClear') {
        if (e.wave < this.sim.waveCount - 1) hud.banner(`Wave ${e.wave + 1} cleared`, `+${e.bonus} bits`, 'clear');
        getSound().play('clear');
        const [x, y] = this.renderer.cellCenter(this.sim.board.cx(this.sim.board.core[0]), this.sim.board.cy(this.sim.board.core[0]));
        for (let k = 0; k < 6; k++) this.renderer.fx.token(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30, this.renderer.counter[0], this.renderer.counter[1]);
        this.maybeBrief();
        this.coachStep();
      } else if (e.type === 'end') {
        getSound().play(e.result === 'win' ? 'win' : 'lose');
        hud.banner(e.result === 'win' ? 'Core secured' : 'Core breached', '', e.result === 'win' ? 'clear' : 'bad');
      }
    }
  }

  /** Brief the player the first time a malware kind is about to show up. */
  private maybeBrief(): void {
    if (!this.hud || !this.save || !this.sim.buildPhase) return;
    for (const k of this.hud.newThreats(this.sim)) {
      if (this.save.seen[k] && this.sim.waveIndex > 0) continue;
      if (k === 'worm' && this.sim.waveIndex === 0) continue; // the tutorial covers the first wave
      this.save.seen[k] = true;
      this.hooks?.persist();
      this.hud.showBrief(k, true);
      return;
    }
  }

  private coachStep(): void {
    const hud = this.hud;
    const save = this.save;
    if (!hud || !save) return;
    const done = (k: string) => save.tips[k];
    const mark = (k: string) => { save.tips[k] = true; this.hooks?.persist(); };
    requestAnimationFrame(() => {
      if (!done('place')) {
        if (this.sim.towers.length) { mark('place'); }
        else { hud.coach('Drag a defense onto the grid', hud.cards.get('filter')!); return; }
      }
      if (!done('start')) {
        if (this.sim.waveIndex > 0) mark('start');
        else { hud.coach('Start the wave when ready', hud.goButton); return; }
      }
      if (!done('maze') && this.sim.buildPhase && this.sim.waveIndex >= 1) {
        mark('maze');
        hud.banner('Tip', 'Malware paths around your defenses. Build walls to make the route longer.', 'clear');
      }
      hud.coach(null);
    });
  }

  /* ------------------------------------------------------------------ loop */

  private tick(): void {
    if (this.bot) {
      if (Math.round(this.sim.time / DT) % 15 === 0) this.bot.act(this.sim);
    }
    this.sim.step();
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) this.runner.frame(dt);
    if (this.hud) this.renderer.counter = this.hud.counterPos();
    if (this.sim.events.length) {
      this.renderer.consume(this.sim, this.sim.events);
      if (this.hud) this.uiEvents();
      this.sim.events = [];
    }
    // Keep the ghost's check fresh while malware moves under it.
    if (this.view.ghost?.cell && (this.drag || this.armed)) {
      const [cx, cy] = this.view.ghost.cell;
      this.view.ghost.check = this.sim.checkPlacement(this.view.ghost.kind, cx, cy);
    }
    this.renderer.draw(this.sim, this.view, dt, this.paused);
    if (!this.paused && !this.bot) this.renderer.watchPerf(dt, this.sim);
    this.hud?.update(this.sim, dt);
    this.inspector?.update(this.sim, this.renderer.now);
    if (this.sim.result && !this.ended) {
      if (!this.endAt) {
        this.endAt = now + (this.sim.result === 'win' ? 1600 : 1400);
        this.drag = null;
        this.view.ghost = null;
        this.disarm();
        this.select(null);
      }
      if (now >= this.endAt) {
        this.ended = true;
        this.hooks?.onEnd(this.sim);
      }
    }
    if (this.bot && this.sim.result && now >= this.endAt) this.restartDemo();
  };

  private restartDemo(): void {
    const s = new Sim(this.sim.level, ((Math.random() * 1e6) | 0) + 1);
    (this as { sim: Sim }).sim = s;
    this.bot = new Bot();
    this.endAt = 0;
    this.renderer.resize(s);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    document.body.classList.remove('inspecting');
    for (const d of this.disposers) d();
    this.disposers = [];
    this.hud?.dispose();
    this.inspector?.el.remove();
    if (this.hud) this.root.innerHTML = '';
    this.renderer.fx.onToken = null;
  }
}
