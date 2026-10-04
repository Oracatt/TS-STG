import type { TouhouBulletClearWaveOptions } from './bullet-clear-wave.js';

export interface TouhouBossPhaseClearOptions {
  /** Source coordinates. Captured before callbacks; defaults to (0, 128). */
  x?: number; y?: number;
  /** Called twice at radius 640. Dispatch nearby=true to the bullet owner's
   * cancelNearbyCircle; laser cancellation keeps check=true. */
  cancelCircle: TouhouBulletClearWaveOptions['cancelCircle'];
  /** Remove child enemies and their attack tasks. Their death callbacks may
   * emit projectiles, which are handled by the second cancellation pass. */
  clearEnemies: () => void;
  /** Stop the old attack before either pass. May be omitted if already stopped. */
  stopAttack?: (() => void) | null;
}
/** Synchronous ordinary phase handoff; no persistent screen-clear task.
 * Final Boss defeat uses TouhouBossDefeat instead. A practiced spell's timeout
 * escape does not run either clear sequence. All inputs are validated before
 * any callback runs; exceptions thrown by callbacks propagate to the caller. */
export function clearTouhouBossPhase(options: TouhouBossPhaseClearOptions): void;
