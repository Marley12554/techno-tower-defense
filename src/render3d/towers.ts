/**
 * Current tower models (round 10). Each lives in its own file, designed from
 * its final tier backwards (see CLAUDE.md, tower design rules).
 */
import { Tower3D, type FireEvent, type Stage } from './core';
import { Inspector } from './inspector';
import { Throttler } from './throttler';
import { Sandbox } from './sandbox';

export { Tower3D, type FireEvent, type Stage };

export function buildTower(kind: 'inspector' | 'throttler' | 'sandbox', stage: Stage): Tower3D {
  const tier = (stage === 'mk1' ? 1 : stage === 'mk2' ? 2 : 3) as 1 | 2 | 3;
  if (kind === 'inspector') return new Inspector(tier);
  if (kind === 'throttler') return new Throttler(tier);
  return new Sandbox(stage as Exclude<Stage, 'mk3'>);
}
