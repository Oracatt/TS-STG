// SPDX-License-Identifier: GPL-3.0-only
import type {NativeHost} from '@ts-stg/thlib';
import type {AnmView,AnmInstance,TouhouBossCharge,TouhouHud,TouhouStageClear,TouhouStageTransition} from '@ts-stg/thlib/touhou';

import type {BossKey,Point,Move,RushPhase} from './types.js';
export interface RushMusicTrack{file:string;loopBegin:number;loopEnd:number;sampleRate:number;channels:number;}
export interface RushManifest{source:string;textures:Record<string,string>;files:Record<string,{width:number;height:number;sha256:string}>;fonts:Record<string,string>;sounds:Record<string,{file:string;volume?:number}>;music:Record<string,RushMusicTrack>;}
export interface ArtworkAssets{host?:NativeHost;texture(name:string):number;size(name:string):{width:number;height:number};}
export interface RushActor extends Point{vx?:number;vy?:number;animationIndex?:number;visualKind?:string;kind?:string;source?:string;alpha?:number;tint?:number|number[];move?:Move;moving?:boolean;frame?:number;alive?:boolean;hidden?:boolean;visible?:boolean;delay?:number;}
export interface ArtworkRect{x:number;y:number;width:number;height:number;flip:boolean;}
export interface ArtworkPose{key:BossKey;texture:string;rect:ArtworkRect;width:number;height:number;animationIndex:number;frameIndex:number;bob:number;x:number;y:number;tint:number|number[]|null;alpha:number;frame:number;birth?:number;}
export interface ArtworkState{key:BossKey;animationIndex:number;frameIndex:number;count:number;request:number;moving:boolean;lastFrame:number;previous:Point;move:Move|null|undefined;history:ArtworkPose[];sample?:ArtworkPose;}
export interface SpellCard{phase:RushPhase;age:number;deadAge:number;leaving:boolean;alpha:number;overlayAlpha:number;scroll:number;}
export interface LegacySpellCard extends SpellCard{opacity:number;compositeAlpha:number;backAlpha:number;labelAlpha:number;slideX:number;slideY:number;textScale:number;innerRotation:number[];outerRotation:number[];outerX:number;outerY:number;outerInner:number;outerOuter:number;outerSpeed:number;innerMin:number;innerMax:number;innerAlpha:number;outerScale:number;}
export interface SpellEntrance{boss:BossKey;age:number;phaseKey:string;x:number;y:number;cutinAlpha:number;units?:{x:number;y:number;sign:number}[];alpha?:number;}
export interface ChargeEffect extends Point{kill(reason?:string):unknown;alive:boolean;frame:number;z?:number;follow?:Point&{z?:number};storetimes?:number;blast?:boolean;color?:number|number[];scale?:number;alpha?:number;}
export interface ChargeVisual{effect:ChargeEffect;follow:Point;storetimes:number;blast:boolean;lastFrame:number;display:TouhouBossCharge|undefined;readonly animations:AnmInstance[];}
export interface LegacyCharge{effect:ChargeEffect;follow:Point;color:number[];storetimes:number;blast:boolean;lastFrame:number;inwardAlpha:number[];blastAlpha:number;}
export interface StageObject{name:string;x:number;y:number;z:number;width:number;height:number;rotation:number[];alpha:number;uv:number[];kind:string;removeBehind:number;birth:number;speed?:number;spin?:number[];}
export interface StageCard{key:string;boss:BossKey;id:number;age:number;alpha:number;overlayAlpha:number;scroll:number;leaving:boolean;}
export interface StageObjectOptions{rotation?:number[];alpha?:number;uv?:number[];kind?:string;removeBehind?:number;}
export interface DrawBossPortraitOptions{x:number;y:number;width:number;height:number;color?:number;view?:AnmView;clip?:boolean;}
export interface PortraitGraphicsOptions{musicVolume?:number;}
export interface PortraitDrawOptions{hud?:TouhouHud|null;hideHudNumbers?:boolean;dialogue?:import('@ts-stg/thlib/touhou').TouhouDialogue|null;stageClear?:TouhouStageClear|null;stageTransition?:TouhouStageTransition|null;}
export interface LegacyHudState{time:number;bloodAlpha:number;timeAlpha:number;timeSize:number;timeOut:number;red:boolean;}

export type MeshVertex=[number,number,number,number,number];export type MeshVertex3D=[number,number,number,number,number,number];
