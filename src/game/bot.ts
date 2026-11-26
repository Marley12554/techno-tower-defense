/**
 * Heuristic player for tuning. Not smart: it follows a fixed buy order and puts
 * each tower where it covers the most route, with a bonus for placements that
 * lengthen the route (crude mazing). If it wins easily the map is slack; if it
 * never wins, look at the map.
 */
import type { Sim, Tower } from './sim';
import { TOWERS } from './data';
import type { TowerKind } from './types';

export type BotStep = TowerKind | 'up';

export interface BotOptions {
  /** Buy order, repeated. */
  order: BotStep[];
  /** Mortar fork choice. */
  mortarBranch: 'ma1' | 'mb1';
  /** Weight on route-length gain vs coverage. 0 = never mazes on purpose. */
  maze: number;
  /** Call waves early when nothing is affordable. */
  early: boolean;
}

export const DEFAULT_BOT: BotOptions = {
  order: ['filter', 'filter', 'mortar', 'throttle', 'filter', 'up', 'mortar', 'filter', 'up', 'throttle', 'mortar', 'up', 'up'],
  mortarBranch: 'ma1',
  maze: 0.15,
  early: false,
};

export class Bot {
  private k = 0;
  constructor(private opt: BotOptions = DEFAULT_BOT) {}

  act(sim: Sim): void {
    for (let guard = 0; guard < 4; guard++) {
      const step = this.opt.order[this.k % this.opt.order.length];
      if (!this.tryStep(sim, step)) break;
      this.k++;
    }
    if (sim.buildPhase || (this.opt.early && sim.canStartWave())) sim.startWave();
  }

  private tryStep(sim: Sim, step: BotStep): boolean {
    if (step === 'up') return this.tryUpgrade(sim);
    if (TOWERS[step].cost > sim.bits) return false;
    const spot = this.bestSpot(sim, step);
    if (!spot) return true; // nowhere legal: skip this step
    return sim.place(step, spot[0], spot[1]) !== null;
  }

  private tryUpgrade(sim: Sim): boolean {
    let best: Tower | null = null;
    let id = '';
    for (const t of sim.towers) {
      const ups = sim.nextUpgrades(t);
      if (!ups.length) continue;
      const u = ups.find((x) => x.id === this.opt.mortarBranch) ?? ups.find((x) => x.id !== 'mb1' && x.id !== 'ma1') ?? ups[0];
      if (!best || t.dealt > best.dealt) { best = t; id = u.id; }
    }
    if (!best) return true;
    const cost = best.def.upgrades.find((u) => u.id === id)!.cost;
    if (cost > sim.bits) return false;
    return sim.upgrade(best, id);
  }

  private bestSpot(sim: Sim, kind: TowerKind): [number, number] | null {
    const b = sim.board;
    const s = TOWERS[kind].base;
    let best: [number, number] | null = null;
    let bestScore = -Infinity;
    for (let cy = 0; cy < b.rows; cy++) {
      for (let cx = 0; cx < b.cols; cx++) {
        if (!b.buildable(b.idx(cx, cy))) continue;
        const c = sim.checkPlacement(kind, cx, cy);
        if (!c.ok || !c.routes) continue;
        let cover = 0;
        for (const r of c.routes) {
          for (const cell of r) {
            const dx = b.cx(cell) - cx, dy = b.cy(cell) - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 <= s.range * s.range && d2 >= s.minRange * s.minRange) cover++;
          }
        }
        const score = cover + this.opt.maze * c.delta - 0.01 * cx;
        if (score > bestScore) { bestScore = score; best = [cx, cy]; }
      }
    }
    return best;
  }
}

/** Plays a level to the end headlessly. */
export function playOut(sim: Sim, bot: Bot | null, maxSeconds = 1800): Sim {
  const steps = Math.round(maxSeconds * 60);
  for (let n = 0; n < steps && !sim.result; n++) {
    if (n % 15 === 0) {
      if (bot) bot.act(sim);
      else if (sim.canStartWave()) sim.startWave();
    }
    sim.step();
    sim.events.length = 0;
  }
  return sim;
}
