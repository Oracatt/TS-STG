// SPDX-License-Identifier: GPL-3.0-only
// Coordinate/lifecycle adapter only. Hit geometry, repeated grazing and Bomb
// cancellation belong to the public original-style thlib projectile policies.
import {TouhouBulletCollision,TouhouRNG,TouhouLaserField,touhouCircleCollision,touhouBulletInCancelCircle,
  touhouBulletInCancelRectangle,touhouLaserIntersectsCircle} from '@ts-stg/thlib/touhou';
import {rushTouhouBulletStyle} from './bullet-visuals.js';
import {BULLET_STYLES} from './bullet-styles.js';
const F=Math.fround;

export class RushProjectiles {
  constructor(battle){
    this.battle=battle;this.random=new TouhouRNG(battle.rng.seed??2);this.lasers=new Map();this.ownedLasers=new Map();
    const b=battle.bounds;this.sourceBounds={x:b.minX,y:battle.playerYOffset-b.maxY,width:b.maxX-b.minX,height:b.maxY-b.minY};
    const {banks,styles}=battle.touhouResources;
    // One public owner handles both externally moved beams and source-created
    // debris. A missing ANM bank suppresses drawing only, never simulation.
    this.debris=new TouhouLaserField({bank:banks.bullet??null,styles});
  }
  get context(){return this.battle.playerAdapter.context;}
  ownLaser(head,owner){
    if(!owner)return;
    let heads=this.ownedLasers.get(owner);
    if(!heads)this.ownedLasers.set(owner,heads=new Set());
    heads.add(head);
  }
  onEntityDestroyed(entity){
    if(entity.kind==='laser'&&entity.owner){
      const siblings=this.ownedLasers.get(entity.owner);
      siblings?.delete(entity);if(siblings?.size===0)this.ownedLasers.delete(entity.owner);
    }
    if(entity.kind==='laser'&&entity.curve&&entity.destroyReason!=='cancel'){
      // Explicit lifetime/despawn ends the entire curve, not just its moving
      // head. Natural portrait culling is decided by the public full history.
      const state=this.lasers.get(entity);if(state)this.debris.retire(state);
      this.lasers.delete(entity);
      for(const part of this.entities())if(part.alive&&part.laserHead===entity)part.kill(entity.destroyReason);
    }
    const heads=this.ownedLasers.get(entity);if(!heads)return;
    // Attached beams belong to their emitter, not to detached bullet history.
    // Ending that emitter explicitly erases its beams through the public owner;
    // this also handles zero-length beams with no circle-cancellation samples.
    this.ownedLasers.delete(entity);this.syncLasers();this.debris.context=this.context;
    for(const head of heads){
      const state=this.lasers.get(head);
      if(head.alive&&state)this.debris.erase(state,{check:false});
    }
    this.syncCancelled(new Map());
  }
  circle(b){
    let state=b.sourceCollision;
    if(!state)state=b.sourceCollision=new TouhouBulletCollision();
    if(state.kind!==b.kind||state.palette!==b.color){
      const style=rushTouhouBulletStyle(this.battle.touhouResources,b,this.battle.portrait);
      state.kind=b.kind;state.palette=b.color;state.style=style;state.radius=F(style?.radius??b.radius);
      state.handle=style?.cancelType===6?style.colors[style.color][4]>>>0:0xffd08080;
      state.cancelScript=style?.cancelScript??-1;state.cancelType=style?.cancelType??0;
    }
    state.cancelKind??=b.cancelKind??0;state.frozen=b.frozen??false;
    if(b.protectedFrames!==undefined)state.protectedFrames=b.protectedFrames;
    state.x=F(b.x);state.y=F(this.battle.playerYOffset-b.y);
    state.scale=F(b.size/(BULLET_STYLES[b.kind]?.size??b.size));state.scaleEnabled=state.scale!==1;
    const visual=this.battle.bulletVisuals.visuals.get(b);
    state.animation=visual?.animation??null;state.child=visual?.child??null;
    return state;
  }
  check(b){
    if(!this.battle.combatActive||this.battle.invincible||!b.alive||!b.checking||b.noCheck||b.kind==='laser'||b.visualKind==='laserPart')return;
    if(b.visualKind==='monstone'){
      this.battle.sharedPlayer.collisionCircle(b.x,this.battle.playerYOffset-b.y,b.radius,this.context);return;
    }
    this.circle(b).update(this.battle.sharedPlayer,this.context,{visualRandom:this.random,onHit:()=>{
      b.kill('hit');this.battle.bulletVisuals.finishEntity?.(b);
    }});
  }
  beam(b,parts=null){
    let state=this.lasers.get(b);
    if(state&&(!state.alive||state.killPending||state.state===1)){this.syncBeam(b,state,true);return null;}
    if(!state){
      const color=((b.color%16)+16)%16,origin=b.laserBirth;
      state=this.debris.spawnDriven(b.curve?2:1,{x:F(origin.x),y:F(this.battle.playerYOffset-origin.y),angle:F(-origin.angle),
        width:F(Math.max(0,b.width)*(b.curve?1:2)),length:F(Math.max(0,b.length??0)),speed:F(origin.speed),
        count:Math.max(4,Math.min(512,b.segments??64)),type:0,color,live:!!b.curve,
        autoBounds:this.battle.portrait&&b.cleanOnOutOfRange});
      if(!state){b.kill('capacity');return null;}
      this.lasers.set(b,state);
    }
    state.position={x:F(b.x),y:F(this.battle.playerYOffset-b.y),z:0};
    state.angle=F(b.curve&&(b.vx||b.vy)?-Math.atan2(b.vy,b.vx):-b.angle);
    state.width=F(Math.max(0,b.width)*(b.curve?1:2));state.length=F(Math.max(0,b.length??0));
    state.state=b.delay>0||!b.checking||b.noCheck?3:2;state.collisionEnabled=state.state===2;
    Object.assign(state.p,{...state.position,angle:state.angle,width:state.width,length:state.length});
    if(parts){
      const limit=Math.max(0,Math.trunc(b.segments??512));
      for(const part of parts.slice(limit))part.kill('cancel');
      this.debris.updateDrivenCurve(state,parts.slice(0,limit).map(part=>({position:{x:F(part.x),y:F(this.battle.playerYOffset-part.y),z:0},
        velocity:{x:0,y:0,z:0},angle:F(-part.angle-Math.PI/2),speed:F(part.sampleSpeed??Math.hypot(b.vx,b.vy)/60),actor:part})));
    }
    return state;
  }
  syncBeam(b,state,trim=false){
    if(b.curve){
      if(state.killPending||state.state===1||!state.alive){
        b.kill('cancel');for(const part of this.entities())if(part.laserHead===b)part.kill('cancel');
      }else if(trim){
        // Source live-curve cancellation permanently reduces its history size;
        // future external trajectory samples cannot regrow a severed tail.
        b.segments=state.p.count;
        if(state.samples[0]){b.x=state.samples[0].position.x;b.y=this.battle.playerYOffset-state.samples[0].position.y;}
        const retained=new Set(state.samples.map(s=>s.actor));
        for(const part of this.entities())if(part.laserHead===b&&!retained.has(part))part.kill('cancel');
      }
    }else{
      b.x=state.position.x;b.y=this.battle.playerYOffset-state.position.y;b.length=state.length;
      if(state.killPending||state.state===1||!state.alive)b.kill('cancel');
    }
  }
  entities(){return this.battle.world.entities.concat(this.battle.world.pending);}
  syncLasers(){
    const groups=new Map(),entities=this.entities();
    for(const part of entities)if(part.alive&&part.laserHead){
      if(!groups.has(part.laserHead))groups.set(part.laserHead,[]);groups.get(part.laserHead).push(part);
    }
    for(const parts of groups.values())parts.reverse();
    for(const b of entities)if(b.alive&&b.kind==='laser'&&!groups.has(b))groups.set(b,b.curve?[]:null);
    for(const [b,parts]of groups)this.beam(b,parts);
    for(const [b,state]of this.lasers)if(!groups.has(b)){
      this.debris.retire(state);this.lasers.delete(b);
    }
    return groups;
  }
  syncCancelled(before){
    for(const [b,state]of this.lasers){
      this.syncBeam(b,state,state.p.count<(before.get(state)??state.p.count));
      if(!state.alive||state.killPending||state.state===1)this.lasers.delete(b);
    }
  }
  updateLasers(){
    if(this.context.paused||this.context.freezeBullets)return;
    this.syncLasers();const before=new Map([...this.lasers.values()].map(l=>[l,l.p.count]));
    this.debris.update(this.battle.combatActive&&!this.battle.invincible?this.battle.sharedPlayer:null,this.context);
    this.syncCancelled(before);
  }
  intersects(b,radius,position,{activeOnly=true}={}){
    if(!b.alive||activeOnly&&(!b.checking||b.noCheck))return false;
    const x=F(position.x),y=F(this.battle.playerYOffset-position.y);
    if(b.kind==='laser'||b.visualKind==='laserPart'){
      if(b.visualKind==='laserPart')return false; // A curve has one shared collision owner.
      const state=b.curve?this.lasers.get(b):this.beam(b);
      return !!state&&touhouLaserIntersectsCircle(state,x,y,radius);
    }
    const state=this.circle(b);
    return touhouCircleCollision(x,y,radius,state.x,state.y,F(state.radius*state.scale))===1;
  }
  cancel(x,y,width,height,angle,circle,options={}){
    let count=0;
    if(options.bullets!==false)for(const b of this.entities()){
      if(!b.alive||b.group!=='bullet'||b.kind==='laser'||b.visualKind==='laserPart'||b.visualKind==='monstone')continue;
      const state=this.circle(b);
      if(!options.nearby&&state.protectedFrames)continue;
      if(circle?!touhouBulletInCancelCircle(state,x,y,width):!touhouBulletInCancelRectangle(state,x,y,width,height,angle,this.sourceBounds))continue;
      if(!options.nearby)state.cancelKind=(options.kind??0)&3;
      b.kill(options.reason??'bomb');this.battle.bulletVisuals.finishEntity(b);
      if(!state.frozen)this.context.sound?.(71,state.x);
      count++;
      // Source reward=true (drop mode1) requests excluded stone resources,
      // not ordinary POINT items. BossItem rewards are spawned independently.
    }
    if(options.lasers!==false){
      this.syncLasers();this.debris.context=this.context;
      const before=new Map([...this.lasers.values()].map(l=>[l,l.p.count]));
      // Field snapshots its source owners once. Newly split debris is not
      // cancelled again by the same Bomb call.
      count+=circle?this.debris.cancelCircle(x,y,width,{check:options.check??true}):
        this.debris.cancelRectangle(x,y,width,height,angle,{check:options.check??true});
      this.syncCancelled(before);
    }
    return count;
  }
  /** ECL613 has no radius, viewport or protection restriction. Presentation
   * owners retain their cancellation tails after trajectory actors retire. */
  clearAll(){
    let count=0;
    for(const b of this.entities()){
      if(!b.alive||b.group!=='bullet'||b.kind==='laser'||b.visualKind==='laserPart')continue;
      const state=this.circle(b);
      b.kill('bonus');this.battle.bulletVisuals.finishEntity(b);
      if(!state.frozen)this.context.sound?.(71,state.x);
      count++;
    }
    return count+this.finishLasers({check:false});
  }
  finishLasers({check=true}={}){
    this.syncLasers();this.debris.context=this.context;
    let count=0;
    for(const l of this.debris.lasers)if(l.alive&&l.state!==1)count+=this.debris.erase(l,{check});
    this.syncCancelled(new Map());
    return count;
  }
  draw(draw,view){this.debris.draw(draw,view);}
  dispose(){
    for(const l of this.debris.lasers)this.debris.retire(l);
    for(const effect of this.debris.effects)effect.destroy();
    this.debris.lasers.length=0;this.debris.effects.length=0;this.lasers.clear();this.ownedLasers.clear();
  }
}
