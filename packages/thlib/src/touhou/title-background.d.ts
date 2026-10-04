import type {DrawList} from '@ts-stg/thlib';
import type {TouhouRenderMesh} from './distortion.js';
export function titleShade(component:number,weight:number,direction:number):number;
export class TouhouTitleBackground {
 constructor(options?:{textureId?:number|null;width?:number;height?:number;displayOffsetX?:number;displayOffsetY?:number;rng?:{next():number}});
 textureId:number|null;width:number;height:number;wave:number;color:number[];mesh:TouhouRenderMesh;
 initialize():this;update():this;draw(draw:DrawList,textureId?:number|null):DrawList;
}
