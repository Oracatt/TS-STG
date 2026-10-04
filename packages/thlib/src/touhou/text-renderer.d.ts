import type {AnmBank,AnmInstance} from './anm.js';
import type {SystemBitmapTextOptions} from '../native-host.js';
export interface TouhouTextBitmap {width:number;height:number;pixels:Uint8Array;}
export interface TouhouAnimationTextOptions {font?:number;color?:number;shadowColor?:number;spacing?:number;outline?:boolean;codePage?:number;align?:'left'|'center';x?:number;outlineScale?:number;}
export interface TouhouBitmapTextHost {
 hasSystemFont?:(family:string)=>boolean;
 encodeText:(text:string,codePage:number)=>Uint8Array;
 rasterizeBitmapText:(text:string,options:SystemBitmapTextOptions)=>TouhouTextBitmap;
 updateTextureRegion?:(id:number,x:number,y:number,width:number,height:number,pixels:Uint8Array)=>void;
 readTexturePixels:(id:number)=>TouhouTextBitmap;
 updateTexture:(id:number,pixels:Uint8Array)=>void;
}
export function outlineTouhouTextBitmap(surface:TouhouTextBitmap,background?:number,radius?:number):TouhouTextBitmap;
export class TouhouTextRenderer {
 constructor(options:{host:TouhouBitmapTextHost;bank:AnmBank});
 rasterize(text:string,options:TouhouAnimationTextOptions&{width:number;height:number}):TouhouTextBitmap;
 writeAnimationText(vm:AnmInstance,text:string,options?:TouhouAnimationTextOptions):AnmInstance;
 createNameAnimation(name:string,options?:{script?:number;interrupt?:number;color?:number;shadowColor?:number;codePage?:number}):AnmInstance;
 dispose():void;
}
