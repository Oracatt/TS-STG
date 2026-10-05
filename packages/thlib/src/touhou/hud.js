// FrontInf lifecycle/icons and numeric placement from hud_system/{enable,icons,draw}.cpp.
import { touhouGroupedScore } from './font.js';
import { mul } from './math.js';
import { invalidTouhouSpellTime } from './spell.js';
import {TOUHOU_PLAYER_RULES} from './player-rules.js';

const screenView={x:0,y:0,scale:1,screenScale:1.5};
// Layer 22 uses the playfield-centered viewport; HUD numbers use the full screen.
const noticeView={x:336,y:24,scale:1,screenScale:1.5};
const visibleTree=(vm,visible)=>{vm.visible=visible;for(const child of vm.children??[])visibleTree(child,visible);};
const whole=(value,name,minimum=0)=>{if(!Number.isSafeInteger(value)||value<minimum)throw new RangeError(`${name} must be an integer >= ${minimum}`);return value;};
const label=(explicit,fallback,name)=>{const script=explicit===undefined?fallback:explicit;if(script!==null)whole(script,name);return script;};

export class TouhouHud {
  constructor({bank,textBank=null,font,character=0,difficulty=1,lives=2,bombs=2,rules={},maximumLives,maximumBombs,
    maxPower,powerPerLevel,lifeFragmentThreshold,bombFragmentThreshold,characterScript,difficultyScript}={}) {
    const r={...TOUHOU_PLAYER_RULES,...rules};
    this.maximumLives=whole(maximumLives??r.maxLives,'maximumLives');this.maximumBombs=whole(maximumBombs??r.maxBombs,'maximumBombs');
    this.maxPower=whole(maxPower??r.maxPower,'maxPower',1);this.powerPerLevel=whole(powerPerLevel??r.powerPerLevel,'powerPerLevel',1);
    this.lifeFragmentThreshold=whole(lifeFragmentThreshold??r.lifeFragmentThreshold,'lifeFragmentThreshold',1);
    this.bombFragmentThreshold=whole(bombFragmentThreshold??r.bombFragmentThreshold,'bombFragmentThreshold',1);
    const difficultyLabel=label(difficultyScript,Number.isInteger(difficulty)&&difficulty>=0&&difficulty<=5?difficulty+75:null,'difficultyScript');
    const characterLabel=label(characterScript,character===0||character===1?character+101:null,'characterScript');
    this.bank=bank;this.textBank=textBank;this.font=font;this.roots=[bank.create(0,{secondary:true}),bank.create(100)];
    if(difficultyLabel!==null)this.roots.push(bank.create(difficultyLabel));
    if(characterLabel!==null)this.roots.push(bank.create(characterLabel));
    this.lifeIcons=Array.from({length:7},(_,i)=>bank.create(i+32,{secondary:true}));
    this.bombIcons=Array.from({length:7},(_,i)=>bank.create(i+40,{secondary:true}));
    this.lastLife='';this.lastBomb='';this.lifeStock=null;this.bombStock=null;
    this.notices=[null,null];this.scoreDigits=[];this.timeAnimations=[];this.timeNotice=null;
    this.setLives(lives,0);this.setBombs(bombs,0);
  }
  /** hud_system/notifications.cpp: independent result/stock slots, no invented queue.
   * Values are displayed points, not the stored score/10 units. */
  notice(type,value=0,{spell=null}={}) {
    if(![0,1,2,3,4,6].includes(type))return false;
    if(type===0&&!this.textBank)throw new Error('Spell capture notice requires the common ascii_960 ANM bank');
    const slot=type>=2&&type<=4?1:0,script=type===6?54:type+49;
    this.notices[slot]?.animation.destroy();
    this.notices[slot]={type,value,animation:this.bank.create(script)};
    if(type===0){
      for(const vm of this.scoreDigits)vm.destroy();this.scoreDigits=[];
      let remainder=value|0,place=10000000,significant=false;
      for(let i=0;i<8;i++){
        const vm=this.textBank.create(i+4),digit=Math.trunc(remainder/place);if(digit)significant=true;
        vm.setSprite(digit+239);visibleTree(vm,significant);this.scoreDigits.push(vm);remainder%=place;place/=10;
      }
      if(value>999999){const vm=this.textBank.create(12);vm.setSprite(253);this.scoreDigits.push(vm);}
      if(value>999){const vm=this.textBank.create(13);vm.setSprite(253);this.scoreDigits.push(vm);}
    }
    if(type===0||type===1){
      const animation=this.bank.create(84);this.timeAnimations.push(animation);
      this.timeNotice={animation,spell,frames:spell?.frames??0,encodedTime:spell?.encodedTime??0,captureIndex:spell?.captureIndex??0};
      if(type===1){
        // The recovered front:50 is centered at y=256, while front:84 starts
        // at y=256. Their source quads overlap by half the 64-unit banner.
        // Resolve that composition collision in this shared owner, retaining
        // both original scripts, alpha timelines and the fixed time rows.
        // This is a thlib readability correction, not a recovered source move.
        const banner=this.notices[0].animation;
        banner.y-=banner.F(0x74)/2;
      }
    }
    return true;
  }
  get activeNotice(){return this.notices.some(entry=>entry?.animation.alive)||this.scoreDigits.some(vm=>vm.alive)||this.timeAnimations.some(vm=>vm.alive);}
  updateNotices(){
    for(const entry of this.notices)entry?.animation.update();
    for(const vm of this.scoreDigits)vm.update();for(const vm of this.timeAnimations)vm.update();
    this.notices=this.notices.map(entry=>entry?.animation.alive?entry:null);
    this.scoreDigits=this.scoreDigits.filter(vm=>vm.alive);this.timeAnimations=this.timeAnimations.filter(vm=>vm.alive);
    const time=this.timeNotice;
    if(time&&!time.animation.alive)this.timeNotice=null;
    else if(time?.spell){
      const generation=time.spell.captureIndex??0;
      if(generation===((time.captureIndex+1)>>>0)||(generation===time.captureIndex&&!time.spell.active&&time.spell.frames===time.frames))time.encodedTime=time.spell.encodedTime;
    }
  }
  drawNotices(draw){
    for(const entry of this.notices)entry?.animation.draw(draw,noticeView);
    for(const vm of this.scoreDigits)vm.draw(draw,noticeView);for(const vm of this.timeAnimations)vm.draw(draw,noticeView);
    const time=this.timeNotice;if(!time?.animation.alive||!time.spell||!this.font)return;
    // hud_system/draw.cpp: first line is simulation time, second the recorded
    // platform time. Invalid replay clock values have the source 999.99 sentinel.
    const alpha=time.animation.alpha,options={font:4,drawPriority:84,color:((alpha<<24)|0xffffff)>>>0};
    const row=(seconds,hundredths,y,color)=>{
      this.font.draw(draw,`${String(seconds).padStart(3,' ')}.`,{...options,x:224,y,color});
      this.font.draw(draw,`${String(hundredths).padStart(2,'0')}s`,{...options,x:268,y:y+6,scaleX:.6,scaleY:.6,color});
    };
    row(Math.min(Math.trunc(time.frames/60),999),Math.trunc((time.frames%60)*100/60),144,options.color);
    const encoded=time.encodedTime,invalid=invalidTouhouSpellTime(encoded);
    row(invalid?999:(Math.trunc(encoded/100)%1000+934)%1000,invalid?99:(encoded%100+67)%100,160,((alpha<<24)|0x808080)>>>0);
  }
  icons(entries,full,fragments,maximum,threshold) {
    whole(maximum,'maximum stock');whole(full,'stock',-1);whole(fragments,'fragments');whole(threshold,'fragment threshold',1);
    const slots=Math.min(maximum,7),shown=Math.min(full,slots);
    for(const vm of entries)vm.x=mul(7-slots,28);
    let i=0;for(;i<shown;i++)entries[i].interrupt(2);
    // Source artwork contains only thirds. Other thresholds use an empty next
    // icon and their exact numeric fraction rather than a misleading picture.
    if(i<slots)entries[i++].interrupt((threshold===3&&fragments<3?fragments:0)+7);
    for(;i<slots;i++)entries[i].interrupt(3);
    for(;i<7;i++)entries[i].interrupt(5);
  }
  setLives(full,fragments=0) {const key=`${full}:${fragments}:${this.maximumLives}:${this.lifeFragmentThreshold}`;if(key!==this.lastLife){this.icons(this.lifeIcons,full,fragments,this.maximumLives,this.lifeFragmentThreshold);this.lastLife=key;}this.lifeStock={full,fragments};}
  setBombs(full,fragments=0) {const key=`${full}:${fragments}:${this.maximumBombs}:${this.bombFragmentThreshold}`;if(key!==this.lastBomb){this.icons(this.bombIcons,full,fragments,this.maximumBombs,this.bombFragmentThreshold);this.lastBomb=key;}this.bombStock={full,fragments};}
  update(state={}) {
    this.setLives(state.lives??2,state.lifeFragments??0);this.setBombs(state.bombs??2,state.bombFragments??0);
    for(const vm of [...this.roots,...this.lifeIcons,...this.bombIcons])vm.update();
    this.updateNotices();
  }
  draw(draw,state={}, {hideNumbers=false}={}) {
    // front.anm mixes 1280-unit sprites (313 mode 2) with 640-unit
    // gradient underlines (mode 1); each VM applies its own recovered mode.
    for(const vm of [...this.roots,...this.lifeIcons,...this.bombIcons])vm.draw(draw,screenView);
    this.drawNotices(draw);
    if(hideNumbers)return draw;
    const alpha=this.lifeIcons[0].alpha??255, tint=color=>((color&0xffffff)|((alpha&255)<<24))>>>0;
    const put=(text,x,y,options={})=>this.font.draw(draw,text,{x,y,font:10,drawPriority:75,color:tint(0xff000000),shadowColor:tint(0xffffffff),...options});
    put(touhouGroupedScore(state.highScore??0,state.highScoreDigit??0),620,42,{alignX:2,color:tint(0xff707070),shadowColor:tint(0x80ffffff)});
    put(touhouGroupedScore(state.score??0,state.continues??0),620,64,{alignX:2,color:tint(0xff001080),shadowColor:tint(0xd0ffffff)});
    put(String(state.lifeFragments??0).padStart(3,' '),576,120,{scaleX:.6});put(`/${this.lifeFragmentThreshold}`,597,120,{scaleX:.6});
    put(String(state.bombFragments??0).padStart(3,' '),576,158,{scaleX:.6});put(`/${this.bombFragmentThreshold}`,597,158,{scaleX:.6});
    const life=state.lives??this.lifeStock.full,bomb=state.bombs??this.bombStock.full;
    if(this.maximumLives>7||life>7)put(`${life}/${this.maximumLives}`,558,120,{alignX:2,scaleX:.6});
    if(this.maximumBombs>7||bomb>7)put(`${bomb}/${this.maximumBombs}`,558,158,{alignX:2,scaleX:.6});
    const power=Math.max(0,Math.min(this.maxPower,state.power??100)),color=tint(0xff800000),shadowColor=tint(0x80ffd0d0);
    const parts=value=>[Math.floor(value/this.powerPerLevel),String(Math.floor((value%this.powerPerLevel)*100/this.powerPerLevel)).padStart(2,'0')];
    const value=parts(power),maximum=parts(this.maxPower);
    if(maximum[0]>9){put(`${value[0]}.${value[1]}/${maximum[0]}.${maximum[1]}`,620,182,{alignX:2,scaleX:.75,color,shadowColor});}
    else{
      put(`${value[0]}.`,540,182,{color,shadowColor});
      put(value[1],560,189,{scaleX:.6,color,shadowColor});
      put(`/${maximum[0]}.`,574,182,{color,shadowColor});put(maximum[1],606,189,{scaleX:.6,color,shadowColor});
    }
    // Source field44 is the title-specific resource. It is deliberately absent
    // from the gameplay model; do not fabricate it as a generic point value.
    return draw;
  }
  snapshot(){return {activeNotice:this.activeNotice,notices:this.notices.flatMap((entry,slot)=>entry?[{slot,type:entry.type,value:entry.value,...entry.animation.snapshot()}]:[]),scoreDigits:this.scoreDigits.map(vm=>({...vm.snapshot(),visible:vm.visible})),time:this.timeNotice?{frames:this.timeNotice.frames,encodedTime:this.timeNotice.encodedTime,...this.timeNotice.animation.snapshot()}:null};}
  destroy(){for(const vm of [...this.roots,...this.lifeIcons,...this.bombIcons,...this.notices.flatMap(entry=>entry?[entry.animation]:[]),...this.scoreDigits,...this.timeAnimations])vm.destroy();this.notices=[null,null];this.scoreDigits=[];this.timeAnimations=[];this.timeNotice=null;}
}
