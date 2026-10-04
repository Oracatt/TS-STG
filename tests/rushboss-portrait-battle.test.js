import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DrawList,Keys} from '@ts-stg/thlib';
import {TouhouPlayer,TouhouRenderQueue,createTouhouResources,getTouhouPlayerData} from '@ts-stg/thlib/touhou';
import {RushBattle} from '../games/rushboss/src/runtime.js';
import {rushTouhouBulletType} from '../games/rushboss/src/bullet-visuals.js';
import {BOSSES} from '../games/rushboss/src/catalog.js';
import {assertRenderScopes} from './fixtures/render-scopes.js';

const phase={key:'portrait',number:2,spell:true,name:'霊符「夢想封印」',cardId:3,hp:100000,time:1000,bonus:3000000};
const tick=(battle,frames,mask=0)=>{for(let i=0;i<frames;i++)battle.update(mask);};
const available=fs.existsSync('packages/thlib/assets/touhou-common/manifest.json');
function loaded({phases=[phase],...options}={}){
  let handle=1;const host={readText:file=>fs.readFileSync(file,'utf8'),loadTexture:()=>handle++,createRenderTarget:()=>handle++,unloadTexture(){}};
  const resources=createTouhouResources(host),battle=new RushBattle(phases,{profile:'portrait',resources,invincible:true,...options});
  return{resources,battle,dispose(){battle.dispose();resources.dispose();}};
}

test('portrait uses the original player coordinate system, insets, movement, collection line and respawn',()=>{
  for(const character of [0,1]){
    const battle=new RushBattle([phase],{profile:'portrait',character,invincible:true});
    const reference=new TouhouPlayer({character,sht:getTouhouPlayerData(character),x:0,y:400,seed:0});
    assert.deepEqual(battle.bounds,{minX:-192,maxX:192,minY:-224,maxY:224});
    assert.deepEqual(battle.sharedPlayer.bounds,reference.bounds);assert.deepEqual(battle.sharedPlayer.movementInsets,reference.movementInsets);
    assert.equal(battle.sharedPlayer.collectLine,128);assert.equal(battle.sharedPlayer.respawnY,400);assert.equal(battle.sharedPlayer.respawnStartY,480);
    assert.equal(battle.sharedPlayer.power,100);assert.equal(battle.sharedPlayer.bombs,2);
    for(const mask of [Keys.UP|Keys.RIGHT,Keys.DOWN|Keys.LEFT|Keys.FOCUS,Keys.RIGHT|Keys.DOWN])for(let frame=0;frame<160;frame++){
      battle.update(mask);reference.update(mask,{});
      assert.deepEqual([battle.sharedPlayer.fixedX,battle.sharedPlayer.fixedY],[reference.fixedX,reference.fixedY]);
      assert.equal(battle.player.y,224-battle.sharedPlayer.y);
    }
    assert.deepEqual([battle.sharedPlayer.x,battle.sharedPlayer.y],[184,432]);battle.dispose();battle.dispose();
  }
});

test('portrait maps absolute anchors explicitly and retains circle geometry, velocities and aim angles',()=>{
  const battle=new RushBattle([phase],{profile:'portrait',invincible:true});
  assert.equal(battle.anchorX(320),192);assert.deepEqual(battle.anchorPosition({x:-200,y:110}),{x:-120,y:110});
  const anchor=battle.anchorPosition({x:100,y:100}),bullets=battle.ring('MiDan',12,anchor,180,0,70,2);
  for(const bullet of bullets){
    assert.ok(Math.abs(Math.hypot(bullet.x-anchor.x,bullet.y-anchor.y)-70)<.00001);
    assert.ok(Math.abs(Math.hypot(bullet.vx,bullet.vy)-180)<.00003);
  }
  battle.moveBoss(battle.anchorPosition({x:100,y:80}));assert.equal(battle.boss.move.x,60);
  battle.moveBoss({x:battle.boss.x,y:20});assert.equal(battle.boss.move.x,battle.boss.x,'Already-mapped targets are not scaled twice');
  assert.equal(battle.outside({x:193,y:0}),true);assert.equal(battle.outside({x:200,y:0},10),false);battle.dispose();
});

test('deferred dialogue advances player and public animations without starting phases, shooting or taking damage',{skip:!available},()=>{
  const f=loaded({deferStart:true}),b=f.battle;let began=0,attacks=0;
  b.phases=[{...phase,init(){began++;},update(){attacks++;}}];
  assert.equal(b.combatStarted,false);assert.equal(b.boss.alive,false);assert.equal(b.presentation.shared.boss,null);
  const y=b.sharedPlayer.y;tick(b,60,Keys.UP|Keys.SHOOT|Keys.BOMB);
  assert.ok(b.sharedPlayer.y<y);assert.equal(b.shots.length,0);assert.equal(b.sharedPlayer.bomb,null);assert.equal(b.phaseFrame,0);
  assert.equal(began,0);assert.equal(attacks,0);assert.equal(b.statistics.spawned,0);
  b.setDialogue(true).revealBoss();tick(b,30);assert.deepEqual(b.presentation.shared.snapshot().auraScripts,[]);
  assert.equal(b.presentation.shared.hud.timerVisible,false);assert.equal(b.damage(300),0);
  assert.equal(b.presentation.shared.bossVisible,false);assert.equal(b.entranceReady,false);
  assert.throws(()=>b.startCombat(0),/entrance/);
  tick(b,70,Keys.SHOOT);assert.equal(b.entranceReady,false);assert.equal(attacks,0);assert.equal(b.statistics.spawned,0);
  b.update();assert.equal(b.entranceReady,true);assert.equal(b.presentation.shared.bossVisible,true);
  b.startCombat(0);b.update();assert.equal(began,1);assert.equal(attacks,1);assert.equal(b.phaseFrame,1);
  assert.deepEqual(b.presentation.shared.snapshot().auraScripts,[99,108]);
  assert.deepEqual(b.presentation.cards,[]);assert.deepEqual(b.presentation.entrances,[]);
  b.setDialogue(true);b.sharedPlayer.invulnerability.set(0);assert.equal(b.miss(),false);
  tick(b,30,Keys.SHOOT);assert.equal(attacks,1);assert.equal(b.phaseFrame,1);f.dispose();
});

test('portrait Bomb cancellation, bullet rendering and effects use the same native downward Y coordinates',{skip:!available},()=>{
  const f=loaded(),b=f.battle;
  const bullet=b.spawn('MiDan',{x:10,y:-176},{x:0,y:0},0,{delay:0});b.update();
  const animation=b.bulletVisuals.visuals.get(bullet).animation;assert.deepEqual([animation.x,animation.y],[10,400]);
  assert.equal(b.playerAdapter.cancelBullets(10,400,4,{reason:'bomb'}),1);
  const laser=b.laser({x:40,y:100},-Math.PI/2,0,{length:300,width:5,cleanOnBomb:true});b.update();
  assert.equal(b.playerAdapter.cancelRectangle(40,400,20,20,0,{lasers:true}),1);
  assert.equal(laser.alive,true);assert.equal(laser.length,272,'original infinite-laser cancellation retains the untouched root');
  for(const kind of ['XinDan','YanDan']){const actor=b.spawn(kind,{x:0,y:100},{x:0,y:0},0,{delay:0});b.update();assert.ok(b.bulletVisuals.visuals.has(actor));}
  assert.equal(rushTouhouBulletType({kind:'YanDan',color:0},true),43);assert.equal(rushTouhouBulletType({kind:'XinDan',color:0},true),22);
  const fog=b.effect('freezingFog',{x:15,y:100},{scale:96,alpha:1}),charge=b.effect('laserFog',{x:10,y:120});
  tick(b,3);assert.equal(b.presentation.effects.find(v=>v.effect===fog).animation.scriptId,19);
  const sourceBeam=b.projectiles.lasers.get(laser);assert.ok(sourceBeam.origin.alive);assert.equal(sourceBeam.origin.scriptId,58);
  assert.equal(b.projectiles.debris.lasers.filter(l=>l.origin?.alive).length,1,'the old Rush fog event cannot duplicate the public origin');
  assert.equal(b.presentation.proxyPlayer.y,b.sharedPlayer.y);assert.deepEqual(b.presentation.shared.view,b.playerView);
  const draw=new DrawList(),queue=new TouhouRenderQueue();b.presentation.draw(queue);b.playerAdapter.draw(queue,b.playerView);
  b.bulletVisuals.drawEffects(queue,b.bulletView);queue.flush(draw);assertRenderScopes(draw.commands);f.dispose();
});

test('portrait phase drops use public item types, preserve nominal score and finish exit animations during ending dialogue',{skip:!available},()=>{
  const f=loaded({phases:[{...phase,final:true}]}),b=f.battle;b.sharedPlayer.setPower(100);tick(b,30);b.completePhase('defeated');
  const items=b.playerAdapter.items,counts={};for(const item of items.items)counts[item.type]=(counts[item.type]??0)+1;
  assert.deepEqual(counts,{1:15,2:15});assert.equal(b.sharedPlayer.score,Math.floor(b.score/10));
  const power=items.items.find(item=>item.type===1),score=b.score;items.collect(power,b.playerAdapter.context);b.syncHudScore();
  assert.equal(b.sharedPlayer.power,101);assert.equal(b.score,score+100);assert.equal(b.sharedPlayer.score,Math.floor(b.score/10));
  assert.equal(b.finished,true);const frame=b.presentation.frame;b.setDialogue(true);tick(b,20,Keys.RIGHT|Keys.SHOOT);
  assert.equal(b.presentation.frame,frame+20);assert.equal(b.presentation.shared.spell.active,false);assert.ok(b.sharedPlayer.x>0);f.dispose();
});

test('all source Boss phases accept portrait bounds and explicit anchor APIs without changing pattern vector units',()=>{
  for(const boss of BOSSES)for(let index=0;index<boss.phases.length;index++){
    const b=new RushBattle(boss.phases,{boss:boss.key,profile:'portrait',spellIndex:index,practice:true,invincible:true,difficulty:3});
    tick(b,180);
    assert.ok(Number.isFinite(b.boss.x)&&Number.isFinite(b.boss.y),`${boss.key}/${index}`);
    for(const entity of b.world.entities)assert.ok(Number.isFinite(entity.x)&&Number.isFinite(entity.y)&&Number.isFinite(entity.vx)&&Number.isFinite(entity.vy));
    b.dispose();
  }
});
