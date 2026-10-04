// Common motion and directional enemy animation ports. Stage logic remains JS.
// Source: runtime_state/motion.cpp; gameplay/enemy_movement.cpp (497f40 family).
import { f32,PI,add,sub,mul,div,polar,rotate,sin,atan2,wrapAngle,angleDifference,snap,TouhouTimer } from './math.js';
import { TouhouHealth, applyTouhouEnemyDamage } from './damage.js';
const vec=(v={})=>({x:f32(v.x??0),y:f32(v.y??0),z:f32(v.z??0)});
const plus=(a,b)=>({x:add(a.x,b.x),y:add(a.y,b.y),z:add(a.z,b.z)});
const minus=(a,b)=>({x:sub(a.x,b.x),y:sub(a.y,b.y),z:sub(a.z,b.z)});
const scaled=(a,s)=>({x:mul(a.x,s),y:mul(a.y,s),z:mul(a.z,s)});
const damped=(v,d)=>sub(v,mul(v,d));

export class TouhouMotion {
  constructor({position,velocity,delta,flags=0,speed=0,angle=0,radius=0,angularVelocity=0,axisAngle=0,ellipseScale=0,phase=0,damping=0}={}) {
    Object.assign(this,{position:vec(position),velocity:vec(velocity),delta:vec(delta),flags:flags>>>0,
      speed:f32(speed),angle:f32(angle),radius:f32(radius),angularVelocity:f32(angularVelocity),axisAngle:f32(axisAngle),ellipseScale:f32(ellipseScale),phase:f32(phase),damping:f32(damping)});
  }
  updateVelocity(clockScale=1) {
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
  updatePosition(clockScale=1) {
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
  update(clockScale=1){this.updateVelocity(clockScale);this.updatePosition(clockScale);return this;}
}

/** enemy_spawn.cpp: default effect is selected from the base animation, not its directional transition. */
export function touhouEnemyDeathScript(script, animationFile = 2) {
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
  constructor({id=0,bank,script=0,x=0,y=0,hp=40,radius=12,directional=true,motion,
    onUpdate,onDefeat,onContact,deathBank=null,deathScript,deathSound=(id&1)+3,animationFile=2,
    primaryFlags=0,flags=0,contactWidth=24,contactHeight=24,contactAngle=0,
    damageInvulnerability=2,contactInvulnerability=0,hitSound=-1,spell=false,drop=[]}={}) {
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
  get hp(){return this.health.hp;}
  set hp(value){this.health.set(value);}
  get damageTotal(){return this.health.damageTotal;}
  /** Spell health is stored at seven times the visible HP, retaining hit remainders. */
  prepareSpellHealth(hp=this.hp,threshold=0){this.health.threshold=threshold|0;this.health.set(hp,true);return this;}
  prepareNormalHealth(hp=this.hp){this.health.threshold=0;this.health.set(hp,false);return this;}
  damage(amount,source,context={}) {
    if(!this.alive||this.invulnerable||(this.primaryFlags&0x21))return 0;
    amount|=0;
    const hitPosition=source?.hitPosition??source?.damagePosition??(Number.isFinite(source?.x)&&Number.isFinite(source?.y)?source:null);
    if(hitPosition)this.lastHitPosition=vec(hitPosition);
    if(amount!==0||source?.hitDetected)this.hitThisFrame=true;
    applyTouhouEnemyDamage(this.health,amount,this);
    if(!(this.primaryFlags&0x80)&&this.hp<=0)this.defeat(source,context);return amount;
  }
  /** Final branch of enemy_damage.cpp. Invoke after a deferred per-frame damage flush. */
  finishDamageFeedback(context={}) {
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
  defeat(source,context={}) {
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
  collidePlayer(player,context={}) {
    if(!this.alive||!player||(this.primaryFlags&0x22)||this.contactInvulnerability.current>0||
      (this.flags&0x400)||(context.enemyContactBlocked&&!(this.flags&0x80)))return 0;
    if(this.onContact){this.onContact(this,player,context);return 0;}
    const result=this.primaryFlags&0x1000?
      player.collisionRectangle(this.x,this.y,this.contactAngle,this.contactHeight,this.contactWidth,context):
      player.collisionCircle(this.x,this.y,div(this.contactWidth,2),context);
    if((this.primaryFlags&0x200)&&result===2&&this.age%6===0)player.addGraze(context,player,0);
    return result;
  }
  update(context={}) {
    for(const effect of this.effects)effect.update();this.effects=this.effects.filter(vm=>vm.alive);
    if(!this.alive)return;
    this.frameAge=this.age;
    this.onUpdate?.(this,context);this.previous=vec({x:this.x,y:this.y});
    if(!this.alive)return;
    this.motion.update(context.clockScale??1);this.x=this.motion.position.x;this.y=this.motion.position.y;
    const dx=sub(this.x,this.previous.x),next=dx<f32(-.03)?-1:dx>f32(.03)?1:0;
    if(this.directional&&next!==this.direction) {
      const transition=this.direction===-1?(next===0?3:2):this.direction===0?(next===-1?1:2):(next===0?4:1);
      this.animation.destroy();this.animation=this.bank.create(this.script+transition,{x:this.x,y:this.y});this.direction=next;
    }
    this.animation.x=this.x;this.animation.y=this.y;
    if(!context.deferEnemyDamageFeedback)this.finishDamageFeedback(context);
    this.animation.update();
    // Original deliberately uses animation height for x extent and width for y.
    const halfX=div(Math.abs(mul(this.animation.height,this.animation.scaleY)),2),halfY=div(Math.abs(mul(this.animation.width,this.animation.scaleX)),2);
    const outside=-192>add(this.x,halfX)||sub(this.x,halfX)>192||0>add(this.y,halfY)||sub(this.y,halfY)>448;
    if(!outside)this.entered=true;
    else if(this.entered&&!this.keepOffscreen){this.alive=false;this.animation.destroy();}
    if(!context.deferEnemyContact)this.collidePlayer(context.player,context);
    if(this.damageInvulnerability.current>0)this.damageInvulnerability.add(-1,context.timerRate??1);
    if(this.contactInvulnerability.current>0)this.contactInvulnerability.add(-1,context.timerRate??1);
    this.age++;
  }
  draw(draw,view){if(this.alive)this.animation.draw(draw,view);for(const effect of this.effects)effect.draw(draw,view);return draw;}
  snapshot(){return {id:this.id,x:this.x,y:this.y,hp:this.hp,scaledHp:this.health.scaledHp,healthFlags:this.health.flags,damageTotal:this.damageTotal,alive:this.alive,age:this.age,direction:this.direction};}
}
