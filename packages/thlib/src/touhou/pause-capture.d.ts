import type {AnmBank,AnmInstance,AnmView} from './anm.js';
import type {DrawList} from '../index.js';
export interface TouhouPixelSurface {width:number;height:number;pixels:Uint8Array|Uint8ClampedArray}
export interface TouhouPixelRect {left:number;top:number;right:number;bottom:number}
export interface TouhouPixelServices {readTexturePixels(id?:number):TouhouPixelSurface;updateTexture(id:number,pixels:Uint8Array|Uint8ClampedArray):void}
export function nextRawPauseRandom(random:{state:number;last:number}):number;
export function copyPauseSurface(source:TouhouPixelSurface,destination:TouhouPixelSurface,sourceRect:TouhouPixelRect,destinationRect:TouhouPixelRect):TouhouPixelSurface;
export function applyPauseNoise(surface:TouhouPixelSurface,rect:TouhouPixelRect,random:{state:number;last:number}):TouhouPixelSurface;
export class TouhouPauseCapture {
 constructor(options:{bank:AnmBank;pixels:TouhouPixelServices;rng?:{state:number;last:number};sourceRect?:TouhouPixelRect;view?:AnmView;script?:number;secondary?:boolean});
 bank:AnmBank;animation:AnmInstance|null;
 capture(options?:{sourceTexture?:number;practice?:boolean}):this;update():void;hide():void;draw(draw:DrawList):DrawList;destroy():void;
}
