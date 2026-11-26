import type { MalwareDef, MalwareKind, TowerDef, TowerKind, TowerStats } from './types';

const ZERO: TowerStats = {
  range: 0, minRange: 0, damage: 0, rate: 0, splash: 0, slow: 0, amp: 1,
  bomblets: 0, bombletDmg: 0, bombletSplash: 0, flight: 0, projSpeed: 0,
};

export const TOWERS: Record<TowerKind, TowerDef> = {
  filter: {
    kind: 'filter',
    name: 'Packet Filter',
    blurb: 'Fast single-target bolts. Cheap and reliable.',
    strong: 'Spyware, stragglers',
    weak: 'Big swarms',
    cost: 45,
    targets: true,
    base: { ...ZERO, range: 2.6, damage: 5, rate: 2.6, projSpeed: 16 },
    upgrades: [
      { id: 'f1', name: 'Deep Inspection', blurb: 'Harder hits, faster scans.', cost: 40, parent: null, patch: { damage: 7, rate: 3 } },
      { id: 'f2', name: 'Line Rate', blurb: 'Full-speed filtering at longer reach.', cost: 75, parent: 'f1', patch: { damage: 9, rate: 3.8, range: 3 } },
    ],
  },
  throttle: {
    kind: 'throttle',
    name: 'Throttle',
    blurb: 'Slows all malware in its field. No damage.',
    strong: 'Fast malware, feeding other towers',
    weak: 'Does nothing alone',
    cost: 60,
    targets: false,
    base: { ...ZERO, range: 1.7, slow: 0.35 },
    upgrades: [
      { id: 't1', name: 'Bandwidth Cap', blurb: 'Stronger slow, wider field.', cost: 45, parent: null, patch: { slow: 0.45, range: 2 } },
      { id: 't2', name: 'Congestion', blurb: 'Slowed malware takes +25% damage from everything.', cost: 80, parent: 't1', patch: { slow: 0.5, range: 2.3, amp: 1.25 } },
    ],
  },
  mortar: {
    kind: 'mortar',
    name: 'Sandbox Mortar',
    blurb: 'Lobs shells that detonate in an area. Slow to reload.',
    strong: 'Packed swarms',
    weak: 'Fast targets, anything next to it',
    cost: 95,
    targets: true,
    base: { ...ZERO, range: 4.5, minRange: 1.5, damage: 22, rate: 0.45, splash: 0.95, flight: 0.85 },
    upgrades: [
      { id: 'm1', name: 'Hardened Shell', blurb: 'Bigger payload.', cost: 55, parent: null, patch: { damage: 30 } },
      {
        id: 'ma1', name: 'Cluster Payload', branch: 'Cluster', cost: 85, parent: 'm1',
        blurb: 'Shells scatter 4 bomblets on impact. Shreds swarms.',
        patch: { bomblets: 4, bombletDmg: 10, bombletSplash: 0.6 },
      },
      {
        id: 'ma2', name: 'Fragmentation', branch: 'Cluster', cost: 120, parent: 'ma1',
        blurb: '6 heavier bomblets and a faster reload.',
        patch: { bomblets: 6, bombletDmg: 14, rate: 0.53 },
      },
      {
        id: 'mb1', name: 'Long Range', branch: 'Long Range', cost: 85, parent: 'm1',
        blurb: 'Reaches much farther with a heavier shell.',
        patch: { range: 6.5, damage: 46 },
      },
      {
        id: 'mb2', name: 'Bunker Buster', branch: 'Long Range', cost: 130, parent: 'mb1',
        blurb: 'Massive single blasts. Tight splash, huge damage.',
        patch: { range: 7.2, damage: 100, splash: 0.75, rate: 0.4 },
      },
    ],
  },
};

export const TOWER_ORDER: TowerKind[] = ['filter', 'throttle', 'mortar'];

export const MALWARE: Record<MalwareKind, MalwareDef> = {
  worm: {
    kind: 'worm', name: 'Worm', blurb: 'Weak alone, comes in swarms.',
    hp: 16, speed: 1.5, reward: 2, leak: 1, steal: 0, burst: null, radius: 0.2,
  },
  spyware: {
    kind: 'spyware', name: 'Spyware', blurb: 'Very fast. Steals bits if it gets through.',
    hp: 12, speed: 3, reward: 4, leak: 1, steal: 12, burst: null, radius: 0.2,
  },
  trojan: {
    kind: 'trojan', name: 'Trojan', blurb: 'Slow and tough. Bursts into worms when killed.',
    hp: 140, speed: 0.75, reward: 8, leak: 4, steal: 0,
    burst: { kind: 'worm', count: 5, hpMul: 0.6, reward: 1 }, radius: 0.34,
  },
};

/** Combined stats after a list of upgrade ids. */
export function statsFor(kind: TowerKind, path: readonly string[]): TowerStats {
  const def = TOWERS[kind];
  const s: TowerStats = { ...def.base };
  for (const id of path) {
    const u = def.upgrades.find((x) => x.id === id);
    if (u) Object.assign(s, u.patch);
  }
  return s;
}
