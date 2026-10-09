import type {AnmDrawList as DrawList} from './anm.js';
import type {AnmBank,AnmInstance} from './anm.js';
import type {TouhouPauseCapture} from './pause-capture.js';
import type {TouhouMenuChoice} from './menu-choices.js';

export interface TouhouPausePage {done?:boolean;update?(mask:number):void;draw?(draw:DrawList):void}

export interface TouhouPauseOptions {
 bank:AnmBank;sound?:(id:number)=>void;onResume?:()=>void;onExit?:()=>void;onRestart?:()=>void;
 onReplay?:(context:{pause:TouhouPause;close:()=>void})=>TouhouPausePage|void;
 onOptions?:TouhouPauseOptions['onReplay'];onManual?:TouhouPauseOptions['onReplay'];
 /** Omit these rows and close their gaps. Missing callbacks otherwise keep the original greyed rows. */
 hiddenChoices?:readonly TouhouMenuChoice[];
 restart?:boolean;continues?:number;initialMask?:number;drawBackground?:(draw:DrawList,pause:TouhouPause)=>void;capture?:TouhouPauseCapture;
}

// Normal pause transitions: pause_system/{transitions,menu,resume}.cpp.
// The six choices and confirmation delays use original front.anm scripts.
import {Keys} from '../index.js';
import {TouhouButtons} from './menu.js';
import {TouhouRenderQueue} from './render-queue.js';
import {hiddenTouhouMenuChoices,drawTouhouMenuPanel} from './menu-choices.js';

const childrenByChoice=[[],[0x78,0x7e,0x84,0x87,0x89],[0x79,0x7f,0x8a],[0x7a,0x80],[0x7b,0x81],[0x7c]];
export class TouhouPause {
  declare hiddenChoices: Set<number>;
  declare bank: AnmBank;
  declare sound: (((id: number) => void) | undefined);
  declare onResume: ((() => void) | undefined);
  declare onExit: ((() => void) | undefined);
  declare onRestart: ((() => void) | undefined);
  declare onReplay: (((context: { pause: TouhouPause; close: () => void; }) => TouhouPausePage | void) | undefined);
  declare onOptions: (((context: { pause: TouhouPause; close: () => void; }) => TouhouPausePage | void) | undefined);
  declare onManual: (((context: { pause: TouhouPause; close: () => void; }) => TouhouPausePage | void) | undefined);
  declare restart: boolean;
  declare continues: number;
  declare drawBackground: (((draw: DrawList, pause: TouhouPause) => void) | undefined);
  declare capture: TouhouPauseCapture | undefined;
  declare buttons: TouhouButtons;
  declare savedSelection: number;
  declare renderQueue: TouhouRenderQueue;
  declare disabledChoices:Set<number>;
  declare external:TouhouPausePage|null;

  declare active: boolean;
  declare phase: number;
  declare age: number;
  declare selection: number;
  declare count: number;
  declare panelVisible: boolean;
  declare excluded: Set<number>;
  declare panel: AnmInstance;

  constructor({bank,sound,onResume,onExit,onRestart,onReplay,onOptions,onManual,restart=false,continues=0,initialMask=0,drawBackground,capture,hiddenChoices=[]}: TouhouPauseOptions={} as TouhouPauseOptions){
    this.hiddenChoices=hiddenTouhouMenuChoices(hiddenChoices);
    Object.assign(this,{bank,sound,onResume,onExit,onRestart,onReplay,onOptions,onManual,restart,continues,drawBackground,capture});this.capture?.capture();
    this.buttons=new TouhouButtons();this.buttons.update(initialMask);this.active=true;this.phase=0;this.age=1;this.selection=0;this.savedSelection=0;this.count=6;this.panelVisible=true;this.external=null;this.renderQueue=new TouhouRenderQueue();
    this.excluded=new Set();this.disabledChoices=new Set();
    const disable=(choice:number)=>{this.excluded.add(choice);this.disabledChoices.add(choice);};
    for(const [choice,callback]of[[1,onExit],[2,onReplay],[3,onManual],[4,onOptions],[5,onRestart]] as const)if(!callback)disable(choice);
    if(restart){disable(2);disable(3);}
    // Source menu.cpp follows Replay's interrupt5 with recursive selection7,
    // leaving its ordinary grey fallback opaque. A Continue excludes the row
    // from navigation only; a missing callback still uses the disabled style.
    if(continues>0)this.excluded.add(2);
    for(const choice of this.hiddenChoices)disable(choice);
    this.panel=bank.create(restart?0x91:0x90,{secondary:true});this.panel.interrupt(3,true);this.sound?.(14);
  }
  phaseTo(phase:number){this.phase=phase;this.age=0;if(phase===18)this.capture?.hide();}
  child(script: number){const find=(vm:AnmInstance):AnmInstance|null=>{for(const child of vm.children){if(child.scriptId===script)return child;const nested=find(child);if(nested)return nested;}return null;};return find(this.panel);}
  signalChoice(choice: number,label: number){for(const script of childrenByChoice[choice])this.child(script)?.interrupt(label,true);}
  selectPanel(bias=7){this.panel.interrupt(this.selection+bias,true);}
  disableChoices(){for(const choice of this.disabledChoices)this.signalChoice(choice,5);}
  move(delta: number){let next=this.selection;for(let i=0;i<this.count;i++){next=(next+delta+this.count)%this.count;if(this.count===2||!this.excluded.has(next))break;}const changed=next!==this.selection;this.selection=next;return changed;}
  resume(): void{this.selection=0;this.panel.interrupt(1,true);this.phaseTo(18);}
  restoreMenu(): void{this.selection=this.savedSelection;this.count=6;this.phaseTo(6);this.selectPanel();this.disableChoices();this.panelVisible=true;this.external=null;}
  retry(){this.sound?.(7);this.signalChoice(5,6);this.selection=5;if(this.restart)this.phaseTo(18);else this.phaseTo(7);}
  finish(){
    const choice=this.selection;this.active=false;this.panel.destroy();this.capture?.destroy();this.bank.collect();
    if(choice===0)this.onResume?.();else if(choice===1)this.onExit?.();else if(choice===5)this.onRestart?.();
  }
  openExternal(kind: string){
    this.panelVisible=false;const callback=kind==='replay'?this.onReplay:kind==='manual'?this.onManual:this.onOptions;
    // Hosts supply their own fully implemented page. Omitted pages are disabled.
    const close=()=>this.restoreMenu();this.external=callback?.({pause:this,close})??null;
  }
  update(mask: number=0,{retryPressed=false,exitPressed=false}: {retryPressed?:boolean;exitPressed?:boolean}={}): void{
    if(!this.active)return;
    this.buttons.update(mask);const b=this.buttons,confirm=!!(b.pressed&(Keys.SHOOT|Keys.CONFIRM)),cancel=!!(b.pressed&(Keys.BOMB|Keys.CANCEL|Keys.PAUSE));
    switch(this.phase){
      case 0:if(this.age>=10){this.phaseTo(6);this.selection=0;if(this.excluded.has(0))this.move(1);this.selectPanel();this.disableChoices();}break;
      case 6:{
        let moved=false;if(b.repeat(Keys.UP))moved=this.move(-1)||moved;if(b.repeat(Keys.DOWN))moved=this.move(1)||moved;
        if(moved){this.selectPanel();this.disableChoices();this.sound?.(10);}
        if(confirm&&!this.excluded.has(this.selection)){
          if(this.selection===5){this.retry();break;}this.sound?.(7);this.signalChoice(this.selection,6);
          if(this.selection===0)this.resume();
          else this.phaseTo(({1:this.restart?18:7,2:9,3:14,4:16} as Record<number,number>)[this.selection]);
        }
        if(retryPressed&&!this.excluded.has(5)){this.retry();break;}
        if(b.pressed&Keys.PAUSE){this.resume();break;}
        if(exitPressed&&!this.excluded.has(1)){this.sound?.(7);this.signalChoice(1,6);this.selection=1;this.phaseTo(18);}break;
      }
      case 7:case 9:
        if(this.age<20)break;
        if(this.age===20){this.savedSelection=this.selection;this.count=2;this.selection=1;this.panel.interrupt(14,true);}
        if(this.age<30)break;
        if(this.age===30)this.selectPanel(15);
        {let moved=false;if(b.repeat(Keys.UP))moved=this.move(-1)||moved;if(b.repeat(Keys.DOWN))moved=this.move(1)||moved;if(moved){this.selectPanel(15);this.sound?.(10);}}
        if(confirm){this.child(this.selection===0?0x8e:0x8f)?.interrupt(6,true);this.sound?.(this.selection===0?7:9);this.phaseTo(this.selection===0&&this.phase===9?10:8);}
        if(cancel){this.sound?.(9);if(this.selection===0){this.selection=1;this.selectPanel(15);}else{this.child(0x8f)?.interrupt(6,true);this.phaseTo(8);}}
        if(b.pressed&Keys.PAUSE)this.resume();break;
      case 8:if(this.age>=20){if(this.selection===0){this.panel.interrupt(1,true);this.selection=this.savedSelection;this.count=6;this.phaseTo(18);}else this.restoreMenu();}break;
      case 10:if(this.age===20){this.phaseTo(11);this.openExternal('replay');}break;
      case 11:this.external?.update?.(mask);if(this.external?.done)this.restoreMenu();break;
      case 14:case 16:
        if(this.age===20)this.openExternal(this.phase===14?'manual':'options');
        if(this.age>20){this.external?.update?.(mask);if(this.external?.done)this.restoreMenu();}break;
      case 18:if(this.age>=12)this.finish();break;
      default:throw new Error(`Unsupported pause phase ${this.phase}`);
    }
    if(this.active){this.panel.update();this.capture?.update();this.age++;}this.bank.collect();
  }
  draw(draw: DrawList): DrawList{
    if(!this.active)return draw;
    // Hosts without pixel services can supply an explicit presentation fallback.
    if(this.capture)this.capture.draw(draw);else if(this.drawBackground)this.drawBackground(draw,this);else draw.rect(48,24,576,672,0x00000080);
    // Secondary ANM layers use callback priorities, not their raw layer IDs.
    const queue=this.renderQueue.reset();
    if(this.panelVisible)drawTouhouMenuPanel(this.panel,queue,{x:0,y:0,scale:1,screenScale:1.5},this.hiddenChoices);queue.flush(draw);
    this.external?.draw?.(draw);return draw;
  }
  snapshot(): {active:boolean;phase:number;age:number;selection:number;count:number;excluded:number[];panelVisible:boolean}{return{active:this.active,phase:this.phase,age:this.age,selection:this.selection,count:this.count,excluded:[...this.excluded],panelVisible:this.panelVisible};}
  destroy(): void{this.active=false;this.panel.destroy();this.capture?.destroy();this.bank.collect();}
}
