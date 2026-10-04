export const TOUHOU_BULLET_CLEAR_WAVE_PRESET: Readonly<{
  initialRadius: 16; radiusStep: 6; maxRadius: 640;
}>;
export interface TouhouBulletClearWaveCancelOptions {
  bullets: true; lasers: true;
  /** Original ECL616: bullets ignore protection and preserve their cancel kind.
   * Dispatch to TouhouBulletField.cancelNearbyCircle, not cancelCircle. */
  nearby: true;
  dropMode: 0;
  /** Laser cancellation continues to respect laser protection. */
  check: true;
  reason: 'bonus';
}
export interface TouhouBulletClearWaveOptions {
  /** Captured at construction. This wave does not follow a moving Boss. */
  x?: number; y?: number;
  initialRadius?: number; radiusStep?: number; maxRadius?: number;
  /** Called immediately for frame zero, then once per active update. It should
   * delegate to the existing bullet and laser cancellation owners. */
  cancelCircle: (x: number, y: number, radius: number,
    options: Readonly<TouhouBulletClearWaveCancelOptions>) => number | void;
}
/** Headless original Ecl_EtBreak2_ni wave, independent of rendering or death. */
export class TouhouBulletClearWave {
  constructor(options: TouhouBulletClearWaveOptions);
  readonly position: Readonly<{ x: number; y: number }>;
  initialRadius: number; radiusStep: number; maxRadius: number;
  frame: number; radius: number; alive: boolean; cancelled: number;
  cancelCircle: TouhouBulletClearWaveOptions['cancelCircle'];
  update(): this; destroy(): void;
  snapshot(): { frame: number; alive: boolean; position: { x: number; y: number };
    radius: number; initialRadius: number; radiusStep: number; maxRadius: number; cancelled: number };
}
