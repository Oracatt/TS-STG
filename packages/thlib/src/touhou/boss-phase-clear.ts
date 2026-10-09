import type {TouhouBulletClearWaveOptions} from './bullet-clear-wave.js';


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

import { f32 } from './math.js';

const cancelOptions = Object.freeze({
  bullets: true, lasers: true, nearby: true, dropMode: 0, check: true, reason: 'bonus',
});

/** Ordinary Boss phase handoff: stop the old attack, cancel nearby projectiles,
 * remove its child enemies, then cancel any projectiles emitted by their death
 * scripts. Source: enemy_damage.cpp phase_script and st01bs.ecl Boss2.
 * Final defeat and practice timeout have separate exit sequences. */
export function clearTouhouBossPhase({ x = 0, y = 128, cancelCircle, clearEnemies, stopAttack = null }: TouhouBossPhaseClearOptions = {} as TouhouBossPhaseClearOptions): void {
  if (![x, y].every(value => typeof value === 'number' && Number.isFinite(f32(value))))
    throw new TypeError('Boss phase clear coordinates must be finite float32 values');
  if (typeof cancelCircle !== 'function') throw new TypeError('Boss phase clear requires a cancelCircle callback');
  if (typeof clearEnemies !== 'function') throw new TypeError('Boss phase clear requires a clearEnemies callback');
  if (stopAttack !== null && typeof stopAttack !== 'function')
    throw new TypeError('Boss phase clear stopAttack must be a function or null');
  x = f32(x); y = f32(y);
  stopAttack?.();
  cancelCircle(x, y, 640, cancelOptions);
  clearEnemies();
  cancelCircle(x, y, 640, cancelOptions);
}
