import type {DrawList} from '../index.js';
import type {TouhouProjectionCamera} from './anm-projection.js';
export interface AnmTexture {kind:string;path?:string;offset?:number;length?:number;format?:number;width?:number;height?:number;sha256?:string;referenceExtractedSha256?:string;byteMatchesExtracted?:boolean}
export interface AnmEntry {index:number;offset:number;length:number;name:string;width:number;height:number;format:number;x:number;y:number;memoryPriority:number;lowResScale:number;hasData:number;originalWidth:number;originalHeight:number;spriteBase:number;scriptBase:number;spriteCount:number;scriptCount:number;texture:AnmTexture}
export interface AnmSprite {index:number;entry:number;storedId:number;x:number;y:number;width:number;height:number;pivotX:number;pivotY:number;scaleX:number;scaleY:number;rotation:number;excluded?:boolean}
export interface AnmInstruction {offset:number;opcode:number;size:number;time:number;mask:number;args:number[]}
export interface AnmScript {index:number;entry:number;storedId:number;offset:number;instructions:AnmInstruction[];excluded?:boolean}
export interface AnmData {format:'touhou-anm-v8'|'th20-anm-v8';name:string;byteLength:number;entries:AnmEntry[];sprites:AnmSprite[];scripts:AnmScript[];opcodeCounts:Record<string,number>;source?:{file:string;sha256:string;bytes:number}}
export interface AnmView {canvasWidth?:number;canvasHeight?:number;projection?:TouhouProjectionCamera;x?:number;y?:number;scale?:number;screenScale?:number;pixelSnap?:boolean;screenOffsets?:Array<{x:number;y:number}>}
export interface TouhouAnmAttachedEffect {update():number;interrupt?(label:number):void;retire?():void;}
export interface AnmEnvironment {layerPriorities?:Readonly<Record<number,number>>;effectiveLayer?:(layer:number,secondary:boolean)=>number;paddedTextures?:boolean;defaultSecondary?:boolean;loadTexture?:(path:string,width:number,height:number)=>number;unloadTexture?:(id:number)=>void;resolveTexture?:(entry:AnmEntry,bank:AnmBank)=>number;cameraComponent?:(variable:number)=>number;cameraOffset?:()=>{x:number;y:number;z:number};spawnEffect?:(animation:AnmInstance,type:number)=>TouhouAnmAttachedEffect;rng?:{state:number;modulus?:number;next():number;signed():number}}
export interface AnmCreateOptions {secondary?:boolean;front?:boolean;x?:number;y?:number;z?:number;rotation?:number;parent?:AnmInstance;detached?:boolean;spriteRemap?:(sprite:number,vm:AnmInstance)=>number;beforeStart?:(vm:AnmInstance)=>void}
export function decodeAnm(source:ArrayBuffer|Uint8Array,name?:string):AnmData;
export const SUPPORTED_ANM_OPCODES:readonly number[];
export class UnsupportedAnmError extends Error {constructor(instance:AnmInstance,feature:string)}
export class AnmBank {
 constructor(data:AnmData,environment?:AnmEnvironment);
 data:AnmData;environment:AnmEnvironment;instances:AnmInstance[];scripts:AnmScript[];textures:Map<number,number>;rng:NonNullable<AnmEnvironment['rng']>;
 create(scriptId:number,options?:AnmCreateOptions):AnmInstance;
 texture(entryIndex:number):number;textureFor(sprite:number|AnmSprite):number;
 update():void;draw(draw:DrawList,view?:AnmView):void;
 updateDetached():void;drawDetached(draw:DrawList,view?:AnmView):void;
 collect():number;pruneDead():number;dispose():void;coverage(scriptId:number):number[];
}
export class AnmInstance {
 constructor(bank:AnmBank,scriptId:number,options?:AnmCreateOptions);
 bank:AnmBank;scriptId:number;id:number;renderOrder:number;renderSecondary:boolean;renderFront:boolean;readonly effectiveLayer:number;readonly drawPriority:number|undefined;alive:boolean;stopped:boolean;memory:DataView;
 parent:AnmInstance|null;transformParent:AnmInstance|null;children:AnmInstance[];detached:AnmInstance[];detachedRoot:boolean;
 pc:number;time:number;pendingInterrupt:number;returnTime:number;returnPc:number;
 x:number;y:number;z:number;rotation:number;scaleX:number;scaleY:number;scale2X:number;scale2Y:number;textureScaleX:number;textureScaleY:number;width:number;height:number;
 alpha:number;color:number;secondaryColor:number;flashColor:number|null;layer:number;orientation:number;visible:boolean;
 readonly spriteIndex:number;readonly renderType:number;
 F(offset:number,value?:number):number;U(offset:number,value?:number):number;B(offset:number,value?:number):number;
 bit(offset:number,mask:number,value:number):void;flag(mask:number,value:number):void;
 setSprite(index:number,remap?:boolean):this;setLayer(layer:number):void;
 interrupt(label:number,recursive?:boolean):this;interruptNow(label:number,recursive?:boolean):this;
 executeFrame():void;update():void;destroy():void;
 draw(draw:DrawList,view?:AnmView):void;drawSelf(draw:DrawList,view?:AnmView):void;
 corners():Array<{x:number;y:number;z:number}>;worldPosition(view?:AnmView,output?:{x?:number;y?:number;z?:number}|null):{x:number;y:number;z:number};detachedPosition():{x:number;y:number;z:number};
 inheritedRotation():number;inheritedScale(selector?:number):number;transformOffset(x:number,y:number,rotateOwn:boolean,scaleOwn:boolean):{x:number;y:number};
 interpolate(key:string,address:number,count:number,end:number[],duration:number,mode:number,options?:{bytes?:boolean;integer?:boolean;rgb?:boolean;angle?:boolean;tangents?:number[][]}):void;
  snapshot():Record<string,unknown>;
  attachedEffect?:TouhouAnmAttachedEffect;effectTrackedAge?:number;
}
