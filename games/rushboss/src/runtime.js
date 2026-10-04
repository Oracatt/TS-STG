// SPDX-License-Identifier: GPL-3.0-only
// Business adapter for TouhouRushBoss trajectories and attack content.
// World, entity lifecycle, drawing and geometry are provided by public thlib.
import { World, Entity } from '@ts-stg/thlib';
import {TouhouTimer,TouhouBossPhaseTimeline,TouhouBossDefeat,TouhouRNG,AnmInterpolation,applyTouhouEnemyDamage,clearTouhouBossPhase} from '@ts-stg/thlib/touhou';
import { RushRandom } from './random.js';
import { BULLET_STYLES } from './bullet-styles.js';
import { RushPlayerAdapter } from './player-adapter.js';
import { RushBulletVisuals } from './bullet-visuals.js';
import { RushSharedPresentation } from './shared-presentation.js';
import {RushProjectiles} from './projectiles.js';
import {rushBossDrops} from './boss-drop-profile.js';
import {rushBossDamageProtection} from './boss-health-profile.js';
import {rushBossPhaseTiming} from './boss-phase-timing.js';
import {rushBossPhaseEntry} from './boss-phase-entry.js';
const f = Math.fround, DT = f(1 / 60);
export const vector = (angle, length) => {angle=f(angle);length=f(length);return{x:f(f(Math.cos(angle))*length),y:f(f(Math.sin(angle))*length)};};
export const angle = (from, to) => f(Math.atan2(to.y-from.y,to.x-from.x));

/** UserComponent.h MoveBody: quadratic drag, semi-implicit Euler at 60 Hz. */
export function stepBody(body) {
  const dx=typeof body.drag==='number'?body.drag:body.drag?.x??0;
  const dy=typeof body.drag==='number'?body.drag:body.drag?.y??0;
  const vx=body.vx,vy=body.vy,fx=body.fx??0,fy=body.fy??0;
  if(dx===0&&dy===0&&fx===0&&fy===0&&vx>=-1e16&&vx<=1e16&&vy>=-1e16&&vy<=1e16){
    // In this finite range the source speed/squared-speed cannot overflow.
    // All drag/force intermediates are exact signed zeros. Keep dx*vx and
    // fx-zero so -0 drag, velocity and force retain their original sign.
    body.vx=f(vx+(fx-dx*vx));body.vy=f(vy+(fy-dy*vy));
    body.x=f(body.x+f(body.vx*DT));body.y=f(body.y+f(body.vy*DT));return;
  }
  const speed=f(Math.sqrt(f(f(vx*vx)+f(vy*vy))));
  const dragX=f(f(f(dx*speed)*vx)/100),dragY=f(f(f(dy*speed)*vy)/100);
  body.vx=f(vx+f(f(fx-dragX)*DT));
  body.vy=f(vy+f(f(fy-dragY)*DT));
  body.x=f(body.x+f(body.vx*DT));body.y=f(body.y+f(body.vy*DT));
}

/** BaseObject.h MovingObject: max/min speed interpolation by remaining distance. */
export function setMove(body, target, maxSpeed, minSpeed) {
  const dx=f(target.x-body.x),dy=f(target.y-body.y),distance=f(Math.sqrt(f(f(dx*dx)+f(dy*dy))));
  if(minSpeed===undefined){minSpeed=maxSpeed??50;maxSpeed=Math.max(distance,minSpeed);}
  body.moving=true;body.move={x:f(target.x),y:f(target.y),maxSpeed:f(maxSpeed),minSpeed:f(minSpeed),speed:f(maxSpeed),distance};
}
export function stepMove(body) {
  if(!body.moving){stepBody(body);return;}
  const move=body.move,dx=f(move.x-body.x),dy=f(move.y-body.y),d=f(Math.sqrt(f(f(dx*dx)+f(dy*dy))));
  if(d===0||d<move.speed*DT){body.x=move.x;body.y=move.y;body.vx=body.vy=0;body.moving=false;return;}
  body.vx=f(f(dx/d)*move.speed);body.vy=f(f(dy/d)*move.speed);
  body.x=f(body.x+f(body.vx*DT));body.y=f(body.y+f(body.vy*DT));
  const value=f(1-f(d/move.distance));move.speed=f(move.maxSpeed+f(f(move.minSpeed-move.maxSpeed)*value));
}

class RushEntity extends Entity {
  constructor(ctx,kind,pos,velocity,color,opts={}) {
    const style=BULLET_STYLES[kind],isActor=kind==='actor',isEffect=kind==='effect';
    const {onSpawn,onDestroy,update,onUpdate,setup,...data}=opts;
    super({x:pos.x??0,y:pos.y??0,vx:velocity.x??0,vy:velocity.y??0,radius:style?.radius??0,
      group:isActor?'actor':isEffect?'effect':'bullet',layer:isEffect?1:style?.add?4:5});
    Object.assign(this,{ctx,kind,color,frame:0,fx:0,fy:0,drag:0,mass:1,rotation:0,
      delay:isActor||isEffect?0:15,cleanOnOutOfRange:true,cleanOnHit:!isActor,cleanOnBomb:!isActor,
      outOfRangeTolerance:20,checking:!isActor,alpha:1,size:style?.size??32,style,grazed:false},data);
    if(opts.force){this.fx=opts.force.x;this.fy=opts.force.y;}
    for(const key of ['x','y','vx','vy','fx','fy'])this[key]=f(this[key]);
    this.initialDelay=this.delay;this.onUpdate=onUpdate??update;
    this.birthNotified=false;this.age=0;
    setup?.(ctx,this);
  }
  kill(reason='destroy') {return this.destroy(reason);}
  onDestroy() {this.ctx.projectiles?.onEntityDestroyed(this);this.cleanup?.(this.ctx,this);}
  update() {
    if(this.delay>0){this.delay--;return;}
    if(!this.birthNotified){this.birthNotified=true;this.onSpawnCallback?.(this.ctx,this);if(!this.alive)return;}
    if(this.moving)stepMove(this);else stepBody(this);
    if(this.curve&&this.alive)this.ctx.addLaserPart(this);
    // This entity supplies trajectory only. thlib contact is evaluated after
    // movement and ANM advancement, independently of Rush's callback order.
    // Original curves survive while any part of their complete history is
    // still in view. Their public owner decides when the whole curve retires.
    if(this.cleanOnOutOfRange&&!(this.curve&&this.ctx.portrait)&&this.ctx.outside(this,this.outOfRangeTolerance)){this.kill('outOfRange');return;}
    this.frame++;
    this.onUpdate?.(this.ctx,this);
    if(this.shadowInterval&&this.frame%this.shadowInterval===0)this.ctx.effect('afterimage',this,{source:this.kind,
      color:this.color,rotation:this.rotation,size:this.size,tint:this.tint,duration:10,alpha:this.shadowAlpha??0.5});
    if(this.lifetime!==undefined&&this.frame>=this.lifetime)this.kill('expired');
    const rotate=this.autoRotateMode??this.style?.rotate??0;
    if(rotate===1&&(this.vx||this.vy))this.rotation=f(Math.atan2(this.vy,this.vx)-Math.PI/2+(this.autoRotateOffset??0));
    else if(rotate===2||rotate===3)this.rotation=f(this.rotation+(rotate===3?0.05:-0.05)+(this.autoRotateOffset??0));
  }
  snapshot(){return{...super.snapshot(),kind:this.kind,color:this.color,frame:this.frame,delay:this.delay,fx:this.fx,fy:this.fy,
    drag:this.drag,width:this.width,angle:this.angle,checking:this.checking};}
}

export class RushBattle {
  constructor(phases,{boss='sunny',difficulty=1,character=0,seed=0,practice=false,spellIndex=0,invincible=false,assets=null,resources=null,profile='legacy',deferStart=false,onHudNotice=null}={}) {
    if(!['legacy','portrait'].includes(profile))throw new RangeError('Unknown Rush battle profile');
    this.profile=profile;this.portrait=profile==='portrait';this.combatStarted=false;this.dialogue=false;this.startIndex=Math.max(0,spellIndex);this.disposed=false;
    this.bounds=this.portrait?{minX:-192,maxX:192,minY:-224,maxY:224}:{minX:-320,maxX:320,minY:-240,maxY:240};
    this.playerView=this.portrait?{x:336,y:24,scale:1.5,screenScale:1}:{x:480,y:360,scale:1.5,screenScale:1};
    this.bulletView=this.playerView;this.playerYOffset=this.portrait?224:0;
    this.phases=phases;this.bossKey=boss;this.difficulty=difficulty;this.character=character;this.assets=assets;this.onHudNotice=onHudNotice;
    this.rng=new RushRandom(seed);this.world=new World({bounds:{x:this.bounds.minX,y:this.bounds.minY,width:this.bounds.maxX-this.bounds.minX,height:this.bounds.maxY-this.bounds.minY},seed});
    this.defeatRng=new TouhouRNG(seed);this.defeatSequence=null;
    this.world.game=this;this.frame=0;this.phaseFrame=0;this.phaseIndex=-1;this.transition=0;this.finished=false;
    this.boss={x:0,y:250,vx:0,vy:0,fx:0,fy:0,moving:false,alive:true,checking:true,invulnerable:false,animationIndex:0,tsRadius:5};
    this.boss.damageInvulnerability=new TouhouTimer();
    if(this.portrait&&deferStart){this.boss.alive=false;this.boss.visible=false;this.boss.checking=false;}
    this.practice=practice;this.invincible=invincible;this.singlePhase=practice&&spellIndex>=0;
    this.results=[];this.effects=[];this.state={};this.score=0;this.graze=0;
    this.statistics={spawned:0,lasers:0,actors:0,peak:0,misses:0,bombs:0,shotDamage:0,events:0};
    this.spawnHash=2166136261;this.previousInput=0;this.gameOver=false;
    this.playerAdapter=new RushPlayerAdapter(this,{character,practice,seed,resources});
    this.sharedPlayer=this.playerAdapter.player;this.touhouResources=this.playerAdapter.resources;
    this.bulletVisuals=new RushBulletVisuals(this.touhouResources,{yOffset:this.playerYOffset,commonOnly:this.portrait});
    this.projectiles=new RushProjectiles(this);
    this.player=this.playerAdapter.facade;
    this.presentation=new RushSharedPresentation(this);
    if(!deferStart)this.startCombat(this.startIndex);
  }
  get entranceReady(){return this.presentation.shared?.entranceReady??true;}
  get combatActive(){return this.combatStarted&&!this.dialogue&&!this.finished&&!this.gameOver&&this.entranceReady;}
  get spellBonus(){return this.phase?.spell?this.playerAdapter.spell.bonus:0;}
  get captureFailed(){return !!this.phase?.spell&&!this.playerAdapter.spell.captureEligible;}
  get phaseTimeElapsed(){return Math.max(0,this.phaseFrame-(this.phaseTiming?.source.phaseClockStartFrame??0));}
  /** Explicit source-layout anchors only. Never pass a bullet's position or a
   * ring's radius through this mapping: local geometry retains source units. */
  anchorX(x){return this.portrait?f(x*.6):x;}
  anchorPosition(position){return {...position,x:this.anchorX(position.x??0)};}
  outside(position,tolerance=0){const b=this.bounds;return position.x<b.minX-tolerance||position.x>b.maxX+tolerance||position.y<b.minY-tolerance||position.y>b.maxY+tolerance;}
  setDialogue(active=true){this.dialogue=!!active;return this;}
  revealBoss({mode=this.portrait?'blackFog':'flyIn',x=0,y=mode==='blackFog'?100:250,
    moveTo=mode==='blackFog'?null:{x:0,y:100},speed=160,damageProtectionFrames=this.portrait&&mode==='blackFog'?120:0,...entrance}={}){
    Object.assign(this.boss,{x:f(x),y:f(y),vx:0,vy:0,fx:0,fy:0,moving:false,alive:true,visible:true,checking:false});
    // Source Boss() ECL515 precedes summon/dialogue. Its timer keeps running
    // during those events; startCombat must inherit the remaining protection.
    this.boss.damageInvulnerability.set(damageProtectionFrames);
    if(moveTo)setMove(this.boss,moveTo,speed);
    this.presentation.revealBoss({mode,...entrance});return this;
  }
  startCombat(index=this.startIndex){
    if(!Number.isInteger(index)||index<0||index>=this.phases.length)throw new RangeError('Unknown Boss phase');
    if(!this.boss.alive)this.revealBoss({mode:'flyIn'});
    if(!this.entranceReady)throw new Error('Wait for the Boss entrance before starting combat');
    this.dialogue=false;this.finished=false;this.combatStarted=true;this.beginPhase(index);return this;
  }
  syncHudScore(){if(this.portrait)this.sharedPlayer.score=Math.max(0,Math.min(999999999,Math.floor(this.score/10)));}
  spawnPhaseDrops(phase,reason){
    if(!this.portrait)return;
    const drops=phase.itemDrops??rushBossDrops(this.bossKey,phase.number);
    if(drops&&(drops.centerType||Object.values(drops.counts??{}).some(count=>count>0)))
      this.playerAdapter.items.spawnBossDrops({x:this.boss.x,y:this.playerYOffset-this.boss.y},
        {...drops,timedOut:reason==='timeout',survival:!!(phase.spell&&phase.survival),mode:this.practice?2:0},this.playerAdapter.context);
  }
  random(min,max){return this.rng.float(min,max);} randomInt(min,max){return this.rng.int(min,max);}
  angle(a,b){return angle(a,b);} vec(a,l){return vector(a,l);}
  logSpawn(kind,color,pos,velocity){
    this.statistics.spawned++;
    const str=`${this.frame}/${kind}/${color}/${pos.x}/${pos.y}/${velocity.x}/${velocity.y}`;
    for(let i=0;i<str.length;i++)this.spawnHash=Math.imul(this.spawnHash^str.charCodeAt(i),16777619)>>>0;
  }
  spawn(kind,pos,velocity={x:0,y:0},color=0,opts={}) {
    if(!BULLET_STYLES[kind]&&kind!=='Monstone')throw Error(`Unsupported bullet ${kind}`);
    const b=new RushEntity(this,kind,{...pos},{...velocity},color,opts);
    b.onSpawnCallback=opts.onSpawn;b.cleanup=opts.onDestroy;
    if(kind==='Monstone'){b.visualKind='monstone';b.group='bullet';b.layer=3;b.radius=opts.checkRadius??7;b.checking=true;}
    this.logSpawn(kind,color,b,{x:b.vx,y:b.vy});return this.world.spawn(b);
  }
  ring(kind,n,pos,speed,a=0,offset=0,color=0,opts={}) {
    const out=[];
    for(let i=0;i<n;i++){const rad=a+i*Math.PI*2/n,v=vector(rad,speed),d=vector(rad,offset);
      out.push(this.spawn(kind,{x:pos.x+d.x,y:pos.y+d.y},v,color,typeof opts==='function'?opts(i,rad):opts));}
    return out;
  }
  fan(kind,n,pos,speed,a,delta=0,offset=0,color=0,opts={}) {
    const out=[];
    for(let i=0;i<n;i++){const rad=a-(n-1)*delta/2+delta*i,v=vector(rad,speed),d=vector(rad,offset);
      out.push(this.spawn(kind,{x:pos.x+d.x,y:pos.y+d.y},v,color,typeof opts==='function'?opts(i,rad):opts));}
    return out;
  }
  actor(opts) {
    const a=new RushEntity(this,'actor',opts,{x:opts.vx??0,y:opts.vy??0},opts.color??0,{delay:0,...opts});
    a.cleanup=opts.onDestroy;a.onSpawnCallback=opts.onSpawn;this.statistics.actors++;
    if(this.portrait&&['laserFog','freezingFog','death'].includes(a.visualKind))this.presentation?.addEffect(a.visualKind,a);
    return this.world.spawn(a);
  }
  laser(pos,a,color=0,opts={}) {
    const curve=!!opts.curve,vel=opts.speed!==undefined?vector(a,opts.speed):{x:opts.vx??0,y:opts.vy??0};
    const d=vector(a,opts.offset??0),p={x:pos.x+d.x,y:pos.y+d.y};
    const b=new RushEntity(this,'laser',p,vel,color,{delay:0,cleanOnHit:false,cleanOnBomb:false,cleanOnOutOfRange:curve,
      angle:a,width:curve?10:2,length:300,checking:true,radius:0,...opts,curve});
    b.group='bullet';b.layer=4;b.cleanup=opts.onDestroy;b.onSpawnCallback=opts.onSpawn;
    b.segments=opts.segments??(typeof opts.curve==='number'?opts.curve:90);
    b.laserBirth={x:b.x,y:b.y,angle:b.angle,speed:Math.hypot(b.vx,b.vy)/60};
    this.statistics.lasers++;this.logSpawn('laser',color,p,vel);this.world.spawn(b);
    this.projectiles.ownLaser(b,opts.owner);
    if(opts.fog||opts.fogSize)this.effect('laserFog',p,{follow:b,scale:opts.fog?.scale??opts.fogSize,
      frames:opts.fog?.frames??opts.fogFrames??120,color});
    return b;
  }
  addLaserPart(head) {
    const b=this.actor({x:head.x,y:head.y,visualKind:'laserPart',angle:angle({x:0,y:0},{x:head.vx,y:head.vy})-Math.PI/2,
      color:head.color,width:head.width,sizeY:12*Math.hypot(head.vx,head.vy)/150,layer:4,group:'bullet',
      lifetime:head.segments,cleanOnOutOfRange:this.portrait?false:head.cleanOnOutOfRange,cleanOnHit:head.cleanOnHit,cleanOnBomb:head.cleanOnBomb,
      checking:true,laserHead:head,sampleSpeed:Math.hypot(head.vx,head.vy)/60,animFrames:head.animFrames??10,alpha:0.35});
    return b;
  }
  effect(kind,pos,opts={}) {
    // A source preparation cue already owns the opening charge. Keep later
    // authored cycle cues, without layering a second Rush warmup over it.
    if(kind==='maple'&&this.phaseTimeline&&!this.phaseTimeline.attackStarted)return null;
    const e=this.actor({x:pos.x,y:pos.y,group:'effect',visualKind:kind,lifetime:opts.duration??opts.lifetime??180,
      cleanOnOutOfRange:false,...opts});
    if(kind==='maple'){this.presentation.addCharge(e,this.boss);this.sound((opts.storetimes??1)>1?'se_ch00':'se_ch02');}
    if(kind==='shadow'){
      delete e.lifetime;e.onUpdate=(ctx,a)=>{if(a.frame%(a.interval??2)===0)ctx.effect('afterimage',a.follow,
        {source:a.follow===ctx.player?'player':ctx.bossKey,color:0,alpha:a.alpha,duration:10});};
    }
    this.statistics.events++;return e;
  }
  sound(key){if(!this.phaseCleanupQuiet&&this.assets)this.assets.playSound(key.startsWith('se_')?key:`se_${key}`);}
  moveBoss(target,maxSpeed,minSpeed){setMove(this.boss,target,maxSpeed,minSpeed);}
  clear(){if(!this.phaseCleanupQuiet)this.world.clear(e=>e.group!=='player');}
  cleanAuto(kind,pos=this.boss) {
    if(!['nonspell','spell','final'].includes(kind))throw new RangeError(`Unknown phase clean mode: ${kind}`);
    if(this.phaseCleanupQuiet)return;
    // Attack scripts request a phase clear; the common projectile owners
    // perform its geometry/effects. No Rush expanding cleaner survives into
    // the following attack or makes spawning bullets immune to cancellation.
    if(kind==='final'&&this.finalCleanerPhase===this.phaseIndex)return;
    if(kind==='final')this.finalCleanerPhase=this.phaseIndex;
    clearTouhouBossPhase({x:pos.x,y:this.playerYOffset-pos.y,
      cancelCircle:(...args)=>this.playerAdapter.cancelBullets(...args),
      clearEnemies:()=>this.world.clear(e=>e.group==='actor')});
  }
  beginPhase(index,{withEntry=false}={}) {
    for(const charge of this.phaseCharges??[])charge.stop();this.phaseCharges=[];
    if(index>=this.phases.length){this.finished=true;this.boss.alive=false;return;}
    this.phaseIndex=index;this.phase=this.phases[index];this.phaseFrame=0;this.phaseResult=null;this.state={};this.transition=0;this.dying=null;
    this.phaseEntry=null;this.phaseTimeline=null;this.phaseTiming=null;this.patternFrame=0;this.escaping=null;this.escaped=false;
    this.defeatSequence?.destroy();this.defeatSequence=null;this.boss.primaryFlags=0;
    this.boss.hp=this.boss.maxHp=this.phase.hp;this.boss.checking=true;this.boss.invulnerable=false;this.boss.immuneDamage=false;
    const entry=withEntry&&this.portrait&&this.phase.boss===this.bossKey?
      rushBossPhaseEntry(this.bossKey,this.phase.number,{practice:this.practice}):null;
    if(entry){
      this.boss.damageInvulnerability.set(entry.protectionFrames);
      Object.assign(this.boss,{vx:0,vy:0,fx:0,fy:0,moving:false});
      this.playerAdapter.preparePhase(this.phase);
      this.phaseEntry={clock:new TouhouBossPhaseTimeline({attackStartFrame:entry.frames}),
        move:new AnmInterpolation([this.boss.x,this.boss.y],[entry.move.x,this.playerYOffset-entry.move.y],entry.move.duration,entry.move.easing)};
      return;
    }
    if(this.portrait&&!this.practice&&this.phase.boss===this.bossKey){
      const protection=rushBossDamageProtection(this.bossKey,this.phase.number);
      if(protection)this.boss.damageInvulnerability.set(protection.frames-protection.elapsedBeforePhase);
    }
    this.boss.vx=this.boss.vy=0;this.boss.fx=this.boss.fy=0;
    this.activatePhase();
  }
  activatePhase(){
    this.phaseEntry=null;
    this.presentation.beginPhase(this.phase,this.boss);
    this.playerAdapter.beginPhase(this.phase);
    this.patternFrame=0;
    this.phaseTiming=this.portrait&&this.phase.boss===this.bossKey?
      rushBossPhaseTiming(this.bossKey,this.phase.number,this.difficulty,{practice:this.practice}):null;
    this.phaseTimeline=this.phaseTiming?new TouhouBossPhaseTimeline({...this.phaseTiming,onCue:(cue,timeline)=>{
      if(cue.type==='charge'){
        const charge=this.presentation.shared?.beginCharge({...cue.options,follow:this.presentation.proxyBoss,
          clock:()=>timeline.frame-cue.frame});
        if(charge)this.phaseCharges.push(charge);
      }
      if(cue.sound!==undefined)this.touhouResources?.audio?.request(cue.sound,this.boss.x);
    }}):null;
    this.phase.init?.(this);if(this.phase.spell&&!this.presentation.shared)this.sound('se_cat00');
  }
  damage(amount,source='shot') {
    if(!this.combatActive||!this.phase||this.transition||this.dying||this.finished||!this.boss.checking||this.boss.invulnerable||this.boss.immuneDamage||this.phase.survival)return 0;
    // The public damage batch and health owner supply the complete original
    // resistance rules. Authored Rush attacks do not add another damage ramp.
    const health=this.playerAdapter.health,before=this.boss.hp;
    applyTouhouEnemyDamage(health,amount,this.boss);
    this.boss.hp=Math.max(0,health.hp);const dmg=before-this.boss.hp;
    this.statistics.shotDamage+=dmg;
    if(this.boss.hp<=0)this.endPhase('defeated');return dmg;
  }
  endPhase(reason) {
    if(this.transition||this.dying||this.escaping||this.finished)return;
    const p=this.phase;
    // Original mode2 ECL514 replaces any selected card's success target with
    // BossDead and its timeout target with BossEscapeSpell. A practiced card
    // is the encounter's last card even if it was not the stage's last card.
    if(this.portrait&&this.singlePhase&&reason==='timeout'){this.beginPracticeEscape(reason);return;}
    if(p.finalSpell||p.final||this.portrait&&this.singlePhase){
      if(this.portrait){
        this.boss.invulnerable=true;this.boss.checking=false;this.boss.primaryFlags=156;
        Object.assign(this.boss,{moving:false,vx:0,vy:0,fx:0,fy:0});
        this.world.clear(e=>e.group==='actor');this.finalCleanerPhase=this.phaseIndex;
        for(const charge of this.phaseCharges??[])charge.stop();this.phaseCharges=[];
        const sequence=new TouhouBossDefeat({x:this.boss.x,y:this.playerYOffset-this.boss.y,
          delayFrames:p.deathDelay??60,rng:this.defeatRng,
          sound:(id,x)=>this.touhouResources.audio?.request(id,x),
          cancelCircle:(...args)=>this.playerAdapter.cancelBullets(...args),clearAll:()=>this.projectiles.clearAll(),
          onMove:position=>{this.boss.x=position.x;this.boss.y=f(this.playerYOffset-position.y);},
          onBurst:()=>this.completePhase(reason)});
        this.defeatSequence=sequence;this.dying=sequence.alive?sequence:null;return;
      }
      this.phaseResult=this.playerAdapter.endPhase({reason});
      this.dying={reason,remaining:p.deathDelay??60};this.boss.invulnerable=true;
      this.sound(this.portrait?'se_enep01':'se_enep00');this.cleanAuto('final',this.boss);return;
    }
    this.completePhase(reason);
  }
  settlePhase(reason,{quiet=false}={}) {
    const p=this.phase;
    // Ending the ECL-like preparation also cancels any future release birth;
    // already spawned particles keep their independent animation lifetime.
    for(const charge of this.phaseCharges??[])charge.stop();this.phaseCharges=[];
    const result=this.phaseResult??this.playerAdapter.endPhase({reason});
    const captured=!!result?.captured,bonus=result?.bonus??0;
    this.presentation.endPhase();
    this.results.push({key:p.key,number:p.number,cardId:p.cardId,frames:this.phaseFrame,reason,captured,bonus});this.score+=bonus;
    // Cleanup may restore content state (e.g. Artia's player movement). The
    // original exit owner, rather than the old content callbacks, owns its
    // clearing and sounds on a practiced card's final exit.
    this.phaseCleanupQuiet=quiet;
    try{p.end?.(this);}finally{this.phaseCleanupQuiet=false;}
    this.spawnPhaseDrops(p,reason);this.syncHudScore();
  }
  beginPracticeEscape(reason) {
    // default.ecl BossEscapeSpell: settle immediately, remove attack owners,
    // withdraw the Boss slot/aura and move to(-224,-80) over60 frames (mode4).
    // There is no ECL613 clear or Boss death inversion on this route.
    this.escaping={clock:new TouhouBossPhaseTimeline({attackStartFrame:60}),
      move:new AnmInterpolation([this.boss.x,this.boss.y],[-224,this.playerYOffset+80],60,4)};
    this.settlePhase(reason,{quiet:true});this.world.clear(e=>e.group==='actor');
    // These content charge events belong to the terminated attack script.
    // Their detached ANM tails may finish, but no late release or sound should
    // be scheduled while the remaining projectiles continue moving.
    for(const charge of this.presentation.charges){charge.effect.kill('escape');charge.display?.stop();}
    for(const charge of this.presentation.shared?.charges??[])charge.stop();
    Object.assign(this.boss,{hp:100000,maxHp:100000,invulnerable:true,checking:false,primaryFlags:156,
      moving:false,vx:0,vy:0,fx:0,fy:0});
    this.playerAdapter.health.set(100000,false);this.combatStarted=false;
    this.presentation.shared?.stopCombat();
  }
  completePhase(reason) {
    const p=this.phase;
    this.settlePhase(reason,{quiet:this.portrait&&this.singlePhase&&!!this.defeatSequence?.burst});this.dying=null;
    if(this.singlePhase||p.finalSpell||p.final){
      this.finished=true;this.transition=0;this.boss.alive=false;
      if(this.portrait){this.boss.visible=false;this.world.clear(e=>e.group==='actor'||e.group==='bullet');this.presentation.beginBossDeath();}
      return;
    }
    // enemy_damage.cpp phase_script runs the next script in the same damage
    // pass. A zero-delay handoff must initialize the next card immediately.
    this.transition=Math.max(0,Math.trunc(p.transitionDelay??(!this.portrait&&p.spell?60:0)));
    if(this.transition===0)this.beginPhase(this.phaseIndex+1,{withEntry:true});
  }
  miss() {
    return this.playerAdapter.receiveHit();
  }
  checkBossContact() {
    const p=this.player,b=this.boss;
    if(!this.combatActive||this.invincible||!b.alive||!b.checking||p.invulnerable>0||p.state!==1)return;
    // Source Enemy contact uses the Boss body's tsRadius; this is a character,
    // not an enemy bullet. Monstone's final dash enlarges this body to twenty.
    this.sharedPlayer.collisionCircle(b.x,this.playerYOffset-b.y,b.tsRadius,this.playerAdapter.context);
  }
  checkBullet(b) {
    this.projectiles.check(b);
  }
  intersectsBullet(b,radius,position=this.player,options={}) {
    return this.projectiles.intersects(b,radius,position,options);
  }
  updatePlayer(mask) {
    this.playerAdapter.update(mask);
  }
  get shots(){return this.playerAdapter.shots;}
  get bombRemaining(){return this.playerAdapter.bombRemaining;}
  updateDamageProtection(){
    const timer=this.boss.damageInvulnerability;
    if(this.boss.alive&&timer.current>0)timer.add(-1);
  }
  update(mask=0) {
    if(this.disposed||this.gameOver||this.finished&&!this.portrait)return;
    const phaseAtFrameStart=this.phaseIndex;
    const entryAtFrameStart=this.phaseEntry;
    const deathAtFrameStart=this.portrait?this.dying:null;
    const escapeAtFrameStart=this.escaping;
    if(deathAtFrameStart&&!this.dialogue){this.phaseFrame++;deathAtFrameStart.update();}
    if(escapeAtFrameStart&&!this.dialogue){
      escapeAtFrameStart.clock.update();[this.boss.x,this.boss.y]=escapeAtFrameStart.move.sample();
      if(escapeAtFrameStart.clock.attackStarted){this.escaping=null;this.escaped=true;this.finished=true;this.boss.alive=false;this.boss.visible=false;}
    }
    if(entryAtFrameStart&&!this.dialogue){
      entryAtFrameStart.clock.update();
      [this.boss.x,this.boss.y]=entryAtFrameStart.move.sample();
      if(entryAtFrameStart.clock.attackStarted)this.activatePhase();
    }
    this.updatePlayer(mask);this.previousInput=mask;
    if(!this.combatStarted&&!this.escaping||this.dialogue||this.portrait&&this.finished){
      if(this.boss.alive)stepMove(this.boss);
      // Practice timeout leaves live projectiles behind. Continue their
      // source motion through the result-notice tail; the application pauses
      // them when it actually opens the result page. Combat remains disabled.
      if(this.escaped&&!this.dialogue)this.world.update();
      this.bulletVisuals.update(this.world.entities.concat(this.world.pending));this.projectiles.updateLasers();this.playerAdapter.afterBulletUpdate();
      this.updateDamageProtection();
      this.frame++;this.presentation.update(this);this.syncHudScore();return;
    }
    this.checkBossContact();
    stepMove(this.boss);
    this.world.update();
    this.bulletVisuals.update(this.world.entities.concat(this.world.pending));
    this.projectiles.updateLasers();
    for(const bullet of this.world.entities.concat(this.world.pending))if(bullet.group==='bullet')this.checkBullet(bullet);
    this.playerAdapter.afterBulletUpdate();
    if(this.dying){if(!this.portrait&&--this.dying.remaining<=0)this.completePhase(this.dying.reason);}
    else if(this.transition){if(--this.transition===0)this.beginPhase(this.phaseIndex+1,{withEntry:true});}
    else if(!this.finished&&!escapeAtFrameStart&&!this.escaping&&!entryAtFrameStart&&!this.phaseEntry&&this.phaseIndex===phaseAtFrameStart) {
      this.phaseFrame++;
      this.phaseTimeline?.update();
      if(this.phaseTimeElapsed>=Math.round(this.phase.time*60))this.endPhase('timeout');
      else if(!this.phaseTimeline||this.phaseTimeline.patternReady)this.phase.update?.(this,++this.patternFrame);
    }
    this.updateDamageProtection();this.frame++;
    if(!this.presentation.shared)this.playerAdapter.spell.update(this.playerAdapter.context);
    this.presentation.update(this);
    this.syncHudScore();
    this.statistics.peak=Math.max(this.statistics.peak,this.world.entities.length);
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.defeatSequence?.destroy();this.world.clear();
    this.projectiles.dispose();this.presentation.dispose();this.bulletVisuals.dispose();this.playerAdapter.dispose();
  }
  snapshot() {
    return{...(this.portrait?{profile:this.profile,combatStarted:this.combatStarted,dialogue:this.dialogue,bounds:{...this.bounds},damageProtection:this.boss.damageInvulnerability.current,
      phaseTimeline:this.phaseTimeline?.snapshot()??null,phaseEntry:this.phaseEntry?.clock.snapshot()??null,
      defeat:this.defeatSequence?.snapshot()??null,escape:this.escaping?.clock.snapshot()??null,escaped:!!this.escaped}:{}),
      frame:this.frame,boss:this.bossKey,difficulty:this.difficulty,character:this.character,phase:this.phase?.key,
      phaseIndex:this.phaseIndex,phaseFrame:this.phaseFrame,hp:this.boss.hp,position:{x:this.boss.x,y:this.boss.y},
      player:{...this.player},score:this.score,graze:this.graze,finished:this.finished,gameOver:this.gameOver,
      results:this.results,statistics:{...this.statistics},spawnHash:this.spawnHash.toString(16),
      entities:this.world.entities.length,randomCalls:this.rng.calls,sharedPlayer:this.playerAdapter.snapshot()};
  }
}
