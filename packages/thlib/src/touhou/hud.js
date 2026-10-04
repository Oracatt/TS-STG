// FrontInf lifecycle/icons and numeric placement from hud_system/{enable,icons,draw}.cpp.
import { touhouGroupedScore } from './font.js';
import { mul } from './math.js';
import { invalidTouhouSpellTime } from './spell.js';

const screenView={x:0,y:0,scale:1,screenScale:1.5};
// Layer 22 uses the playfield-centered viewport; HUD numbers use the full screen.
const noticeView={x:336,y:24,scale:1,screenScale:1.5};
const visibleTree=(vm,visible)=>{vm.visible=visible;for(const child of vm.children??[])visibleTree(child,visible);};

export class TouhouHud {
  constructor({bank,textBank=null,font,character=0,difficulty=1,lives=2,bombs=2,maximumLives=7,maximumBombs=7}={}) {
    this.bank=bank;this.textBank=textBank;this.font=font;this.roots=[bank.create(0,{secondary:true}),bank.create(100),bank.create(difficulty+75),bank.create(character+101)];
    this.lifeIcons=Array.from({length:7},(_,i)=>bank.create(i+32,{secondary:true}));
    this.bombIcons=Array.from({length:7},(_,i)=>bank.create(i+40,{secondary:true}));
    this.maximumLives=maximumLives;this.maximumBombs=maximumBombs;this.lastLife='';this.lastBomb='';
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
  icons(entries,full,fragments,maximum) {
    if(!Number.isInteger(maximum)||maximum<0||maximum>7||full>maximum||full< -1||fragments<0||fragments>=3)
      throw new RangeError('Original HUD icon state outside seven slots / three fragments');
    for(const vm of entries)vm.x=mul(7-maximum,28);
    let i=0;for(;i<full;i++)entries[i].interrupt(2);
    if(i<maximum)entries[i++].interrupt(fragments+7);
    for(;i<maximum;i++)entries[i].interrupt(3);
    for(;i<7;i++)entries[i].interrupt(5);
  }
  setLives(full,fragments=0) {const key=`${full}:${fragments}:${this.maximumLives}`;if(key!==this.lastLife){this.icons(this.lifeIcons,full,fragments,this.maximumLives);this.lastLife=key;}}
  setBombs(full,fragments=0) {const key=`${full}:${fragments}:${this.maximumBombs}`;if(key!==this.lastBomb){this.icons(this.bombIcons,full,fragments,this.maximumBombs);this.lastBomb=key;}}
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
    put(String(state.lifeFragments??0).padStart(3,' '),576,120,{scaleX:.6});put('/3',597,120,{scaleX:.6});
    put(String(state.bombFragments??0).padStart(3,' '),576,158,{scaleX:.6});put('/3',597,158,{scaleX:.6});
    const power=Math.max(0,Math.min(400,state.power??100)),color=tint(0xff800000),shadowColor=tint(0x80ffd0d0);
    put(`${Math.floor(power/100)}.`,540,182,{color,shadowColor});
    put(String(power%100).padStart(2,'0'),560,189,{scaleX:.6,color,shadowColor});
    put('/4.',574,182,{color,shadowColor});put('00',606,189,{scaleX:.6,color,shadowColor});
    // Source field44 is the title-specific resource. It is deliberately absent
    // from the gameplay model; do not fabricate it as a generic point value.
    return draw;
  }
  snapshot(){return {activeNotice:this.activeNotice,notices:this.notices.flatMap((entry,slot)=>entry?[{slot,type:entry.type,value:entry.value,...entry.animation.snapshot()}]:[]),scoreDigits:this.scoreDigits.map(vm=>({...vm.snapshot(),visible:vm.visible})),time:this.timeNotice?{frames:this.timeNotice.frames,encodedTime:this.timeNotice.encodedTime,...this.timeNotice.animation.snapshot()}:null};}
  destroy(){for(const vm of [...this.roots,...this.lifeIcons,...this.bombIcons,...this.notices.flatMap(entry=>entry?[entry.animation]:[]),...this.scoreDigits,...this.timeAnimations])vm.destroy();this.notices=[null,null];this.scoreDigits=[];this.timeAnimations=[];this.timeNotice=null;}
}
