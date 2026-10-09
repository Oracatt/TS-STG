
import { TouhouRNG, f32, add, sub, mul, div } from './math.js';

/** screen_effect/update.cpp mode1 (ECL517). Each axis independently chooses
 * 0/+amplitude/-amplitude from the visual RNG stream; amplitude interpolates
 * between the two integer arguments. The timer advances before sampling.
 */
export class TouhouScreenShake {
  duration: number;
  from: number;
  to: number;
  rng: Pick<TouhouRNG, 'next'>;
  age: number;
  alive: boolean;
  amplitude: number;
  x: number;
  y: number;

  constructor({ duration = 30, from = 12, to = 0, rng = new TouhouRNG(1) }: { duration?: number; from?: number; to?: number; rng?: Pick<TouhouRNG, 'next'> } = {}) {
    if (!Number.isInteger(duration) || duration < 1 || !Number.isInteger(from) || !Number.isInteger(to))
      throw new RangeError('Screen shake requires a positive integer duration and integer amplitudes');
    if (!rng?.next) throw new TypeError('Screen shake requires a seeded RNG');
    Object.assign(this, { duration, from, to, rng });
    this.age = 0; this.alive = true; this.amplitude = f32(from); this.x = 0; this.y = 0;
  }
  update(): this {
    if (!this.alive) return this;
    this.age++;
    if (this.age >= this.duration) { this.alive = false; this.amplitude = this.x = this.y = 0; return this; }
    this.amplitude = add(f32(this.from), div(mul(f32(this.age), sub(f32(this.to), f32(this.from))), f32(this.duration)));
    const direction = () => { const value = this.rng.next() % 3; return value === 1 ? this.amplitude : value === 2 ? -this.amplitude : 0; };
    this.x = direction(); this.y = direction(); return this;
  }
  snapshot(): { age: number; alive: boolean; duration: number; amplitude: number; x: number; y: number } { return { age: this.age, alive: this.alive, duration: this.duration, amplitude: this.amplitude, x: this.x, y: this.y }; }
}
