import type { LevelData } from './types';
import m1 from '../../levels/m1.json';

export const LEVELS: LevelData[] = [m1 as LevelData];

export function findLevel(id: string): LevelData | undefined {
  return LEVELS.find((l) => l.id === id);
}
