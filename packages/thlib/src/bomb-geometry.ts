import type { Bullet } from './bullets.js';
export interface BeamGeometry {
  x: number; y: number; angle: number; length: number; width: number; readonly currentWidth?: number;
}

export interface BeamTarget {
  alive?: boolean; x: number; y: number; radius?: number; scale?: number; angle?: number;
  hitbox?: string; halfLength?: number; halfWidth?: number;
  width?: number; currentWidth?: number; hitboxScale?: number;
  intersectsCircle?: (x: number, y: number, radius: number) => boolean;
  segments?: () => Array<[number, number, number, number]>;
}

import { distanceToSegmentSq } from './math.js';

// Shortest distance between two finite segments, including crossing and collinear ones.
const segmentDistanceSq = (a: readonly number[], b: readonly number[]) => {
  const [ax, ay, bx, by] = a, [cx, cy, dx, dy] = b;
  const ux = bx - ax, uy = by - ay, vx = dx - cx, vy = dy - cy;
  const cross = ux * vy - uy * vx;
  if (cross !== 0) {
    const wx = cx - ax, wy = cy - ay;
    const t = (wx * vy - wy * vx) / cross, s = (wx * uy - wy * ux) / cross;
    if (t >= 0 && t <= 1 && s >= 0 && s <= 1) return 0;
  }
  return Math.min(distanceToSegmentSq(ax, ay, cx, cy, dx, dy),
    distanceToSegmentSq(bx, by, cx, cy, dx, dy),
    distanceToSegmentSq(cx, cy, ax, ay, bx, by),
    distanceToSegmentSq(dx, dy, ax, ay, bx, by));
};

/** Beam is a capsule starting at x/y with positive length along angle. Width is full width. */
export function beamIntersectsCircle(beam: BeamGeometry, x: number, y: number, radius: number): boolean {
  const width = beam.currentWidth ?? beam.width;
  return distanceToSegmentSq(x, y, beam.x, beam.y,
    beam.x + Math.cos(beam.angle) * beam.length, beam.y + Math.sin(beam.angle) * beam.length) <= (width / 2 + radius) ** 2;
}

/** Exact capsule contact with circles, rotated Bullet capsules/boxes and segmented Lasers.
 * Cancellation intentionally includes delayed projectiles and warning lasers. */
export function beamIntersectsEntity(beam: BeamGeometry, entity: BeamTarget): boolean {
  if (entity.alive === false) return false;
  const segment = [beam.x, beam.y, beam.x + Math.cos(beam.angle) * beam.length,
    beam.y + Math.sin(beam.angle) * beam.length];
  const radius = (beam.currentWidth ?? beam.width) / 2;
  if (typeof entity.segments === 'function') {
    const otherRadius = (entity.currentWidth ?? entity.width ?? 0) * (entity.hitboxScale ?? 1) / 2;
    return entity.segments().some(other => segmentDistanceSq(segment, other) <= (radius + otherRadius) ** 2);
  }
  const scale = entity.scale ?? 1;
  if (entity.hitbox !== 'capsule' && entity.hitbox !== 'box')
    return beamIntersectsCircle(beam, entity.x, entity.y, (entity.radius ?? 0) * scale);
  const angle = entity.angle ?? 0, c = Math.cos(angle), s = Math.sin(angle);
  const local = (x: number, y: number) => [(x - entity.x) * c + (y - entity.y) * s,
    -(x - entity.x) * s + (y - entity.y) * c];
  const [ax, ay] = local(segment[0], segment[1]), [bx, by] = local(segment[2], segment[3]);
  const length = entity.halfLength! * scale, width = entity.halfWidth! * scale;
  if (entity.hitbox === 'capsule')
    return segmentDistanceSq([ax, ay, bx, by], [-length, 0, length, 0]) <= (radius + width) ** 2;
  if ((Math.abs(ax) <= length && Math.abs(ay) <= width) ||
    (Math.abs(bx) <= length && Math.abs(by) <= width)) return true;
  return [[-length, -width, length, -width], [length, -width, length, width],
    [length, width, -length, width], [-length, width, -length, -width]]
    .some(edge => segmentDistanceSq([ax, ay, bx, by], edge) <= radius ** 2);
}
