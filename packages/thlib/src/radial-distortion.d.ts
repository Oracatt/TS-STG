import type { DrawList } from './core.js';
import { GridMesh, GridMeshDrawing } from './grid-mesh.js';
export interface RadialDistortionBounds {
  minX: number; maxX: number; minY: number; maxY: number; insetX?: number; insetY?: number;
}
export interface RadialDistortionOptions {
  mesh?: GridMesh; radius?: number; currentRadius?: number; color?: number; phaseX?: number; phaseY?: number;
  margin?: number; growth?: number; displacement?: number; waveAmplitude?: number;
  vertexPhaseStepX?: number; vertexPhaseStepY?: number; phaseVelocityX?: number; phaseVelocityY?: number;
  normalizationEpsilon?: number; wrapPhase?: (phase: number) => number;
  colorAt?: ((weight: number, color: number) => number) | null; forceOpaque?: boolean;
  positionBounds?: RadialDistortionBounds | null;
}
export class RadialDistortion {
  constructor(options?: RadialDistortionOptions);
  mesh: GridMesh; radius: number; currentRadius: number; color: number; phaseX: number; phaseY: number;
  margin: number; growth: number; displacement: number; waveAmplitude: number;
  vertexPhaseStepX: number; vertexPhaseStepY: number; phaseVelocityX: number; phaseVelocityY: number;
  normalizationEpsilon: number; wrapPhase: (phase: number) => number;
  colorAt: ((weight: number, color: number) => number) | null; forceOpaque: boolean;
  positionBounds: RadialDistortionBounds | null;
  update(center: { x: number; y: number; z?: number }, clockScale?: number): this;
  draw<T extends DrawList>(draw: T, textureId: number, options?: GridMeshDrawing): T;
}
