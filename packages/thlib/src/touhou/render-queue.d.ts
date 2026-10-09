import {DrawList,LayeredDrawQueue} from '../index.js';
import type {AnmInstance,AnmView} from './anm.js';
export class TouhouRenderQueue extends LayeredDrawQueue {
 constructor(options?:{defaultLayer?:number;layerPriorities?:Readonly<Record<number,number>>});
 layerPriorities:Readonly<Record<number,number>>;
 entries:unknown[];defaultLayer:number;reset():this;
 enqueueAnm(vm:AnmInstance,view?:AnmView):this;
 enqueue(layer:number,callback:(draw:DrawList)=>void,options?:{order?:number}):this;
}

export const TOUHOU_LAYER_PRIORITIES:Readonly<Record<number,number>>;
export const TOUHOU_OWNER_PRIORITIES:Readonly<{stageBackground:3;stageForeground:6;itemBack:19;enemyOverlay:23;player:30;item:35;laser:39;bullet:41;graze:42;bomb:44;floatingScore:51;bossLabel:60;spellText:84}>;
export function effectiveAnmLayer(layer:number,secondary?:boolean):number;
export function anmDrawPriority(layer:number,secondary?:boolean,priorities?:Readonly<Record<number,number>>):number|undefined;
