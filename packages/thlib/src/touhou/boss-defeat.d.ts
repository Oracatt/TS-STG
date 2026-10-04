import type { TouhouRNG } from './math.js';
import type { TouhouBulletClearWave, TouhouBulletClearWaveOptions } from './bullet-clear-wave.js';

export const TOUHOU_BOSS_DEFEAT_PRESET: Readonly<{ delayFrames: 60; speed: 0.4; sound: 5 }>;
export interface TouhouBossDefeatPosition { x: number; y: number; z: number }
export interface TouhouBossDefeatOptions {
  x?: number; y?: number; z?: number;
  /** Radians. Omitting this consumes one signed sample from the seeded RNG. */
  angle?: number;
  /** Uses the original signed-unit conversion; defaults to new TouhouRNG(). */
  rng?: Pick<TouhouRNG, 'next'> & Partial<Pick<TouhouRNG, 'modulus'>>;
  delayFrames?: number; speed?: number;
  /** Shared bullet/laser cancellation adapter; called immediately at radius 16. */
  cancelCircle: TouhouBulletClearWaveOptions['cancelCircle'];
  /** ECL613: cancel every surviving bullet and laser, preserving their effects. */
  clearAll: (defeat: TouhouBossDefeat) => void;
  /** Copy the moving body's position into the host Boss. The clear origin stays fixed. */
  onMove?: ((position: TouhouBossDefeatPosition, defeat: TouhouBossDefeat) => void) | null;
  /** After clearAll, settle the spell, drop rewards, retire the body and begin
   * TouhouBossDeath({delayFrames:0}) visuals. Does not wait for visual tails. */
  onBurst?: ((defeat: TouhouBossDefeat) => void) | null;
  /** Emits the initial sound only. The visual burst owns its second sound. */
  sound?: ((id: number, x: number) => void) | null;
}
/** Bankless Boss-only defeat choreography. No score, stage or dialogue policy. */
export class TouhouBossDefeat {
  constructor(options: TouhouBossDefeatOptions);
  age: number; alive: boolean; burst: boolean; delayFrames: number; speed: number; angle: number;
  position: TouhouBossDefeatPosition; velocity: { x: number; y: number };
  clearWave: TouhouBulletClearWave;
  clearAll: TouhouBossDefeatOptions['clearAll']; onMove: TouhouBossDefeatOptions['onMove'];
  onBurst: TouhouBossDefeatOptions['onBurst']; sound: TouhouBossDefeatOptions['sound'];
  update(): this;
  /** Complete the remaining sequence now; normally update() reaches frame 60. */
  finish(): this;
  destroy(): void;
  snapshot(): { age: number; alive: boolean; burst: boolean; delayFrames: number; speed: number; angle: number;
    position: TouhouBossDefeatPosition; velocity: { x: number; y: number };
    clearWave: ReturnType<TouhouBulletClearWave['snapshot']> };
}
