import type {DrawList} from '../core.js';
import type {LayeredDrawQueue} from '../layered-render.js';
export interface TouhouCompositorViewport {x:number;y:number;width:number;height:number;}
export interface TouhouGameplayCompositorOptions {
 renderTarget?:number|null;compositeTarget?:number|null;viewport?:TouhouCompositorViewport;
 width?:number;height?:number;scale?:number;clearColor?:number;cameraViewport?:TouhouCompositorViewport|null;
}
export class TouhouGameplayCompositor {
 constructor(options?:TouhouGameplayCompositorOptions);
 renderTarget:number|null;compositeTarget:number|null;viewport:TouhouCompositorViewport;cameraViewport:TouhouCompositorViewport;
 width:number;height:number;scale:number;clearColor:number;
 draw(draw:DrawList,queue:LayeredDrawQueue,options?:{drawBackground?:(draw:DrawList)=>void;drawDistortion?:(draw:DrawList,backgroundTexture:number)=>void;
 /** Original game-unit camera0/1/3/5 displacement. The frame and screen HUD stay fixed. */
 cameraOffset?:{x:number;y:number}}):DrawList;
}
