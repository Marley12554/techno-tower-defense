/**
 * Fixed-timestep runner with adaptive slowdown.
 *
 * Each frame it runs however many fixed steps real time calls for (times the
 * playback speed), but never spends more than `budgetMs` doing it. If the sim
 * can't keep up, the leftover time is dropped and playback runs slow instead
 * of freezing the tab. The step size never changes, so a slowed run produces
 * exactly the same result as a full-speed one.
 */
export interface RunnerOptions {
  dt: number;
  /** Max milliseconds of stepping per frame. */
  budgetMs?: number;
  /** Max steps per frame regardless of budget. */
  maxStepsPerFrame?: number;
  /** Clock in ms, injectable for tests. */
  now?: () => number;
}

export class Runner {
  readonly dt: number;
  /** User playback speed (0.25x, 1x, 4x...). */
  speed = 1;
  paused = false;
  /** Measured effective speed over recent frames, relative to real time. 1 = keeping up at 1x. */
  effectiveSpeed = 1;
  /** True when the last frames hit the budget. */
  overloaded = false;

  private acc = 0;
  private budgetMs: number;
  private maxSteps: number;
  private now: () => number;

  constructor(private stepFn: () => void, opts: RunnerOptions) {
    this.dt = opts.dt;
    this.budgetMs = opts.budgetMs ?? 10;
    this.maxSteps = opts.maxStepsPerFrame ?? 64;
    this.now = opts.now ?? (() => performance.now());
  }

  /** Call once per animation frame with real elapsed seconds. Returns steps taken. */
  frame(elapsedSec: number): number {
    if (this.paused) return 0;
    // Ignore huge gaps (tab was hidden) instead of trying to catch up.
    const e = Math.min(elapsedSec, 0.25);
    this.acc += e * this.speed;
    const start = this.now();
    let steps = 0;
    let hitLimit = false;
    while (this.acc >= this.dt) {
      if (steps >= this.maxSteps || this.now() - start > this.budgetMs) {
        hitLimit = true;
        break;
      }
      this.stepFn();
      this.acc -= this.dt;
      steps++;
    }
    if (hitLimit) this.acc = 0; // drop the backlog: this is the slowdown
    this.overloaded = hitLimit;
    const simAdvanced = steps * this.dt;
    const inst = e > 0 ? simAdvanced / e : this.speed;
    this.effectiveSpeed += (inst - this.effectiveSpeed) * 0.1;
    return steps;
  }

  /** Run n steps immediately (headless / fast-forward). */
  advance(n: number): void {
    for (let i = 0; i < n; i++) this.stepFn();
  }

  /** Fraction of a step left in the accumulator, for render interpolation. */
  get alpha(): number {
    return this.acc / this.dt;
  }
}
