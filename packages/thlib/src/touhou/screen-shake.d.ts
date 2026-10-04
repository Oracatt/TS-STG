import type { TouhouRNG } from './math.js';
/** Source mode1 screen shake; coordinates are original game units. */
export class TouhouScreenShake {
  constructor(options?: { duration?: number; from?: number; to?: number; rng?: Pick<TouhouRNG, 'next'> });
  duration: number; from: number; to: number; rng: Pick<TouhouRNG, 'next'>;
  age: number; alive: boolean; amplitude: number; x: number; y: number;
  update(): this; snapshot(): { age: number; alive: boolean; duration: number; amplitude: number; x: number; y: number };
}
