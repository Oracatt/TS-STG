import type {AnmBank,AnmInstance} from './anm.js';
import type {DrawList} from '../index.js';
import type {TouhouDamageSource,TouhouPlayer,TouhouPlayerContext} from './player.js';
import type {TouhouWorld,TouhouWorldOptions,TouhouNormalizedWorldBounds} from './world.js';
export interface TouhouVector {x:number;y:number;z:number;}
export interface TouhouMotionOptions {position?:Partial<TouhouVector>;velocity?:Partial<TouhouVector>;delta?:Partial<TouhouVector>;flags?:number;speed?:number;angle?:number;radius?:number;angularVelocity?:number;axisAngle?:number;ellipseScale?:number;phase?:number;damping?:number;}
export interface TouhouEnemyContext extends TouhouPlayerContext {spell?:import('./spell.js').TouhouSpell;player?:TouhouPlayer;effectBank?:AnmBank|null;deferEnemyContact?:boolean;deferEnemyDamageFeedback?:boolean;enemyContactBlocked?:boolean;
  /** Return true to postpone body removal, ordinary death effects, drops and callbacks. The owner must finish defeat with this hook disabled. */
  deferEnemyDefeat?:(enemy:TouhouEnemy,source:unknown)=>boolean;
  /** Recheck after onUpdate so a newly held actor does not move once more in that frame. */
  isEnemyHeld?:(enemy:TouhouEnemy)=>boolean;
  /** Return true to replace only the ordinary enemy death sound/ANM; drops and defeat callbacks still run. */
  presentEnemyDeath?:(enemy:TouhouEnemy,source:unknown)=>boolean;
  onEnemyDefeat?:(enemy:TouhouEnemy,source:unknown)=>void;}
export interface TouhouEnemyOptions extends TouhouWorldOptions {id?:number;bank:AnmBank;script?:number;x?:number;y?:number;hp?:number;radius?:number;directional?:boolean;motion?:TouhouMotion;onUpdate?:(enemy:TouhouEnemy,context:TouhouEnemyContext)=>void;onDefeat?:(enemy:TouhouEnemy,context:TouhouEnemyContext,source:unknown)=>void;onContact?:(enemy:TouhouEnemy,player:TouhouPlayer,context:TouhouEnemyContext)=>void;deathBank?:AnmBank|null;deathScript?:number;deathSound?:number;animationFile?:number;primaryFlags?:number;flags?:number;contactWidth?:number;contactHeight?:number;contactAngle?:number;damageInvulnerability?:number;contactInvulnerability?:number;hitSound?:number;spell?:boolean;drop?:Array<Omit<Parameters<NonNullable<TouhouPlayerContext['spawnItem']>>[0],'x'|'y'>>;autoBounds?:boolean;}
// Common motion and directional enemy animation ports. Stage logic remains JS.
// Source: runtime_state/motion.cpp; gameplay/enemy_movement.cpp (497f40 family).
import { f32,PI,add,sub,mul,div,polar,rotate,sin,atan2,wrapAngle,angleDifference,snap,TouhouTimer } from './math.js';
import { TouhouHealth, applyTouhouEnemyDamage } from './damage.js';
import { resolveTouhouWorld } from './world.js';
const vec=(v:Partial<TouhouVector>={})=>({x:f32(v.x??0),y:f32(v.y??0),z:f32(v.z??0)});
const plus=(a:TouhouVector,b:TouhouVector)=>({x:add(a.x,b.x),y:add(a.y,b.y),z:add(a.z,b.z)});
const minus=(a:TouhouVector,b:TouhouVector)=>({x:sub(a.x,b.x),y:sub(a.y,b.y),z:sub(a.z,b.z)});
const scaled=(a:TouhouVector,s: number)=>({x:mul(a.x,s),y:mul(a.y,s),z:mul(a.z,s)});
const damped=(v:number,d:number)=>sub(v,mul(v,d));

export class TouhouMotion {
  position:TouhouVector;
  velocity:TouhouVector;
  delta:TouhouVector;
  flags:number;
  speed:number;
  angle:number;
  radius:number;
  angularVelocity:number;
  axisAngle:number;
  ellipseScale:number;
  phase:number;
  damping:number;

  constructor({position,velocity,delta,flags=0,speed=0,angle=0,radius=0,angularVelocity=0,axisAngle=0,ellipseScale=0,phase=0,damping=0}: TouhouMotionOptions={}) {
    Object.assign(this,{position:vec(position),velocity:vec(velocity),delta:vec(delta),flags:flags>>>0,
      speed:f32(speed),angle:f32(angle),radius:f32(radius),angularVelocity:f32(angularVelocity),axisAngle:f32(axisAngle),ellipseScale:f32(ellipseScale),phase:f32(phase),damping:f32(damping)});
  }
  updateVelocity(clockScale: number=1): void {
    if(this.flags&32)return;
    switch(this.flags&15) {
      case 0: {
        const p=polar(this.angle,mul(clockScale,this.speed));this.delta.x=p.x;this.delta.y=p.y;
        if(this.damping>0)this.delta=minus(this.delta,scaled(this.delta,this.damping));
        if(this.flags&16)this.angle=wrapAngle(add(damped(mul(clockScale,this.angularVelocity),this.damping),this.angle));
        break;
      }
      case 2:case 3:
        this.radius=add(damped(mul(clockScale,this.angularVelocity),this.damping),this.radius);
        this.angle=wrapAngle(add(damped(mul(clockScale,this.speed),this.damping),this.angle));break;
      case 4:
        this.phase=wrapAngle(add(this.phase,damped(mul(clockScale,this.angularVelocity),this.damping)));
        this.delta={...polar(this.axisAngle,mul(clockScale,this.speed)),z:0};break;
    }
  }
  updatePosition(clockScale: number=1): void {
    if(this.flags&32)return;
    switch(this.flags&15) {
      case 0:this.position=plus(this.position,this.delta);break;
      case 2:this.position=plus(this.delta,{...polar(this.angle,this.radius),z:0});break;
      case 3: {
        let offset=polar(wrapAngle(wrapAngle(angleDifference(this.angle,this.axisAngle))),this.radius);
        offset.x=mul(offset.x,this.ellipseScale);offset=rotate(offset.x,offset.y,this.axisAngle);
        this.position=plus(this.delta,{...offset,z:0});break;
      }
      case 4: {
        const previous=this.position;this.velocity=plus(this.velocity,this.delta);
        const angle=wrapAngle(wrapAngle(add(this.axisAngle,f32(1.5707963705062866))));
        const amplitude=mul(mul(sin(this.phase),this.radius),clockScale);
        this.position=plus({...polar(angle,amplitude),z:0},this.velocity);
        const difference=minus(this.position,previous);this.angle=wrapAngle(atan2(difference.y,difference.x));break;
      }
    }
    this.position.x=snap(this.position.x);this.position.y=snap(this.position.y);
  }
  update(clockScale: number=1): this{this.updateVelocity(clockScale);this.updatePosition(clockScale);return this;}
}

/** enemy_spawn.cpp: default effect is selected from the base animation, not its directional transition. */
export function touhouEnemyDeathScript(script: number, animationFile: number = 2): number {
  if (animationFile !== 2) return 37;
  if ([5,25,53,94].includes(script)) return 33;
  if ([10,56,99].includes(script)) return 41;
  if ([15,109].includes(script)) return 45;
  if (script === 30) return 51;
  if (script === 35) return 50;
  if (script === 40) return 49;
  return 37;
}

/** Reusable minor enemy; caller supplies JS behavior, original ANM base and drops.
 * ECL bytecode and specific stage attack scripts are not implicitly emulated. */
export class TouhouEnemy {
  declare destroy?:()=>void;
  bank:AnmBank;script:number;directional:boolean;deathBank:AnmBank|null;drop:NonNullable<TouhouEnemyOptions['drop']>;onContact?:TouhouEnemyOptions['onContact'];
  entered: boolean;

  world:TouhouWorld;
  bounds:Readonly<TouhouNormalizedWorldBounds>;
  autoBounds:boolean;
  id:number;
  x:number;
  y:number;
  radius:number;
  alive:boolean;
  age:number;
  direction:number;
  motion:TouhouMotion;
  animation:AnmInstance;
  effects:AnmInstance[];
  invulnerable?:boolean;
  keepOffscreen?:boolean;
  health:TouhouHealth;
  damageInvulnerability:TouhouTimer;
  contactInvulnerability:TouhouTimer;
  primaryFlags:number;
  flags:number;
  contactWidth:number;
  contactHeight:number;
  contactAngle:number;
  deathScript:number;
  deathSound:number;
  lastHitPosition:TouhouVector;
  hitSound:number;
  hitCooldown:number;
  hitThisFrame:boolean;
  frameAge:number;
  previous:TouhouVector;
  z?:number;
  onUpdate?:TouhouEnemyOptions['onUpdate'];
  onDefeat?:TouhouEnemyOptions['onDefeat'];

  constructor({id=0,bank,script=0,x=0,y=0,hp=40,radius=12,directional=true,motion,
    onUpdate,onDefeat,onContact,deathBank=null,deathScript,deathSound=(id&1)+3,animationFile=2,
    primaryFlags=0,flags=0,contactWidth=24,contactHeight=24,contactAngle=0,
    damageInvulnerability=2,contactInvulnerability=0,hitSound=-1,spell=false,drop=[],world,bounds,autoBounds=true}: TouhouEnemyOptions={} as TouhouEnemyOptions) {
    if(typeof autoBounds!=='boolean')throw new TypeError('Enemy autoBounds must be boolean');
    this.world=resolveTouhouWorld({world,bounds});this.bounds=this.world.bounds;this.autoBounds=autoBounds;
    Object.assign(this,{id,bank,script,radius:f32(radius),directional,onUpdate,onDefeat,onContact,deathBank,
      deathScript:deathScript??touhouEnemyDeathScript(script,animationFile),deathSound,drop,
      primaryFlags:primaryFlags>>>0,flags:flags>>>0,contactWidth:f32(contactWidth),contactHeight:f32(contactHeight),contactAngle:f32(contactAngle)});
    this.health=new TouhouHealth(hp,{spell});
    if(hp>999)this.flags|=0x4000;
    this.hitSound=hitSound;this.hitCooldown=0;this.hitThisFrame=false;this.frameAge=0;
    this.damageInvulnerability=new TouhouTimer(damageInvulnerability);this.contactInvulnerability=new TouhouTimer(contactInvulnerability);
    this.x=f32(x);this.y=f32(y);this.alive=true;this.age=0;this.direction=0;this.entered=false;
    this.previous=vec({x,y});this.motion=motion??new TouhouMotion({position:{x,y}});
    this.lastHitPosition=vec();
    this.animation=bank.create(script,{x,y});this.effects=[];
  }
  get hp(): number{return this.health.hp;}
  set hp(value: number){this.health.set(value);}
  get damageTotal(): number{return this.health.damageTotal;}
  /** Spell health is stored at seven times the visible HP, retaining hit remainders. */
  prepareSpellHealth(hp: number=this.hp,threshold: number=0): this{this.health.threshold=threshold|0;this.health.set(hp,true);return this;}
  prepareNormalHealth(hp: number=this.hp): this{this.health.threshold=0;this.health.set(hp,false);return this;}
  damage(amount: number,source?: unknown,context: TouhouEnemyContext={}): number {
    if(!this.alive||this.invulnerable||(this.primaryFlags&0x21))return 0;
    amount|=0;
    const descriptor=source as TouhouDamageSource|null|undefined;
    const hitPosition=descriptor?.hitPosition??descriptor?.damagePosition??(Number.isFinite(descriptor?.x)&&Number.isFinite(descriptor?.y)?descriptor:null);
    if(hitPosition)this.lastHitPosition=vec(hitPosition);
    if(amount!==0||descriptor?.hitDetected)this.hitThisFrame=true;
    applyTouhouEnemyDamage(this.health,amount,this);
    if(!(this.primaryFlags&0x80)&&this.hp<=0)this.defeat(source,context);return amount;
  }
  /** Final branch of enemy_damage.cpp. Invoke after a deferred per-frame damage flush. */
  finishDamageFeedback(context: TouhouEnemyContext={}): void {
    if(!this.alive)return;
    const vm=this.animation,frame=this.frameAge,phaseHealth=(this.hp-this.health.threshold)|0;
    const spellFlags=context.spell?.flags??0,survival=(spellFlags&9)===9;
    if(this.hitCooldown){vm.flashColor=null;this.hitCooldown--;}
    else{
      if(this.flags&0x8000)vm.flashColor=frame%4===0?0xffff00ff:null;
      if(!this.hitThisFrame||(this.primaryFlags&0x2000)){
        if(frame%4!==0)vm.flashColor=null;
        else if((this.flags&0x4080)&&!survival&&phaseHealth<((spellFlags&1)?100:500))vm.flashColor=0xff0000ff;
      }else{
        vm.flashColor=0xff0000ff;this.hitCooldown=4;
        let sound=this.hitSound;
        if(sound<0)sound=(this.flags&0x4080)&&!survival&&phaseHealth<((spellFlags&1)?200:900)?35:34;
        context.sound?.(sound,this.x);
      }
    }
    this.hitThisFrame=false;
  }
  defeat(source?: unknown,context: TouhouEnemyContext={}): void {
    if(!this.alive)return;
    // A registered encounter may keep the body alive during its scripted
    // defeat sequence. Deferral precedes all ordinary sounds, drops and
    // callbacks; the owner later invokes defeat with this hook disabled.
    if(context.deferEnemyDefeat?.(this,source)===true)return;
    this.alive=false;
    // vector_6c is written by damage_regions::calculate_damage, not enemy motion.
    const dx=sub(this.x,this.lastHitPosition.x),dy=sub(this.y,this.lastHitPosition.y);
    const angle=mul(.2,.2)<=add(mul(dx,dx),mul(dy,dy))?atan2(dy,dx):div(-PI,2);
    // A concrete encounter can explicitly own the death presentation (for
    // example the registered Boss). HP/flag heuristics must not turn fairies
    // into Bosses or stack the small enemy explosion over the Boss effect.
    const presented=context.presentEnemyDeath?.(this,source)===true;
    if(!presented&&this.deathSound>=0)context.sound?.(this.deathSound,this.x);
    this.animation.destroy();
    const deathBank=this.deathBank??context.effectBank;
    if(!presented&&deathBank&&this.deathScript>=0)this.effects.push(deathBank.create(this.deathScript,{x:this.x,y:this.y,rotation:angle}));
    for(const entry of this.drop)context.spawnItem?.({...entry,x:this.x,y:this.y});
    this.onDefeat?.(this,context,source);context.onEnemyDefeat?.(this,source);
  }
  /** enemy_damage.cpp contact branch. Kept separate for hosts with split actor priorities. */
  collidePlayer(player: TouhouPlayer|undefined,context: TouhouEnemyContext={}): number {
    if(!this.alive||!player||(this.primaryFlags&0x22)||this.contactInvulnerability.current>0||
      (this.flags&0x400)||(context.enemyContactBlocked&&!(this.flags&0x80)))return 0;
    if(this.onContact){this.onContact(this,player,context);return 0;}
    const result=this.primaryFlags&0x1000?
      player.collisionRectangle(this.x,this.y,this.contactAngle,this.contactHeight,this.contactWidth,context):
      player.collisionCircle(this.x,this.y,div(this.contactWidth,2),context);
    if((this.primaryFlags&0x200)&&result===2&&this.age%6===0)player.addGraze(context,player,0);
    return result;
  }
  update(context: TouhouEnemyContext={}): void {
    for(const effect of this.effects)effect.update();this.effects=this.effects.filter(vm=>vm.alive);
    if(!this.alive)return;
    this.frameAge=this.age;
    this.onUpdate?.(this,context);this.previous=vec({x:this.x,y:this.y});
    if(!this.alive)return;
    if(context.isEnemyHeld?.(this)){this.animation.update();return;}
    this.motion.update(context.clockScale??1);this.x=this.motion.position.x;this.y=this.motion.position.y;
    this.updateAnimation(context);
    // Original deliberately uses animation height for x extent and width for y.
    const halfX=div(Math.abs(mul(this.animation.height,this.animation.scaleY)),2),halfY=div(Math.abs(mul(this.animation.width,this.animation.scaleX)),2);
    const outside=this.world.outside(this,halfX,halfY,0,true);
    if(!outside)this.entered=true;
    else if(this.autoBounds&&this.entered&&!this.keepOffscreen){this.alive=false;this.animation.destroy();}
    if(!context.deferEnemyContact)this.collidePlayer(context.player,context);
    if(this.damageInvulnerability.current>0)this.damageInvulnerability.add(-1,context.timerRate??1);
    if(this.contactInvulnerability.current>0)this.contactInvulnerability.add(-1,context.timerRate??1);
    this.age++;
  }
  /** Animate a body moved by an external sequence without ticking its attack
   * or applying automatic offscreen retirement before that sequence ends. */
  updateAnimation(context: TouhouEnemyContext={}): void {
    const dx=sub(this.x,this.previous.x),next=dx<f32(-.03)?-1:dx>f32(.03)?1:0;
    if(this.directional&&next!==this.direction) {
      const transition=this.direction===-1?(next===0?3:2):this.direction===0?(next===-1?1:2):(next===0?4:1);
      this.animation.destroy();this.animation=this.bank.create(this.script+transition,{x:this.x,y:this.y});this.direction=next;
    }
    this.animation.x=this.x;this.animation.y=this.y;
    if(this.z!==undefined)this.animation.z=this.z;
    if(!context.deferEnemyDamageFeedback)this.finishDamageFeedback(context);
    this.animation.update();
  }
  draw(draw: DrawList,view?: {x:number;y:number;scale:number;screenScale?:number}): DrawList{if(this.alive)this.animation.draw(draw,view);for(const effect of this.effects)effect.draw(draw,view);return draw;}
  snapshot(): {id:number;x:number;y:number;hp:number;scaledHp:number;healthFlags:number;damageTotal:number;alive:boolean;age:number;direction:number}{return {id:this.id,x:this.x,y:this.y,hp:this.hp,scaledHp:this.health.scaledHp,healthFlags:this.health.flags,damageTotal:this.damageTotal,alive:this.alive,age:this.age,direction:this.direction};}
}
