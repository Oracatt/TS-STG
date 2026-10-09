import type {AnmInstance} from './anm-vm.js';
import type {AnmDrawList as DrawList} from './anm.js';
import type {AnmBank} from './anm.js';
import type {TouhouBitmapFont} from './font.js';

export interface TouhouStageEntry {label:string;disabled?:boolean;score?:number;[key:string]:unknown}

export interface TouhouStageSelectOptions {bank:AnmBank;font:TouhouBitmapFont;entries:TouhouStageEntry[];selection?:number;pageSize?:number;headingScript?:number|false;sound?:(id:number)=>void;onSelect?:(entry:TouhouStageEntry,index:number)=>void;
 /** Starts the source cover at confirmed selection age10; onSelect remains at age40. */
 onTransition?:(entry:TouhouStageEntry,index:number)=>void;
 onCancel?:()=>void;drawLabel?:(draw:DrawList,entry:TouhouStageEntry,options:{x:number;y:number;font:number;color:number;selected:boolean;index:number;alignX:1})=>void;x?:number;y?:number;lineHeight?:number;fontIndex?:number}

import {Keys} from '../input.js';
import {TouhouButtons} from './menu.js';

/** Stage-list presentation and transitions from title_system/stage_select.cpp
 * and stage_select_draw.cpp. Labels/count/page size are application content. */
export class TouhouStageSelect {
  declare bank: AnmBank;
  declare font: TouhouBitmapFont;
  declare entries: TouhouStageEntry[];
  declare pageSize: number;
  declare sound: (((id: number) => void) | undefined);
  declare onSelect: (((entry: TouhouStageEntry, index: number) => void) | undefined);
  declare onTransition: (((entry: TouhouStageEntry, index: number) => void) | undefined);
  declare onCancel: ((() => void) | undefined);
  declare drawLabel: (((draw: DrawList, entry: TouhouStageEntry, options: { x: number; y: number; font: number; color: number; selected: boolean; index: number; alignX: 1; }) => void) | undefined);
  declare x: number;
  declare y: number;
  declare lineHeight: number;
  declare fontIndex: number;
  declare buttons: TouhouButtons;
  declare heading: AnmInstance | null | null;

  declare selection: number;
  declare phase: number;
  declare age: number;
  declare active: boolean;

  constructor({bank,font,entries,selection=0,pageSize=6,headingScript=43,
    sound,onSelect,onTransition,onCancel,drawLabel,x=330,y=170,lineHeight=34,fontIndex=7}: TouhouStageSelectOptions={} as TouhouStageSelectOptions){
    if(!Array.isArray(entries)||!entries.length)throw new TypeError('Stage selection requires entries');
    if(!Number.isInteger(pageSize)||pageSize<1)throw new RangeError('Stage selection page size must be a positive integer');
    Object.assign(this,{bank,font,entries,pageSize,sound,onSelect,onTransition,onCancel,drawLabel,x,y,lineHeight,fontIndex});
    this.selection=Math.max(0,Math.min(entries.length-1,selection|0));this.phase=1;this.age=0;this.active=true;
    this.buttons=new TouhouButtons();this.heading=headingScript===false?null:bank.create(headingScript);
  }
  move(delta: number): void{const previous=this.selection,count=this.entries.length;this.selection=((previous+delta)%count+count)%count;if(this.selection!==previous)this.sound?.(10);}
  update(mask: number=0): void{
    if(!this.active)return;this.buttons.update(mask);const b=this.buttons;
    if(this.phase===1){if(this.age>10){this.phase=2;this.age=0;}}
    else if(this.phase===2){
      if(b.repeat(Keys.UP))this.move(-1);if(b.repeat(Keys.DOWN))this.move(1);
      if(b.repeat(Keys.LEFT))this.move(-this.pageSize);if(b.repeat(Keys.RIGHT))this.move(this.pageSize);
      if(b.pressed&(Keys.CANCEL|Keys.BOMB|Keys.PAUSE)){this.phase=4;this.age=0;this.sound?.(9);}
      else if(b.pressed&(Keys.CONFIRM|Keys.SHOOT)){
        if(this.entries[this.selection].disabled)this.sound?.(16);
        else{this.phase=3;this.age=0;this.sound?.(7);this.sound?.(50);}
      }
    }else if(this.phase===3){
      // Original stage_select.cpp starts the shutters at age10, before the
      // age40 launch. Applications can own that 30-frame cover through this
      // early callback; standalone lists keep the existing onSelect timing.
      if(this.age===10)this.onTransition?.(this.entries[this.selection],this.selection);
      if(this.age>=40){this.active=false;this.onSelect?.(this.entries[this.selection],this.selection);}
    }
    else if(this.phase===4&&this.age>=6){this.active=false;this.onCancel?.();}
    this.age++;
  }
  draw(draw: DrawList): DrawList{
    if(!this.active||![2,3].includes(this.phase)||(this.phase===2&&this.age<10))return draw;
    const first=Math.floor(this.selection/this.pageSize)*this.pageSize,last=Math.min(first+this.pageSize,this.entries.length);
    for(let index=first;index<last;index++){
      const entry=this.entries[index],selected=index===this.selection;
      const color=!selected?0xff808080:entry.disabled?0xffdfdfdf:this.phase===3&&this.age%4>=2?0xff000000:0xffffff00;
      const options={x:this.x,y:this.y+(index-first)*this.lineHeight,font:this.fontIndex,color,selected,index,alignX:1 as const};
      if(this.drawLabel)this.drawLabel(draw,entry,options);else this.font.draw(draw,entry.label,options);
      if(entry.score!==undefined)this.font.draw(draw,String(Math.trunc(entry.score)).padStart(7,'0')+'0',{...options,x:this.x+144});
    }
    if(this.entries.length>this.pageSize)this.font.draw(draw,`${Math.floor(first/this.pageSize)+1}/${Math.ceil(this.entries.length/this.pageSize)}`,
      {font:0,x:this.x,y:this.y+this.pageSize*this.lineHeight+12,color:0xffffffff});
    return draw;
  }
  destroy(): void{this.active=false;this.heading?.interrupt(1,true);this.heading=null;}
  snapshot(): {phase:number;age:number;selection:number;count:number;active:boolean}{return{phase:this.phase,age:this.age,selection:this.selection,count:this.entries.length,active:this.active};}
}
