import type {AnmBank,AnmData,AnmEnvironment,AnmInstance} from './anm.js';
import type {TouhouBitmapTextHost,TouhouAnimationTextOptions} from './text-renderer.js';
import type {TouhouSht} from './shot-data.js';
import type {TouhouBulletStyle} from './bullet-patterns.js';
import type {TouhouBitmapFont} from './font.js';
import type {TouhouAudio,TouhouAudioManifest} from './audio.js';
import type {TouhouPlayerProfile} from './player.js';
export interface TouhouPlayerResourceProfile {bank:string;profile?:TouhouPlayerProfile;sht?:TouhouSht;}
export interface TouhouResourceOptions {
 basePath?:string;environment?:AnmEnvironment;audioVolume?:number;
 /** Required manifest banks; defaults to the source pack. All additional manifest archives load too. */
 bankNames?:readonly string[];
 /** Decoded banks with already-resolved texture paths, also usable without a host. */
 archives?:Record<string,AnmData>;shots?:Record<string,TouhouSht>|TouhouSht[];styles?:TouhouBulletStyle[];
 players?:Record<string,TouhouPlayerResourceProfile>;
}
export interface TouhouResourceHost extends Partial<TouhouBitmapTextHost> {
 readText?:(path:string)=>string;
 loadTexture?:(path:string,width?:number,height?:number)=>number;
 unloadTexture?:(id:number)=>void;
 createTexture?:(width:number,height:number,pixels:Uint8Array)=>number;
 createRenderTarget?:(width:number,height:number)=>number;
 updateTexture?:(id:number,pixels:Uint8Array)=>void;
 readTexturePixels?:(id:number)=>{width:number;height:number;pixels:Uint8Array};
 loadSound?:(path:string)=>number;
 playSound?:(id:number,volume?:number,pan?:number,loop?:boolean)=>void;
 stopSound?:(id:number)=>void;
 unloadSound?:(id:number)=>void;
}
export interface TouhouResources {
 readonly disposed:boolean;
 basePath:string;shots:TouhouSht[]&{pl00:TouhouSht;pl01:TouhouSht}&Record<string,TouhouSht>;styles:TouhouBulletStyle[];
 players:Record<string,TouhouPlayerResourceProfile>;
 banks:Record<string,AnmBank|null>;data:Record<string,AnmData>;
 manifest:any;audioManifest:TouhouAudioManifest|null;font:TouhouBitmapFont|null;audio:TouhouAudio|null;
 createBank(name:string):AnmBank;registerBank(name:string,data:AnmData):AnmBank;dispose():void;
 createNameAnimation(text:string,options?:{script?:number;interrupt?:number;color?:number;shadowColor?:number;codePage?:number},bank?:AnmBank):AnmInstance;
 writeAnimationText(vm:AnmInstance,text:string,options?:TouhouAnimationTextOptions):AnmInstance;
 encodeText(text:string,codePage?:number):Uint8Array;
}
export type TouhouResourceBankName='pl00'|'pl01'|'bullet'|'effect'|'enemy'|'ascii_960'|'front'|'text'|'title'|'screenswitch';
export const TOUHOU_RESOURCE_BANKS:readonly TouhouResourceBankName[];
export function createTouhouResources(host?:TouhouResourceHost|null,options?:TouhouResourceOptions):TouhouResources;
