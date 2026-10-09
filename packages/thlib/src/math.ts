import type { Vec2, Bounds } from './core-types.js';
export const TAU: number = Math.PI * 2;
export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const mod = (value: number, divisor: number): number => ((value % divisor) + divisor) % divisor;
export const normalizeAngle =(angle: number): number => mod(angle + Math.PI, TAU) - Math.PI;
export const angleTo = (a: Vec2, b: Vec2): number => Math.atan2(b.y - a.y, b.x - a.x);
export const distanceSq = (a: Vec2, b: Vec2): number => (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
export const distance = (a: Vec2, b: Vec2): number => Math.sqrt(distanceSq(a, b));
export const approachAngle = (angle: number, target: number, step: number): number => angle + clamp(normalizeAngle(target - angle), -Math.abs(step), Math.abs(step));
export const circlesOverlap = (ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean => (ax - bx) ** 2 + (ay - by) ** 2 <= (ar + br) ** 2;

export function distanceToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
  return (px - ax - dx * t) ** 2 + (py - ay - dy * t) ** 2;
}

export function circleIntersectsRect(x: number, y: number, radius: number, rect: Bounds): boolean {
  const closestX = clamp(x, rect.x, rect.x + rect.width);
  const closestY = clamp(y, rect.y, rect.y + rect.height);
  return (x - closestX) ** 2 + (y - closestY) ** 2 <= radius * radius;
}

export const Easings: Readonly<Record<'linear' | 'inQuad' | 'outQuad' | 'inOutQuad' | 'smooth' | 'outCubic', (t: number) => number>> = Object.freeze({
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => t * (2 - t),
  inOutQuad: t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  smooth: t => t * t * (3 - 2 * t),
  outCubic: t => 1 - (1 - t) ** 3,
});

/** Mulberry32: fixed uint32 operations, never Math.random or wall-clock time. */
export class RNG {

  declare seed: number;
  declare state: number;

  constructor(seed: number = 1) { this.seed = seed >>> 0; this.state = this.seed; }
  nextUint(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  next(): number { return this.nextUint() / 4294967296; }
  float(min: number = 0, max: number = 1): number { return min + (max - min) * this.next(); }
  int(min: number, max?: number): number {
    if (max === undefined) { max = min; min = 0; }
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max <= min || max - min > 4294967296) {
      throw new RangeError('RNG.int requires safe integers min < max and a range <= 2^32');
    }
    const span = max - min, limit = 4294967296 - (4294967296 % span);
    let value;
    do { value = this.nextUint(); } while (value >= limit);
    return min + value % span;
  }
  sign(): 1 | -1 { return this.nextUint() & 1 ? 1 : -1; }
  pick<T>(values: readonly T[]): T {
    if (!values.length) throw new RangeError('Cannot pick from an empty collection');
    return values[this.int(values.length)];
  }
  shuffle<T>(values: T[]): T[] {
    for (let i = values.length - 1; i > 0; i--) {
      const j = this.int(i + 1); [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }
  save(): number { return this.state >>> 0; }
  restore(state: number): this { this.state = state >>> 0; return this; }
  clone(): RNG { return new RNG(this.seed).restore(this.state); }
}
