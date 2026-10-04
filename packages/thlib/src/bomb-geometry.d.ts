export interface BeamGeometry {
  x: number; y: number; angle: number; length: number; width: number; readonly currentWidth?: number;
}
export interface BeamTarget {
  alive?: boolean; x: number; y: number; radius?: number; scale?: number; angle?: number;
  hitbox?: string; halfLength?: number; halfWidth?: number;
  width?: number; currentWidth?: number; hitboxScale?: number;
  segments?: () => Array<[number, number, number, number]>;
}
export function beamIntersectsCircle(beam: BeamGeometry, x: number, y: number, radius: number): boolean;
export function beamIntersectsEntity(beam: BeamGeometry, entity: BeamTarget): boolean;
