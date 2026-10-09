
/** Modes 7/17 describe incremental motion; mode 8 requires Hermite tangents.
 * They are intentionally excluded from this target-based movement preset. */
export type TouhouBossEscapeEasing = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16
  | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31;

export interface TouhouBossEscapePosition { x: number; y: number; z: number }

export interface TouhouBossEscapeOptions {
  x?: number; y?: number; z?: number;
  /** Defaults to (-224, -80). Omitted z preserves the starting z. */
  target?: { x: number; y: number; z?: number };
  /** Positive integer up to 16777216; defaults to the source's 60 frames. */
  duration?: number;
  easing?: TouhouBossEscapeEasing;
  onMove?: ((position: TouhouBossEscapePosition, escape: TouhouBossEscape) => void) | null;
  /** Called once after the final onMove, unless onMove destroys the sequence. */
  onEscape?: ((escape: TouhouBossEscape) => void) | null;
}

import { AnmInterpolation } from './anm-interpolation.js';
import { f32 } from './math.js';

/** default.ecl BossEscapeNoDead / BossEscapeSpell movement. Settlement,
 * stopping attacks, hiding the HUD and clearing projectiles belong to the
 * calling encounter; escaping alone never emits a death burst or rewards. */
export const TOUHOU_BOSS_ESCAPE_PRESET: Readonly<{
  duration: 60; easing: 4; target: Readonly<{ x: -224; y: -80 }>;
}> = Object.freeze({
  duration: 60, easing: 4, target: Object.freeze({ x: -224, y: -80 }),
});

const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(f32(value));
const easingSupported = (value: number) => Number.isInteger(value) && value >= 0 && value <= 31 && ![7, 8, 17].includes(value);

export class TouhouBossEscape {
  declare _move: AnmInterpolation;
  declare _advancing: boolean;

  declare age: number;
  declare alive: boolean;
  declare escaped: boolean;
  declare duration: number;
  declare easing: TouhouBossEscapeEasing;
  declare position: TouhouBossEscapePosition;
  declare target: Readonly<TouhouBossEscapePosition>;
  declare onMove: TouhouBossEscapeOptions['onMove'];
  declare onEscape: TouhouBossEscapeOptions['onEscape'];

  constructor({ x = 0, y = 128, z = 0, target = TOUHOU_BOSS_ESCAPE_PRESET.target,
    duration = TOUHOU_BOSS_ESCAPE_PRESET.duration, easing = TOUHOU_BOSS_ESCAPE_PRESET.easing,
    onMove = null, onEscape = null }: TouhouBossEscapeOptions = {} as TouhouBossEscapeOptions) {
    const targetZ = target?.z === undefined ? z : target.z;
    if (!target || typeof target !== 'object' || Array.isArray(target)
      || ![x, y, z, target.x, target.y, targetZ].every(finite))
      throw new TypeError('Boss escape coordinates and target must be finite float32 values');
    // The shared interpolation clock advances in float32. Beyond 2^24 a
    // single-frame increment cannot reliably reach an integer endpoint.
    if (!Number.isInteger(duration) || duration < 1 || duration > 0x1000000)
      throw new RangeError('Boss escape duration must be an integer from 1 to 16777216');
    // 7/17 are incremental motion and 8 requires Hermite tangents. This
    // preset accepts only the shared target-based easing modes.
    if (!easingSupported(easing))
      throw new RangeError('Boss escape easing must be from 0 to 31, excluding 7, 8 and 17');
    if ((onMove !== null && typeof onMove !== 'function') || (onEscape !== null && typeof onEscape !== 'function'))
      throw new TypeError('Boss escape callbacks must be functions or null');
    this.age = 0; this.alive = true; this.escaped = false;
    this.duration = duration; this.easing = easing;
    this.position = { x: f32(x), y: f32(y), z: f32(z) };
    this.target = Object.freeze({ x: f32(target.x), y: f32(target.y), z: f32(targetZ) });
    this.onMove = onMove; this.onEscape = onEscape;
    this._move = new AnmInterpolation(Object.values(this.position), Object.values(this.target), duration, easing);
    this._advancing = false;
  }
  /** Advance one fixed simulation frame. No callbacks run at construction. */
  update(): this {
    if (!this.alive || this._advancing) return this;
    this._advancing = true;
    try {
      this.age++;
      if (this.age >= this.duration) this._finish();
      else {
        const [x, y, z] = this._move.sample();
        Object.assign(this.position, { x, y, z });
        this.onMove?.(this.position, this);
      }
    } finally { this._advancing = false; }
    return this;
  }
  _finish() {
    Object.assign(this.position, this.target);
    this.onMove?.(this.position, this);
    // A host may abandon the scene while observing the terminal movement.
    if (!this.alive) return;
    this.alive = false; this.escaped = true;
    this.onEscape?.(this);
  }
  /** Reach the endpoint now, retaining the elapsed age. Called at most once;
   * destroying this sequence from onMove cancels the escape notification. */
  finish(): this {
    if (!this.alive || this._advancing) return this;
    this._advancing = true;
    try { this._finish(); } finally { this._advancing = false; }
    return this;
  }
  /** Abandon the sequence without moving, rewards or an escape callback. */
  destroy(): void { this.alive = false; }
  snapshot(): { age: number; alive: boolean; escaped: boolean; duration: number;
    easing: TouhouBossEscapeEasing; position: TouhouBossEscapePosition; target: TouhouBossEscapePosition } {
    return { age: this.age, alive: this.alive, escaped: this.escaped,
      duration: this.duration, easing: this.easing,
      position: { ...this.position }, target: { ...this.target } };
  }
}
