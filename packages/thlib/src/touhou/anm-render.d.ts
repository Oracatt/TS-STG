import type {DrawList} from '../index.js';
import type {AnmInstance,AnmView} from './anm.js';
export function anmSpriteVertices(vm:AnmInstance,view?:AnmView):Array<[x:number,y:number,u:number,v:number,color:number]>;
export function drawAnm(vm:AnmInstance,draw:DrawList,view?:AnmView):void;
