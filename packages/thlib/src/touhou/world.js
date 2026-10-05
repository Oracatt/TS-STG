import { f32, add, sub, div } from './math.js';

/** Source playfield, independent of its screen viewport or render scale. */
export const TOUHOU_WORLD_BOUNDS = Object.freeze({ x: -192, y: 0, width: 384, height: 448 });

export function normalizeTouhouWorldBounds(bounds = TOUHOU_WORLD_BOUNDS) {
  if (!bounds || typeof bounds !== 'object') throw new TypeError('Touhou world bounds must be an object');
  const result = {};
  for (const key of ['x', 'y', 'width', 'height']) {
    const value = bounds[key] ?? TOUHOU_WORLD_BOUNDS[key];
    if (typeof value !== 'number' || !Number.isFinite(f32(value))) throw new TypeError('Touhou world bounds must be finite float32 values');
    result[key] = f32(value);
  }
  const { x, y, width, height } = result;
  if (!(width > 0 && height > 0)) throw new RangeError('Touhou world dimensions must be positive');
  const right = add(x, width), bottom = add(y, height);
  if (!Number.isFinite(right) || !Number.isFinite(bottom) || right <= x || bottom <= y)
    throw new RangeError('Touhou world bounds exceed float32 range or precision');
  return Object.freeze({ ...result, left: x, top: y, right, bottom,
    centerX: add(x, div(width, 2)), centerY: add(y, div(height, 2)) });
}

/** Immutable geometry shared by owners. Local bounds overrides get a distinct
 * world; callers cannot accidentally mutate another scene's default bounds. */
export class TouhouWorld {
  constructor({ bounds } = {}) { this.bounds = normalizeTouhouWorldBounds(bounds); Object.freeze(this); }
  /** Original rounded extent checks. Enemy retirement uses strict comparisons;
   * bullets retain their source 64-unit top margin through the fourth argument. */
  outside(position, halfWidth = 0, halfHeight = halfWidth, topMargin = 0, strict = false) {
    const b = this.bounds, top = topMargin === 0 ? b.top : sub(b.top, topMargin);
    return strict
      ? add(position.x, halfWidth) < b.left || sub(position.x, halfWidth) > b.right || add(position.y, halfHeight) < top || sub(position.y, halfHeight) > b.bottom
      : add(position.x, halfWidth) <= b.left || sub(position.x, halfWidth) >= b.right || add(position.y, halfHeight) <= top || sub(position.y, halfHeight) >= b.bottom;
  }
}

export function resolveTouhouWorld({ world, bounds } = {}) {
  if (world !== undefined && !(world instanceof TouhouWorld)) throw new TypeError('world must be a TouhouWorld');
  return bounds !== undefined ? new TouhouWorld({ bounds }) : world ?? new TouhouWorld();
}
