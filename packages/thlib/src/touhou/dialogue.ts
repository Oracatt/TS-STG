import type {AnmBank} from './anm-vm.js';
import type {AnmDrawList as DrawList} from './anm.js';
import type {AnmView,AnmInstance} from './anm.js';
import type {TouhouResources} from './resources.js';

export interface TouhouDialogueEvent {type:string;
  /** Staged-entry scheduling only. Defaults: portrait/emotion -> portraits,
   * active -> speaker, text and other events -> text. */
  entranceStage?:'portraits'|'speaker'|'text';[key:string]:unknown;}

export interface TouhouDialogueEntranceTiming {
  portraitFrame:number;speakerFrame:number;textFrame:number;inputFrame:number;
}

export interface TouhouDialogueEntranceState {
  frame:number;portraits:boolean;speaker:boolean;text:boolean;inputReady:boolean;
}

export interface TouhouDialogueExitTiming {completeFrame:number;handoffFrame?:number|null;}

export interface TouhouDialogueExitState {frame:number;handedOff:boolean;}

/** Active body top-left and height in original 640x480 screen coordinates. */
export interface TouhouDialoguePlayerPortrait {x:number;y:number;height:number;}

export interface TouhouDialoguePortraitState {x:number;y:number;width:number;height:number;color:number;alpha:number;layer:number;}

export interface TouhouDialoguePortraitProfile {bank:string;root:number;body:number;face?:number;x:number;y:number;width:number;height:number;}

/** Factory-owned portrait lifecycle. It does not need the source player ANM banks. */
export interface TouhouDialoguePortrait {
 draw(draw:DrawList,step:TouhouDialogueStep,dialogue:TouhouDialogue,view:AnmView):void;
 update?(dialogue:TouhouDialogue):void;setStep?(step:TouhouDialogueStep,dialogue:TouhouDialogue):void;
 /** Explicit per-side presence changes. A hook owns its fade/re-entry and
  * remains drawable while absent; without one, false immediately hides draw/state.
  * Neither case releases ownership: update/dispose still run. */
 setPresent?(present:boolean,dialogue:TouhouDialogue):void;
 setActive?(active:boolean,dialogue:TouhouDialogue):void;finish?(dialogue:TouhouDialogue):void;dispose?():void;
 state?(dialogue:TouhouDialogue):TouhouDialoguePortraitState|null;
}

export interface TouhouDialogueStep {text?:string;speaker?:'left'|'right';emotion?:string;terminal?:boolean;coldFrames?:number;autoFrames?:number;boxStyle?:number;
 /** 0/1 are the portrait-side balloons; 2 points toward an actor above the
  * balloon and leaves both portraits inactive. Defaults to speaker left/right. */
 boxMode?:0|1|2;
 /** ANM raw coordinates: twice the original 640x480 screen coordinates,
  * retaining the source balloon's own anchor/tail offsets. */
 x?:number;y?:number;
 /** Optional timing for this step. Undefined retains the legacy first-step
  * entrance option; later steps default to immediate entry. Null disables it. */
 entrance?:'afterBoss'|TouhouDialogueEntranceTiming|null;
 events?:TouhouDialogueEvent[];
 /** Explicit false starts the source portrait exit once; true re-enters from
  * a fresh source template. Omitted presence preserves the prior state. */
 portraits?:{left?:{present?:boolean;emotion?:string};right?:{present?:boolean;emotion?:string}};}

export interface TouhouDialogueOptions {resources:TouhouResources;steps?:TouhouDialogueStep[];character?:string|number;codePage?:number;charsPerFrame?:number;startDelayFrames?:number;skipMask?:number;skipHoldFrames?:number;maxLineBytes?:number;textColor?:number;speakerNames?:{left?:string;right?:string};onEvent?:(event:TouhouDialogueEvent,step:TouhouDialogueStep,dialogue:TouhouDialogue)=>void;onComplete?:(dialogue:TouhouDialogue)=>void;
  /** Extends the built-in 0/1 profiles. IDs outside that set never silently select Marisa. */
  portraitProfiles?:Record<string,TouhouDialoguePortraitProfile>;
  /** Called for each present side; null uses its source preset. Returned portraits are updated and disposed by the dialogue. */
  createPortrait?:((side:'left'|'right',step:TouhouDialogueStep,dialogue:TouhouDialogue)=>TouhouDialoguePortrait|null)|null;
  /** Optional default first-step staging. A step may override it.
   * Default null preserves immediate entry.
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

// Common dialogue composition restored from hud_system/dialogue_{constructor,
// script,text,geometry}.cpp. Business supplies words, events and optional skins.
import {Keys} from '../input.js';
import {TouhouButtons} from './menu.js';
import {TouhouRenderQueue} from './render-queue.js';
import {f32,add,mul} from './math.js';

export const TOUHOU_DIALOGUE_PRESETS: Readonly<{boxBase:270;boxChildBase:166;text:20;ruby:21;textFadeFrames:8;boxFadeFrames:5;boxGrowFrames:8;portraitFadeFrames:15;skipHoldFrames:20;autoInputGuardFrames:40}>=Object.freeze({boxBase:270,boxChildBase:166,text:20,ruby:21,textFadeFrames:8,boxFadeFrames:5,boxGrowFrames:8,portraitFadeFrames:15,skipHoldFrames:20,autoInputGuardFrames:40});
export const TOUHOU_DIALOGUE_EXPRESSIONS: Readonly<Record<string,number>>=Object.freeze({NOTICE:17,NOTICE2:18,HAPPY:19,ANGRY:20,ANGRY2:20,SWEAT:21,DISAPPOINT:22,PUZZLED:23,SURPRISE:24,LOSE:25});
/** st01m0/st03m0/st04m0.msg entry1: portraits are born at0, the selected
 * speaker activates at4, the first line arrives at34 and input waits at38. */
export const TOUHOU_DIALOGUE_ENTRANCE_PRESETS: Readonly<{
  afterBoss:Readonly<{portraitFrame:0;speakerFrame:4;textFrame:34;inputFrame:38}>;
}>=Object.freeze({
  afterBoss:Object.freeze({portraitFrame:0,speakerFrame:4,textFrame:34,inputFrame:38}),
});
/** MSG4/5/6 begin the original animation exits. The pre-Boss MSG ends30
 * frames later; the post-Boss MSG requests Stage Clear at+1 and ends at+31. */
export const TOUHOU_DIALOGUE_EXIT_PRESETS: Readonly<{
  beforeBoss:Readonly<{completeFrame:30;handoffFrame:null}>;
  afterBoss:Readonly<{completeFrame:31;handoffFrame:1}>;
}>=Object.freeze({
  beforeBoss:Object.freeze({completeFrame:30,handoffFrame:null}),
  afterBoss:Object.freeze({completeFrame:31,handoffFrame:1}),
});
const entranceTiming=(value:TouhouDialogueOptions['entrance']):Readonly<TouhouDialogueEntranceTiming>|null=>{
  if(value===null||value===undefined)return null;
  const timing=typeof value==='string'?TOUHOU_DIALOGUE_ENTRANCE_PRESETS[value]:value;
  if(!timing||typeof timing!=='object')throw new TypeError('Unknown dialogue entrance profile');
  let previous=0;const result={} as TouhouDialogueEntranceTiming;
  for(const key of ['portraitFrame','speakerFrame','textFrame','inputFrame'] as const){
    const frame=timing[key];
    if(!Number.isSafeInteger(frame)||frame<previous)throw new RangeError('Dialogue entrance frames must be nonnegative integers in presentation order');
    result[key]=frame;previous=frame;
  }
  return Object.freeze(result);
};
const eventEntranceStage=(event:TouhouDialogueEvent)=>event.entranceStage??(event.type==='portrait'||event.type==='emotion'?'portraits':event.type==='active'?'speaker':'text');
const exitTiming=(value:TouhouDialogueOptions['exit']):Readonly<Required<TouhouDialogueExitTiming>>|null=>{
  if(value===null||value===undefined)return null;
  const timing=typeof value==='string'?TOUHOU_DIALOGUE_EXIT_PRESETS[value]:value;
  if(!timing||typeof timing!=='object')throw new TypeError('Unknown dialogue exit profile');
  const {completeFrame,handoffFrame=null}=timing;
  if(!Number.isSafeInteger(completeFrame)||completeFrame<0||
    handoffFrame!==null&&(!Number.isSafeInteger(handoffFrame)||handoffFrame<0||handoffFrame>completeFrame))
    throw new RangeError('Dialogue exit frames must be nonnegative integers with handoff no later than completion');
  return Object.freeze({completeFrame,handoffFrame});
};
/** Source 640x480 screen coordinates, after ANM scale mode 2. */
export const TOUHOU_DIALOGUE_PORTRAITS: Readonly<{reimu:Readonly<{root:66;body:62;face:64;x:0;y:130;width:249;height:349}>;marisa:Readonly<{root:77;body:73;face:75;x:0;y:90;width:309;height:389}>;right:Readonly<{x:248;y:120;width:220;height:360}>}>=Object.freeze({
  reimu:Object.freeze({root:66,body:62,face:64,x:0,y:130,width:249,height:349}),
  marisa:Object.freeze({root:77,body:73,face:75,x:0,y:90,width:309,height:389}),
  right:Object.freeze({x:248,y:120,width:220,height:360}),
});
const defaultPortraitProfiles:Record<string,TouhouDialoguePortraitProfile>={0:{...TOUHOU_DIALOGUE_PORTRAITS.reimu,bank:'pl00'},1:{...TOUHOU_DIALOGUE_PORTRAITS.marisa,bank:'pl01'}};
const children=(vm:AnmInstance|null|undefined):AnmInstance[]=>vm?[...vm.children,...vm.children.flatMap(children)]:[];
const find=(vm:AnmInstance|null|undefined,script:number)=>children(vm).find(child=>child.scriptId===script);
const instructionBits=new DataView(new ArrayBuffer(4));
const floatArgument=(word:number)=>{instructionBits.setUint32(0,word,true);return instructionBits.getFloat32(0,true);};
const floatWord=(value:number)=>{instructionBits.setFloat32(0,value,true);return instructionBits.getUint32(0,true);};

/** Byte-aware wrap; the native encoder determines CP932/936 character widths.
 * A two-byte character is never divided at the byte boundary. */
export function wrapTouhouDialogue(text: string,encode: (text:string,codePage:number)=>Uint8Array,{codePage=932,maxBytes=40}: {codePage?:number;maxBytes?:number}={}): string[]{
  const result=[];for(const paragraph of String(text).split('\n')){let line='',bytes=0;
    for(const character of paragraph){const width=encode(character,codePage).length;if(bytes+width>maxBytes&&line){result.push(line);line='';bytes=0;}line+=character;bytes+=width;}
    result.push(line);
  }return result;
}

/** A preset consumes plain steps, not a particular game's message bytecode.
 * Source ANMs provide bubble growth, text reveal and portrait transitions.
 * Optional charsPerFrame extends the default original whole-line reveal. */
export class TouhouDialogue {
  declare playerProfile: TouhouDialoguePortraitProfile|null;
  declare createPortrait: ((side: "left" | "right", step: TouhouDialogueStep, dialogue: TouhouDialogue) => TouhouDialoguePortrait | null)|null;
  declare customPortraits:Partial<Record<'left'|'right',TouhouDialoguePortrait>>;
  declare portraitPresence:Partial<Record<'left'|'right',boolean>>;
  declare portraitStep:TouhouDialogueStep|null;
  declare texts:AnmInstance[];
  declare box:AnmInstance|null|undefined;
  declare pages:string[][];
  declare portrait:AnmInstance|null|undefined;
  declare portraitMotion:AnmInstance|null|undefined;
  declare rightPortraitBank:AnmBank|null|undefined;
  declare rightPortraitMotion:AnmInstance|null|undefined;
  declare resources: TouhouResources;
  declare steps: TouhouDialogueStep[];
  declare character: string | number;
  declare codePage: number;
  declare onEvent: (((event: TouhouDialogueEvent, step: TouhouDialogueStep, dialogue: TouhouDialogue) => void) | undefined);
  declare onComplete: (((dialogue: TouhouDialogue) => void) | undefined);
  declare onExitHandoff: (((dialogue: TouhouDialogue) => void) | undefined);
  declare drawPortrait: (((draw: DrawList, step: TouhouDialogueStep, dialogue: TouhouDialogue, view: AnmView) => void | false) | undefined);
  declare charsPerFrame: number;
  declare skipMask: number;
  declare skipHoldFrames: number;
  declare maxLineBytes: number;
  declare speakerNames: { left?: string; right?: string; };
  declare textColor: number;
  declare stepEntranceTiming:Readonly<TouhouDialogueEntranceTiming>|null;
  declare displayStep: null | TouhouDialogueStep;
  declare front: AnmBank;
  declare textBank: AnmBank;
  declare portraitBank: AnmBank | null;
  declare buttons: TouhouButtons;
  declare queue: TouhouRenderQueue;
  declare disposed: boolean;
  declare startDelay: number;
  declare page: number;
  declare cold: number;
  declare auto: number;
  declare textAge: number;
  declare shownCharacters: number;
  declare lines: string[];
  declare boxType: number;
  declare mode: number;
  declare boxWidth: number;

  declare readonly playerPortrait: Readonly<TouhouDialoguePlayerPortrait>;
  declare readonly entranceTiming: Readonly<TouhouDialogueEntranceTiming>|null;
  declare entranceState: TouhouDialogueEntranceState|null;
  declare readonly exitTiming: Readonly<Required<TouhouDialogueExitTiming>>|null;
  declare exitState: TouhouDialogueExitState|null;
  declare complete: boolean;
  declare current: TouhouDialogueStep|null;
  declare index: number;
  declare age: number;

  constructor({resources,steps=[],character=0,codePage=932,onEvent,onComplete,onExitHandoff,drawPortrait,charsPerFrame=Infinity,
    startDelayFrames=0,entrance=null,exit=null,skipMask=Keys.FOCUS,skipHoldFrames=20,maxLineBytes=40,speakerNames={},textColor=0x000000,playerPortrait={},
    portraitProfiles={},createPortrait=null}: TouhouDialogueOptions={} as TouhouDialogueOptions){
    if(!resources?.createBank)throw new TypeError('TouhouDialogue requires public Touhou resources');
    this.playerProfile=portraitProfiles[character]??defaultPortraitProfiles[character]??null;
    if(!this.playerProfile&&!createPortrait)throw new TypeError('Custom dialogue character requires a portrait profile or factory');
    if(createPortrait!==null&&typeof createPortrait!=='function')throw new TypeError('Dialogue portrait factory must be a function');
    this.createPortrait=createPortrait;this.customPortraits={};this.portraitPresence={};
    this.playerPortrait=Object.freeze({x:playerPortrait.x??this.playerProfile?.x??0,y:playerPortrait.y??this.playerProfile?.y??0,height:playerPortrait.height??this.playerProfile?.height??1});
    if(!Number.isFinite(this.playerPortrait.x)||!Number.isFinite(this.playerPortrait.y)||!Number.isFinite(this.playerPortrait.height)||this.playerPortrait.height<=0)
      throw new RangeError('Player portrait layout requires finite x/y and positive height');
    Object.assign(this,{resources,steps,character,codePage,onEvent,onComplete,onExitHandoff,drawPortrait,charsPerFrame,skipMask,skipHoldFrames,maxLineBytes,speakerNames,textColor});
    this.entranceTiming=entranceTiming(entrance);this.stepEntranceTiming=null;this.entranceState=null;
    this.exitTiming=exitTiming(exit);this.exitState=null;this.displayStep=null;this.portraitStep=null;
    this.front=resources.createBank('front');this.textBank=resources.createBank('text');this.portraitBank=this.playerProfile&&!createPortrait?resources.createBank(this.playerProfile!.bank):null;
    this.buttons=new TouhouButtons();this.queue=new TouhouRenderQueue();this.age=0;this.index=-1;this.current=null;this.complete=false;this.disposed=false;
    this.startDelay=Math.max(0,startDelayFrames|0);this.page=0;this.cold=0;this.auto=0;this.textAge=0;this.shownCharacters=0;
    this.texts=[];for(let pair=0;pair<2;pair++)for(let line=0;line<2;line++){
      const vm=this.textBank.create(20+pair);if(line)vm.interruptNow(7);vm.flag(0x400,0);this.texts.push(vm);
    }
    if(!this.startDelay)this._enter(0);
  }
  get active(): boolean{return !this.complete&&!this.disposed;}
  get alive(): boolean{return this.active;}
  get exiting(): boolean{return !!this.exitState&&this.active;}
  _enter(index: number){
    this.index=index;this.current=this.steps[index]??null;
    if(!this.current){this._finish();return;}
    const step=this.current;this.cold=step.coldFrames??0;this.auto=step.autoFrames??500;this.page=0;
    if(step.terminal&&this.exitTiming){
      // Terminal business events still run once and in order. Do not reset
      // the last speaking pose just before sending the source exit signal.
      for(const event of step.events??[])this.onEvent?.(event,step,this);
      this._finish();return;
    }
    this.displayStep=step;
    if(step.boxMode!==undefined&&![0,1,2].includes(step.boxMode))throw new RangeError('Dialogue box mode must be 0, 1 or 2');
    const timing=step.entrance===undefined?(index===0?this.entranceTiming:null):entranceTiming(step.entrance);
    this.stepEntranceTiming=timing;
    if(timing&&!step.terminal){
      // An authored MSG-style wait may occur after another speaker as well.
      // Retire the old balloon and hide text until this step's reveal cue.
      if(this.box){this.box.destroy();this.box=null;}this.lines=[];this.pages=[];
      for(const vm of this.texts)if(vm.alive)vm.interruptNow(3);
      this.cold=0;this.entranceState={frame:0,portraits:false,speaker:false,text:false,inputReady:false};
      for(const event of step.events??[])if(!['portraits','speaker','text'].includes(eventEntranceStage(event)))
        throw new RangeError('Dialogue entrance event stage must be portraits, speaker or text');
      this._advanceEntrance();return;
    }
    this.entranceState=null;
    this._createPortraits(step);this._activateSpeaker(step);
    // All source side effects occur in source order. Completion is delivered
    // after the whole step, including BGM calls that follow Destroy() in C++.
    for(const event of step.events??[])this.onEvent?.(event,step,this);
    if(step.terminal){this._finish();return;}
    this._showStepText(step);
  }
  _setPortraitPresence(side:'left'|'right',present:boolean|undefined){
    if(present===undefined||this.portraitPresence[side]===present)return;
    const previous=this.portraitPresence[side];this.portraitPresence[side]=present;
    if(this.customPortraits[side]){this.customPortraits[side]!.setPresent?.(present,this);return;}
    if(!present){
      // MSG4/5 are pending exits. Keep their original ANM tails alive, and
      // do not reactivate them through a later speaker/emotion instruction.
      if(side==='left')this.portrait?.interrupt(1,true);else this.rightPortraitMotion?.interrupt(1,true);
    }else if(previous===false){
      // Re-entry is a fresh template, even when the previous tail is alive.
      if(side==='left'){this.portrait?.destroy();this.portraitBank?.collect();this.portrait=null;this.portraitMotion=null;}
      else{this.rightPortraitBank?.dispose();this.rightPortraitBank=null;this.rightPortraitMotion=null;}
    }
  }
  _createPortraits(step: TouhouDialogueStep){
    this.portraitStep=step;
    for(const side of ['left','right'] as const)this._setPortraitPresence(side,step.portraits?.[side]?.present);
    for(const side of ['left','right'] as const)if(step.portraits?.[side]?.present&&!this.customPortraits[side]&&this.createPortrait){
      const portrait=this.createPortrait(side,step,this);
      if(portrait){if(typeof portrait.draw!=='function')throw new TypeError('Dialogue portrait must implement draw');this.customPortraits[side]=portrait;portrait.setPresent?.(true,this);}
    }
    if(step.portraits?.left?.present&&!this.customPortraits.left&&!this.playerProfile)throw new TypeError('Missing custom left dialogue portrait');
    if(step.portraits?.left?.present&&!this.customPortraits.left&&!this.portrait?.alive){
      this.portraitBank??=this.resources.createBank(this.playerProfile!.bank);
      this.portrait=this.portraitBank.create(this.playerProfile!.root);this.portraitMotion=find(this.portrait,this.playerProfile!.body);
    }
    if(this.portrait&&this.portraitPresence.left!==false)this.portrait.interruptNow(TOUHOU_DIALOGUE_EXPRESSIONS[(step.portraits?.left?.emotion??step.emotion) as string]??17,true);
    for(const side of ['left','right'] as const)if(this.portraitPresence[side]!==false)this.customPortraits[side]?.setStep?.(step,this);
    if(step.portraits?.right?.present&&!this.customPortraits.right&&!this.rightPortraitMotion?.alive){this.rightPortraitBank?.dispose();this._createRightPortrait();}
  }
  _activateSpeaker(step: TouhouDialogueStep){
    const active=(side:'left'|'right')=>step.boxMode!==2&&step.speaker===side;
    if(this.portraitPresence.left!==false)this.portrait?.interruptNow(active('left')?2:3,true);
    if(this.portraitPresence.right!==false)this.rightPortraitMotion?.interruptNow(active('right')?2:3);
    for(const side of ['left','right'] as const)if(this.portraitPresence[side]!==false)this.customPortraits[side]?.setActive?.(active(side),this);
  }
  _advanceEntrance(){
    const state=this.entranceState!,timing=this.stepEntranceTiming!,step=this.current!;
    for(const [stage,key,action] of [['portraits','portraitFrame',()=>this._createPortraits(step)],
      ['speaker','speakerFrame',()=>this._activateSpeaker(step)],['text','textFrame',()=>this._showStepText(step)]] as const){
      if(state[stage]||state.frame<timing[key])continue;
      state[stage]=true;action();
      for(const event of step.events??[])if(eventEntranceStage(event)===stage)this.onEvent?.(event,step,this);
    }
    state.inputReady=state.frame>=timing.inputFrame;
  }
  _showStepText(step: TouhouDialogueStep){
    const label=step.speaker==='right'&&!this.drawPortrait?this.speakerNames.right:null;
    const text=(label?`${label}: `:'')+(step.text??'');this.lines=wrapTouhouDialogue(text,this.resources.encodeText.bind(this.resources),{codePage:this.codePage,maxBytes:this.maxLineBytes});
    this.pages=[];for(let i=0;i<this.lines.length;i+=2)this.pages.push(this.lines.slice(i,i+2));this._showPage();
  }
  _showPage(){
    this.textAge=0;this.shownCharacters=this.charsPerFrame===Infinity?Infinity:0;
    const lines=this.pages[this.page]??[''],mode=this.current!.boxMode??(this.current!.speaker==='left'?0:1),type=(this.current!.boxStyle??0)*3+mode+(lines.length>1?24:0);
    this.box?.destroy();this.boxType=type;this.mode=mode;
    const bytes=Math.max(...lines.map((line)=>this.resources.encodeText(line,this.codePage).length));
    this.boxWidth=f32(Math.max(0,((bytes&0x1ffffffe)*8-24)*2));
    // MSG28 doubles its 640x480 screen coordinates before creating the ANM.
    // st01m0 baseline speaker anchors: (116,240) and (360,240).
    this.box=this.front.create(270+type,{x:this.current!.x??(mode===0?232:720),y:this.current!.y??480});for(const child of children(this.box))child.F(0x454,add(this.boxWidth,16));
    for(const vm of this.texts)vm.interruptNow(3);
    this._writePage(true);this._positionText();
  }
  _writePage(reveal=false){
    const lines=this.pages[this.page],available=this.shownCharacters;let consumed=0;
    for(let i=0;i<2;i++){
      const vm=this.texts[i],characters=Array.from(lines[i]??''),count=available===Infinity?characters.length:Math.max(0,Math.min(characters.length,available-consumed));consumed+=characters.length;
      this.resources.writeAnimationText(vm,characters.slice(0,count).join(''),{font:4,color:this.textColor,shadowColor:0x20000000,outlineScale:f32(.6000000238418579),codePage:this.codePage});
      if(reveal&&lines[i]!==undefined)vm.interruptNow(2);
    }
  }
  _positionText(){
    const child=find(this.box,166+this.boxType);if(!child)return;
    const p=child.worldPosition({screenScale:1}),sx=child.scaleX;
    let x=mul(p.x,2),y=mul(p.y,2);
    if(this.mode===0)x=add(x,-36);else if(this.mode===1)x=add(add(mul(sx>=1?1:add(sx,.125),32),-6),x);
    else x=add(add(mul(add(sx,.125),16),-6),x);
    for(const vm of this.texts){vm.x=x;vm.y=y;}
  }
  advance(): boolean{
    if(!this.active||this.exiting||this.startDelay||this.cold||this.entranceState&&!this.entranceState.inputReady)return false;
    const total=(this.pages[this.page]??[]).reduce((sum: number,line: Iterable<unknown>|ArrayLike<unknown>)=>sum+Array.from(line).length,0);
    if(this.shownCharacters<total){this.shownCharacters=Infinity;this._writePage();return true;}
    if(this.page+1<this.pages.length){this.page++;this.cold=2;this.auto=500;this._showPage();}
    else this._enter(this.index+1);return true;
  }
  update(mask: number=0): void{
    if(!this.active)return;this.age++;this.buttons.update(mask);
    if(this.startDelay){if(--this.startDelay===0)this._enter(0);return;}
    const hadText=!!this.box;
    this.front.update();this.textBank.update();this.portraitBank?.update();this.rightPortraitBank?.update();
    for(const portrait of Object.values(this.customPortraits))portrait.update?.(this);
    if(this.exiting){this.exitState!.frame++;this._runExitCues();return;}
    if(this.entranceState&&!this.entranceState.inputReady){this.entranceState.frame++;this._advanceEntrance();}
    this._positionText();if(!this.box)return;
    if(hadText)this.textAge++;
    if(this.shownCharacters!==Infinity){const next=Math.floor(this.textAge*this.charsPerFrame);if(next!==this.shownCharacters){this.shownCharacters=next;this._writePage();}}
    if(this.entranceState&&!this.entranceState.inputReady)return;
    // Rush-style source cold/automatic counters are supplied by the adapter;
    // the original Touhou held-key gate remains available as a reusable policy.
    if(this.cold>0){this.cold--;return;}
    let held=0;for(let bit=0;bit<32;bit++)if((this.skipMask&(1<<bit))!==0)held=Math.max(held,this.buttons.held[bit]);
    if((this.buttons.pressed&(Keys.SHOOT|Keys.CONFIRM))||held>=this.skipHoldFrames||this.auto===0)this.advance();else if(this.auto>0)this.auto--;
  }
  _createRightPortrait(){
    // st01enm:10 uses the same common 15-frame portrait script as pl00:62:
    // mirrored entrance/inactive/exit X, Y-20, and a parent X=496. Its speaking
    // shake keeps the original signed offsets. This private bank supplies only
    // the motion clock; business skins never enter the public resource pack.
    const bank=this.rightPortraitBank=this.resources.createBank('pl00');bank.scripts=bank.scripts.slice();
    let event=0;
    const source=bank.scripts[62];bank.scripts[62]={...source,instructions:source.instructions.map(ins=>{
      if(ins.opcode===5)event=ins.args[0];
      if(ins.opcode!==400&&ins.opcode!==407)return ins;
      const args=ins.args.slice(),offset=ins.opcode===400?0:2;
      const x=floatArgument(args[offset]),y=floatArgument(args[offset+1]);
      args[offset]=floatWord(event===7?x:-x);args[offset+1]=floatWord(y-20);return{...ins,args};
    })};
    this.rightPortraitMotion=bank.create(62,{x:496,front:true});
  }
  /** Full-screen source ANMs never inherit the playfield's x/y offset. */
  portraitView(view: AnmView={scale:1.5,screenScale:1}): AnmView{
    return{x:0,y:0,scale:1,screenScale:(view.scale??1)*(view.screenScale??1)};
  }
  portraitState(side: 'left'|'right'='left'): TouhouDialoguePortraitState|null{
    if(this.customPortraits[side]){
      const portrait=this.customPortraits[side]!;
      if(this.portraitPresence[side]===false&&!portrait.setPresent)return null;
      return portrait.state?.(this)??null;
    }
    const vm=side==='right'?this.rightPortraitMotion:this.portraitMotion;
    if(!vm?.alive)return null;const position=vm.worldPosition({screenScale:1}),profile=side==='right'?TOUHOU_DIALOGUE_PORTRAITS.right:this.playerProfile!;
    return{x:position.x,y:position.y,width:profile.width,height:profile.height,color:vm.color,alpha:vm.alpha,layer:vm.layer};
  }
  _drawDefaultPortrait(queue: TouhouRenderQueue,view: AnmView){
    if(!this.portrait?.alive)return;
    const layout=this.playerPortrait,profile=this.playerProfile!,ratio=layout.height/profile.height,s=(view.scale??1)*(view.screenScale??1);
    const sourceView={x:(layout.x-profile.x*ratio)*s,y:(layout.y-profile.y*ratio)*s,scale:ratio,screenScale:s};
    this.portrait.draw(queue,sourceView);
  }
  draw(draw: DrawList,view: AnmView={x:336,y:24,scale:1.5,screenScale:1}): void{
    const waitingPortraits=this.entranceState&&!this.entranceState.portraits;
    if(!this.active||this.startDelay||(waitingPortraits||this.exiting)&&!this.portraitStep)return;
    // A later MSG wait gates the new portrait cues, not a body/tail already
    // on screen. Keep its previous business skin until the new cues run.
    const step=this.exiting||waitingPortraits?this.portraitStep!:this.current!;
    const queue=this.queue.reset(),screenView=this.portraitView(view);let keepDefault=!this.drawPortrait;
    if(this.drawPortrait)queue.enqueue(this.rightPortraitMotion?.layer??35,target=>{
      keepDefault=this.drawPortrait!(target,step,this,screenView)===false;
    },{order:this.rightPortraitMotion?.renderOrder??Infinity});
    if(keepDefault)this._drawDefaultPortrait(queue,view);
    for(const [side,portrait]of Object.entries(this.customPortraits) as Array<['left'|'right',TouhouDialoguePortrait]>){
      if(this.portraitPresence[side]===false&&!portrait.setPresent)continue;
      queue.enqueue(this.portraitState(side)?.layer??35,target=>portrait.draw(target,step,this,screenView));
    }
    this.front.draw(queue,screenView);this.textBank.draw(queue,screenView);queue.flush(draw);
  }
  /** Graceful close uses the configured original exit; dispose() remains the
   * immediate resource-release path for abandoning or replacing a scene. */
  finish(): this{this._finish();return this;}
  _finish(){
    if(!this.active||this.exitState)return;
    if(!(this as {exitTiming:Readonly<Required<TouhouDialogueExitTiming>>|null}).exitTiming||!this.displayStep){this.complete=true;this.onComplete?.(this);return;}
    this.exitState={frame:0,handedOff:false};this.startDelay=0;this.cold=0;this.entranceState=null;
    // MSG4/5 use pending recursive interrupt1, not immediate destruction.
    // Bodies/expressions slide and fade for30 frames using their source ANMs.
    if(this.portraitPresence.left!==false)this.portrait?.interrupt(1,true);
    if(this.portraitPresence.right!==false)this.rightPortraitMotion?.interrupt(1,true);
    for(const portrait of Object.values(this.customPortraits))portrait.finish?.(this);
    // MSG6 clear_dialogue_text(false): blank the text surfaces, interrupt1
    // for their8-frame retirement, and delete the bubble tree. Its5-frame
    // optional fade is not requested by this source MSG ending sequence.
    for(let index=0;index<this.texts.length;index++){
      const vm=this.texts[index];if(!vm.alive)continue;
      this.resources.writeAnimationText(vm,'                                                                     ',
        {font:index<2?11:18,color:0,shadowColor:0x20ffffff,codePage:this.codePage});
      vm.interrupt(1,true);
    }
    this.box?.destroy();this.box=null;this._runExitCues();
  }
  _runExitCues(){
    const state=this.exitState!,timing=this.exitTiming!;
    if(timing.handoffFrame!==null&&!state.handedOff&&state.frame>=timing.handoffFrame){
      state.handedOff=true;this.onExitHandoff?.(this);
    }
    if(this.disposed)return;
    if(state.frame>=timing.completeFrame){this.complete=true;this.onComplete?.(this);}
  }
  snapshot(): {active:boolean;complete:boolean;index:number;page:number;age:number;coldFrames:number;autoFrames:number;speaker?:string;text?:string;lines:string[];boxScript:number|null;entrance?:TouhouDialogueEntranceState;exit?:TouhouDialogueExitState}{return{active:this.active,complete:this.complete,index:this.index,page:this.page,age:this.age,coldFrames:this.cold,autoFrames:this.auto,speaker:this.current?.speaker,text:this.current?.text,lines:this.pages?.[this.page]??[],boxScript:this.box?.scriptId??null,
    ...(this.entranceState?{entrance:{...this.entranceState}}:{}),...(this.exitState?{exit:{...this.exitState}}:{})};}
  dispose(): void{if(this.disposed)return;this.disposed=true;this.front.dispose();this.textBank.dispose();this.portraitBank?.dispose();this.rightPortraitBank?.dispose();for(const portrait of Object.values(this.customPortraits))portrait.dispose?.();this.customPortraits={};}
}
