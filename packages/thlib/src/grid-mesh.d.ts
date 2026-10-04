import type { DrawList } from './core.js';
export interface GridVertex { x: number; y: number; z: number; rhw: number; color: number; u: number; v: number; }
export interface GridPosition { x: number; y: number; z: number; }
export interface GridMeshOptions {
  offsetX?: number; offsetY?: number; textureWidth?: number; textureHeight?: number;
  uvMin?: number; uvMax?: number; colorFormat?: 'rgba' | 'argb';
}
export interface GridMeshDrawing { scale?: number; offsetX?: number; offsetY?: number; strips?: boolean; }
export function argbToRgba(color: number): number;
export class GridMesh {
  constructor(columns?: number, rows?: number, options?: GridMeshOptions);
  columns: number; rows: number; offsetX: number; offsetY: number; textureWidth: number; textureHeight: number;
  uvMin: number; uvMax: number; colorFormat: 'rgba' | 'argb';
  vertices: GridVertex[]; positions: GridPosition[]; strips: GridVertex[][]; stripsDirty: boolean;
  uv(position: Pick<GridPosition, 'x' | 'y'>, vertex: Pick<GridVertex, 'u' | 'v'>): void;
  initialize(x: number, y: number, width: number, height: number, copyStrips?: boolean): this;
  updateStrips(): this; invalidateStrips(): this;
  geometry(options?: GridMeshDrawing): { vertices: Array<[number, number, number, number, number]>; indices: number[] };
  draw<T extends DrawList>(draw: T, textureId: number, options?: GridMeshDrawing): T;
}
