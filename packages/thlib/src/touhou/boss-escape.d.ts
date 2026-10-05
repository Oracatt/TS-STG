export const TOUHOU_BOSS_ESCAPE_PRESET: Readonly<{
  duration: 60; easing: 4; target: Readonly<{ x: -224; y: -80 }>;
}>;
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
/** Bankless escape movement. The host owns attack stopping, spell settlement,
 * HUD retirement, projectile policy and what follows the departure. No RNG,
 * death inversion, sounds, cancellation or rewards are emitted here. */
export class TouhouBossEscape {
  constructor(options?: TouhouBossEscapeOptions);
  age: number; alive: boolean; escaped: boolean; duration: number; easing: TouhouBossEscapeEasing;
  position: TouhouBossEscapePosition;
  target: Readonly<TouhouBossEscapePosition>;
  onMove: TouhouBossEscapeOptions['onMove']; onEscape: TouhouBossEscapeOptions['onEscape'];
  update(): this;
  /** Move to the endpoint now, retaining elapsed age; idempotent. */
  finish(): this;
  /** Cancel without moving or notifying onEscape. */
  destroy(): void;
  snapshot(): { age: number; alive: boolean; escaped: boolean; duration: number;
    easing: TouhouBossEscapeEasing; position: TouhouBossEscapePosition; target: TouhouBossEscapePosition };
}
