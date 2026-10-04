import type {AnmInstance,AnmView} from './anm.js';
export interface TouhouProjectionViewport {x:number;y:number;width:number;height:number}
export interface TouhouProjectionCamera {view:number[];projection:number[];viewport:TouhouProjectionViewport;outputViewport?:TouhouProjectionViewport;screenScale?:number;screenOffsets?:Array<{x:number;y:number}>;billboardAxis?:{x:number;y:number;z:number}}
export function identityMatrix():number[];
export function multiplyMatrix(a:number[],b:number[]):number[];
export function rotationMatrix(axis:number,angle:number):number[];
export function createTouhouCamera(viewport:TouhouProjectionViewport,options?:{fieldOfView?:number;near?:number;far?:number}):TouhouProjectionCamera;
export function projectedAnmWorld(vm:AnmInstance,screenScale:number,screenOffsets:Array<{x:number;y:number}>):number[];
export function projectedAnmGeometry(vm:AnmInstance,view?:AnmView):{vertices:number[][];indices:number[];entry:number;mvp:number[];world:number[];camera:TouhouProjectionCamera};
export function projectedAnmBillboard(vm:AnmInstance,view?:AnmView):{vertices:number[][];indices:number[];entry:number;sourceVertices:number[][];projected:{x:number;y:number;z:number};camera:TouhouProjectionCamera};
