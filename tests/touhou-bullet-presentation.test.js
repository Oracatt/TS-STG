import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {DrawList} from '@ts-stg/thlib';
import {createTouhouResources,touhouStyle,TouhouBulletBirth,TouhouBulletPresentation,TouhouReimuBomb,TouhouMarisaBomb,
  TouhouBulletField,touhouBulletCommand} from '@ts-stg/thlib/touhou';
import {RushBattle} from '../games/rushboss/src/runtime.js';
const optional={skip:!existsSync('packages/thlib/assets/touhou-common/manifest.json')||process.env.TS_STG_TEST_STATIC_ASSETS==='1'};
const phase={key:'bullet-presentation-fixture',hp:1000,time:1000};
const resources=()=>createTouhouResources({readText:file=>readFileSync(file,'utf8'),loadTexture:()=>1});
const hasQuad=draw=>draw.commands.some(command=>command[0]==='quad'||command[0]==='statefulQuad');
function usingResources(fn){const shared=resources();try{fn(shared);}finally{shared.dispose();}}
function usingBattle(fn,options={}){usingResources(shared=>{const battle=new RushBattle([phase],{resources:shared,invincible:true,profile:'portrait',...options});
  try{fn(battle,shared);}finally{battle.dispose();}});}

// These durations and local sprite slots come from recovered bullet.anm:
// scripts37/41 use sprite1 during birth; labels7/default/9 last8/15/25.
test('source birth labels keep the palette fog until the exact 8/15/25-frame completion',optional,()=>usingResources(shared=>{
  for(const type of [0,4])for(const [birthKind,duration]of [[TouhouBulletBirth.FAST,8],[TouhouBulletBirth.NORMAL,15],[TouhouBulletBirth.SLOW,25]]){
    const style=touhouStyle(shared.styles,type,3),visual=new TouhouBulletPresentation({bank:shared.banks.bullet,style,birthKind});
    const fog=style.remapSprite(1),body=style.remapSprite(0);
    assert.notEqual(fog,body);assert.equal(visual.animation.spriteIndex,fog);assert.equal(visual.ready,false);
    assert.ok(visual.animation.alpha>0&&visual.animation.alpha<255);assert.ok(visual.animation.scaleX>1);
    const draw=new DrawList();visual.draw(draw);assert.ok(hasQuad(draw));
    for(let frame=1;frame<duration;frame++){
      visual.update();assert.equal(visual.ready,false,`type${type} kind${birthKind} at frame${frame}`);
      assert.equal(visual.animation.spriteIndex,fog);
    }
    visual.update();assert.equal(visual.ready,true);assert.equal(visual.phase,'active');
    assert.equal(visual.animation.spriteIndex,body);assert.equal(visual.animation.alpha,255);
    assert.equal(visual.animation.scaleX,1);assert.equal(visual.animation.scaleY,1);visual.destroy();
  }
}));

function activeRushBullet(battle,position){
  const bullet=battle.spawn('XiaoYu',position,{},0,{delay:0,cleanOnOutOfRange:false});
  // Activate the real source actor without separately ticking the Bomb: this
  // makes its cancellation target ready before the tested Bomb callback.
  battle.world.update();battle.bulletVisuals.update(battle.world.entities.concat(battle.world.pending));
  assert.equal(bullet.birthNotified,true);return bullet;
}
test('actual shared Reimu orb update and orb retirement both retain original cancellation children',optional,()=>usingBattle(battle=>{
  const player=battle.sharedPlayer,context=battle.playerAdapter.context;
  const contact=activeRushBullet(battle,{x:player.x,y:battle.playerYOffset-player.y});
  assert.equal(player.triggerBomb(context),true);const bomb=player.bomb;assert.ok(bomb instanceof TouhouReimuBomb);
  bomb.update(context);assert.equal(contact.destroyReason,'reimu-orb');
  battle.bulletVisuals.update(battle.world.entities.concat(battle.world.pending));
  const first=battle.bulletVisuals.visuals.get(contact);assert.equal(first.phase,'cancel');
  assert.equal(battle.bulletVisuals.effects.length,1);const firstEffect=battle.bulletVisuals.effects[0];
  assert.equal(firstEffect.scriptId,first.style.cancelScript);
  // Source221 first waits a random number of frames, then spawns219/220.
  for(let frame=0;!firstEffect.children.length&&frame<20;frame++)firstEffect.update();
  assert.ok(firstEffect.children.some(child=>child.alive));
  const orb=bomb.orbs.find(value=>value.active),retirement=activeRushBullet(battle,{x:orb.x,y:battle.playerYOffset-orb.y});
  bomb.retireOrb(orb,context);assert.equal(retirement.destroyReason,'reimu-orb-retire');
  battle.bulletVisuals.update(battle.world.entities.concat(battle.world.pending));
  assert.equal(battle.bulletVisuals.visuals.get(retirement).phase,'cancel');assert.equal(battle.bulletVisuals.effects.length,2);
}));

test('actual shared Marisa ANM57 beam invokes the Rush rectangle adapter and original bullet cancellation',optional,()=>usingBattle(battle=>{
  const player=battle.sharedPlayer,context=battle.playerAdapter.context;
  assert.equal(player.triggerBomb(context),true);const bomb=player.bomb;assert.ok(bomb instanceof TouhouMarisaBomb);
  const findOrigin=animation=>{for(const child of animation?.children??[]){if(child.scriptId===57&&child.alive)return child;const found=findOrigin(child);if(found)return found;}return null;};
  let origin=findOrigin(bomb.beam);
  for(let frame=0;!origin&&frame<40;frame++){bomb.update(context);origin=findOrigin(bomb.beam);}
  assert.ok(origin,'Marisa cancellation must use the actual source ANM57 child, not a fabricated beam');
  // ANM57 first spawns at y480, below the original448-unit playfield. Source
  // rectangular cancellation excludes that target until the real beam enters.
  let position=origin.worldPosition();
  for(let frame=0;position.y>448&&frame<40;frame++){bomb.update(context);position=origin.worldPosition();}
  assert.ok(position.x>=-192&&position.x<=192&&position.y>=0&&position.y<=448);
  const bullet=activeRushBullet(battle,{x:position.x,y:battle.playerYOffset-position.y});
  bomb.update(context);assert.equal(bullet.destroyReason,'marisa-beam');
  battle.bulletVisuals.update(battle.world.entities.concat(battle.world.pending));
  const visual=battle.bulletVisuals.visuals.get(bullet);assert.equal(visual.phase,'cancel');assert.equal(battle.bulletVisuals.effects.length,1);
  assert.equal(battle.bulletVisuals.effects[0].scriptId,visual.style.cancelScript);
},{character:1}));

test('instant shots explicitly skip fog and large-orb postload sprite follows its selected palette',optional,()=>usingResources(shared=>{
  for(const type of [0,4,33]){
    const style=touhouStyle(shared.styles,type,3);
    const visual=new TouhouBulletPresentation({bank:shared.banks.bullet,style,birthKind:TouhouBulletBirth.INSTANT});
    assert.equal(visual.ready,true);assert.equal(visual.animation.spriteIndex,style.remapSprite(0));
    assert.equal(visual.animation.alpha,255);assert.equal(visual.animation.scaleX,1);visual.destroy();
  }
  const style=touhouStyle(shared.styles,33,5),orb=new TouhouBulletPresentation({bank:shared.banks.bullet,style});
  assert.equal(orb.animation.spriteIndex,style.remapSprite(0));assert.ok(orb.animation.scaleX>1);
  orb.destroy();
}));

test('recoloring a birth remaps fog sprite1 without prematurely changing it into body0',optional,()=>usingResources(shared=>{
  const visual=new TouhouBulletPresentation({bank:shared.banks.bullet,style:touhouStyle(shared.styles,4,0)});
  const alpha=visual.animation.alpha,scale=visual.animation.scaleX;
  visual.setStyle(touhouStyle(shared.styles,4,6));
  assert.equal(visual.animation.spriteIndex,visual.style.remapSprite(1));
  assert.equal(visual.ready,false);assert.equal(visual.animation.alpha,alpha);assert.equal(visual.animation.scaleX,scale);
  for(let frame=0;frame<15;frame++)visual.update();
  assert.equal(visual.animation.spriteIndex,visual.style.remapSprite(0));visual.destroy();
}));

test('retire deletes body and source child silently, while explicit cancellation allocates one original effect',optional,()=>usingResources(shared=>{
  const create=()=>new TouhouBulletPresentation({bank:shared.banks.bullet,style:touhouStyle(shared.styles,0,3),birthKind:null});
  const retired=create(),idBeforeRetire=shared.banks.bullet.nextId;
  assert.ok(retired.child);assert.equal(retired.finish('retire'),null);assert.equal(retired.alive,false);
  assert.equal(retired.child.alive,false);assert.equal(shared.banks.bullet.nextId,idBeforeRetire);
  const draw=new DrawList();retired.draw(draw);assert.equal(hasQuad(draw),false);
  const cancelled=create(),effect=cancelled.finish('cancel');
  assert.ok(effect);assert.equal(effect.scriptId,cancelled.style.cancelScript);
  assert.equal(cancelled.phase,'cancel');assert.equal(cancelled.animation.pendingInterrupt,0);
  assert.equal(cancelled.animation.spriteIndex,cancelled.style.remapSprite(2));
  const idAfterCancel=shared.banks.bullet.nextId;assert.equal(cancelled.finish('cancel'),null);
  assert.equal(shared.banks.bullet.nextId,idAfterCancel);
  const cancelDraw=new DrawList();cancelled.draw(cancelDraw);effect.draw(cancelDraw);assert.ok(hasQuad(cancelDraw));
  for(let frame=0;frame<20;frame++)cancelled.update();assert.equal(cancelled.alive,false);
  cancelled.destroy();effect.destroy();
}));

test('hit keeps the source deferred body interrupt and 30-frame velocity drift; frozen cancel omits separate effect',optional,()=>usingResources(shared=>{
  const style=touhouStyle(shared.styles,4,3),hit=new TouhouBulletPresentation({bank:shared.banks.bullet,style,x:12,y:24,birthKind:null});
  const effect=hit.finish('hit',{velocity:{x:2,y:-3,z:0},clockScale:.5});
  assert.equal(hit.animation.pendingInterrupt,1);assert.equal(effect.x,12);assert.equal(effect.y,24);
  const drift=effect.interpolations.get('position').value;
  assert.equal(drift.duration,30);assert.equal(drift.mode,6);assert.deepEqual(drift.end,[10,-15,0]);
  hit.update();assert.equal(hit.animation.pendingInterrupt,0);hit.destroy();effect.destroy();
  const frozen=new TouhouBulletPresentation({bank:shared.banks.bullet,style,birthKind:null});
  const id=shared.banks.bullet.nextId;assert.equal(frozen.finish('cancel',{frozen:true}),null);
  assert.equal(shared.banks.bullet.nextId,id);assert.equal(frozen.phase,'cancel');frozen.destroy();
}));

test('shared bullet controller preserves source fog and permits original startup collision independently of readiness',optional,()=>usingResources(shared=>{
  const field=new TouhouBulletField({bank:shared.banks.bullet,styles:shared.styles});
  const [bullet]=field.emit({type:0,color:5,x:0,y:100,speed:0,commands:[touhouBulletCommand(1,{ints:[1]})]});
  assert.equal(bullet.state,2);assert.equal(bullet.animation.U(0x444),0);
  assert.equal(bullet.animation.spriteIndex,bullet.style.remapSprite(1));
  let collisions=0;field.update({collisionCircle:()=>{collisions++;return 1;}});
  assert.equal(collisions,1);assert.equal(bullet.state,3);assert.equal(field.effects.length,1);
  assert.equal(bullet.animation.U(0x444),0,'birth fog does not gate original collision');
}));

test('shared controller naturally retires at original bounds without any cancel animation or callback',optional,()=>usingResources(shared=>{
  const field=new TouhouBulletField({bank:shared.banks.bullet,styles:shared.styles});
  const [bullet]=field.emit({type:4,x:300,y:100,speed:0});let effects=0;
  for(let frame=0;frame<6;frame++)field.update(null,{onCancelEffect:()=>effects++});
  assert.equal(bullet.state,0);assert.equal(bullet.animation.alive,false);assert.equal(field.count,0);
  assert.equal(field.effects.length,0);assert.equal(effects,0);
  const [cancel]=field.emit({type:4,x:0,y:100,speed:0});
  assert.equal(field.cancelCircle(0,100,10),1);assert.equal(cancel.state,4);
  assert.equal(field.effects.length,1);assert.equal(effects,1);
}));

test('Rush startup fog and trajectory delay never suppress the original circle collision',optional,()=>usingBattle(battle=>{
  const standard=battle.spawn('XiaoYu',{x:0,y:100},{},3);battle.update();
  const visual=battle.bulletVisuals.visuals.get(standard);assert.ok(visual instanceof TouhouBulletPresentation);
  assert.equal(visual.ready,false);assert.equal(visual.animation.spriteIndex,visual.style.remapSprite(1));
  assert.equal(standard.delay,14);assert.equal(battle.intersectsBullet(standard,1,standard),true);
  const draw=new DrawList();battle.bulletVisuals.drawBullet(draw,standard);assert.ok(hasQuad(draw));
  const collisionReady=battle.spawn('XiaoYu',{x:0,y:0},{},0,{delay:0,birthKind:TouhouBulletBirth.SLOW});
  const collisionDelayed=battle.spawn('XiaoYu',{x:10,y:0},{},0,{delay:30,birthKind:TouhouBulletBirth.FAST});
  battle.update();assert.equal(battle.bulletVisuals.visuals.get(collisionReady).ready,false);
  assert.equal(battle.intersectsBullet(collisionReady,1,collisionReady),true);
  for(let frame=0;frame<8;frame++)battle.update();
  assert.equal(battle.bulletVisuals.visuals.get(collisionDelayed).ready,true);
  assert.ok(collisionDelayed.delay>0);assert.equal(battle.intersectsBullet(collisionDelayed,1,collisionDelayed),true);
}));

test('Rush natural bounds/lifetime removal has no drawable effect, but named cancellation does',optional,()=>usingBattle(battle=>{
  const outside=battle.spawn('XiaoYu',{x:battle.bounds.maxX+30,y:0},{},0,{delay:1});
  const expired=battle.spawn('XiaoYu',{x:0,y:0},{},0,{delay:0,lifetime:2});
  battle.update();assert.equal(outside.alive,true);assert.ok(battle.bulletVisuals.visuals.has(outside));
  battle.update();assert.equal(outside.destroyReason,'outOfRange');assert.equal(expired.destroyReason,'expired');
  assert.equal(battle.bulletVisuals.visuals.has(outside),false);assert.equal(battle.bulletVisuals.visuals.has(expired),false);
  assert.equal(battle.bulletVisuals.effects.length,0);const draw=new DrawList();battle.bulletVisuals.drawEffects(draw);assert.equal(hasQuad(draw),false);
  const cancel=battle.spawn('XiaoYu',{x:0,y:0},{},0,{delay:0});battle.update();
  cancel.kill('cancel');battle.update();assert.equal(battle.bulletVisuals.effects.length,1);
  const cancelDraw=new DrawList();battle.bulletVisuals.drawEffects(cancelDraw);assert.ok(hasQuad(cancelDraw));
}));

test('Rush clear/dispose retirement is silent and repeated drawing does not advance birth or gameplay',optional,()=>usingBattle(battle=>{
  const b=battle.spawn('XiaoYu',{x:0,y:0},{},0);battle.update();
  const visual=battle.bulletVisuals.visuals.get(b),birth=visual.snapshot(),snapshot=battle.snapshot();
  for(let frame=0;frame<4;frame++)battle.bulletVisuals.drawBullet(new DrawList(),b);
  assert.deepEqual(visual.snapshot(),birth);assert.deepEqual(battle.snapshot(),snapshot);
  for(const reason of ['clear','destroy','dispose']){
    const bullet=battle.spawn('XiaoYu',{x:0,y:0},{},0,{delay:0});battle.update();bullet.kill(reason);battle.update();
    assert.equal(battle.bulletVisuals.visuals.has(bullet),false);assert.equal(battle.bulletVisuals.effects.length,0);
  }
}));

test('Rush respawn cleanup follows original cancel_circle and retains its disappearance effect',optional,()=>usingBattle(battle=>{
  const bullet=battle.spawn('XiaoYu',{x:0,y:0},{},0,{delay:0});battle.update();
  const visual=battle.bulletVisuals.visuals.get(bullet);bullet.kill('respawn');battle.update();
  assert.equal(visual.phase,'cancel');assert.equal(battle.bulletVisuals.effects.length,1);
  assert.equal(battle.bulletVisuals.effects[0].scriptId,visual.style.cancelScript);
}));

test('deferred owner callbacks preserve tint/fade without mutating source animation lifecycle or RNG',optional,()=>usingResources(shared=>{
  const visual=new TouhouBulletPresentation({bank:shared.banks.bullet,style:touhouStyle(shared.styles,4,0),birthKind:null});
  visual.animation.color=0xffffffff;
  const callbacks=[],queue={enqueuePriority(priority,callback,options){callbacks.push({priority,callback,options});}};
  const before=visual.animation.snapshot(),random=shared.banks.bullet.rng.state;
  visual.draw(queue,undefined,{alpha:.5,tint:[1,.5,0]});
  assert.deepEqual(visual.animation.snapshot(),before);assert.equal(callbacks.length,1);assert.equal(callbacks[0].priority,41);
  const draw=new DrawList();callbacks[0].callback(draw);
  const quad=draw.commands.find(command=>command[0]==='quad'||command[0]==='statefulQuad');assert.ok(quad);
  assert.deepEqual(quad.slice(12,16),[0xff7f007f,0xff7f007f,0xff7f007f,0xff7f007f]);
  assert.deepEqual(visual.animation.snapshot(),before);assert.equal(shared.banks.bullet.rng.state,random);visual.destroy();
}));
