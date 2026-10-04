import { TouhouRNG, PI, f32, add, sub, mul, div, polar, wrapAngle } from './math.js';
import { TouhouBulletClearWave } from './bullet-clear-wave.js';

/** default.ecl BossDead2: a moving body and fixed-origin cancellation wave,
 * followed by the whole-field clear and burst at frame 60. The effect-bank
 * owner TouhouBossDeath remains independent and can outlive this sequence. */
export const TOUHOU_BOSS_DEFEAT_PRESET = Object.freeze({ delayFrames: 60, speed: 0.4, sound: 5 });

const finite = value => typeof value === 'number' && Number.isFinite(f32(value));
function callback(value, name, required = false) {
  if ((required || value !== null) && typeof value !== 'function') throw new TypeError(`${name} must be a function${required ? '' : ' or null'}`);
}

export class TouhouBossDefeat {
  constructor({ x = 0, y = 128, z = 0, angle,
    rng = new TouhouRNG(), delayFrames = TOUHOU_BOSS_DEFEAT_PRESET.delayFrames,
    speed = TOUHOU_BOSS_DEFEAT_PRESET.speed, cancelCircle, clearAll,
    onMove = null, onBurst = null, sound = null } = {}) {
    if (![x, y, z, speed].every(finite) || (angle !== undefined && !finite(angle)))
      throw new TypeError('Boss defeat coordinates, angle and speed must be finite float32 values');
    if (!Number.isSafeInteger(delayFrames) || delayFrames < 0 || speed < 0)
      throw new RangeError('Boss defeat requires nonnegative speed and integer delayFrames');
    callback(cancelCircle, 'cancelCircle', true); callback(clearAll, 'clearAll', true);
    callback(onMove, 'onMove'); callback(onBurst, 'onBurst'); callback(sound, 'sound');
    if (angle === undefined) {
      if (!rng || typeof rng.next !== 'function') throw new TypeError('Boss defeat requires a seeded RNG with next()');
      const modulus = rng.modulus ?? 0x7fffffff;
      if (!Number.isInteger(modulus) || modulus <= 2 || modulus > 0xffffffff)
        throw new RangeError('Boss defeat RNG modulus must be an integer greater than two');
      // enemy_reads.cpp [-9998] is signed_unit(random) * pi. Preserve the
      // float32 operation boundaries of TouhouRNG.signed and consume once.
      angle = mul(sub(div(f32(rng.next()), sub(div(f32(modulus), 2), 1)), 1), PI);
      if (!finite(angle)) throw new TypeError('Boss defeat RNG must produce a finite integer sample');
    }
    this.age = 0; this.alive = true; this.burst = false;
    this.delayFrames = delayFrames; this.speed = f32(speed); this.angle = wrapAngle(angle);
    this.position = { x: f32(x), y: f32(y), z: f32(z) };
    this.velocity = polar(this.angle, this.speed);
    this.clearAll = clearAll; this.onMove = onMove; this.onBurst = onBurst; this.sound = sound;
    this.sound?.(TOUHOU_BOSS_DEFEAT_PRESET.sound, this.position.x);
    this.clearWave = new TouhouBulletClearWave({ x: this.position.x, y: this.position.y, cancelCircle });
    if (delayFrames === 0) this.finish();
  }
  /** Update once per fixed simulation frame while the defeated Boss is still
   * visible. Existing bullets, player and active spell continue updating. */
  update() {
    if (!this.alive) return this;
    this.age++;
    this.position.x = add(this.position.x, this.velocity.x);
    this.position.y = add(this.position.y, this.velocity.y);
    this.onMove?.(this.position, this);
    if (!this.alive) return this;
    this.clearWave.update();
    if (this.age >= this.delayFrames) this.finish();
    return this;
  }
  finish() {
    if (!this.alive || this.burst) return this;
    this.clearAll(this);
    this.clearWave.destroy(); this.alive = false; this.burst = true;
    // ECL613 precedes ECL523. The caller settles the still-active spell and
    // drops rewards here, then starts TouhouBossDeath with delayFrames: 0.
    this.onBurst?.(this); return this;
  }
  /** Abandon a scene without clearing projectiles or reporting a victory. */
  destroy() { this.clearWave.destroy(); this.alive = false; }
  snapshot() {
    return { age: this.age, alive: this.alive, burst: this.burst,
      delayFrames: this.delayFrames, speed: this.speed, angle: this.angle,
      position: { ...this.position }, velocity: { ...this.velocity }, clearWave: this.clearWave.snapshot() };
  }
}
