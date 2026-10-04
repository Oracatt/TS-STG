import type { DrawList } from '../core.js';
import { GridMesh, GridVertex, GridMeshDrawing } from '../grid-mesh.js';
import { RadialDistortion } from '../radial-distortion.js';
export type TouhouMeshVertex = GridVertex;
export interface TouhouMeshOptions { viewOffsetX?: number; viewOffsetY?: number; screenWidth?: number; screenHeight?: number; }
export type TouhouMeshDrawing = GridMeshDrawing;
export { argbToRgba } from '../grid-mesh.js';
export class TouhouRenderMesh extends GridMesh {
  constructor(columns?: number, rows?: number, options?: TouhouMeshOptions);
  viewOffsetX: number; viewOffsetY: number; screenWidth: number; screenHeight: number;
}
export class TouhouStageDistortion {
  constructor(options?: TouhouMeshOptions & { mode?: number; phaseX?: number; phaseY?: number; columns?: number; rows?: number });
  mode: number; phaseX: number; phaseY: number; mesh: TouhouRenderMesh;
  timer: { current: number; previous: number; value: number };
  update(rate?: number | null): this; draw(draw: DrawList, textureId: number, options?: TouhouMeshDrawing): DrawList;
}
export class TouhouEnemyDistortion extends RadialDistortion {
  constructor(options?: TouhouMeshOptions & { radius?: number; currentRadius?: number; color?: number; phaseX?: number; phaseY?: number; columns?: number; rows?: number });
  mesh: TouhouRenderMesh;
}
