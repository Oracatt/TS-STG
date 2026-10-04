import {Keys} from '../input.js';
import {TouhouButtons} from './menu.js';

/** Stage-list presentation and transitions from title_system/stage_select.cpp
 * and stage_select_draw.cpp. Labels/count/page size are application content. */
export class TouhouStageSelect {
  constructor({bank,font,entries,selection=0,pageSize=6,headingScript=43,
    sound,onSelect,onTransition,onCancel,drawLabel,x=330,y=170,lineHeight=34,fontIndex=7}={}){
    if(!Array.isArray(entries)||!entries.length)throw new TypeError('Stage selection requires entries');
    if(!Number.isInteger(pageSize)||pageSize<1)throw new RangeError('Stage selection page size must be a positive integer');
    Object.assign(this,{bank,font,entries,pageSize,sound,onSelect,onTransition,onCancel,drawLabel,x,y,lineHeight,fontIndex});
    this.selection=Math.max(0,Math.min(entries.length-1,selection|0));this.phase=1;this.age=0;this.active=true;
    this.buttons=new TouhouButtons();this.heading=headingScript===false?null:bank.create(headingScript);
  }
  move(delta){const previous=this.selection,count=this.entries.length;this.selection=((previous+delta)%count+count)%count;if(this.selection!==previous)this.sound?.(10);}
  update(mask=0){
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
  draw(draw){
    if(!this.active||![2,3].includes(this.phase)||(this.phase===2&&this.age<10))return draw;
    const first=Math.floor(this.selection/this.pageSize)*this.pageSize,last=Math.min(first+this.pageSize,this.entries.length);
    for(let index=first;index<last;index++){
      const entry=this.entries[index],selected=index===this.selection;
      const color=!selected?0xff808080:entry.disabled?0xffdfdfdf:this.phase===3&&this.age%4>=2?0xff000000:0xffffff00;
      const options={x:this.x,y:this.y+(index-first)*this.lineHeight,font:this.fontIndex,color,selected,index,alignX:1};
      if(this.drawLabel)this.drawLabel(draw,entry,options);else this.font.draw(draw,entry.label,options);
      if(entry.score!==undefined)this.font.draw(draw,String(Math.trunc(entry.score)).padStart(7,'0')+'0',{...options,x:this.x+144});
    }
    if(this.entries.length>this.pageSize)this.font.draw(draw,`${Math.floor(first/this.pageSize)+1}/${Math.ceil(this.entries.length/this.pageSize)}`,
      {font:0,x:this.x,y:this.y+this.pageSize*this.lineHeight+12,color:0xffffffff});
    return draw;
  }
  destroy(){this.active=false;this.heading?.interrupt(1,true);this.heading=null;}
  snapshot(){return{phase:this.phase,age:this.age,selection:this.selection,count:this.entries.length,active:this.active};}
}
