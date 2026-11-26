import type { MalwareKind, TowerKind } from '../game/types';

/**
 * Cool colors are the player's network, hot colors are threats. Keep it that
 * way everywhere so the board reads at a glance.
 */
export const C = {
  bg: '#03050a',
  substrate: '#060a12',
  grid: 'rgba(90,150,220,0.06)',
  via: 'rgba(110,180,240,0.20)',
  frame: 'rgba(45,226,255,0.28)',
  comp: '#0c111b',
  compHi: '#151d2b',
  compEdge: '#223047',
  pin: '#33465f',
  compText: 'rgba(150,180,220,0.32)',
  cyan: '#2de2ff',
  green: '#3dffa2',
  blue: '#7d8cff',
  white: '#eafcff',
  bits: '#5dffc8',
  route: '#ff2a6d',
  routeHot: '#ff8fb5',
  danger: '#ff3355',
  amber: '#ffb21f',
  good: '#3dffa2',
};

export const TOWER_COLOR: Record<TowerKind, string> = {
  filter: C.cyan,
  throttle: C.blue,
  mortar: C.green,
};

export const MALWARE_COLOR: Record<MalwareKind, string> = {
  worm: '#e040ff',
  spyware: '#ffb21f',
  trojan: '#ff3b3b',
};

/** '#rrggbb' -> 'rgba(r,g,b,a)'. */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const FONT = "'Chakra Petch', 'Rajdhani', system-ui, sans-serif";
export const MONO = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace";
