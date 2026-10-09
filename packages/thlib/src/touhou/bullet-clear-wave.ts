export interface TouhouBulletClearWaveCancelOptions {
  bullets: true; lasers: true;
  /** Original ECL616: bullets ignore protection and preserve their cancel kind.
   * Dispatch to TouhouBulletField.cancelNearbyCircle, not cancelCircle. */
  nearby: true;
  dropMode: 0;
  /** Laser cancellation continues to respect laser protection. */
  check: true;
  reason: 'bonus';
}
export interface TouhouBulletClearWaveOptions {
  /** Captured at construction. This wave does not follow a moving Boss. */
  x?: number; y?: number;
  initialRadius?: number; radiusStep?: number; maxRadius?: number;
  /** Called immediately for frame zero, then once per active update. It should
   * delegate to the existing bullet and laser cancellation owners. */
  cancelCircle: (x: number, y: number, radius: number,
    options: Readonly<TouhouBulletClearWaveCancelOptions>) => number | void;
}
import { f32, add } from './math.js';

/** default.ecl Ecl_EtBreak2_ni and enemy_shot_adapter.cpp opcode 616.
 * This owner schedules cancellation only. Existing bullet/laser owners keep
 * their movement, cancellation animation, sound and item policies. */
export const TOUHOU_BULLET_CLEAR_WAVE_PRESET = Object.freeze({
  initialRadius: 16, radiusStep: 6, maxRadius: 640,
});

const cancelOptions:Readonly<TouhouBulletClearWaveCancelOptions> = Object.freeze({
  bullets: true, lasers: true, nearby: true, dropMode: 0, check: true, reason: 'bonus',
});

/** An expanding, fixed-origin cancellation wave. The source helper executes
 * radius 16 during construction, then 22..634 on subsequent fixed frames.
 * The terminal whole-field clear at a Boss burst belongs to the encounter;
 * it is deliberately not coupled to this reusable helper's lifetime. */
export class TouhouBulletClearWave {
  readonly position: Readonly<{ x: number; y: number }>;
  initialRadius: number;
  radiusStep: number;
  maxRadius: number;
  frame: number;
  radius: number;
  alive: boolean;
  cancelled: number;
  cancelCircle: TouhouBulletClearWaveOptions['cancelCircle'];

  constructor({ x = 0, y = 0, initialRadius = TOUHOU_BULLET_CLEAR_WAVE_PRESET.initialRadius,
    radiusStep = TOUHOU_BULLET_CLEAR_WAVE_PRESET.radiusStep,
    maxRadius = TOUHOU_BULLET_CLEAR_WAVE_PRESET.maxRadius, cancelCircle }: TouhouBulletClearWaveOptions = {} as TouhouBulletClearWaveOptions) {
    if (![x, y, initialRadius, radiusStep, maxRadius].every(value => Number.isFinite(f32(value))))
      throw new TypeError('Clear wave coordinates and radii must be finite float32 values');
    if (typeof cancelCircle !== 'function') throw new TypeError('Clear wave requires a cancelCircle callback');
    initialRadius = f32(initialRadius); radiusStep = f32(radiusStep); maxRadius = f32(maxRadius);
    if (initialRadius < 0 || radiusStep <= 0 || maxRadius <= initialRadius || add(maxRadius, radiusStep) <= maxRadius)
      throw new RangeError('Clear wave requires an increasing nonnegative radius below maxRadius');
    this.position = Object.freeze({ x: f32(x), y: f32(y) });
    this.initialRadius = initialRadius; this.radiusStep = radiusStep; this.maxRadius = maxRadius;
    this.cancelCircle = cancelCircle; this.frame = 0; this.radius = initialRadius;
    this.alive = true; this.cancelled = 0; this.apply();
  }
  apply() {
    const count = this.cancelCircle(this.position.x, this.position.y, this.radius, cancelOptions);
    if (Number.isFinite(count)) this.cancelled += count as number;
  }
  /** Call once after each fixed simulation frame; do not advance while paused. */
  update(): this {
    if (!this.alive) return this;
    this.frame++; this.radius = add(this.radius, this.radiusStep);
    if (this.radius >= this.maxRadius) this.alive = false;
    else this.apply();
    return this;
  }
  destroy(): void { this.alive = false; }
  snapshot(): { frame: number; alive: boolean; position: { x: number; y: number };
    radius: number; initialRadius: number; radiusStep: number; maxRadius: number; cancelled: number } {
    return { frame: this.frame, alive: this.alive, position: { ...this.position },
      radius: this.radius, initialRadius: this.initialRadius, radiusStep: this.radiusStep,
      maxRadius: this.maxRadius, cancelled: this.cancelled };
  }
}
