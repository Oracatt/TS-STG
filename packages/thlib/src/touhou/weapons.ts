import type {AnmDrawList as DrawList} from './anm.js';
import type {TouhouPlayer,TouhouPlayerOption,TouhouPlayerContext,TouhouPlayerOptions,TouhouPlayerWeapon,TouhouView} from './player.js';
import {TOUHOU_PLAYER_PROFILES} from './player-profile.js';
import {getTouhouWeaponData,type TouhouWeaponIndex} from './weapon-data.js';
import {fireTouhouPattern} from './shots.js';
import {applyTouhouDamage} from './bombs.js';
import {argbToRgba} from './distortion.js';
import {PI,add,mul,div,sin,atan2,polar,rotate,wrapAngle,angleDifference,trunc32,TouhouTimer,TouhouRNG} from './math.js';

/** Paired Reimu/Marisa weapon families, independent of equipment or a stone meter. */
export const TOUHOU_WEAPON_IDS=Object.freeze({standard:0,spread:1,frost:2,rear:3,contact:4,purification:5,beast:6,wind:7} as const);
export type TouhouWeaponName=keyof typeof TOUHOU_WEAPON_IDS;
export type TouhouWeaponSelection=TouhouWeaponIndex|TouhouWeaponName;
/** Original shot names from stonetext.txt; these identify weapons, not their equipment. */
export const TOUHOU_WEAPON_NAMES=Object.freeze([
  Object.freeze(['紅い妖気を纏う針','拡散する呪われた御札','執着するホーミング御札','背中の力','禁忌のオプション','浄化のオプション','オオワシの群れ','神秘の蛇']),
  Object.freeze(['紅色の魔レーザー','血塗られたミサイル','アイシクルショット','前後のない世界','禁忌のオプション','浄化のオプション','オオカミの群れ','土着の蛙']),
]);
function indexOf(selection:TouhouWeaponSelection):TouhouWeaponIndex{
  const id=typeof selection==='string'?TOUHOU_WEAPON_IDS[selection]:selection;
  if(!Number.isInteger(id)||id<0||id>7)throw new RangeError('Unknown Touhou weapon; select an index 0 through 7 or a TOUHOU_WEAPON_IDS name');
  return id;
}
const fixed=(value:number)=>trunc32(mul(value,128));
type FixedPoint={x:number;y:number};
interface OptionState{angle:number;age:TouhouTimer;ring:OptionRing|null;}

/** effect_system/rings.cpp: original descriptor 7/8 procedural geometry.
 * These rings are untextured source effects, not substitutes for missing art. */
class OptionRing{
  readonly age=new TouhouTimer(0);
  readonly rings:Array<{radii:number[];colors:number[];positions:FixedPoint[]}>;
  x:number;y:number;
  constructor(readonly filled:boolean,readonly rng:TouhouRNG,x:number,y:number){
    this.x=x;this.y=y;
    this.rings=(filled?[0x00ff0000]:[0xffff4040,0xffc040ff,0xffffff40]).map(color=>({
      radii:Array.from({length:60},()=>32),colors:Array.from({length:60},(_,i)=>filled&&i===0?0x80ffff80:color),
      positions:Array.from({length:60},()=>({x:0,y:0})),
    }));
  }
  update(rate:number):void{
    if(this.age.current!==this.age.previous)for(const ring of this.rings){
      if(this.filled)for(let i=0;i<60;i++)ring.colors[i]=((ring.colors[i]&0xff00ffff)|((trunc32(add(mul(this.rng.signed(),16),224))&255)<<16))>>>0;
      for(let i=0;i<60;i++)ring.radii[i]=Math.max(this.filled?24:28,Math.min(this.filled?40:36,add(ring.radii[i],mul(this.rng.signed(),2))));
      if(this.filled)ring.radii[0]=0;
      let angle=0;const step=div(mul(PI,2),this.filled?58:59);
      for(let i=0;i<60;i++){ring.positions[i]=polar(angle,ring.radii[i]);angle=wrapAngle(add(angle,step));}
      ring.positions[59]={...ring.positions[this.filled?1:0]};
    }
    this.age.tick(rate);
  }
  draw(draw:DrawList,view:TouhouView):void{
    const scale=view.scale??1;
    const point=(p:FixedPoint)=>({x:add(view.x??0,mul(add(this.x,p.x),scale)),y:add(view.y??0,mul(add(this.y,p.y),scale))});
    // rings.cpp selects ANM blend mode 1: source-alpha additive.
    draw.blend('add');
    for(const ring of this.rings){
      const vertices=ring.positions.map((p,i):[number,number,number,number,number]=>{const q=point(p);return[q.x,q.y,0,0,argbToRgba(ring.colors[i])];});
      if(this.filled){const indices:number[]=[];for(let i=1;i<59;i++)indices.push(0,i,i+1);draw.mesh(0,vertices,indices);}
      else draw.lineStrip(vertices.map(v=>[v[0],v[1],v[4]]));
    }
    draw.blendEnd();
  }
}

/** The eight normal weapon families. Owns options and their local combat effects;
 * equipment selection, resource meters and passive rewards remain application rules.
 * SHT patterns 15..19 remain available to explicit author-controlled emitters; this
 * owner does not silently activate the original game's separate special ability. */
export class TouhouWeapon implements TouhouPlayerWeapon{
  readonly id:TouhouWeaponIndex;
  readonly optionStates:OptionState[];
  private anchor:FixedPoint;
  private cooldown=0;
  private disposed=false;
  constructor(readonly player:TouhouPlayer,selection:TouhouWeaponSelection){
    this.id=indexOf(selection);
    if(player.character!==0&&player.character!==1)throw new RangeError('Original Touhou weapons require Reimu or Marisa');
    this.anchor={x:player.fixedX,y:player.fixedY};
    this.optionStates=player.options.map(()=>({angle:0,age:new TouhouTimer(0),ring:null}));
  }
  initializeOption(option:TouhouPlayerOption):void{
    const state=this.optionStates[option.index];
    // Orbit restarts its evenly spaced phases when power changes. The drifting
    // family retains its per-slot phase/timer, as the original Option owner does.
    if(this.id===2&&this.player.powerLevel)state.angle=wrapAngle(mul(option.index,div(mul(PI,2),this.player.powerLevel)));
    option.angle=state.angle;
  }
  onFocusChange(_focused:boolean):void{this.anchor={x:this.player.fixedX,y:this.player.fixedY};}
  optionTarget(option:TouhouPlayerOption,target:FixedPoint,context:TouhouPlayerContext):FixedPoint{
    const p=this.player,state=this.optionStates[option.index],focused=p.focused;
    if(this.id===2){
      const radius=p.character===0?(focused?32:60):(focused?28:40),offset=polar(state.angle,radius);
      target={x:(p.fixedX+fixed(offset.x))|0,y:(p.fixedY+fixed(offset.y))|0};
      const step=div(PI,focused?40:120);
      state.angle=wrapAngle(wrapAngle(p.character===0?add(state.angle,step):angleDifference(state.angle,step)));
    }else if(this.id===5){
      if(state.age.current===0)state.angle=wrapAngle(mul(p.rng.signed(),PI));
      const base=(focused?option.focusOffset:option.normalOffset)!;
      let local={x:mul(sin(state.angle),p.character===0?40:25),y:mul(sin(wrapAngle(mul(state.angle,2))),8)};
      if(p.character===1)local=rotate(local.y,local.x,atan2(base.y,base.x));
      target={x:((p.fixedX+fixed(base.x))|0)+fixed(local.x)|0,y:((p.fixedY+fixed(base.y))|0)+fixed(local.y)|0};
      const step=div(mul(PI,2),p.character===0&&focused?3000:1000);
      state.angle=wrapAngle(add(state.angle,add(step,div(mul(p.rng.unit(),mul(PI,2)),1000))));
      state.age.tick(context.timerRate??1);
    }else if(this.id===6&&focused){
      const offset=option.focusOffset!;
      target={x:(this.anchor.x+fixed(offset.x))|0,y:(this.anchor.y+fixed(offset.y))|0};
    }
    option.angle=state.angle;
    return target;
  }
  shoot(frame:number,secondary:number,context:TouhouPlayerContext):void{
    if(this.disposed)return;
    const p=this.player;
    fireTouhouPattern(p,p.powerLevel,frame,secondary,context);
    p.weaponPattern=(p.focused?2:1)*(p.weaponLevels+1)+p.powerLevel;
    fireTouhouPattern(p,p.weaponPattern,frame,secondary,context);
    if(this.id!==4&&this.id!==5)return;
    for(const option of p.options){
      const state=this.optionStates[option.index];
      if(!option.active){state.ring=null;continue;}
      state.ring??=new OptionRing(this.id===5,p.weaponRng,option.x,option.y);
      state.ring.x=option.x;state.ring.y=option.y;
      if(this.id===5){
        if(this.cooldown)this.cooldown--;
        if(!this.cooldown)this.cooldown+=(context.cancelCircle?.(option.x,option.y,2,{bullets:true,lasers:false,reward:false,reason:'purification-option'})??0);
      }
    }
  }
  update(context:TouhouPlayerContext):void{
    if(this.disposed)return;
    const p=this.player;
    p.weaponPattern=(p.focused?2:1)*(p.weaponLevels+1)+p.powerLevel;
    if(p.shootTimer.current<0){for(const state of this.optionStates)state.ring=null;return;}
    for(let i=0;i<this.optionStates.length;i++){
      const state=this.optionStates[i],ring=state.ring;
      if(!p.options[i].active){state.ring=null;continue;}
      if(!ring)continue;
      if(this.id===4&&ring.age.current!==ring.age.previous&&ring.age.current%3===0)
        applyTouhouDamage({shape:'circle',x:ring.x,y:ring.y,radius:32,damage:2,bomb:false,source:this},context);
      ring.update(context.timerRate??1);
    }
  }
  reset():void{
    for(const state of this.optionStates)state.ring=null;
    if(this.player.character===1)this.cooldown=0;
  }
  destroy():void{this.reset();this.disposed=true;}
  snapshot():Record<string,unknown>{
    const timer=(age:TouhouTimer)=>[age.previous,age.current,age.value];
    return{id:this.id,anchor:{...this.anchor},cooldown:this.cooldown,disposed:this.disposed,
      options:this.optionStates.map(state=>({angle:state.angle,age:timer(state.age),
        ring:state.ring?{x:state.ring.x,y:state.ring.y,age:timer(state.ring.age)}:null}))};
  }
  draw(draw:DrawList,view:TouhouView={x:336,y:24,scale:1.5}):void{
    if(this.disposed||!this.optionStates.some(state=>state.ring))return;
    if(draw.enqueuePriority){draw.enqueuePriority(24,target=>this.draw(target,view),{layer:11});return;}
    for(const state of this.optionStates)state.ring?.draw(draw,view);
  }
}

/** Construct one ready-to-use original weapon configuration. Bodies, movement,
 * deathbomb rules and Bombs still come from the ordinary Reimu/Marisa profile. */
export function createTouhouWeaponPreset(character:0|1|'reimu'|'marisa',selection:TouhouWeaponSelection):Pick<TouhouPlayerOptions,'character'|'sht'|'profile'>{
  const id=indexOf(selection),who=character==='reimu'?0:character==='marisa'?1:character;
  if(who!==0&&who!==1)throw new RangeError('Character must be 0/reimu or 1/marisa');
  return{character:who,sht:getTouhouWeaponData(who,id),profile:{...(who===0?TOUHOU_PLAYER_PROFILES.reimu:TOUHOU_PLAYER_PROFILES.marisa),
    weaponFactory:player=>new TouhouWeapon(player,id),shoot:(player,frame,secondary,context)=>player.weapon!.shoot(frame,secondary,context)}};
}
