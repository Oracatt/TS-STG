// SPDX-License-Identifier: MIT
import { Bullet } from './bullets.js';

/** thlib's own standard collision geometry, in logical units. These are
 * library defaults, not a version-specific game's historical hitbox table.
 * Round bullets use one quarter of their visual diameter. Slender bullets
 * use an oriented capsule; halfLength measures its centre segment, and
 * halfWidth is the cap radius. A sprite's transparent rim is never harmful.
 * Existing new Bullet(...) defaults are deliberately unchanged. */
const circle = (name, size, colors = 16, rotation = 'none', additive = false) => Object.freeze({
  name, size, radius: size / 4, hitbox: 'circle', rotation, colors, additive,
});
const capsule = (name, size, radius = size / 8, halfLength = radius * 1.15, colors = 16, additive = false) => Object.freeze({
  name, size, radius, hitbox: 'capsule', halfLength, halfWidth: radius, rotation: 'velocity', colors, additive,
});
const box = (name, size, halfLength, halfWidth, colors = 16) => Object.freeze({
  name, size, radius: halfWidth, hitbox: 'box', halfLength, halfWidth, rotation: 'velocity', colors, additive: false,
});

/** Names identify geometry, independently of texture IDs and colour variants.
 * flame/heart/linked/micro-orb are generic motifs even when a consumer supplies
 * artwork absent from the bundled visual pack. All entries and the table are
 * frozen; consumers may explicitly copy an entry to customize their own game. */
export const StandardBulletPresets = Object.freeze({
  pellet: circle('pellet', 8),
  orb: circle('orb', 16),
  ring: circle('ring', 16),
  rice: capsule('rice', 16),
  kunai: capsule('kunai', 16),
  needle: capsule('needle', 16, 1.5, 4.5),
  amulet: box('amulet', 16, 4, 2),
  star: circle('star', 16, 16, 'spin'),
  capsule: capsule('capsule', 16),
  'oval-ring': capsule('oval-ring', 16),
  glow: circle('glow', 16, 16, 'none', true),
  'orb-medium': circle('orb-medium', 32, 8),
  'heart-ring': circle('heart-ring', 32, 8),
  knife: capsule('knife', 32, 3, 9, 8),
  oval: capsule('oval', 32, 4, 4.6, 8),
  'star-large': circle('star-large', 32, 8, 'spin'),
  'ring-medium': circle('ring-medium', 32, 8),
  'orb-large': circle('orb-large', 64, 8, 'none', true),
  lightning: capsule('lightning', 32, 3.5, 8, 8),
  diamond: circle('diamond', 32, 8, 'spin'),
  droplet: capsule('droplet', 32, 4, 4.6, 8),
  'orb-patterned': circle('orb-patterned', 32, 8),
  flame: capsule('flame', 32, 4, 4.6, 4, true),
  linked: capsule('linked', 16),
  'micro-orb': circle('micro-orb', 8),
  heart: circle('heart', 32, 8),
});

export function getBulletPreset(name) {
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(StandardBulletPresets, name)) {
    throw new RangeError(`Unknown standard bullet preset: ${String(name)}`);
  }
  return StandardBulletPresets[name];
}

const finite = (value, label, minimum = -Infinity) => {
  if (!Number.isFinite(value) || value < minimum) throw new RangeError(`${label} must be finite${minimum === 0 ? ' and nonnegative' : ''}`);
  return value;
};

/** Test standard (or explicitly customized) geometry against a circle.
 * x/y and angle belong to the bullet's local logical coordinate system;
 * scale affects the bullet geometry, not the target circle. An inactive or
 * destroyed bullet cannot collide. The actual calculation is Bullet's single
 * existing circle/capsule/box implementation. */
export function bulletIntersectsCircle(presetOrName, transform, targetX, targetY, targetRadius) {
  const preset = typeof presetOrName === 'string' ? getBulletPreset(presetOrName) : presetOrName;
  if (!preset || !['circle', 'capsule', 'box'].includes(preset.hitbox)) throw new TypeError('A valid standard bullet preset is required');
  const view = {
    x: finite(transform?.x, 'Bullet x'), y: finite(transform?.y, 'Bullet y'),
    angle: finite(transform.angle ?? 0, 'Bullet angle'),
    scale: finite(transform.scale ?? 1, 'Bullet scale', 0),
    radius: finite(preset.radius, 'Bullet radius', 0),
    hitbox: preset.hitbox,
    halfLength: preset.halfLength === undefined ? preset.radius * 1.15 : finite(preset.halfLength, 'Bullet halfLength', 0),
    halfWidth: preset.halfWidth === undefined ? preset.radius : finite(preset.halfWidth, 'Bullet halfWidth', 0),
    isActive: transform.active !== false && transform.alive !== false && transform.isActive !== false,
  };
  finite(targetX, 'Target x'); finite(targetY, 'Target y'); finite(targetRadius, 'Target radius', 0);
  return Bullet.prototype.collidesCircle.call(view, targetX, targetY, targetRadius);
}
