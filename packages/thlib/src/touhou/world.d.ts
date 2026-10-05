export interface TouhouWorldBounds { x:number;y:number;width:number;height:number; }
export interface TouhouNormalizedWorldBounds extends TouhouWorldBounds { left:number;top:number;right:number;bottom:number;centerX:number;centerY:number; }
export interface TouhouWorldOptions { world?:TouhouWorld;bounds?:Partial<TouhouWorldBounds>; }
export const TOUHOU_WORLD_BOUNDS:Readonly<TouhouWorldBounds>;
export function normalizeTouhouWorldBounds(bounds?:Partial<TouhouWorldBounds>):Readonly<TouhouNormalizedWorldBounds>;
export class TouhouWorld {
  constructor(options?:{bounds?:Partial<TouhouWorldBounds>});
  readonly bounds:Readonly<TouhouNormalizedWorldBounds>;
  outside(position:{x:number;y:number},halfWidth?:number,halfHeight?:number,topMargin?:number,strict?:boolean):boolean;
}
export function resolveTouhouWorld(options?:TouhouWorldOptions):TouhouWorld;
