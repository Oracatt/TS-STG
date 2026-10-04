export const TAU = Math.PI * 2;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
export const normalizeAngle = angle => mod(angle + Math.PI, TAU) - Math.PI;
export const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
export const distanceSq = (a, b) => (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
export const distance = (a, b) => Math.sqrt(distanceSq(a, b));
export const approachAngle = (angle, target, step) => angle + clamp(normalizeAngle(target - angle), -Math.abs(step), Math.abs(step));
export const circlesOverlap = (ax, ay, ar, bx, by, br) => (ax - bx) ** 2 + (ay - by) ** 2 <= (ar + br) ** 2;

export function distanceToSegmentSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
  return (px - ax - dx * t) ** 2 + (py - ay - dy * t) ** 2;
}

export function circleIntersectsRect(x, y, radius, rect) {
  const closestX = clamp(x, rect.x, rect.x + rect.width);
  const closestY = clamp(y, rect.y, rect.y + rect.height);
  return (x - closestX) ** 2 + (y - closestY) ** 2 <= radius * radius;
}

export const Easings = Object.freeze({
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => t * (2 - t),
  inOutQuad: t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  smooth: t => t * t * (3 - 2 * t),
  outCubic: t => 1 - (1 - t) ** 3,
});

/** Mulberry32: fixed uint32 operations, never Math.random or wall-clock time. */
export class RNG {
  constructor(seed = 1) { this.seed = seed >>> 0; this.state = this.seed; }
  nextUint() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  next() { return this.nextUint() / 4294967296; }
  float(min = 0, max = 1) { return min + (max - min) * this.next(); }
  int(min, max) {
    if (max === undefined) { max = min; min = 0; }
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max <= min || max - min > 4294967296) {
      throw new RangeError('RNG.int requires safe integers min < max and a range <= 2^32');
    }
    const span = max - min, limit = 4294967296 - (4294967296 % span);
    let value;
    do { value = this.nextUint(); } while (value >= limit);
    return min + value % span;
  }
  sign() { return this.nextUint() & 1 ? 1 : -1; }
  pick(values) {
    if (!values.length) throw new RangeError('Cannot pick from an empty collection');
    return values[this.int(values.length)];
  }
  shuffle(values) {
    for (let i = values.length - 1; i > 0; i--) {
      const j = this.int(i + 1); [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }
  save() { return this.state >>> 0; }
  restore(state) { this.state = state >>> 0; return this; }
  clone() { return new RNG(this.seed).restore(this.state); }
}
