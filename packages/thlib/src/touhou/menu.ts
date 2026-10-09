import type {AnmBank,AnmInstance} from './anm.js';
import type {AnmDrawList as DrawList} from './anm.js';
import type {TouhouBitmapFont} from './font.js';

export interface TouhouMenuBackground {textureId:number|null;update():void;drawCapture?(draw:DrawList):void;draw(draw:DrawList):void;destroy?():void;}

export type TouhouSelectionId=string|number;

export type TouhouSelectionStep='difficulty'|'character';

export interface TouhouSelectionEntry {id:TouhouSelectionId;label?:string;[key:string]:unknown;}

export interface TouhouSelectionPage {
 draw(draw:DrawList,menu:TouhouTitleMenu):void;update?(mask:number,menu:TouhouTitleMenu):void;
 onSelectionChange?(id:TouhouSelectionId,menu:TouhouTitleMenu):void;destroy?():void;
}

export interface TouhouStartSelection {character:TouhouSelectionId;difficulty:TouhouSelectionId;mode:string;}

export interface TouhouTitleMenuOptions {
 bank:AnmBank;decorationBank?:AnmBank;font:TouhouBitmapFont;background?:TouhouMenuBackground;
 labels?:readonly string[];excluded?:number[];difficulty?:TouhouSelectionId;character?:TouhouSelectionId;
 onSelect?:(index:number,menu:TouhouTitleMenu)=>void;onStart?:(selection:TouhouStartSelection)=>void;sound?:(id:number)=>void;
 scripts?:Record<number,number|false>;childScripts?:Record<number,number>;startModes?:Record<number,string>;quitIndex?:number;
 layout?:{font?:number;x?:number;y?:number;lineHeight?:number};disposeBanks?:boolean;disposeBackground?:boolean;
 difficulties?:readonly (TouhouSelectionId|TouhouSelectionEntry)[];characters?:readonly (TouhouSelectionId|TouhouSelectionEntry)[];
 /** Omit a page to skip it. The mode callback supports e.g. an Extra route without a difficulty page. */
 selectionFlow?:readonly TouhouSelectionStep[]|((mode:string,menu:TouhouTitleMenu)=>readonly TouhouSelectionStep[]);
 /** Required for IDs outside the source 0..3 difficulties and 0..1 characters. Null uses the source ANMs. */
 createSelectionPage?:((kind:TouhouSelectionStep,menu:TouhouTitleMenu)=>TouhouSelectionPage|null)|null;
}

// Original main/difficulty/character selection states with injectable actions.
// Source: title_system/{main_menu,difficulty,character,draw_main}.cpp.
import { Keys,RepeatingInput } from '../index.js';
import { add,div } from './math.js';
import {TouhouRenderQueue} from './render-queue.js';

/** Input edge and repeat cadence from input/input_state.cpp, independent of key mapping. */
export class TouhouButtons extends RepeatingInput {
  declare count8: Uint32Array;
  declare count12: Uint32Array;

  constructor(){
    super({delay:25,channels:{repeat8:{interval:8},repeat12:{interval:12}},defaultChannel:'repeat8'});
    this.count8=this.channels.repeat8.counters;this.count12=this.channels.repeat12.counters;
  }
  get repeat8(): number{return this.channels.repeat8.mask;}set repeat8(mask){this.channels.repeat8.mask=mask|0;}
  get repeat12(): number{return this.channels.repeat12.mask;}set repeat12(mask){this.channels.repeat12.mask=mask|0;}
}
export const TOUHOU_MAIN_LABELS: readonly string[]=Object.freeze(['Game Start','Extra Start','Practice','Spell Practice','Replay','Player Data','Music Room','Option','Manual','Quit']);
const entries=(values:readonly (TouhouSelectionId|TouhouSelectionEntry)[],name:string):TouhouSelectionEntry[]=>{
  if(!Array.isArray(values as unknown)||!values.length)throw new TypeError(`${name} requires a nonempty selection list`);
  const result=values.map(value=>typeof value==='object'&&value!==null?{...value}:{id:value});
  if(result.some(value=>!['string','number'].includes(typeof value.id))||new Set(result.map(value=>value.id)).size!==result.length)
    throw new TypeError(`${name} requires unique string or number IDs`);
  return result;
};
export function touhouMenuStyle(index: number,selected: number,{excluded=false,flash=0,jitter=0}: {excluded?:boolean;flash?:number;jitter?:number}={}): {color:number;shadowColor:number;offset:number} {
  if(excluded)return {color:0xff808080,shadowColor:0x40ffffff,offset:0};
  if(index!==selected)return {color:0xff608080,shadowColor:0xff404040,offset:0};
  const displacement=[2,-1,0,3,-3,2,-2,0,2];
  return {color:flash&&flash%4<2?0xff000000:0xff80ffff,shadowColor:!flash?0xff000000:flash%4<2?0xffffff80:0xffffffff,offset:jitter>0?div(displacement[jitter],2):0};
}

export class TouhouTitleMenu {
  declare bank: AnmBank;
  declare decorationBank: AnmBank | undefined;
  declare font: TouhouBitmapFont;
  declare background: TouhouMenuBackground | undefined;
  declare labels: string[];
  declare excluded: Set<number>;
  declare onSelect: (((index: number, menu: TouhouTitleMenu) => void) | undefined);
  declare onStart: (((selection: TouhouStartSelection) => void) | undefined);
  declare sound: (((id: number) => void) | undefined);
  declare renderQueue: TouhouRenderQueue;
  declare scripts: Record<number, number | false>;
  declare childScripts: Record<number, number>;
  declare startModes: Record<number, string>;
  declare quitIndex: number;
  declare layout: { font: number; x: number; y: number; lineHeight: number; };
  declare disposeBanks: boolean;
  declare disposeBackground: boolean;
  declare destroyed: boolean;
  declare selectionAge: number;
  declare flashAge: number;
  declare selectionFlow: (readonly TouhouSelectionStep[] | ((mode: string, menu: TouhouTitleMenu) => readonly TouhouSelectionStep[]));
  declare createSelectionPage: ((kind:TouhouSelectionStep,menu:TouhouTitleMenu)=>TouhouSelectionPage|null)|null;
  declare flow:TouhouSelectionStep[];
  declare handles:Map<number,AnmInstance>;
  declare selectionPage:TouhouSelectionPage|null;
  declare decoration:AnmInstance|undefined;
  declare mode:string;
  declare flowIndex: number;

  declare state: string;
  declare phase: number;
  declare age: number;
  declare selection: number;
  declare difficulty: TouhouSelectionId;
  declare character: TouhouSelectionId;
  declare finished: boolean;
  declare buttons: TouhouButtons;
  declare difficulties: TouhouSelectionEntry[];
  declare characters: TouhouSelectionEntry[];

  constructor({bank,decorationBank,font,background,labels=TOUHOU_MAIN_LABELS,excluded=[1],difficulty=1,character=0,onSelect,onStart,sound,
    scripts={},childScripts={},startModes={0:'normal',2:'practice'},quitIndex=labels.length-1,
    layout={font:7,x:186,y:230,lineHeight:23},disposeBanks=false,disposeBackground=false,
    difficulties=[0,1,2,3],characters=[0,1],selectionFlow=['difficulty','character'],createSelectionPage=null}: TouhouTitleMenuOptions={} as TouhouTitleMenuOptions) {
    Object.assign(this,{bank,decorationBank,font,background,labels:[...labels],excluded:new Set(excluded),difficulty,character,onSelect,onStart,sound});this.renderQueue=new TouhouRenderQueue();
    Object.assign(this,{scripts,childScripts,startModes,quitIndex,layout:{font:7,x:186,y:230,lineHeight:23,...layout},disposeBanks,disposeBackground});this.destroyed=false;
    this.buttons=new TouhouButtons();this.handles=new Map();this.state='main';this.phase=1;this.age=0;this.selection=0;this.selectionAge=0;this.flashAge=0;this.finished=false;
    this.difficulties=entries(difficulties,'Difficulty');this.characters=entries(characters,'Character');
    this.selectionFlow=selectionFlow;this.createSelectionPage=createSelectionPage;this.selectionPage=null;this.flow=['difficulty','character'];this.flowIndex=0;
    if(createSelectionPage!==null&&typeof createSelectionPage!=='function')throw new TypeError('Selection page factory must be a function');
    if(!createSelectionPage&&Array.isArray(selectionFlow)&&((selectionFlow.includes('difficulty')&&this.difficulties.some(v=>![0,1,2,3].includes(v.id as number)))||(selectionFlow.includes('character')&&this.characters.some(v=>![0,1].includes(v.id as number)))))
      throw new TypeError('Custom selection entries require an explicit createSelectionPage presentation');
    this.spawn(0);this.spawn(31);
  }
  spawn(script: number){const mapped=this.scripts[script]??script;if(mapped===false)return null;const vm=this.bank.create(mapped);this.handles.set(script,vm);return vm;}
  signal(script: number,event: number,recursive=false,immediate=true){const vm=this.handles.get(script);if(vm){if(immediate)vm.interruptNow(event,recursive);else vm.interrupt(event,recursive);}}
  child(script:number,id:number):AnmInstance|null{id=this.childScripts[id]??id;const walk=(vm:AnmInstance):AnmInstance|null=>{for(const child of vm.children){if(child.scriptId===id)return child;const found=walk(child);if(found)return found;}return null;};const vm=this.handles.get(script);return vm?walk(vm):null;}
  childSignal(script: number,id: number,label: number,immediate=false){const vm=this.child(script,id);if(vm){if(immediate)vm.interruptNow(label,true);else vm.interrupt(label,true);}}
  childVisible(script: number,id: number,visible: boolean){const vm=this.child(script,id);if(vm){const show=(n:AnmInstance):void=>{n.flag(1,visible?1:0);for(const c of n.children)show(c);};show(vm);}}
  phaseTo(phase: number){this.phase=phase;this.age=0;}
  get selectionEntries(): TouhouSelectionEntry[]{return this.state==='difficulty'?this.difficulties:this.characters;}
  get selectedId(): TouhouSelectionId{return this.selectionEntries[this.selection]?.id;}
  _closeSelectionPage(){this.selectionPage?.destroy?.();this.selectionPage=null;}
  _preparePage(kind:TouhouSelectionStep){
    this._closeSelectionPage();this.state=kind;this.selection=Math.max(0,this.selectionEntries.findIndex(entry=>entry.id===this[kind]));this.phaseTo(1);
    this.selectionPage=this.createSelectionPage?.(kind,this)??null;
    if(this.selectionPage&&typeof this.selectionPage.draw!=='function')throw new TypeError('Selection presentation must implement draw');
    const builtin=kind==='difficulty'?[0,1,2,3]:[0,1];
    if(!this.selectionPage&&this.selectionEntries.some(entry=>!builtin.includes(entry.id as number)))throw new TypeError(`Missing custom ${kind} selection presentation`);
    return !!this.selectionPage;
  }
  _openFlow(index: number){
    this.flowIndex=index;
    if(index<0){this.returnMain();return;}
    const page=this.flow[index];if(page==='difficulty')this.openDifficulty();else if(page==='character')this.openCharacter();
    else{this._closeSelectionPage();this.finished=true;this.onStart?.({character:this.character,difficulty:this.difficulty,mode:this.mode});}
  }
  _startSelection(){
    const flow=typeof this.selectionFlow==='function'?this.selectionFlow(this.mode,this):this.selectionFlow;
    if(!Array.isArray(flow)||flow.some(page=>page!=='difficulty'&&page!=='character')||new Set(flow).size!==flow.length)
      throw new TypeError('Selection flow must contain unique difficulty/character pages');
    this.flow=[...flow];this._openFlow(0);
  }
  _customPage(){
    const b=this.buttons,page=this.selectionPage!;
    if(this.phase===1&&this.age>6)this.phaseTo(2);
    else if(this.phase===2){
      let moved=false;if(b.repeat(Keys.UP|Keys.LEFT))moved=this.move(-1,this.selectionEntries.length)||moved;
      if(b.repeat(Keys.DOWN|Keys.RIGHT))moved=this.move(1,this.selectionEntries.length)||moved;
      if(moved){this.sound?.(10);page.onSelectionChange?.(this.selectedId,this);}
      if(b.pressed&(Keys.BOMB|Keys.CANCEL|Keys.PAUSE)){this.phaseTo(4);this.sound?.(9);}
      else if(b.pressed&(Keys.SHOOT|Keys.CONFIRM)){this.phaseTo(3);this.sound?.(7);}
    }else if(this.phase===3&&this.age>=14){this[this.state as TouhouSelectionStep]=this.selectedId;this._openFlow(this.flowIndex+1);}
    else if(this.phase===4&&this.age>=6)this._openFlow(this.flowIndex-1);
  }
  move(delta: number,count: number,wrap=true){const old=this.selection;let next=old;for(let i=0;i<count;i++){next=wrap?(next+delta+count)%count:Math.max(0,Math.min(count-1,next+delta));if(this.state!=='main'||!this.excluded.has(next))break;}this.selection=next;return next!==old;}
  main(){
    const b=this.buttons,confirm=!!(b.pressed&(Keys.SHOOT|Keys.CONFIRM)),cancel=!!(b.pressed&(Keys.BOMB|Keys.CANCEL|Keys.PAUSE));
    if(this.phase===1){if(this.age===120&&this.decorationBank)this.decoration=this.decorationBank.create(0);if(this.age>130)this.phaseTo(2);}
    else if(this.phase===2){
      let moved=false;if(b.repeat(Keys.UP))moved=this.move(-1,this.labels.length)||moved;if(b.repeat(Keys.DOWN))moved=this.move(1,this.labels.length)||moved;
      if(moved){this.sound?.(10);this.selectionAge=8;}
      if(cancel){this.sound?.(9);if(this.selection===this.quitIndex)this.phaseTo(4);else this.selection=this.quitIndex;}
      if(confirm&&!this.excluded.has(this.selection)){this.flashAge=30;this.sound?.(this.selection===this.quitIndex?9:7);this.signal(31,1,true,false);this.decoration?.interrupt(1,true);this.phaseTo(4);}
    }else if(this.phase===4&&this.age>=20){
      if(this.startModes[this.selection]!==undefined&&this.onStart){this.mode=this.startModes[this.selection];this.signal(0,3);this._startSelection();}
      else {this.finished=true;this.onSelect?.(this.selection,this);}
    }
  }
  openDifficulty(){
    this.flowIndex=Math.max(0,this.flow.indexOf('difficulty'));
    if(this._preparePage('difficulty'))return;this.spawn(58);this.signal(58,3);this.signal(58,(this.selectedId as number)+13,true,false);this.spawn(34);
    for(let i=17;i<21;i++)this.childVisible(58,i,false);
  }
  difficultyPage(){
    const b=this.buttons;
    if(this.phase===1&&this.age>6)this.phaseTo(2);
    else if(this.phase===2){
      let moved=false;if(b.repeat(Keys.UP|Keys.LEFT))moved=this.move(-1,this.difficulties.length,false)||moved;if(b.repeat(Keys.DOWN|Keys.RIGHT))moved=this.move(1,this.difficulties.length,false)||moved;
      if(moved){this.sound?.(10);this.signal(58,3);this.signal(58,(this.selectedId as number)+7,true,false);}
      if(b.pressed&(Keys.BOMB|Keys.CANCEL|Keys.PAUSE)){this.phaseTo(4);this.sound?.(9);this.signal(58,1,true,false);}
      else if(b.pressed&(Keys.SHOOT|Keys.CONFIRM)){this.signal(58,6,true,false);this.childSignal(58,(this.selectedId as number)+48,2);this.phaseTo(3);this.sound?.(7);}
    }else if(this.phase===3&&this.age>=14){this.signal(34,1,true,false);this.difficulty=this.selectedId;this._openFlow(this.flowIndex+1);}
    else if(this.phase===4&&this.age>=6){this.signal(34,1,true,false);this._openFlow(this.flowIndex-1);}
  }
  openCharacter(){
    this.flowIndex=Math.max(0,this.flow.indexOf('character'));
    if(this._preparePage('character'))return;this.spawn(35);this.spawn(12);this.signal(12,3);this.signal(12,(this.selectedId as number)+7,true,false);
    this.childVisible(12,15,false);this.childVisible(12,16,false);
  }
  characterPage(){
    const b=this.buttons;
    if(this.phase===1&&this.age>6){this.phaseTo(2);this.childSignal(12,6,37,true);this.childSignal(12,7,37,true);}
    else if(this.phase===2){
      if(b.repeat(Keys.LEFT)){this.sound?.(10);this.signal(12,(this.selectedId as number)+25,true);this.move(-1,this.characters.length);this.signal(12,(this.selectedId as number)+13,true,false);}
      if(b.repeat(Keys.RIGHT)){this.sound?.(10);this.signal(12,(this.selectedId as number)+19,true);this.move(1,this.characters.length);this.signal(12,(this.selectedId as number)+7,true,false);}
      if(b.pressed&(Keys.SHOOT|Keys.CONFIRM)){for(const child of [(this.selectedId as number)+6,(this.selectedId as number)+8,4,5])this.childSignal(12,child,6);this.sound?.(7);this.phaseTo(3);}
      else if(b.pressed&(Keys.BOMB|Keys.CANCEL|Keys.PAUSE)){this.phaseTo(4);this.sound?.(9);}
    }else if(this.phase===3&&this.age>=14){
      this.character=this.selectedId;this.signal(12,6,true,false);this.signal(35,1,true);
      // The original proceeds to stone selection here. The engine application
      // instead receives the chosen base character, as explicitly requested.
      this._openFlow(this.flowIndex+1);
    }else if(this.phase===4&&this.age>=6){this.character=this.selectedId;this.signal(12,1,true,false);this.signal(35,1,true,false);this._openFlow(this.flowIndex-1);}
  }
  returnMain(){this._closeSelectionPage();this.state='main';this.selection=0;this.finished=false;this.phaseTo(1);this.age=120;this.spawn(31);this.signal(0,2);this.signal(31,2);}
  update(mask: number): void{
    if(this.finished)return;
    this.buttons.update(mask);if(this.state==='main')this.main();else if(this.selectionPage)this._customPage();else if(this.state==='difficulty')this.difficultyPage();else this.characterPage();
    this.selectionPage?.update?.(mask,this);
    this.bank!.update();this.decorationBank?.update();this.background?.update();this.age++;if(this.selectionAge>0)this.selectionAge--;if(this.flashAge>0)this.flashAge--;
  }
  draw(draw: DrawList): DrawList{
    const view={x:0,y:0,scale:1,screenScale:1.5},queue=this.renderQueue.reset();this.bank!.draw(queue,view);this.decorationBank?.draw(queue,view);
    if(this.background){if(this.background.textureId!==null){draw.targetBegin(this.background.textureId,0);this.background.drawCapture?.(draw);queue.flush(draw,{maximumPriority:67});draw.targetEnd();}this.background.draw(draw);}queue.flush(draw);
    if(this.state==='main'&&[2,3,4].includes(this.phase))for(let i=0;i<this.labels.length;i++){
      const style=touhouMenuStyle(i,this.selection,{excluded:this.excluded.has(i),flash:this.flashAge,jitter:this.selectionAge});
      this.font.draw(draw,this.labels[i],{font:this.layout.font,x:add(this.layout.x,style.offset),y:add(this.layout.y+i*this.layout.lineHeight,style.offset),alignX:0,...style});
    }
    this.selectionPage?.draw(draw,this);return draw;
  }
  destroy(): void{if(this.destroyed)return;this.destroyed=true;this._closeSelectionPage();for(const bank of new Set([this.bank,this.decorationBank].filter(Boolean))){for(const vm of bank!.instances)vm.destroy();if(this.disposeBanks)bank!.dispose();}if(this.disposeBackground)this.background?.destroy?.();}
  snapshot(): {state:string;phase:number;age:number;selection:number;difficulty:TouhouSelectionId;character:TouhouSelectionId}{return {state:this.state,phase:this.phase,age:this.age,selection:this.selection,difficulty:this.difficulty,character:this.character};}
}
