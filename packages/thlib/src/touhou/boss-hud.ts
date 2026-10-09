import type {AnmBank,AnmInstance,AnmView} from './anm.js';
import type {TouhouBitmapFont,TouhouTextOptions} from './font.js';
import type {TouhouPlayer} from './player.js';
import type {TouhouSpell} from './spell.js';
import type {AnmDrawList as DrawList} from './anm.js';

/** A business Boss can supply this shape without inheriting a thlib enemy. */
export interface TouhouBossHudEnemy {x:number;y:number;z?:number;hp:number;alive?:boolean;maximumHp?:number;phaseHealth?:number;health?:{maximum?:number;threshold?:number};primaryFlags?:number;damageInvulnerability?:{current:number};}

export interface TouhouBossHealthBar {
 current:number;maximum:number;phaseHealth?:number;markers?:number[];groupIndex?:number;visible?:boolean;
 /** false follows the health fraction immediately; omitted uses the source fill animation. */
 animateFill?:boolean;
}

export interface TouhouBossHudState {bosses?:Array<TouhouBossHudEnemy|null>;player?:Pick<TouhouPlayer,'x'|'y'>;spell?:TouhouSpell;spellFlags?:number;remainingFrames?:number;remainingSpells?:number;healthBars?:Array<TouhouBossHealthBar|null>;name?:string;hidden?:boolean;dialogue?:boolean;timerHidden?:boolean;paused?:boolean;labelScript?:number;sound?:(id:number,x:number)=>void;}

export type TouhouBossNameRenderer=(draw:DrawList,name:string,options:TouhouTextOptions,animation:AnmInstance)=>void;

import { f32,PI,add,sub,mul,div,sin,cos,wrapAngle,trunc32 } from './math.js';

const tree=(vm: AnmInstance,visible: boolean)=>{if(!vm)return;vm.visible=visible;for(const child of vm.children)tree(child,visible);};
const phaseHp=(enemy:TouhouBossHudEnemy)=>enemy.phaseHealth??((enemy.hp-(enemy.health?.threshold??0))|0);
const signal=(entries: AnmInstance[],event: number,immediate=false)=>{for(const vm of entries)immediate?vm.interruptNow(event):vm.interrupt(event,true);};
const viewDefault={x:0,y:0,scale:1,screenScale:1.5,screenOffsets:[{x:48,y:24},{x:336,y:24}]};

/** Generic original FrontInf boss rings, timer and lower-screen pointer.
 * hud_system/update.cpp timer_display/boss_panels/boss_pointer, draw.cpp, and
 * gameplay/enemy_frame.cpp store_boss_time. Stage-specific names are caller data. */
export class TouhouBossHud {
  declare markerCount: number;
  declare starCapacity: number;
  declare createStar: ((index: number, bank: AnmBank) => AnmInstance);
  declare label: null | AnmInstance;
  declare labelScript: number;
  declare state:TouhouBossHudState;

  declare bank: AnmBank;
  declare textBank: AnmBank;
  declare font: TouhouBitmapFont|null;
  declare pointer: AnmInstance;
  declare managePointer: boolean;
  declare numbers: AnmInstance[];
  declare panels: Array<{fraction:number;target:number;hp:number;markers:number[];animations:AnmInstance[];near:boolean}>;
  declare seconds: number;
  declare hundredths: number;
  declare previousSeconds: number;
  declare timerMode: number;
  declare pointerMode: number;
  declare timerVisible: boolean;
  declare remainingSpells: number;
  declare stars: Array<AnmInstance|null>;
  declare retiringStars: AnmInstance[];
  declare name: string;
  declare nameAnimation: AnmInstance|null;
  declare drawName: TouhouBossNameRenderer|null;
  declare nameStyle: TouhouTextOptions;

  constructor({bank,textBank,font=null,pointer=null,managePointer=pointer===null,drawName=null,nameStyle={},
    panelCount=2,markerCount=4,starCapacity=10,createStar=null}: {bank:AnmBank;textBank:AnmBank;font?:TouhouBitmapFont|null;pointer?:AnmInstance|null;managePointer?:boolean;drawName?:TouhouBossNameRenderer|null;nameStyle?:TouhouTextOptions;panelCount?:number;markerCount?:number;starCapacity?:number;createStar?:((index:number,bank:AnmBank)=>AnmInstance)|null}={} as NonNullable<ConstructorParameters<typeof TouhouBossHud>[0]>) {
    if(!bank||!textBank)throw new TypeError('TouhouBossHud requires original front and ascii ANM banks');
    if(!Number.isSafeInteger(panelCount)||panelCount<1||!Number.isSafeInteger(markerCount)||markerCount<0||!Number.isSafeInteger(starCapacity)||starCapacity<0)
      throw new RangeError('HUD capacities must be nonnegative integers, with at least one panel');
    if(starCapacity>10&&!createStar)throw new RangeError('Additional stars require a createStar layout factory');
    if(createStar!==null&&typeof createStar!=='function')throw new TypeError('createStar must be a function or null');
    this.markerCount=markerCount;this.starCapacity=starCapacity;this.createStar=createStar??((index,bank)=>bank.create(58+index));
    this.bank=bank;this.textBank=textBank;this.font=font;this.pointer=pointer??bank.create(100);this.managePointer=managePointer;
    this.numbers=[textBank.create(2),textBank.create(3)];
    for(const vm of this.numbers){tree(vm,false);vm.U(0x4a0,vm.U(0x4a0)&~0x03000000);}
    tree(this.pointer,false);
    this.panels=Array.from({length:panelCount},()=>({fraction:0,target:0,hp:0,markers:Array(markerCount).fill(0),animations:[],near:false}));
    this.seconds=0;this.hundredths=0;this.previousSeconds=0;this.timerMode=0;this.pointerMode=0;this.timerVisible=false;
    this.label=null;this.labelScript=-1;this.state={};
    this.remainingSpells=0;this.stars=Array(starCapacity).fill(null);this.retiringStars=[];
    this.name='';this.nameAnimation=null;this.drawName=drawName;this.nameStyle={font:6,scaleX:.65,scaleY:.65,...nameStyle};
  }
  setTime(seconds: number,hundredths: number=0): this{this.seconds=seconds<100?seconds|0:99;this.hundredths=seconds<100?hundredths|0:99;return this;}
  setRemainingFrames(frames: number): this{frames|=0;return this.setTime(Math.trunc(frames/60),Math.trunc(Math.imul(frames%60,100)/60));}
  setMarkers(index: number,fractions: number[]): this{if(!Number.isInteger(index)||index<0||index>=this.panels.length||fractions.length>this.markerCount)throw new RangeError('Boss HUD panel or marker capacity exceeded');this.panels[index].markers=Array.from({length:this.markerCount},(_,i)=>f32(fractions[i]??0));return this;}
  setLabel(script: number=-1): this{if(script===this.labelScript)return this;this.label?.destroy();this.label=null;this.labelScript=script;if(script>=0)this.label=this.bank.create(script);return this;}
  /** ECL 534 counts later cards, excluding the current/upcoming spell. Original
   * front58..67 retain their own 60+20 entry and interrupt1 exit animations. */
  setRemainingSpells(count: number): this{
    if(!Number.isFinite(count))throw new TypeError('Remaining Boss spells must be finite');
    this.remainingSpells=Math.max(0,Math.min(this.starCapacity,Math.trunc(count)));
    for(let i=0;i<this.starCapacity;i++){
      if(i<this.remainingSpells){if(!this.stars[i])this.stars[i]=this.createStar(i,this.bank);}
      else if(this.stars[i]){this.stars[i]!.interrupt(1,true);this.retiringStars.push(this.stars[i]!);this.stars[i]=null;}
    }
    return this;
  }
  /** Custom names share the source label position and ANM alpha timeline. The
   * concrete front150..165 Boss-name artwork remains the application's skin. */
  setName(name: string=''): this{
    name=String(name);if(name===this.name)return this;
    this.nameAnimation?.destroy();this.nameAnimation=null;this.name=name;
    if(name){this.nameAnimation=this.bank.create(58);this.nameAnimation.F(0x30,0);}
    return this;
  }
  clearPanel(panel:TouhouBossHud['panels'][number],reset=false){for(const vm of panel.animations)vm.destroy();panel.animations=[];if(reset){panel.fraction=0;panel.markers.fill(0);}}
  update(state: TouhouBossHudState={} as TouhouBossHudState): this {
    this.state=state;const bosses=state.bosses??[],player=state.player??{x:0,y:400},spellFlags=state.spell?.flags??state.spellFlags??0;
    if(state.remainingFrames!==undefined)this.setRemainingFrames(state.remainingFrames);
    const first=bosses[0]?.alive===false?null:bosses[0];
    if(!first){this.setName('');this.setRemainingSpells(0);}
    else{
      if(state.name!==undefined)this.setName(state.name);
      if(state.remainingSpells!==undefined)this.setRemainingSpells(state.remainingSpells);
    }
    this.timerVisible=!!first&&this.seconds>=0&&!state.hidden&&!state.dialogue&&!state.timerHidden;
    if(this.timerVisible){
      for(const vm of this.numbers)tree(vm,true);
      const reversed=!!(spellFlags&0x100),y=player.y;
      if(this.timerMode===0){if((!reversed&&y<128)||(reversed&&y>320)){this.timerMode=1;signal(this.numbers,5);}}
      else if(this.timerMode===1){if((!reversed&&y<160)||(reversed&&y>288)){signal(this.numbers,4);this.timerMode=0;}}
      else{signal(this.numbers,spellFlags&1?2:3,true);signal(this.numbers,4,true);this.timerMode=0;}
      if(this.seconds<this.previousSeconds){if(this.seconds<2){signal(this.numbers,9);state.sound?.(12,0);}else if(this.seconds<5){signal(this.numbers,8);state.sound?.(11,0);}}
      else if(this.previousSeconds<this.seconds)signal(this.numbers,7);
      if(this.seconds!==this.previousSeconds){this.numbers[0].setSprite(Math.trunc(this.seconds/10)+239);this.numbers[1].setSprite(this.seconds%10+239);}
      this.previousSeconds=this.seconds;
    }else{for(const vm of this.numbers)tree(vm,false);this.timerMode=2;}
    if(!state.hidden)for(let i=0;i<this.panels.length;i++){
      const panel=this.panels[i],enemy=bosses[i]?.alive===false?null:bosses[i];
      if(!enemy){this.clearPanel(panel,true);if(i===0)this.setLabel(-1);continue;}
      const healthBar=state.healthBars?.[i],displayHp=healthBar?.current??enemy.hp;
      const excluded=!!((enemy.primaryFlags??0)&0x31)||(enemy.damageInvulnerability?.current??0)>0;
      if(healthBar?.visible!==false&&displayHp<100000&&!excluded&&!state.dialogue){
        panel.hp=displayHp;panel.target=div(f32(panel.hp),f32(healthBar?.maximum??enemy.health?.maximum??enemy.maximumHp??enemy.hp));
        if(healthBar?.markers)this.setMarkers(i,healthBar.markers);
        if(healthBar?.animateFill===false)panel.fraction=panel.target;
        else if(panel.fraction<panel.target)panel.fraction=add(panel.fraction,.02500000037252903);
        if(panel.target<panel.fraction)panel.fraction=panel.target;
        if(!panel.animations.length)panel.animations=Array.from({length:3+this.markerCount},(_,j)=>this.bank.create(j<3?374+j:377));
        if(state.labelScript!==undefined&&i===0)this.setLabel(state.labelScript);
        const ring=panel.animations[0];ring.F(0x38,mul(-panel.fraction,mul(PI,2)));ring.U(0x49c,ring.U(0x49c)|2);
        const x=mul(enemy.x,2),y=mul(enemy.y,2),z=enemy.z??0;
        for(let j=0;j<3;j++){panel.animations[j].x=x;panel.animations[j].y=y;panel.animations[j].z=z;}
        let markerZ=0;
        for(let j=0;j<this.markerCount;j++){
          const marker=panel.animations[j+3],fraction=panel.markers[j];
          if(fraction===0||panel.fraction<=fraction)tree(marker,false);
          else{tree(marker,true);const angle=wrapAngle(add(div(-mul(PI,2),2),-mul(mul(PI,2),fraction)));marker.rotation=angle;marker.U(0x49c,marker.U(0x49c)|2);
            marker.x=add(-mul(112,sin(angle)),x);marker.y=add(mul(112,cos(angle)),y);markerZ=add(markerZ,z);marker.z=markerZ;}
        }
        const dx=sub(enemy.x,player.x),dy=sub(enemy.y,player.y),distance=add(mul(dx,dx),mul(dy,dy));
        if(!panel.near&&distance<mul(80,80)){signal(panel.animations,3);panel.near=true;}
        else if(panel.near&&mul(96,96)<=distance){signal(panel.animations,2);panel.near=false;}
      }else this.clearPanel(panel);
    }
    if(!first||((first.primaryFlags??0)&0x21))tree(this.pointer,false);
    else{
      tree(this.pointer,true);const hp=state.healthBars?.[0]?.phaseHealth??phaseHp(first),spell=!!(spellFlags&1);
      if(this.pointerMode===0&&hp<(spell?2000:700)){this.pointer.interrupt(7);this.pointerMode=1;}
      else if(this.pointerMode===1&&hp<(spell?1000:400)){this.pointer.interrupt(8);this.pointerMode=2;}
      else if(this.pointerMode===2&&hp<(spell?400:200)){this.pointer.interrupt(9);this.pointerMode=3;}
      else if(this.pointerMode===3&&hp>(spell?400:200)){this.pointer.interrupt(10);this.pointerMode=0;}
      this.pointer.x=mul(add(add(first.x,32),192),2);this.pointer.y=960;
      const distance=Math.abs(sub(first.x,player.x));this.pointer.alpha=distance<64?trunc32(div(mul(191,distance),64))+64:255;
      if(first.x< -192||first.x>192)this.pointer.alpha=0;
    }
    for(const vm of this.numbers)vm.update();for(const panel of this.panels)for(const vm of panel.animations)vm.update();this.label?.update();if(this.managePointer)this.pointer.update();
    this.nameAnimation?.update();
    for(const vm of this.stars)if(vm){tree(vm,!state.hidden);vm.update();}
    for(const vm of this.retiringStars){tree(vm,!state.hidden);vm.update();}
    this.retiringStars=this.retiringStars.filter(vm=>vm.alive);
    return this;
  }
  draw(draw: DrawList,view: AnmView=viewDefault): DrawList{
    if(this.state.hidden)return draw;
    for(const vm of this.numbers)vm.draw(draw,view);for(const panel of this.panels)for(const vm of panel.animations)vm.draw(draw,view);this.label?.draw(draw,view);if(this.managePointer)this.pointer.draw(draw,view);
    for(const vm of this.stars)vm?.draw(draw,view);for(const vm of this.retiringStars)vm.draw(draw,view);
    if(this.nameAnimation?.alive&&!this.state.hidden&&(this.font||this.drawName)){
      const vm=this.nameAnimation,position=vm.worldPosition(view),baseScale=this.font?.screenScale??1.5;
      const scale=(view.scale??1)*(view.screenScale??baseScale)/baseScale,alpha=vm.alpha;
      const options={...this.nameStyle,x:position.x/baseScale,y:position.y/baseScale,
        scaleX:this.nameStyle.scaleX!*scale,scaleY:this.nameStyle.scaleY!*scale,
        color:((alpha<<24)|((this.nameStyle.color??0xffffff)&0xffffff))>>>0,
        shadowColor:((alpha<<24)|((this.nameStyle.shadowColor??0)&0xffffff))>>>0,drawPriority:vm.drawPriority};
      if(this.drawName)this.drawName(draw,this.name,options,vm);else this.font!.draw(draw,this.name,options);
    }
    if(this.font&&this.timerVisible&&!this.state.paused&&!this.state.timerHidden){
      const first=this.numbers[0],x=add(first.F(0x2c),16),y=sub(first.F(0x30),7),options={font:4,color:first.U(0x490),drawPriority:84};
      const baseScale=this.font.screenScale??1.5,scale=(view.scale??1)*(view.screenScale??baseScale)/baseScale;
      const translated=(atX: number,atY: number,size: number)=>({...options,x:atX*scale+(view.x??0)/baseScale,y:atY*scale+(view.y??0)/baseScale,scaleX:size*scale,scaleY:size*scale});
      this.font.draw(draw,'.',translated(x,y,1));this.font.draw(draw,String(this.hundredths).padStart(2,'0'),translated(add(x,8),add(y,6),.6));
    }
    return draw;
  }
  snapshot(): Record<string,unknown>{return {seconds:this.seconds,hundredths:this.hundredths,timerMode:this.timerMode,pointerMode:this.pointerMode,timerVisible:this.timerVisible,name:this.name,remainingSpells:this.remainingSpells,stars:(this.stars.filter(Boolean) as AnmInstance[]).map(vm=>({script:vm.scriptId,alpha:vm.alpha,alive:vm.alive})),retiringStars:this.retiringStars.map(vm=>({script:vm.scriptId,alpha:vm.alpha,scaleX:vm.scaleX})),panels:this.panels.map(p=>({fraction:p.fraction,target:p.target,hp:p.hp,near:p.near,markers:p.markers.slice()}))};}
  destroy(): void{for(const vm of this.numbers)vm.destroy();for(const panel of this.panels)this.clearPanel(panel);this.label?.destroy();this.nameAnimation?.destroy();for(const vm of this.stars)vm?.destroy();for(const vm of this.retiringStars)vm.destroy();this.stars.fill(null);this.retiringStars.length=0;if(this.managePointer)this.pointer.destroy();}
}
