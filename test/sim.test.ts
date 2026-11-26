import { describe, expect, it } from 'vitest';
import { Board } from '../src/game/board';
import { Sim } from '../src/game/sim';
import { Bot, playOut } from '../src/game/bot';
import { LEVELS } from '../src/game/levels';
import type { LevelData } from '../src/game/types';

const tiny: LevelData = {
  id: 't', name: 't', sector: '00', startBits: 1000, integrity: 5, hpGrowth: 0, stars: [5, 3],
  grid: [
    '.....',
    'S...C',
    '.....',
  ],
  waves: [{ groups: [{ type: 'worm', count: 3, every: 1 }] }],
};

describe('board', () => {
  it('flow field counts steps to the Core', () => {
    const b = new Board(tiny.grid);
    expect(b.dist[b.idx(4, 1)]).toBe(0);
    expect(b.dist[b.idx(0, 1)]).toBe(4);
    expect(b.dist[b.idx(0, 0)]).toBe(5);
  });

  it('routes go straight when they can', () => {
    const b = new Board(tiny.grid);
    expect(b.route(0).map((i) => [b.cx(i), b.cy(i)])).toEqual([[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]]);
  });

  it('every shipped level is connected and well formed', () => {
    for (const l of LEVELS) {
      const b = new Board(l.grid);
      expect(b.allSpawnsReach(b.dist)).toBe(true);
      expect(l.waves.length).toBeGreaterThanOrEqual(15);
    }
  });
});

describe('placement', () => {
  it('rejects a placement that cuts every route', () => {
    const s = new Sim(tiny);
    expect(s.place('filter', 2, 0)).not.toBeNull();
    expect(s.place('filter', 2, 2)).not.toBeNull();
    const c = s.checkPlacement('filter', 2, 1);
    expect(c.ok).toBe(false);
    expect(c.reason).toBe('Blocks the only route');
  });

  it('a wall lengthens the route and reports the change', () => {
    const s = new Sim(tiny);
    const before = s.routeLength();
    const c = s.checkPlacement('filter', 2, 1);
    expect(c.ok).toBe(true);
    expect(c.delta).toBe(2);
    s.place('filter', 2, 1);
    expect(s.routeLength()).toBe(before + 2);
  });

  it('rejects components, the Core, spawns and unaffordable towers', () => {
    const l = LEVELS[0];
    const s = new Sim(l);
    expect(s.checkPlacement('filter', 4, 2).reason).toBe('Component in the way');
    expect(s.checkPlacement('filter', 16, 4).reason).toBe("That's the Core");
    expect(s.checkPlacement('filter', 0, 1).reason).toBe('Spawn port');
    s.bits = 10;
    const c = s.checkPlacement('mortar', 8, 0);
    expect(c.ok).toBe(false);
    expect(c.legal).toBe(true);
  });

  it("can't build on malware, and malware re-routes around new towers", () => {
    const s = new Sim(tiny);
    s.startWave();
    for (let i = 0; i < 30; i++) s.step();
    const m = s.malware[0];
    expect(s.checkPlacement('filter', s.board.cx(m.to), s.board.cy(m.to)).reason).toBe('Malware in the way');
    // Wall the straight line ahead of it; it must still reach the Core.
    s.place('filter', 3, 1);
    let leaked = 0;
    for (let i = 0; i < 60 * 20; i++) { s.step(); for (const e of s.events) if (e.type === 'leak') leaked++; s.events.length = 0; }
    expect(leaked + s.kills).toBe(3);
  });

  it('sells for a full refund before the next wave, partial after', () => {
    const s = new Sim(tiny);
    const t = s.place('filter', 1, 0)!;
    expect(s.sellValue(t)).toBe(45);
    s.startWave();
    expect(s.sellValue(t)).toBe(31);
  });
});

describe('sim', () => {
  it('is deterministic for a seed', () => {
    const a = playOut(new Sim(LEVELS[0], 3), new Bot());
    const b = playOut(new Sim(LEVELS[0], 3), new Bot());
    expect([a.result, a.integrity, a.bits, a.kills, a.time]).toEqual([b.result, b.integrity, b.bits, b.kills, b.time]);
  });

  it('an empty board loses', () => {
    const s = playOut(new Sim(LEVELS[0], 1), null);
    expect(s.result).toBe('lose');
  });

  it('trojans burst into worms', () => {
    const l: LevelData = { ...tiny, waves: [{ groups: [{ type: 'trojan', count: 1, every: 1 }] }] };
    const s = new Sim(l);
    s.startWave();
    s.step();
    const m = s.malware[0];
    m.hp = 0.5;
    s.place('filter', 1, 0);
    let bursts = 0;
    for (let i = 0; i < 120; i++) { s.step(); for (const e of s.events) if (e.type === 'burst') bursts++; s.events.length = 0; }
    expect(bursts).toBe(1);
    expect(s.malware.filter((x) => x.kind === 'worm').length).toBeGreaterThan(0);
  });
});
