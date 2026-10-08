// FrontInf lifecycle/icons and numeric placement from hud_system/{enable,icons,draw}.cpp.
import { touhouGroupedScore } from './font.js';
import { mul } from './math.js';
import { invalidTouhouSpellTime } from './spell.js';
import {TOUHOU_PLAYER_RULES} from './player-rules.js';
import {TouhouRenderQueue} from './render-queue.js';
import {TOUHOU_HUD_LABEL_SCRIPTS} from './hud-label-data.js';
export {TOUHOU_HUD_LABEL_SCRIPTS} from './hud-label-data.js';

const screenView=Object.freeze({x:0,y:0,scale:1,screenScale:1.5});
// Row origins use the recovered 640x480 screen coordinates. Moving a row moves
// its image label, underline, stock icons and numbers together.
export const TOUHOU_HUD_LAYOUT=Object.freeze(Object.fromEntries(Object.entries({
  highScore:{x:428,y:42},score:{x:428,y:64},lives:{x:428,y:96},bombs:{x:428,y:134},
  power:{x:444,y:182},pointValue:{x:444,y:204},graze:{x:444,y:226},replay:{x:440,y:274},
}).map(([key,value])=>[key,Object.freeze(value)])));
export const TOUHOU_HUD_PALETTE=Object.freeze(Object.fromEntries(Object.entries({
  highScore:{color:0xff707070,shadowColor:0x80ffffff},score:{color:0xff001080,shadowColor:0xd0ffffff},
  stock:{color:0xff000000,shadowColor:0xffffffff},power:{color:0xff800000,shadowColor:0x80ffd0d0},
  pointValue:{color:0xff701070,shadowColor:0x80f0c0f0},graze:{color:0xff000000,shadowColor:0xffffffff},
}).map(([key,value])=>[key,Object.freeze(value)])));
const frameScripts=new Set([2,3,4,5]);
const rowScripts=new Map([
  ...[6,20,21].map(id=>[id,'highScore']),...[7,22,23].map(id=>[id,'score']),
  ...[8,9,24,25].map(id=>[id,'lives']),...[10,11,26,27].map(id=>[id,'bombs']),
  ...[12,28,29].map(id=>[id,'power']),...[30,31].map(id=>[id,'pointValue']),
]);
const rowLayout=overrides=>{
  const result={};for(const key of Object.keys(overrides))if(!Object.hasOwn(TOUHOU_HUD_LAYOUT,key))throw new RangeError(`Unknown HUD row ${key}`);
  for(const[key,origin]of Object.entries(TOUHOU_HUD_LAYOUT)){
    const row={...origin,...overrides[key]};if(!Number.isFinite(row.x)||!Number.isFinite(row.y))throw new TypeError(`HUD row ${key} requires finite coordinates`);
    result[key]=Object.freeze(row);
  }return Object.freeze(result);
};
const numberPalette=overrides=>{
  const result={};for(const key of Object.keys(overrides))if(!Object.hasOwn(TOUHOU_HUD_PALETTE,key))throw new RangeError(`Unknown HUD palette ${key}`);
  for(const[key,original]of Object.entries(TOUHOU_HUD_PALETTE)){
    const colors={...original,...overrides[key]};for(const field of ['color','shadowColor'])if(!(field==='shadowColor'&&colors[field]===null)&&(!Number.isInteger(colors[field])||colors[field]<0||colors[field]>0xffffffff))throw new RangeError(`HUD palette ${key}.${field} requires an ARGB color`);
    result[key]=Object.freeze(colors);
  }return Object.freeze(result);
};
// Layer 22 uses the playfield-centered viewport; HUD numbers use the full screen.
const noticeView={x:336,y:24,scale:1,screenScale:1.5};
const visibleTree=(vm,visible)=>{vm.visible=visible;for(const child of vm.children??[])visibleTree(child,visible);};
const whole=(value,name,minimum=0)=>{if(!Number.isSafeInteger(value)||value<minimum)throw new RangeError(`${name} must be an integer >= ${minimum}`);return value;};
const label=(explicit,fallback,name)=>{const script=explicit===undefined?fallback:explicit;if(script!==null)whole(script,name);return script;};

export class TouhouHud {
  constructor({bank,textBank=null,font,character=0,difficulty=1,lives=2,bombs=2,rules={},maximumLives,maximumBombs,
    maxPower,powerPerLevel,lifeFragmentThreshold,bombFragmentThreshold,characterScript,difficultyScript,
    skin=null,layout={},palette={},replay=false}={}) {
    const r={...TOUHOU_PLAYER_RULES,...rules};
    this.maximumLives=whole(maximumLives??r.maxLives,'maximumLives');this.maximumBombs=whole(maximumBombs??r.maxBombs,'maximumBombs');
    this.maxPower=whole(maxPower??r.maxPower,'maxPower',1);this.powerPerLevel=whole(powerPerLevel??r.powerPerLevel,'powerPerLevel',1);
    this.lifeFragmentThreshold=whole(lifeFragmentThreshold??r.lifeFragmentThreshold,'lifeFragmentThreshold',1);
    this.bombFragmentThreshold=whole(bombFragmentThreshold??r.bombFragmentThreshold,'bombFragmentThreshold',1);
    const difficultyLabel=label(difficultyScript,Number.isInteger(difficulty)&&difficulty>=0&&difficulty<=5?difficulty+75:null,'difficultyScript');
    const characterLabel=label(characterScript,null,'characterScript');
    if(skin!==null&&(typeof skin!=='object'||['drawFrame','drawBranding'].some(key=>skin[key]!==undefined&&typeof skin[key]!=='function')))throw new TypeError('HUD skin callbacks must be functions');
    this.skin=skin??{};this.layout=rowLayout(layout);this.palette=numberPalette(palette);this.replay=!!replay;
    this.pointValueMinimum=whole(r.pointValueMinimum,'pointValueMinimum');this.renderQueue=new TouhouRenderQueue();
    this.bank=bank;this.textBank=textBank;this.font=font;this.roots=[bank.create(0,{secondary:true}),bank.create(100)];
    if(difficultyLabel!==null)this.roots.push(bank.create(difficultyLabel));
    if(characterLabel!==null)this.roots.push(bank.create(characterLabel));
    this.lifeIcons=Array.from({length:7},(_,i)=>bank.create(i+32,{secondary:true}));
    this.bombIcons=Array.from({length:7},(_,i)=>bank.create(i+40,{secondary:true}));
    this.labels=Object.fromEntries(['pointValue','graze'].map(key=>[key,bank.create(TOUHOU_HUD_LABEL_SCRIPTS[key],{secondary:true})]));
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
    for(const vm of [...this.roots,...this.lifeIcons,...this.bombIcons,...Object.values(this.labels)])vm.update();
    this.updateNotices();
  }
  rowView(row){
    const point=this.layout[row],original=TOUHOU_HUD_LAYOUT[row];
    return point.x===original.x&&point.y===original.y?screenView:{...screenView,x:(point.x-original.x)*screenView.screenScale,y:(point.y-original.y)*screenView.screenScale};
  }
  drawStatusTree(vm,draw){
    if(vm.alive===false||frameScripts.has(vm.scriptId))return;
    const row=rowScripts.get(vm.scriptId),view=row?this.rowView(row):screenView;
    // Custom banks which implement only the original draw contract still work.
    if(typeof vm.drawSelf!=='function'){vm.draw(draw,view);return;}
    vm.drawSelf(draw,view);for(const child of vm.children??[])this.drawStatusTree(child,draw);
  }
  draw(draw,state={}, {hideNumbers=false}={}) {
    const queue=draw.enqueueAnm&&draw.enqueuePriority?draw:this.renderQueue.reset();
    const context={view:screenView,state,hud:this,layout:this.layout};
    const alpha=this.lifeIcons[0].alpha??255, tint=color=>((color&0xffffff)|((alpha&255)<<24))>>>0;
    // Both the default frame and injected artwork have the same library-owned
    // slot. Branding follows the frame, before all labels and numeric values.
    queue.enqueuePriority(73,target=>{
      if(this.skin?.drawFrame)this.skin.drawFrame(target,context);
      else if(this.roots[0].alive!==false)for(const vm of this.roots[0].children??[])if(frameScripts.has(vm.scriptId))vm.draw(target,screenView);
    });
    if(this.skin?.drawBranding)queue.enqueuePriority(73,target=>this.skin.drawBranding(target,context));
    // front.anm mixes 1280-unit sprites (313 mode 2) with 640-unit
    // gradient underlines (mode 1); each VM applies its own recovered mode.
    this.drawStatusTree(this.roots[0],queue);
    for(const vm of this.roots.slice(1))vm.draw(queue,screenView);
    for(const vm of this.lifeIcons)vm.draw(queue,this.rowView('lives'));
    for(const vm of this.bombIcons)vm.draw(queue,this.rowView('bombs'));
    for(const key of ['pointValue','graze'])this.labels[key].draw(queue,this.rowView(key));
    if(state.replay??this.replay)this.font.draw(queue,'Replay',{...this.layout.replay,font:6,drawPriority:74,color:tint(0xffffffff),shadowColor:tint(0xff000000)});
    this.drawNotices(queue);
    if(hideNumbers){if(queue!==draw)queue.flush(draw);return draw;}
    const put=(row,text,x,y,options={})=>{
      const point=this.layout[row],original=TOUHOU_HUD_LAYOUT[row],colors=this.palette[row==='lives'||row==='bombs'?'stock':row];
      this.font.draw(queue,text,{x:x+point.x-original.x,y:y+point.y-original.y,font:10,drawPriority:75,color:tint(colors.color),shadowColor:colors.shadowColor===null?null:tint(colors.shadowColor),...options});
    };
    put('highScore',touhouGroupedScore(state.highScore??0,state.highScoreDigit??0),620,42,{alignX:2});
    put('score',touhouGroupedScore(state.score??0,state.continues??0),620,64,{alignX:2});
    put('lives',String(state.lifeFragments??0).padStart(3,' '),576,120,{scaleX:.6});put('lives',`/${this.lifeFragmentThreshold}`,597,120,{scaleX:.6});
    put('bombs',String(state.bombFragments??0).padStart(3,' '),576,158,{scaleX:.6});put('bombs',`/${this.bombFragmentThreshold}`,597,158,{scaleX:.6});
    const life=state.lives??this.lifeStock.full,bomb=state.bombs??this.bombStock.full;
    if(this.maximumLives>7||life>7)put('lives',`${life}/${this.maximumLives}`,558,120,{alignX:2,scaleX:.6});
    if(this.maximumBombs>7||bomb>7)put('bombs',`${bomb}/${this.maximumBombs}`,558,158,{alignX:2,scaleX:.6});
    const power=Math.max(0,Math.min(this.maxPower,state.power??100));
    const parts=value=>[Math.floor(value/this.powerPerLevel),String(Math.floor((value%this.powerPerLevel)*100/this.powerPerLevel)).padStart(2,'0')];
    const value=parts(power),maximum=parts(this.maxPower);
    if(maximum[0]>9){put('power',`${value[0]}.${value[1]}/${maximum[0]}.${maximum[1]}`,620,182,{alignX:2,scaleX:.75});}
    else{
      put('power',`${value[0]}.`,540,182);
      put('power',value[1],560,189,{scaleX:.6});
      put('power',`/${maximum[0]}.`,574,182);put('power',maximum[1],606,189,{scaleX:.6});
    }
    // These are portable player fields, not TH20's title-specific field44.
    const integer=value=>String(Math.max(0,Math.trunc(value))).replace(/\B(?=(\d{3})+(?!\d))/g,',');
    put('pointValue',integer(state.pointValue??this.pointValueMinimum),620,204,{alignX:2});
    put('graze',integer(state.graze??0),620,226,{alignX:2});
    if(queue!==draw)queue.flush(draw);
    return draw;
  }
  snapshot(){return {activeNotice:this.activeNotice,notices:this.notices.flatMap((entry,slot)=>entry?[{slot,type:entry.type,value:entry.value,...entry.animation.snapshot()}]:[]),scoreDigits:this.scoreDigits.map(vm=>({...vm.snapshot(),visible:vm.visible})),time:this.timeNotice?{frames:this.timeNotice.frames,encodedTime:this.timeNotice.encodedTime,...this.timeNotice.animation.snapshot()}:null};}
  destroy(){for(const vm of [...this.roots,...this.lifeIcons,...this.bombIcons,...Object.values(this.labels),...this.notices.flatMap(entry=>entry?[entry.animation]:[]),...this.scoreDigits,...this.timeAnimations])vm.destroy();this.notices=[null,null];this.scoreDigits=[];this.timeAnimations=[];this.timeNotice=null;}
}
