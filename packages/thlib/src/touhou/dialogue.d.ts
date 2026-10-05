import type {DrawList} from '../index.js';
import type {AnmView} from './anm.js';
import type {TouhouResources} from './resources.js';
export interface TouhouDialogueEvent {type:string;
  /** First-entry scheduling only. Defaults: portrait/emotion -> portraits,
   * active -> speaker, text and other events -> text. */
  entranceStage?:'portraits'|'speaker'|'text';[key:string]:unknown;}
export interface TouhouDialogueEntranceTiming {
  portraitFrame:number;speakerFrame:number;textFrame:number;inputFrame:number;
}
export interface TouhouDialogueEntranceState {
  frame:number;portraits:boolean;speaker:boolean;text:boolean;inputReady:boolean;
}
export const TOUHOU_DIALOGUE_ENTRANCE_PRESETS:Readonly<{
  afterBoss:Readonly<{portraitFrame:0;speakerFrame:4;textFrame:34;inputFrame:38}>;
}>;
export interface TouhouDialogueExitTiming {completeFrame:number;handoffFrame?:number|null;}
export interface TouhouDialogueExitState {frame:number;handedOff:boolean;}
export const TOUHOU_DIALOGUE_EXIT_PRESETS:Readonly<{
  beforeBoss:Readonly<{completeFrame:30;handoffFrame:null}>;
  afterBoss:Readonly<{completeFrame:31;handoffFrame:1}>;
}>;
/** Active body top-left and height in original 640x480 screen coordinates. */
export interface TouhouDialoguePlayerPortrait {x:number;y:number;height:number;}
export interface TouhouDialoguePortraitState {x:number;y:number;width:number;height:number;color:number;alpha:number;layer:number;}
export interface TouhouDialoguePortraitProfile {bank:string;root:number;body:number;face?:number;x:number;y:number;width:number;height:number;}
/** Factory-owned portrait lifecycle. It does not need the source player ANM banks. */
export interface TouhouDialoguePortrait {
 draw(draw:DrawList,step:TouhouDialogueStep,dialogue:TouhouDialogue,view:AnmView):void;
 update?(dialogue:TouhouDialogue):void;setStep?(step:TouhouDialogueStep,dialogue:TouhouDialogue):void;
 setActive?(active:boolean,dialogue:TouhouDialogue):void;finish?(dialogue:TouhouDialogue):void;dispose?():void;
 state?(dialogue:TouhouDialogue):TouhouDialoguePortraitState|null;
}
export interface TouhouDialogueStep {text?:string;speaker?:'left'|'right';emotion?:string;terminal?:boolean;coldFrames?:number;autoFrames?:number;boxStyle?:number;x?:number;y?:number;events?:TouhouDialogueEvent[];portraits?:{left?:{present?:boolean;emotion?:string};right?:{present?:boolean;emotion?:string}};}
export interface TouhouDialogueOptions {resources:TouhouResources;steps?:TouhouDialogueStep[];character?:string|number;codePage?:number;charsPerFrame?:number;startDelayFrames?:number;skipMask?:number;skipHoldFrames?:number;maxLineBytes?:number;textColor?:number;speakerNames?:{left?:string;right?:string};onEvent?:(event:TouhouDialogueEvent,step:TouhouDialogueStep,dialogue:TouhouDialogue)=>void;onComplete?:(dialogue:TouhouDialogue)=>void;
  /** Extends the built-in 0/1 profiles. IDs outside that set never silently select Marisa. */
  portraitProfiles?:Record<string,TouhouDialoguePortraitProfile>;
  /** Called for each present side; null uses its source preset. Returned portraits are updated and disposed by the dialogue. */
  createPortrait?:(side:'left'|'right',step:TouhouDialogueStep,dialogue:TouhouDialogue)=>TouhouDialoguePortrait|null;
  /** Optional first-step staging. Default null preserves immediate entry.
   * Times are relative to entry after startDelayFrames. Replaces the first
   * step's coldFrames; subsequent steps retain their authored input policy. */
  entrance?:'afterBoss'|TouhouDialogueEntranceTiming|null;
  /** Optional source MSG exit. Keeps update/draw active until onComplete;
   * null preserves legacy immediate completion. Empty scenes finish at once. */
  exit?:'beforeBoss'|'afterBoss'|TouhouDialogueExitTiming|null;
  /** After-Boss MSG21 occurs one frame after exit begins, while portraits
   * are still fading. This callback must not dispose the dialogue tail. */
  onExitHandoff?:(dialogue:TouhouDialogue)=>void;
  /** Source active layout: Reimu {x:0,y:130,height:349}, Marisa {x:0,y:90,height:389}. Uniformly scales both original body and independent expression. */
  playerPortrait?:Partial<TouhouDialoguePlayerPortrait>;
  /** Full-screen ANM view with origin0; not the playfield view. Returning false retains the default source body/expression tree; void replaces it. Read portraitState('right') for the common original motion clock. */
  drawPortrait?:(draw:DrawList,step:TouhouDialogueStep,dialogue:TouhouDialogue,view:AnmView)=>void|false;}
export const TOUHOU_DIALOGUE_PRESETS:Readonly<{boxBase:270;boxChildBase:166;text:20;ruby:21;textFadeFrames:8;boxFadeFrames:5;boxGrowFrames:8;portraitFadeFrames:15;skipHoldFrames:20;autoInputGuardFrames:40}>;
export const TOUHOU_DIALOGUE_EXPRESSIONS:Readonly<Record<string,number>>;
export const TOUHOU_DIALOGUE_PORTRAITS:Readonly<{reimu:Readonly<{root:66;body:62;face:64;x:0;y:130;width:249;height:349}>;marisa:Readonly<{root:77;body:73;face:75;x:0;y:90;width:309;height:389}>;right:Readonly<{x:248;y:120;width:220;height:360}>}>;
export function wrapTouhouDialogue(text:string,encode:(text:string,codePage:number)=>Uint8Array,options?:{codePage?:number;maxBytes?:number}):string[];
export class TouhouDialogue {constructor(options:TouhouDialogueOptions);readonly active:boolean;readonly alive:boolean;readonly exiting:boolean;readonly playerPortrait:Readonly<TouhouDialoguePlayerPortrait>;readonly entranceTiming:Readonly<TouhouDialogueEntranceTiming>|null;entranceState:TouhouDialogueEntranceState|null;readonly exitTiming:Readonly<Required<TouhouDialogueExitTiming>>|null;exitState:TouhouDialogueExitState|null;complete:boolean;current:TouhouDialogueStep|null;index:number;age:number;update(mask?:number):void;advance():boolean;finish():this;portraitView(view?:AnmView):AnmView;portraitState(side?:'left'|'right'):TouhouDialoguePortraitState|null;draw(draw:DrawList,view?:AnmView):void;snapshot():{active:boolean;complete:boolean;index:number;page:number;age:number;coldFrames:number;autoFrames:number;speaker?:string;text?:string;lines:string[];boxScript:number|null;entrance?:TouhouDialogueEntranceState;exit?:TouhouDialogueExitState};dispose():void;}
