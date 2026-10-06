import type { DrawList } from '../core.js';
import type { AnmBank, AnmInstance, AnmView } from './anm.js';
import type { TouhouScreenShake } from './screen-shake.js';
import type { TouhouRNG } from './math.js';
export const TOUHOU_BOSS_DEATH_PRESET: Readonly<{ delayFrames: 60; inversionScript: 25; particleScript: 57; sound: 5; shake: readonly [30, 12, 0] }>;
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
/** Common Boss-only inversion plus particle burst; independent of enemy lifetime. */
export class TouhouBossDeath {
  constructor(bank: AnmBank, options?: TouhouBossDeathOptions);
  bank: AnmBank; position: { x: number; y: number; z: number }; follow: TouhouBossDeathOptions['follow'];
  delayFrames: number; age: number; burst: boolean; alive: boolean; roots: AnmInstance[];
  cameraShake: TouhouScreenShake | null; readonly cameraOffset: { x: number; y: number };
  clock: (() => number) | null;
  sound: TouhouBossDeathOptions['sound']; shake: TouhouBossDeathOptions['shake']; onBurst: TouhouBossDeathOptions['onBurst'];
  update(): this; draw(draw: DrawList, view?: AnmView): DrawList; destroy(): void; snapshot(): Record<string, unknown>;
}
