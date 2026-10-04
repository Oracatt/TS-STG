// Original main/difficulty/character selection states with injectable actions.
// Source: title_system/{main_menu,difficulty,character,draw_main}.cpp.
import { Keys,RepeatingInput } from '../index.js';
import { add,div } from './math.js';
import {TouhouRenderQueue} from './render-queue.js';

/** Input edge and repeat cadence from input/input_state.cpp, independent of key mapping. */
export class TouhouButtons extends RepeatingInput {
  constructor(){
    super({delay:25,channels:{repeat8:{interval:8},repeat12:{interval:12}},defaultChannel:'repeat8'});
    this.count8=this.channels.repeat8.counters;this.count12=this.channels.repeat12.counters;
  }
  get repeat8(){return this.channels.repeat8.mask;}set repeat8(mask){this.channels.repeat8.mask=mask|0;}
  get repeat12(){return this.channels.repeat12.mask;}set repeat12(mask){this.channels.repeat12.mask=mask|0;}
}
export const TOUHOU_MAIN_LABELS=Object.freeze(['Game Start','Extra Start','Practice','Spell Practice','Replay','Player Data','Music Room','Option','Manual','Quit']);
export function touhouMenuStyle(index,selected,{excluded=false,flash=0,jitter=0}={}) {
  if(excluded)return {color:0xff808080,shadowColor:0x40ffffff,offset:0};
  if(index!==selected)return {color:0xff608080,shadowColor:0xff404040,offset:0};
  const displacement=[2,-1,0,3,-3,2,-2,0,2];
  return {color:flash&&flash%4<2?0xff000000:0xff80ffff,shadowColor:!flash?0xff000000:flash%4<2?0xffffff80:0xffffffff,offset:jitter>0?div(displacement[jitter],2):0};
}

export class TouhouTitleMenu {
  constructor({bank,decorationBank,font,background,labels=TOUHOU_MAIN_LABELS,excluded=[1],difficulty=1,character=0,onSelect,onStart,sound,
    scripts={},childScripts={},startModes={0:'normal',2:'practice'},quitIndex=labels.length-1,
    layout={font:7,x:186,y:230,lineHeight:23},disposeBanks=false,disposeBackground=false}={}) {
    Object.assign(this,{bank,decorationBank,font,background,labels:[...labels],excluded:new Set(excluded),difficulty,character,onSelect,onStart,sound});this.renderQueue=new TouhouRenderQueue();
    Object.assign(this,{scripts,childScripts,startModes,quitIndex,layout:{font:7,x:186,y:230,lineHeight:23,...layout},disposeBanks,disposeBackground});this.destroyed=false;
    this.buttons=new TouhouButtons();this.handles=new Map();this.state='main';this.phase=1;this.age=0;this.selection=0;this.selectionAge=0;this.flashAge=0;this.finished=false;
    this.spawn(0);this.spawn(31);
  }
  spawn(script){const mapped=this.scripts[script]??script;if(mapped===false)return null;const vm=this.bank.create(mapped);this.handles.set(script,vm);return vm;}
  signal(script,event,recursive=false,immediate=true){const vm=this.handles.get(script);if(vm){if(immediate)vm.interruptNow(event,recursive);else vm.interrupt(event,recursive);}}
  child(script,id){id=this.childScripts[id]??id;const walk=vm=>{for(const child of vm.children){if(child.scriptId===id)return child;const found=walk(child);if(found)return found;}return null;};const vm=this.handles.get(script);return vm?walk(vm):null;}
  childSignal(script,id,label,immediate=false){const vm=this.child(script,id);if(vm){if(immediate)vm.interruptNow(label,true);else vm.interrupt(label,true);}}
  childVisible(script,id,visible){const vm=this.child(script,id);if(vm){const show=n=>{n.flag(1,visible?1:0);for(const c of n.children)show(c);};show(vm);}}
  phaseTo(phase){this.phase=phase;this.age=0;}
  move(delta,count,wrap=true){const old=this.selection;let next=old;for(let i=0;i<count;i++){next=wrap?(next+delta+count)%count:Math.max(0,Math.min(count-1,next+delta));if(this.state!=='main'||!this.excluded.has(next))break;}this.selection=next;return next!==old;}
  main(){
    const b=this.buttons,confirm=!!(b.pressed&(Keys.SHOOT|Keys.CONFIRM)),cancel=!!(b.pressed&(Keys.BOMB|Keys.CANCEL|Keys.PAUSE));
    if(this.phase===1){if(this.age===120&&this.decorationBank)this.decoration=this.decorationBank.create(0);if(this.age>130)this.phaseTo(2);}
    else if(this.phase===2){
      let moved=false;if(b.repeat(Keys.UP))moved=this.move(-1,this.labels.length)||moved;if(b.repeat(Keys.DOWN))moved=this.move(1,this.labels.length)||moved;
      if(moved){this.sound?.(10);this.selectionAge=8;}
      if(cancel){this.sound?.(9);if(this.selection===this.quitIndex)this.phaseTo(4);else this.selection=this.quitIndex;}
      if(confirm&&!this.excluded.has(this.selection)){this.flashAge=30;this.sound?.(this.selection===this.quitIndex?9:7);this.signal(31,1,true,false);this.decoration?.interrupt(1,true);this.phaseTo(4);}
    }else if(this.phase===4&&this.age>=20){
      if(this.startModes[this.selection]!==undefined&&this.onStart){this.mode=this.startModes[this.selection];this.signal(0,3);this.openDifficulty();}
      else {this.finished=true;this.onSelect?.(this.selection,this);}
    }
  }
  openDifficulty(){
    this.state='difficulty';this.selection=this.difficulty;this.phaseTo(1);this.spawn(58);this.signal(58,3);this.signal(58,this.selection+13,true,false);this.spawn(34);
    for(let i=17;i<21;i++)this.childVisible(58,i,false);
  }
  difficultyPage(){
    const b=this.buttons;
    if(this.phase===1&&this.age>6)this.phaseTo(2);
    else if(this.phase===2){
      let moved=false;if(b.repeat(Keys.UP|Keys.LEFT))moved=this.move(-1,4,false)||moved;if(b.repeat(Keys.DOWN|Keys.RIGHT))moved=this.move(1,4,false)||moved;
      if(moved){this.sound?.(10);this.signal(58,3);this.signal(58,this.selection+7,true,false);}
      if(b.pressed&(Keys.BOMB|Keys.CANCEL|Keys.PAUSE)){this.phaseTo(4);this.sound?.(9);this.signal(58,1,true,false);}
      else if(b.pressed&(Keys.SHOOT|Keys.CONFIRM)){this.signal(58,6,true,false);this.childSignal(58,this.selection+48,2);this.phaseTo(3);this.sound?.(7);}
    }else if(this.phase===3&&this.age>=14){this.signal(34,1,true,false);this.difficulty=this.selection;this.openCharacter();}
    else if(this.phase===4&&this.age>=6){this.signal(34,1,true,false);this.returnMain();}
  }
  openCharacter(){
    this.state='character';this.selection=this.character;this.phaseTo(1);this.spawn(35);this.spawn(12);this.signal(12,3);this.signal(12,this.selection+7,true,false);
    this.childVisible(12,15,false);this.childVisible(12,16,false);
  }
  characterPage(){
    const b=this.buttons;
    if(this.phase===1&&this.age>6){this.phaseTo(2);this.childSignal(12,6,37,true);this.childSignal(12,7,37,true);}
    else if(this.phase===2){
      if(b.repeat(Keys.LEFT)){this.sound?.(10);this.signal(12,this.selection+25,true);this.move(-1,2);this.signal(12,this.selection+13,true,false);}
      if(b.repeat(Keys.RIGHT)){this.sound?.(10);this.signal(12,this.selection+19,true);this.move(1,2);this.signal(12,this.selection+7,true,false);}
      if(b.pressed&(Keys.SHOOT|Keys.CONFIRM)){for(const child of [this.selection+6,this.selection+8,4,5])this.childSignal(12,child,6);this.sound?.(7);this.phaseTo(3);}
      else if(b.pressed&(Keys.BOMB|Keys.CANCEL|Keys.PAUSE)){this.phaseTo(4);this.sound?.(9);}
    }else if(this.phase===3&&this.age>=14){
      this.character=this.selection;this.finished=true;this.signal(12,6,true,false);this.signal(35,1,true);
      // The original proceeds to stone selection here. The engine application
      // instead receives the chosen base character, as explicitly requested.
      this.onStart?.({character:this.character,difficulty:this.difficulty,mode:this.mode});
    }else if(this.phase===4&&this.age>=6){this.character=this.selection;this.signal(12,1,true,false);this.signal(35,1,true,false);this.openDifficulty();}
  }
  returnMain(){this.state='main';this.selection=0;this.finished=false;this.phaseTo(1);this.age=120;this.spawn(31);this.signal(0,2);this.signal(31,2);}
  update(mask){
    if(this.finished)return;
    this.buttons.update(mask);if(this.state==='main')this.main();else if(this.state==='difficulty')this.difficultyPage();else this.characterPage();
    this.bank.update();this.decorationBank?.update();this.background?.update();this.age++;if(this.selectionAge>0)this.selectionAge--;if(this.flashAge>0)this.flashAge--;
  }
  draw(draw){
    const view={x:0,y:0,scale:1,screenScale:1.5},queue=this.renderQueue.reset();this.bank.draw(queue,view);this.decorationBank?.draw(queue,view);
    if(this.background){if(this.background.textureId!==null){draw.targetBegin(this.background.textureId,0);this.background.drawCapture?.(draw);queue.flush(draw,{maximumPriority:67});draw.targetEnd();}this.background.draw(draw);}queue.flush(draw);
    if(this.state==='main'&&[2,3,4].includes(this.phase))for(let i=0;i<this.labels.length;i++){
      const style=touhouMenuStyle(i,this.selection,{excluded:this.excluded.has(i),flash:this.flashAge,jitter:this.selectionAge});
      this.font.draw(draw,this.labels[i],{font:this.layout.font,x:add(this.layout.x,style.offset),y:add(this.layout.y+i*this.layout.lineHeight,style.offset),alignX:0,...style});
    }
    return draw;
  }
  destroy(){if(this.destroyed)return;this.destroyed=true;for(const bank of new Set([this.bank,this.decorationBank].filter(Boolean))){for(const vm of bank.instances)vm.destroy();if(this.disposeBanks)bank.dispose();}if(this.disposeBackground)this.background?.destroy?.();}
  snapshot(){return {state:this.state,phase:this.phase,age:this.age,selection:this.selection,difficulty:this.difficulty,character:this.character};}
}
