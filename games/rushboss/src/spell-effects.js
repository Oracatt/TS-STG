// SPDX-License-Identifier: GPL-3.0-only
// Faithful presentation profile from Boss.cpp, BossParticle.h, Effect.h and
// CardBackground.h. Portable meshes/camera and common media are supplied by thlib.
import {PerspectiveCamera,PerspectiveSprite,TexturedRing,presentationQuaternion,multiplyPresentationQuaternion,rgba,withAlpha} from '@ts-stg/thlib';
import {RushRandom} from './random.js';
const F=Math.fround,TAU=Math.PI*2;
const lerp=(a,b,t)=>F(F(a)+F(F(b-a)*F(t)));
const colors=[[.2,1,1],[1,.2,1],[1,1,.2],[.2,.2,1],[.2,1,.2],[1,.2,.2]];
const color=(rgb,a)=>rgba(rgb[0]*255,rgb[1]*255,rgb[2]*255,Math.max(0,a)*255);
const screenX=x=>(x+320)*1.5,screenY=y=>(240-y)*1.5;
const origin={x:0,y:0,z:0};
const lineAngle=F(F(Math.PI)/6),lineUnit=[F(Math.cos(lineAngle)),F(Math.sin(lineAngle))];
const ringBasis=q=>{const z=q[2],w=q[3],c=F(1-F(2*F(z*z))),s=F(2*F(z*w));return[c,s,-s,c];};
const sampledTexture=(draw,atlas,name)=>{const id=atlas.texture(name);draw.sampler(id,'anisotropic4x','wrap','wrap');return id;};

class ChargeLeaf {
  constructor(owner,charge,birth,blast,start,target) {
    this.birth=birth;this.blast=blast;this.start=start;this.target=target;this.position=blast?{...target}:{...start};this.charge=charge;
    const random=owner.random;this.spin=[random.float(0,TAU),random.float(0,TAU),random.float(0,TAU)];
    this.rotation=presentationQuaternion(random.float(0,TAU),random.float(0,TAU),random.float(0,TAU));
    this.scale=blast?.4:.25;this.alpha=blast?.5:0;this.age=0;
    this.sprite=new PerspectiveSprite(owner.camera,{uv:[.5,0,.5,.5]});
  }
  update() {
    const n=++this.age;
    if(this.blast){
      if(n<=45){const t=F(Math.pow(F(n/45),.75));this.position={x:lerp(this.target.x,this.start.x,t),y:lerp(this.target.y,this.start.y,t),z:lerp(this.target.z,this.start.z,t)};}
      if(n>=25){this.scale=F(this.scale-.01);this.alpha=F(this.alpha-.02);}
    }else{
      if(n<=30)this.position={x:lerp(this.start.x,this.target.x,n/30),y:lerp(this.start.y,this.target.y,n/30),z:lerp(this.start.z,this.target.z,n/30)};
      if(n<=4)this.alpha=F(this.alpha+.125);if(n>=32)this.alpha=F(this.alpha-.1);
    }
    const speed=this.blast&&n<=45?lerp(2,1,n/45):1,dt=F(1/60);
    this.rotation=multiplyPresentationQuaternion(presentationQuaternion(F(F(this.spin[0]*dt)*speed),F(F(this.spin[1]*dt)*speed),F(F(this.spin[2]*dt)*speed)),this.rotation);
    return n<(this.blast?50:37);
  }
  draw(draw,texture) {
    if(this.scale>0&&this.alpha>0)this.sprite.draw(draw,texture,{position:this.position,scale:{x:this.scale,y:this.scale,z:1},rotation:this.rotation,color:color(this.charge.color,this.alpha)});
  }
}

/** Application presentation state is updated once per simulation tick. Rendering
 * never spawns particles or changes RNG, so screenshots and pause are stable. */
export class RushSpellEffects {
  constructor({boss='sunny',seed=0}={}) {
    this.bossKey=boss;this.colorKey=boss==='artia'?1:boss==='sunny'?2:0;
    this.random=new RushRandom((seed^0x7350454c)>>>0);
    this.camera=new PerspectiveCamera({width:640,height:480,fieldOfView:Math.PI/4,near:.1,far:1000,canvasWidth:960,canvasHeight:720,viewport:{x:0,y:0,width:960,height:720}});
    this.magicSprite=new PerspectiveSprite(this.camera);this.magicRotation=[-.002681,-.446869,.893746,-.039161].map(F);
    this.magicFrame=0;this.magicSize=0;this.aura=[];this.charges=[];this.leaves=[];this.cards=[];this.entrances=[];this.activeCard=null;
    this.innerRing=new TexturedRing({segments:512,rounds:4,uv:[3/8,0,1/8,1],closedSeam:true});
    this.outerRing=new TexturedRing({segments:512,rounds:3,uv:[5/8,0,1/8,1],closedSeam:true});
  }
  beginPhase(phase,boss) {
    this.hud={time:phase.time,bloodAlpha:1,timeAlpha:1,timeSize:1,timeOut:10,red:false};
    if(!phase.spell)return;
    const c={phase,age:0,deadAge:0,leaving:false,alpha:0,overlayAlpha:0,scroll:0,opacity:1,compositeAlpha:0,backAlpha:0,labelAlpha:0,slideX:0,slideY:0,textScale:2,innerRotation:[0,0,0,1],outerRotation:[0,0,0,1],
      outerX:boss.x*.8,outerY:boss.y*.8,outerInner:0,outerOuter:20,outerSpeed:F(10.16),innerMin:0,innerMax:100,innerAlpha:1,outerScale:1};
    const units=[];for(let i=0;i<10;i++)for(let j=0;j<12;j++)units.push({x:F(F(F(lineUnit[0]*120)*j)-440),y:F(F(F(lineUnit[1]*120)*j)+F(-390+40*i)),sign:i%2?1:-1});
    this.activeCard=c;this.cards.push(c);this.entrances.push({boss:this.bossKey,age:0,phaseKey:phase.key,units,alpha:0,x:200,y:30,cutinAlpha:0});
  }
  endPhase() {if(this.activeCard){this.activeCard.leaving=true;this.activeCard=null;}}
  addCharge(effect,boss) {
    const count=Math.max(1,effect.storetimes??1);this.charges.push({effect,follow:effect.follow??boss,color:effect.color??[1,1,1],storetimes:count,blast:effect.blast!==false,lastFrame:0,inwardAlpha:Array(count).fill(0),blastAlpha:F(.8)});
  }
  spawnLeaf(charge,birth,blast) {
    const follow=charge.follow,depth=blast?.95:.9,start=this.camera.screenToWorld(follow.x,follow.y,depth),target=this.camera.screenToWorld(follow.x,follow.y,.95);
    const a=F(F(F(Math.PI/2)*(birth%4))+this.random.float(0,F(Math.PI/2))),r=this.random.float(blast?.8:.45,blast?1.1:.5);
    start.x=F(start.x+F(F(Math.cos(a))*r));start.y=F(start.y+F(F(Math.sin(a))*r));
    this.leaves.push(new ChargeLeaf(this,charge,birth,blast,start,target));
  }
  update(battle) {
    const h=this.hud;if(h&&!battle.transition&&!battle.finished){
      const previous=h.time;if(!battle.dying)h.time=Math.max(0,h.time-1/60);
      if(h.time<h.timeOut){h.red=true;h.timeOut--;battle.sound?.('se_timeout');}
      if(Math.trunc(previous)>Math.trunc(h.time)&&h.time<=10)h.timeSize=2;
      if(h.timeSize>1)h.timeSize=Math.max(1,F(h.timeSize-.1));
      h.bloodAlpha=Math.max(.2,Math.min(1,F(h.bloodAlpha+(Math.hypot(battle.player.x-battle.boss.x,battle.player.y-battle.boss.y)<100?-.05:.05))));
      h.timeAlpha=Math.max(.2,Math.min(1,F(h.timeAlpha+(Math.hypot(battle.player.x,battle.player.y-200)<70?-.05:.05))));
    }
    const frame=++this.magicFrame;
    if(frame<=30)this.magicSize=lerp(0,5,F(Math.pow(F(frame/30),.33)));
    const turns=frame<13?5:frame<27?4:frame<40?2:1,delta=presentationQuaternion(0,-.006,.012);
    for(let i=0;i<turns;i++)this.magicRotation=multiplyPresentationQuaternion(delta,this.magicRotation);
    this.aura=this.aura.filter(p=>{const n=++p.age;if(p.fire){if(n<20){p.width=F(p.width+.5);p.height=F(p.height+7);}if(n>5)p.alpha=F(p.alpha-.07);}else{if(n<30)p.size=F(p.size+p.speed);p.alpha=F(p.alpha-.033);}return n<(p.fire?20:30);});
    if(frame%2===0){const angle=this.random.float(0,TAU),speed=this.random.float(3.2,4.8);this.aura.push({age:0,fire:false,speed,angle,size:0,alpha:1});}
    if(frame%6===0&&frame>10)this.aura.push({age:0,fire:true,speed:7,angle:this.random.float(-.05,.05),width:40,height:32,alpha:1});
    this.leaves=this.leaves.filter(leaf=>leaf.update());
    for(const charge of this.charges){
      const f=charge.effect.frame; if(f===charge.lastFrame)continue;charge.lastFrame=f;
      for(let i=0;i<charge.storetimes;i++){const age=f-i*24;if(age>=1&&age<=5)charge.inwardAlpha[i]=F(charge.inwardAlpha[i]+.06);if(age>=1&&age<=30)this.spawnLeaf(charge,age,false);}
      const delay=70+(charge.storetimes-1)*24,age=f-delay;
      if(charge.blast&&f===delay)battle.sound?.('se_enep02');
      if(charge.blast&&age>=1&&age<35)charge.blastAlpha=F(charge.blastAlpha-F(F(.8)/F(35)));
      if(charge.blast&&age>=1&&age<=24)this.spawnLeaf(charge,age,true);
    }
    this.charges=this.charges.filter(c=>c.effect.alive&&c.effect.frame<=70+(c.storetimes-1)*24+74);
    this.entrances=this.entrances.filter(e=>{const n=++e.age;
      if(n<=10){e.alpha=F(e.alpha+F(.05));e.cutinAlpha=F(e.cutinAlpha+F(.1));e.x=F(e.x-15);e.y=F(e.y-3);}
      else if(n<=80){e.x=F(e.x-1);e.y=F(e.y-F(.2));}
      else{e.x=F(e.x-15);e.y=F(e.y-3);e.cutinAlpha=F(e.cutinAlpha-F(.1));}
      if(n>=50)e.alpha=F(e.alpha-F(.05));
      if(n<60)for(const unit of e.units){unit.x=F(unit.x+F(F(lineUnit[0]*2)*unit.sign));unit.y=F(unit.y+F(F(lineUnit[1]*2)*unit.sign));}
      return n<=90;
    });
    for(const c of this.cards){
      c.age++;
      const f=c.age;
      if(f<=10)c.compositeAlpha=F(c.compositeAlpha+.1);
      if(f>15&&f<=35)c.backAlpha=F(c.backAlpha+.05);
      if(f>60&&f<=70)c.labelAlpha=F(c.labelAlpha+.1);
      if(f<=25)c.textScale=F(c.textScale-F(.04));
      if(f>=60){const p=battle.player,covers=p.x>-50&&Math.abs(p.y-(c.slideY-180))<50;c.opacity=Math.max(.2,Math.min(1,F(c.opacity+(covers?-.05:.05))));}
      c.scroll=F(c.scroll+(this.bossKey==='artia'?.005:.003));
      if(c.leaving){c.deadAge++;c.alpha=Math.max(0,F(c.alpha-.1));c.overlayAlpha=Math.max(0,F(c.overlayAlpha-.1));c.slideX=lerp(c.slideX,300,.1);c.slideY=lerp(c.slideY,355,.1);continue;}
      c.alpha=Math.min(1,F(c.alpha+F(.02)));
      c.overlayAlpha=Math.min(this.bossKey==='monstone'?.75:1,F(c.overlayAlpha+F(.02)));
      c.innerRotation=multiplyPresentationQuaternion(presentationQuaternion(0,0,-2),c.innerRotation);c.outerRotation=multiplyPresentationQuaternion(presentationQuaternion(0,0,2),c.outerRotation);
      const ratio=(Math.max(0,c.phase.time-battle.phaseFrame/60)+1)/c.phase.time;
      if(f<=15){c.innerAlpha=lerp(1,.5,f/15);c.innerMax=lerp(100,95,f/15);}
      else if(f<=60){let t=lerp(-3,3,F((f-15)/45));t=F(1/F(1+F(Math.pow(F(2.7),-t))));const end=F(1/F(1+F(Math.pow(F(2.7),-3))));t=F(.5+F(F(F(t-.5)*.5)/F(end-.5)));c.innerMax=lerp(95,195,t);c.innerMin=lerp(0,175,t);}
      else{c.innerMax=lerp(40,195,ratio);c.innerMin=lerp(20,175,ratio);}
      if(f<=75){c.outerOuter=F(c.outerOuter+c.outerSpeed);c.outerInner=F(c.outerInner+c.outerSpeed);c.outerSpeed=F(c.outerSpeed-.22);}
      else c.outerScale=lerp(.5,1,ratio*ratio);
      c.outerX=f<60?battle.boss.x*.8:lerp(c.outerX,battle.boss.x*.8,.2);c.outerY=f<60?battle.boss.y*.8:lerp(c.outerY,battle.boss.y*.8,.2);
      if(f>=60)c.slideY=lerp(c.slideY,355,.1);
    }
    this.cards=this.cards.filter(c=>!c.leaving||c.deadAge<15);
  }
  drawOuter(draw,atlas) {
    const c=this.activeCard;if(!c)return;
    draw.blendFactors('srcAlpha','one','add','one','one','add');this.outerRing.draw(draw,sampledTexture(draw,atlas,'spell-line'),{x:c.outerX,y:c.outerY,inner:c.outerInner,outer:c.outerOuter,rotationMatrix:ringBasis(c.outerRotation),scale:c.outerScale,color:withAlpha(0xffffffff,.5),screenX,screenY});draw.blendEnd();
  }
  drawUnderBoss(draw,atlas,common,battle) {
    draw.blendFactors('srcAlpha','one','add','one','one','add');
    const c=this.activeCard,b=battle.boss;
    if(c)this.innerRing.draw(draw,sampledTexture(draw,atlas,'spell-line'),{x:b.x,y:b.y,inner:c.innerMin,outer:c.innerMax,rotationMatrix:ringBasis(c.innerRotation),color:withAlpha(0xffffffff,c.innerAlpha),screenX,screenY});
    if(b.alive){
      this.magicSprite.draw(draw,sampledTexture(draw,common,'effect-magic-circle'),{position:this.camera.screenToWorld(b.x,b.y,.99),scale:{x:this.magicSize,y:this.magicSize,z:1},rotation:this.magicRotation,color:withAlpha(0xffffffff,.5)});
      const texture=sampledTexture(draw,atlas,'legacy-aura');
      for(const p of this.aura){
        if(p.fire){const x=b.x-Math.sin(p.angle)*p.height/2,y=b.y+Math.cos(p.angle)*p.height/2;
          draw.spriteRegion(texture,7,3,37,42,screenX(x),screenY(y),p.width*1.5,p.height*1.5,-p.angle,color(colors[this.colorKey],p.alpha));
        }else if(p.size>0)draw.spriteRegion(texture,52,6,39,39,screenX(b.x),screenY(b.y),p.size*1.5,p.size*1.5,-p.angle,color(colors[this.colorKey],p.alpha));
      }
    }
    for(const card of this.entrances){const f=card.age;if(f>0&&f<60){const region=atlas.getSprite('spell.attack-strip'),texture=sampledTexture(draw,atlas,region.texture);
      for(const unit of card.units)draw.spriteRegion(texture,region.x,region.y,region.width,region.height,screenX(unit.x),screenY(unit.y),24,192,F(F(Math.PI)/3),withAlpha(0xffffffff,card.alpha));}
    }
    draw.blendEnd();
  }
  drawCharge(draw,charge,atlas) {
    const f=charge.effect.frame,p=charge.follow,texture=sampledTexture(draw,atlas,'legacy-petals');draw.blendFactors('srcAlpha','one','add','one','one','add');
    for(let i=0;i<charge.storetimes;i++){const a=f-i*24;if(a>=1&&a<40){const size=Math.max(0,800-20*a);if(size>0)draw.spriteRegion(texture,0,32,32,32,screenX(p.x),screenY(p.y),size*1.5,size*1.5,0,color(charge.color,charge.inwardAlpha[i]));}}
    const a=f-(70+(charge.storetimes-1)*24);
    if(charge.blast&&a>=1&&a<35)draw.spriteRegion(texture,0,32,32,32,screenX(p.x),screenY(p.y),a*25*1.5,a*25*1.5,0,color(charge.color,charge.blastAlpha));
    draw.blendEnd();
  }
  drawParticles(draw,atlas) {if(!this.leaves.length)return;draw.blendFactors('srcAlpha','one','add','one','one','add');const texture=sampledTexture(draw,atlas,'legacy-petals');for(const leaf of this.leaves)leaf.draw(draw,texture);draw.blendEnd();}
  snapshot(){return{implementation:'thlib perspective sprites / textured rings; Rush source presentation profile',magicFrame:this.magicFrame,magicSize:this.magicSize,magicRotation:this.magicRotation.slice(),visualRandomCalls:this.random.calls,aura:this.aura.length,charges:this.charges.length,chargeFrames:this.charges.map(c=>({frame:c.effect.frame,storetimes:c.storetimes,blast:c.blast})),leaves:this.leaves.length,entrances:this.entrances.map(e=>e.age),hud:this.hud?{...this.hud}:null,
    cards:this.cards.map(c=>({key:c.phase.key,age:c.age,deadAge:c.deadAge,alpha:c.alpha,slideX:c.slideX,slideY:c.slideY,innerMin:c.innerMin,innerMax:c.innerMax,outerInner:c.outerInner,outerOuter:c.outerOuter,outerScale:c.outerScale}))};}
  dispose(){this.aura.length=this.charges.length=this.leaves.length=this.cards.length=this.entrances.length=0;this.activeCard=null;}
}
