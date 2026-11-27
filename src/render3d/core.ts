/** Shared tower base: state blending, glow, light pool, aiming helpers. */
import * as THREE from 'three';
import { contactShadow, glow, lightPool } from './kit';

export type Stage = 'mk1' | 'mk2' | 'mk3' | 'cluster1' | 'cluster2' | 'remote1' | 'remote2';

export interface FireEvent { from: THREE.Vector3; to: THREE.Vector3; kind: 'beam' | 'isolate' | 'field'; color: THREE.Color; tier?: number }

export const tmp = new THREE.Vector3();

export function wrap(a: number): number { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
/** Turns `cur` toward `want` at up to `rate` rad/s. */
export function turn(cur: number, want: number, rate: number, dt: number): number {
  const d = wrap(want - cur);
  const s = rate * dt;
  return cur + Math.max(-s, Math.min(s, d));
}

interface GlowRef { mat: THREE.MeshStandardMaterial; idle: number; active: number }

export abstract class Tower3D {
  readonly root = new THREE.Group();
  /** 0 = idle, 1 = fully alert. Eased, so states blend. */
  alert = 0;
  range = 2.2;
  onFire: ((e: FireEvent) => void) | null = null;
  /** World positions this tower is currently locked onto (the lab draws target brackets). */
  locks: THREE.Vector3[] = [];
  protected glows: GlowRef[] = [];
  protected pool!: THREE.Mesh;
  protected cooldown = 0;
  protected phase = Math.random() * 10;
  protected flash = 0;

  protected addGlow(color: THREE.Color, idle: number, active: number): THREE.MeshStandardMaterial {
    const mat = glow(color, idle);
    this.glows.push({ mat, idle, active });
    return mat;
  }

  protected base(color: THREE.Color, poolR: number, shadowR: number): void {
    this.pool = lightPool(color, poolR);
    this.root.add(this.pool, contactShadow(shadowR));
  }

  /** `targets`: world positions of hostiles in range and in sight, nearest first. */
  update(dt: number, t: number, targets: THREE.Vector3[]): void {
    const want = targets.length ? 1 : 0;
    this.alert += (want - this.alert) * Math.min(1, dt * (want ? 5 : 1.6));
    this.flash = Math.max(0, this.flash - dt * 6);
    for (const g of this.glows) g.mat.emissiveIntensity = g.idle + (g.active - g.idle) * this.alert + this.flash * g.active * 0.6;
    (this.pool.material as THREE.MeshBasicMaterial).opacity = 0.05 + this.alert * 0.16 + this.flash * 0.08;
    this.animate(dt, t, targets);
    this.cooldown -= dt;
  }

  /** Yaw (around +Y) from a local point toward a world target. */
  protected yawTo(obj: THREE.Object3D, target: THREE.Vector3): number {
    obj.getWorldPosition(tmp);
    return Math.atan2(target.x - tmp.x, target.z - tmp.z) - this.root.rotation.y;
  }

  protected abstract animate(dt: number, t: number, targets: THREE.Vector3[]): void;
}

/** Underdamped spring: snaps toward the goal with a little overshoot (the Inspector's twitchy gaze). */
export class Spring {
  v = 0;
  constructor(public x = 0) {}
  step(goal: number, k: number, c: number, dt: number, angular = true): number {
    const err = angular ? wrap(goal - this.x) : goal - this.x;
    this.v += (k * err - c * this.v) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

