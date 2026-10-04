import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Keys } from '@ts-stg/thlib';
import { createTouhouResources } from '@ts-stg/thlib/touhou';
import { RushBattle } from '../games/rushboss/src/runtime.js';

const phase={key:'damage-regression',number:2,cardId:1,spell:true,hp:1500,time:60,bonus:1000000};
const tick=(b,n,mask=0)=>{for(let i=0;i<n;i++)b.update(mask);};
function fixture(textures=false,options={}){
  let handle=0;
  const resources=textures?createTouhouResources({readText:p=>fs.readFileSync(p,'utf8'),loadTexture:()=>++handle}):null;
  const b=new RushBattle([phase],{profile:'portrait',practice:true,resources,...options});
  b.boss.x=0;b.boss.y=-176;b.phaseFrame=1200;b.playerAdapter.spell.age.set(1200);b.sharedPlayer.invulnerability.set(0);
  return {b,dispose(){b.dispose();resources?.dispose();}};
}

for(const textures of [false,true])test(`miss fails capture but keeps spell, timer and Boss through respawn (ANM=${textures})`,()=>{
  const f=fixture(textures),b=f.b,spell=b.playerAdapter.spell,lives=b.sharedPlayer.lives;
  const effect=spell.effect,phaseFrame=b.phaseFrame;
  assert.equal(b.miss(),true);assert.equal(spell.active,true);assert.equal(spell.captureEligible,false);
  assert.equal(b.spellBonus,0);assert.equal(b.captureFailed,true);
  tick(b,110);
  assert.equal(b.sharedPlayer.lives,lives-1);assert.equal(b.sharedPlayer.state,1);
  assert.equal(b.phaseIndex,0);assert.equal(b.results.length,0);assert.equal(b.finished,false);
  assert.equal(b.phaseFrame,phaseFrame+110);assert.equal(spell.active,true);assert.equal(spell.effect,effect);
  assert.ok(b.boss.hp>1300&&b.boss.hp<1500,`actual source respawn damage: HP=${b.boss.hp}`);
  if(textures){assert.ok(effect.alive);assert.equal(b.presentation.shared.hud.timerVisible,true);}
  f.dispose();
});

test('original damage batching caps combined regions, divides respawn damage by five and retains spell HP sevenths',()=>{
  const f=fixture(),b=f.b,a=b.playerAdapter,p=b.sharedPlayer;
  a.syncBoss();p.timer.set(10);p.timer.previous=9;p.state=0;
  const cap=p.sht.damageCaps[0].normal,expected=Math.trunc(cap/5);
  a.context.damageEnemy(a.proxy,cap,{x:0,y:400});a.context.damageEnemy(a.proxy,cap,{x:0,y:400});
  a.afterBulletUpdate();assert.equal(a.health.scaledHp,1500*7-expected);
  assert.equal(b.boss.hp,Math.trunc((1500*7-expected)/7));
  const scaled=a.health.scaledHp;p.state=1;
  for(let i=0;i<7;i++){a.context.damageEnemy(a.proxy,1,{});a.afterBulletUpdate();}
  assert.equal(a.health.scaledHp,scaled-7);assert.equal(b.boss.hp,Math.trunc((scaled-7)/7));
  f.dispose();
});

test('capture notifications use the original first-sixty-frame grace, without ending the attack',()=>{
  const f=fixture(),b=f.b,spell=b.playerAdapter.spell;b.phaseFrame=10;spell.age.set(10);
  b.miss();assert.equal(b.captureFailed,false);assert.equal(spell.captureEligible,true);
  b.phaseFrame=60;spell.age.set(60);b.playerAdapter.notifySpell('notifyPlayerMiss');
  assert.equal(b.captureFailed,true);assert.equal(spell.captureEligible,false);assert.equal(spell.active,true);
  assert.equal(b.results.length,0);f.dispose();
});

test('Bomb damage uses shared batching while capture failure leaves the current spell running',()=>{
  const f=fixture(false,{character:1}),b=f.b;b.sharedPlayer.invulnerability.set(180);
  tick(b,50,Keys.BOMB);
  assert.equal(b.statistics.bombs,1);assert.equal(b.captureFailed,true);
  assert.ok(b.boss.hp>0&&b.boss.hp<1500);assert.equal(b.results.length,0);assert.equal(b.playerAdapter.spell.active,true);
  f.dispose();
});

test('headless spell completion reports the same elapsed frames and decayed reward as the battle',()=>{
  const b=new RushBattle([{...phase,time:20}],{profile:'portrait',invincible:true,practice:true});
  tick(b,350);b.endPhase('defeated');
  tick(b,59);assert.equal(b.playerAdapter.headlessSpell.result,null);assert.equal(b.results.length,0);
  b.update();
  const actual=b.playerAdapter.headlessSpell.result,expected=b.results[0];
  // BossDead settles in the enemy pass before the burst frame's card tick.
  // The start-at1 card clock therefore matches elapsed time at this boundary.
  assert.equal(actual.frames,410);assert.equal(actual.frames,expected.frames);
  assert.equal(actual.bonus,expected.bonus);
  assert.equal(actual.captured,expected.captured);assert.equal(b.playerAdapter.spell.active,false);b.dispose();
});
