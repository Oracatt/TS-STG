import type {AnmDrawList as DrawList} from './anm.js';
import type {AnmBank,AnmInstance,AnmView} from './anm.js';
import type {TouhouRNG} from './math.js';

export interface TouhouBossDeathOptions {
  x?: number; y?: number; z?: number;
  /** Source BossDead delay. Use zero only after the application already waited. */
  delayFrames?: number;
  /** Sample the final burst position without moving particles after their birth. */
  follow?: { x: number; y: number; z?: number } | null;
  sound?: ((id: number, x: number) => void) | null;
  shake?: ((frames: number, from: number, to: number) => void) | null;
  /** The application may retire its Boss body here. No gameplay state is mutated by this effect. */
  onBurst?: ((death: TouhouBossDeath) => void) | null;
  /** Visual RNG stream, kept independent from gameplay and ANM randomness. */
  rng?: Pick<TouhouRNG, 'next'>;
  /** Optional fixed-frame clock for the screen-shake callback. Repeated updates
   * in its birth frame never sample early; ANM roots retain their own updates. */
  clock?: (() => number) | null;
}

/** Original common Boss death. default.ecl BossDead2 and st01bs..st07bs
 * BossDead wait 60 frames, then spawn effect25 (inversion) and effect57
 * (120 particles). Player death effect21 spawns the very same effect25.
 * Ordinary enemy deaths use their own 33/37/41/... effects, never this owner.
 * No screen shader is needed: effect26..30 use source ANM blend4 at layer21.
 */
import { TouhouScreenShake } from './screen-shake.js';
export const TOUHOU_BOSS_DEATH_PRESET: Readonly<{ delayFrames: 60; inversionScript: 25; particleScript: 57; sound: 5; shake: readonly [30, 12, 0] }> = Object.freeze({ delayFrames: 60, inversionScript: 25,
  particleScript: 57, sound: 5, shake: Object.freeze([30, 12, 0] as const) });

function clockFrame(clock: () => number) {
  const frame = clock();
  if (!Number.isSafeInteger(frame) || frame < 0) throw new RangeError('Boss death clock must return a nonnegative integer frame');
  return frame;
}

export class TouhouBossDeath {
  declare rng: Pick<TouhouRNG, "next"> | undefined;
  declare shakeFrame: number;

  declare bank: AnmBank;
  declare position: { x: number; y: number; z: number };
  declare follow: TouhouBossDeathOptions['follow'];
  declare delayFrames: number;
  declare age: number;
  declare burst: boolean;
  declare alive: boolean;
  declare roots: AnmInstance[];
  declare cameraShake: TouhouScreenShake | null;
  declare clock: (() => number) | null;
  declare sound: TouhouBossDeathOptions['sound'];
  declare shake: TouhouBossDeathOptions['shake'];
  declare onBurst: TouhouBossDeathOptions['onBurst'];

  constructor(bank: AnmBank, { x = 0, y = 128, z = 0, delayFrames = TOUHOU_BOSS_DEATH_PRESET.delayFrames,
    follow = null, sound = null, shake = null, onBurst = null, rng, clock = null }: TouhouBossDeathOptions = {} as TouhouBossDeathOptions) {
    if (!bank?.create) throw new TypeError('Boss death requires an effect ANM bank');
    if (![x, y, z].every(Number.isFinite)) throw new TypeError('Boss death coordinates must be finite');
    if (!Number.isInteger(delayFrames) || delayFrames < 0) throw new RangeError('Boss death delayFrames must be a nonnegative integer');
    if (clock !== null && typeof clock !== 'function') throw new TypeError('Boss death clock must be a function or null');
    if (clock !== null) clockFrame(clock);
    this.bank = bank; this.position = { x, y, z }; this.follow = follow;
    this.delayFrames = delayFrames; this.sound = sound; this.shake = shake; this.onBurst = onBurst;
    this.rng = rng; this.cameraShake = null; this.clock = clock; this.shakeFrame = 0;
    this.age = 0; this.burst = false; this.alive = true; this.roots = [];
    if (delayFrames === 0) this.emit(); else this.sound?.(TOUHOU_BOSS_DEATH_PRESET.sound, x);
  }
  emit() {
    if (this.burst || !this.alive) return this;
    const position = this.follow ?? this.position;
    if (![position.x, position.y, position.z ?? 0].every(Number.isFinite)) throw new TypeError('Boss death follow coordinates must be finite');
    this.position = { x: position.x, y: position.y, z: position.z ?? 0 };
    // ECL307 uses front registration (named_spawn flags2). Children retain the
    // source scripts' priorities, blend modes, 0/5/25-frame births and easing.
    for (const script of [TOUHOU_BOSS_DEATH_PRESET.inversionScript, TOUHOU_BOSS_DEATH_PRESET.particleScript])
      this.roots.push(this.bank.create(script, { ...this.position, front: true }));
    this.burst = true;
    this.cameraShake = new TouhouScreenShake({ duration: 30, from: 12, to: 0, rng: this.rng });
    // ECL517 registers screen priority24 during enemy priority36. Its first
    // sample is on the following frame, never during the explosion's birth.
    this.shakeFrame = this.clock === null ? 0 : clockFrame(this.clock);
    this.shake?.(...TOUHOU_BOSS_DEATH_PRESET.shake);
    this.sound?.(TOUHOU_BOSS_DEATH_PRESET.sound, this.position.x);
    this.onBurst?.(this); return this;
  }
  update(): this {
    if (!this.alive) return this;
    this.age++;
    if (!this.burst) {
      if (this.age >= this.delayFrames) this.emit();
      return this; // Newly created ANM roots already executed their frame zero.
    }
    for (const vm of this.roots) if (vm.alive) vm.update();
    if (this.clock === null) this.cameraShake?.update();
    else {
      const frame = clockFrame(this.clock);
      if (frame < this.shakeFrame) throw new RangeError('Boss death clock must not move backwards');
      for (let elapsed = frame - this.shakeFrame; elapsed > 0 && this.cameraShake?.alive; elapsed--) this.cameraShake.update();
      this.shakeFrame = frame;
    }
    this.roots = this.roots.filter(vm => vm.alive);
    this.alive = this.roots.length > 0; return this;
  }
  draw(draw: DrawList, view: AnmView = { x: 336, y: 24, scale: 1.5, screenScale: 1 }): DrawList {
    if (this.alive) for (const vm of this.roots) vm.draw(draw, view); return draw;
  }
  get cameraOffset(): { x: number; y: number } { return this.cameraShake ?? { x: 0, y: 0 }; }
  destroy(): void { for (const vm of this.roots) vm.destroy(); this.roots.length = 0; this.alive = false; }
  snapshot(): Record<string, unknown> { return { age: this.age, alive: this.alive, burst: this.burst, delayFrames: this.delayFrames,
    position: { ...this.position }, shake: this.cameraShake?.snapshot() ?? null, roots: this.roots.map(vm => vm.snapshot()) }; }
}
