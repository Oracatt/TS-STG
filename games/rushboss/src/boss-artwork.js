// SPDX-License-Identifier: GPL-3.0-only
// Private Rush artwork, sourced from BossDeriver.h, Enemy.cpp,
// Character.cpp and Monstone_SC_8::Shadow::Part. Combat actors remain untouched.
import {rgba,withAlpha} from '@ts-stg/thlib';

const F=Math.fround;
const rect=(column,row,width,height,flip=false)=>Object.freeze({x:column*width,y:row*height,width,height,flip});
const animation=(interval,rects)=>Object.freeze({interval,rects:Object.freeze(rects)});
const sequence=(first,last,row,width,height,flip=false)=>Array.from({length:last-first+1},(_,i)=>rect(first+i,row,width,height,flip));
const reverse=(first,last,row,width,height,flip=false)=>sequence(first,last,row,width,height,flip).reverse();
export const RUSH_BOSS_ARTWORK=Object.freeze({
  sunny:Object.freeze({texture:'src_sunnymilk',width:64,height:64,animations:Object.freeze([
    animation(7,sequence(0,3,0,96,96)),animation(7,sequence(1,3,1,96,96,true)),
    animation(7,sequence(1,3,1,96,96)),animation(1000,[rect(0,1,96,96,true)]),
    animation(1000,[rect(0,1,96,96)]),animation(1000,[rect(2,2,96,96)]),
  ])}),
  monstone:Object.freeze({texture:'src_monstone',width:64,height:64,animations:Object.freeze([
    animation(7,[rect(0,0,64,64)]),animation(7,[rect(1,0,64,64)]),
    animation(7,[rect(2,0,64,64)]),animation(1000,[rect(1,0,64,64)]),
    animation(1000,[rect(2,0,64,64)]),
  ])}),
  artia:Object.freeze({texture:'src_artia',width:64,height:74,animations:Object.freeze([
    animation(7,sequence(0,3,0,96,111)),animation(7,sequence(3,5,1,96,111,true)),
    animation(7,sequence(3,5,1,96,111)),animation(1000,reverse(0,2,1,96,111,true)),
    animation(1000,reverse(0,2,1,96,111)),
  ])}),
});
const defaultView=Object.freeze({x:336,y:24,scale:1.5,screenScale:1});
const bossSource=source=>source==='Monstone'?'monstone':source;
const isBossTrail=actor=>actor.visualKind==='afterimage'&&Object.prototype.hasOwnProperty.call(RUSH_BOSS_ARTWORK,bossSource(actor.source));
const distance=(actor,target)=>F(Math.sqrt(F(F(F(target.x-actor.x)**2)+F(F(target.y-actor.y)**2))));
const alphaAfter=(alpha,frames)=>{alpha=F(alpha);for(let i=0;i<frames;i++)alpha=F(alpha-F(.02));return Math.max(0,alpha);};
const color=(tint,alpha)=>Array.isArray(tint)?rgba(tint[0]*255,tint[1]*255,tint[2]*255,Math.round(alpha*255)):
  withAlpha(typeof tint==='number'?tint:0xffffffff,alpha);

/** Owns animation and frozen trails only, with no host resources or game rules.
 * Call update once after simulation; draw also synchronizes lazily. Draw methods
 * submit ordinary DrawList commands, leaving thlib priorities to the caller. */
export class RushBossArtwork {
  constructor(artworkAssets,{view=defaultView}={}){
    if(!artworkAssets?.texture||!artworkAssets?.size)throw new TypeError('Rush artwork texture/size adapter required');
    this.assets=artworkAssets;this.view={...view};this.actors=new Map();this.trails=new Map();this.seenTrails=new WeakSet();
    this.currentBattle=null;this.lastFrame=-1;this.ticks=0;this.disposed=false;
  }
  reset(){this.actors.clear();this.trails.clear();this.seenTrails=new WeakSet();this.currentBattle=null;this.lastFrame=-1;this.ticks=0;return this;}
  pose(actor,key,battle){
    const descriptor=RUSH_BOSS_ARTWORK[key];if(!descriptor)throw new RangeError(`Unknown Rush Boss artwork ${key}`);
    let state=this.actors.get(actor);
    if(!state){state={key,animationIndex:0,frameIndex:0,count:0,request:actor.animationIndex??0,moving:false,lastFrame:battle.frame,
      previous:{x:actor.x,y:actor.y},move:null,history:[]};this.actors.set(actor,state);}
    const elapsed=Math.max(0,battle.frame-state.lastFrame),delta=elapsed||(!state.sample&&battle.frame>0?1:0);
    let index=state.animationIndex,forcedFrame=null;
    const request=actor.animationIndex??0;
    if(!state.sample||request!==state.request)index=request;
    // Enemy::OnUpdate alone selects movement poses; arbitrary physics velocity
    // and orbital clone motion must not switch the animation.
    if(actor.moving&&actor.move){
      const left=actor.move.x-actor.x<0,returnIndex=left?3:4;
      const count=descriptor.animations[returnIndex].rects.length,threshold=1-.025*count;
      const prior=elapsed===1&&state.move===actor.move?state.previous:actor;
      const progress=actor.move.distance>0?F(1-F(distance(prior,actor.move)/actor.move.distance)):1;
      index=progress>threshold?returnIndex:left?1:2;
      if(index===returnIndex)forcedFrame=Math.min(count-1,Math.max(0,Math.trunc(count*(progress-threshold)/(1-threshold))));
    }else if(state.moving)index=0;
    if(!descriptor.animations[index])throw new RangeError(`Unknown ${key} animation ${index}`);
    const changed=index!==state.animationIndex;
    if(changed){state.frameIndex=0;state.count=0;}
    state.animationIndex=index;state.request=request;
    if(forcedFrame!==null)state.frameIndex=forcedFrame;
    const anim=descriptor.animations[index],advance=changed&&delta>0?1:delta;
    state.count+=advance;
    if(state.count>=anim.interval){state.frameIndex=(state.frameIndex+Math.trunc(state.count/anim.interval))%anim.rects.length;state.count%=anim.interval;}
    const clone=actor.visualKind==='monstone'||actor.kind==='Monstone';
    // Floating is a local translation of the unit quad, then world-scaled.
    // The orbital EnemyBullet_Monstone is not a Character and never floats.
    const bob=clone?0:F(F(.05*Math.sin(battle.frame/60*4))*descriptor.height);
    state.sample=Object.freeze({key,texture:descriptor.texture,rect:anim.rects[state.frameIndex],width:descriptor.width,height:descriptor.height,
      animationIndex:index,frameIndex:state.frameIndex,bob,x:actor.x,y:actor.y,tint:actor.tint??null,alpha:actor.alpha??1,frame:battle.frame});
    state.history.push(state.sample);state.history=state.history.filter(sample=>sample.frame>=battle.frame-30);
    state.previous={x:actor.x,y:actor.y};state.move=actor.move;state.moving=!!actor.moving;state.lastFrame=battle.frame;
    return state.sample;
  }
  trailSource(actor,battle){
    if(actor.source!=='Monstone')return this.actors.get(battle.boss);
    let nearest=null,best=Infinity;
    for(const [source,state]of this.actors)if(source.visualKind==='monstone'||source.kind==='Monstone'){
      const d=(source.x-actor.x)**2+(source.y-actor.y)**2;if(d<best){best=d;nearest=state;}
    }
    return nearest;
  }
  captureTrail(actor,battle){
    if(this.seenTrails.has(actor))return this.trails.get(actor)??null;
    this.seenTrails.add(actor);
    const state=this.trailSource(actor,battle);if(!state?.sample)return null;
    const birth=battle.frame-Math.max(0,actor.frame??0);
    // Shadow updates before its followed sprite: copy the prior source rect,
    // transform and local bob once, never borrow the moving live animation.
    let frozen=state.sample;
    for(let i=state.history.length-1;i>=0;i--)if(state.history[i].frame<=birth-1){frozen=state.history[i];break;}
    const trail={...frozen,x:actor.x,y:actor.y,tint:actor.tint??frozen.tint,alpha:actor.alpha??.5,birth};
    this.trails.set(actor,trail);return trail;
  }
  update(battle){
    if(this.disposed)throw new Error('Rush Boss artwork disposed');
    if(this.currentBattle!==battle){this.reset();this.currentBattle=battle;}
    if(this.lastFrame===battle.frame)return this;
    this.lastFrame=battle.frame;this.ticks++;
    const present=new Set();
    if(battle.boss?.alive&&!battle.boss.hidden&&battle.boss.visible!==false){present.add(battle.boss);this.pose(battle.boss,battle.bossKey,battle);}
    for(const actor of battle.world?.entities??[])if(actor.alive&&actor.delay<=0&&(actor.visualKind==='monstone'||actor.kind==='Monstone')){
      present.add(actor);this.pose(actor,'monstone',battle);
    }
    for(const actor of battle.world?.entities??[])if(actor.alive&&isBossTrail(actor))this.captureTrail(actor,battle);
    for(const [actor,trail]of this.trails)if(alphaAfter(trail.alpha,Math.max(0,battle.frame-trail.birth))<=0)this.trails.delete(actor);
    for(const actor of this.actors.keys())if(!present.has(actor))this.actors.delete(actor);
    return this;
  }
  submit(draw,pose,alpha=pose.alpha,tint=pose.tint){
    if(!(alpha>0))return draw;
    const view=this.view,s=view.scale??1,texture=this.assets.texture(pose.texture),r=pose.rect;
    const x=(view.x??0)+pose.x*s,y=(view.y??0)+(224-pose.y-pose.bob)*s,w=pose.width*s,h=pose.height*s,c=color(tint,alpha);
    draw.sampler(texture,'bilinear','clamp','clamp').blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','zero','add');
    if(!r.flip)draw.spriteRegion(texture,r.x,r.y,r.width,r.height,x,y,w,h,0,c);
    else{
      const size=this.assets.size(pose.texture),u0=r.x/size.width,u1=(r.x+r.width)/size.width,v0=r.y/size.height,v1=(r.y+r.height)/size.height;
      draw.mesh(texture,[[x-w/2,y-h/2,u1,v0,c],[x+w/2,y-h/2,u0,v0,c],[x-w/2,y+h/2,u1,v1,c],[x+w/2,y+h/2,u0,v1,c]],[0,1,2,1,3,2]);
    }
    draw.blendEnd();return draw;
  }
  draw(draw,actor,battle,{key=battle.bossKey,alpha=1,tint=actor.tint}={}){
    this.update(battle);
    if(isBossTrail(actor)){
      const trail=this.captureTrail(actor,battle);return trail?this.submit(draw,trail,alphaAfter(trail.alpha,battle.frame-trail.birth)*alpha,tint??trail.tint):draw;
    }
    if(!actor.alive||actor.hidden||actor.visible===false||(actor.delay??0)>0)return draw;
    const pose=this.actors.get(actor)?.sample??this.pose(actor,key,battle);
    return this.submit(draw,pose,(actor.alpha??1)*alpha,tint??pose.tint);
  }
  /** Draw once before Boss bodies. Trails survive the simulation's old 10-frame
   * placeholder entities until the source's alpha -= .02 reaches zero. */
  drawTrails(draw,battle){
    this.update(battle);
    for(const trail of this.trails.values())this.submit(draw,trail,alphaAfter(trail.alpha,Math.max(0,battle.frame-trail.birth)));
    return draw;
  }
  snapshot(){return{implementation:'Rush source Boss artwork',ticks:this.ticks,frame:this.lastFrame,
    actors:[...this.actors.values()].map(state=>({key:state.key,animationIndex:state.animationIndex,frameIndex:state.frameIndex,count:state.count,
      rect:{...state.sample.rect},bob:state.sample.bob})),trails:[...this.trails.values()].map(trail=>({key:trail.key,animationIndex:trail.animationIndex,
      frameIndex:trail.frameIndex,x:trail.x,y:trail.y,bob:trail.bob,birth:trail.birth,alpha:alphaAfter(trail.alpha,Math.max(0,this.lastFrame-trail.birth))}))};}
  destroy(){this.reset();this.disposed=true;}
}
