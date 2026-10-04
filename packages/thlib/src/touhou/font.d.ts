import type { DrawList } from '../index.js';
import type { AnmBank } from './anm.js';
export interface TouhouTextOptions {font?:number;x?:number;y?:number;scaleX?:number;scaleY?:number;alignX?:0|1|2;alignY?:0|1|2;rotation?:number;color?:number;shadowColor?:number|null;drawPriority?:number;}
export function touhouGlyphIndex(code:number,font:number):number;
export function touhouGroupedScore(score:number|bigint,finalDigit?:number):string;
export class TouhouBitmapFont {
 constructor(data:ConstructorParameters<typeof AnmBank>[0],options:{loadTexture:(path:string,width?:number,height?:number)=>number;screenScale?:number});
 layout(text:string,options?:TouhouTextOptions):Array<{index:number;x:number;y:number;width:number;height:number;rotation:number}>;
 draw(draw:DrawList,text:string,options?:TouhouTextOptions):DrawList;
}
