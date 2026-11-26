/** Shared game types. Positions are in cell units: cell (cx, cy) spans [cx, cx+1) x [cy, cy+1). */

export type TowerKind = 'filter' | 'throttle' | 'mortar';
export type MalwareKind = 'worm' | 'spyware' | 'trojan';
export type Targeting = 'first' | 'last' | 'strong' | 'close';

export interface TowerStats {
  /** Reach in cells, measured center to center. */
  range: number;
  /** Mortar dead zone: can't target malware closer than this. */
  minRange: number;
  damage: number;
  /** Shots per second. 0 for towers that don't shoot. */
  rate: number;
  /** Splash radius in cells. */
  splash: number;
  /** Fraction of speed removed inside the field (Throttle). */
  slow: number;
  /** Damage multiplier on malware slowed by this tower. 1 = none. */
  amp: number;
  /** Cluster bomblets released on impact. */
  bomblets: number;
  bombletDmg: number;
  bombletSplash: number;
  /** Mortar shell flight time in seconds. */
  flight: number;
  /** Filter bolt speed in cells per second. */
  projSpeed: number;
}

export interface UpgradeDef {
  id: string;
  name: string;
  blurb: string;
  cost: number;
  /** Upgrade this one follows. null = first tier. Siblings exclude each other. */
  parent: string | null;
  /** Branch label shown on the card, for trees that fork. */
  branch?: string;
  patch: Partial<TowerStats>;
}

export interface TowerDef {
  kind: TowerKind;
  name: string;
  blurb: string;
  strong: string;
  weak: string;
  cost: number;
  base: TowerStats;
  upgrades: UpgradeDef[];
  /** Whether it picks targets (and so shows targeting priority). */
  targets: boolean;
}

export interface MalwareDef {
  kind: MalwareKind;
  name: string;
  blurb: string;
  hp: number;
  /** Cells per second. */
  speed: number;
  reward: number;
  /** Core integrity lost when it gets through. */
  leak: number;
  /** Bits stolen when it gets through. */
  steal: number;
  /** Bursts into these on death. */
  burst: { kind: MalwareKind; count: number; hpMul: number; reward: number } | null;
  /** Body radius in cells (hit tests and drawing). */
  radius: number;
}

export interface WaveGroup {
  type: MalwareKind;
  count: number;
  /** Seconds between spawns in this group. */
  every: number;
  /** Seconds after wave start for the first spawn. */
  at?: number;
  /** Spawn port index. Omitted = alternate between ports. */
  spawn?: number;
  /** Extra HP multiplier for this group. */
  hp?: number;
}

export interface WaveDef {
  groups: WaveGroup[];
}

export interface LevelData {
  id: string;
  name: string;
  sector: string;
  /**
   * One string per row. `.` open, `#` component (blocked), `o` capacitor (blocked),
   * `S` malware spawn port, `C` the Core.
   */
  grid: string[];
  startBits: number;
  integrity: number;
  /** HP growth per wave: hp * (1 + hpGrowth * waveIndex). */
  hpGrowth: number;
  waves: WaveDef[];
  /** Integrity left needed for 3 and 2 stars. */
  stars: [number, number];
}
