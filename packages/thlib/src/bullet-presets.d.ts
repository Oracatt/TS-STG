export type StandardBulletName =
  | 'pellet' | 'orb' | 'ring' | 'rice' | 'kunai' | 'needle' | 'amulet'
  | 'star' | 'capsule' | 'oval-ring' | 'glow' | 'orb-medium' | 'heart-ring'
  | 'knife' | 'oval' | 'star-large' | 'ring-medium' | 'orb-large'
  | 'lightning' | 'diamond' | 'droplet' | 'orb-patterned'
  | 'flame' | 'linked' | 'micro-orb' | 'heart';

/** Immutable library geometry defaults in logical units; not an original-game
 * table. Round presets use radius=size/4. Slender presets intentionally use
 * capsule geometry rather than taking a title's old circular hitbox values. */
export interface StandardBulletPreset {
  readonly name: StandardBulletName;
  readonly size: number;
  readonly radius: number;
  readonly hitbox: 'circle' | 'capsule' | 'box';
  /** Capsule centre-segment half length, or box half length. A capsule's full
   * end-to-end length is 2*(halfLength+halfWidth). */
  readonly halfLength?: number;
  /** Capsule cap radius, or box half width. */
  readonly halfWidth?: number;
  /** Presentation policy metadata; callers supply the current drawing angle. */
  readonly rotation: 'none' | 'velocity' | 'spin';
  readonly colors: number;
  readonly additive: boolean;
}

export const StandardBulletPresets: Readonly<Record<StandardBulletName, Readonly<StandardBulletPreset>>>;
/** Throws RangeError for an unknown name, including colour-qualified names. */
export function getBulletPreset(name: string): Readonly<StandardBulletPreset>;

export interface BulletCollisionTransform {
  x: number;
  y: number;
  /** Radians; zero points along the positive x axis. */
  angle?: number;
  scale?: number;
  active?: boolean;
  alive?: boolean;
  isActive?: boolean;
}

/** Uses the same collision implementation as Bullet.collidesCircle. Tangency
 * counts as a hit. scale affects the preset's geometry, not targetRadius.
 * Unknown names and invalid numeric geometry throw; inactive poses return false. */
export function bulletIntersectsCircle(
  presetOrName: string | StandardBulletPreset,
  transform: BulletCollisionTransform,
  targetX: number,
  targetY: number,
  targetRadius: number,
): boolean;
