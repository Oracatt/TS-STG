import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {RushBattle} from '../games/rushboss/src/runtime.js';
import {BOSSES} from '../games/rushboss/src/catalog.js';
import {RUSH_BOSS_DROP_PROFILES} from '../games/rushboss/src/boss-drop-profile.js';

test('a nonspell defeat hands off synchronously, clears the old attack and does not carry over batch damage',()=>{
  for(const {key,phases}of BOSSES){
    const b=new RushBattle(phases,{boss:key,profile:'portrait',invincible:true});
    try{
      b.boss.x=0;b.boss.y=100;b.playerAdapter.syncBoss();
      const old=b.actor({x:0,y:100,cleanOnOutOfRange:false});
      const bullet=b.spawn('MiDan',{x:80,y:0},{},0,{delay:0});
      b.boss.hp=1;b.playerAdapter.health.set(1,false);
      const a=b.playerAdapter,p=b.sharedPlayer;p.timer.set(100);p.timer.previous=99;p.state=1;
      a.damage.add(a.proxy,1000,{});a.damage.add(a.proxy,1000,{});a.afterBulletUpdate();
      assert.equal(b.phaseIndex,1,key);assert.equal(b.phaseFrame,0);assert.equal(b.transition,0);
      assert.equal(b.playerAdapter.spell.active,true);assert.equal(b.boss.hp,phases[1].hp);
      assert.equal(b.playerAdapter.health.scaledHp,phases[1].hp*7);assert.equal(a.damage.pending.size,0);
      assert.equal(b.results.length,1);assert.equal(b.results[0].reason,'defeated');
      assert.equal(old.alive,false);assert.equal(bullet.alive,false);
      assert.equal(a.items.items.length,0,'Nonspell cleanup has no screen-wide item conversion');
    }finally{b.dispose();}
  }
});

test('within a simulation tick the new card initializes at frame zero and its trajectory starts next tick',()=>{
  let initialized=0,attacks=0;
  const phases=[{key:'non',number:1,spell:false,hp:1,time:30,end:b=>b.cleanAuto('nonspell')},
    {key:'spell',number:2,spell:true,hp:3000,time:30,itemDrops:{},init:()=>initialized++,update:()=>attacks++}];
  const b=new RushBattle(phases,{profile:'portrait',invincible:true});
  try{
    const original=b.playerAdapter.afterBulletUpdate.bind(b.playerAdapter);let first=true;
    b.playerAdapter.afterBulletUpdate=()=>{original();if(first){first=false;b.damage(2);}};
    b.update();assert.equal(initialized,1);assert.equal(b.phaseIndex,1);assert.equal(b.phaseFrame,0);assert.equal(attacks,0);
    b.update();assert.equal(b.phaseFrame,1);assert.equal(attacks,1);
  }finally{b.dispose();}
});

test('all Boss spell rewards use original local drop profiles independently of screen-wide bullets',()=>{
  for(const {key,phases}of BOSSES)for(let index=0;index<phases.length;index++){
    const phase=phases[index],b=new RushBattle(phases,{boss:key,profile:'portrait',invincible:true,spellIndex:index});
    try{
      b.boss.x=0;b.boss.y=100;b.sharedPlayer.setPower(100);
      for(let y=-180;y<=180;y+=40)for(let x=-160;x<=160;x+=40)b.spawn('MiDan',{x,y},{},0,{delay:0});
      b.endPhase('defeated');if(b.dying)b.completePhase('defeated');
      const profile=RUSH_BOSS_DROP_PROFILES[key][phase.number],counts={};
      for(const item of b.playerAdapter.items.items){
        counts[item.type]=(counts[item.type]??0)+1;
        assert.ok(Math.hypot(item.x,item.y-124)<=64.00002,`${key}/${phase.number}: reward escaped Boss radius`);
        assert.equal(item.vy,Math.fround(-2.2));
      }
      const expected=profile?{1:profile.counts.power,2:profile.counts.point,...(profile.centerType?{[profile.centerType]:1}:{})}:{};
      assert.deepEqual(counts,expected,`${key}/${phase.number}`);
      assert.equal(b.playerAdapter.items.pointCounter,0,'No cancellation pseudo-points accumulated');
      assert.ok(!b.projectiles.entities().some(e=>e.alive&&e.group==='bullet'));
    }finally{b.dispose();}
  }
});

test('Boss defeat does not force item collection, but dialogue uses the original HUD collecting flag',()=>{
  const b=new RushBattle(BOSSES[0].phases,{profile:'portrait',invincible:true,spellIndex:1});
  try{
    b.boss.x=0;b.boss.y=100;b.sharedPlayer.setPosition(0,400);b.endPhase('defeated');b.update();
    assert.equal(b.playerAdapter.items.items.length,30);
    assert.ok(b.playerAdapter.items.items.every(item=>item.state===1));
    b.setDialogue(true);b.update();assert.ok(b.playerAdapter.items.items.every(item=>item.state===3));
  }finally{b.dispose();}
});

test('spell practice ends without another authored attack or Boss reward drop',()=>{
  const b=new RushBattle(BOSSES[0].phases,{profile:'portrait',invincible:true,practice:true,spellIndex:3});
  try{
    b.state.tick=119;b.phaseFrame=119;b.boss.hp=1;b.playerAdapter.health.set(1,false);
    b.playerAdapter.syncBoss();b.playerAdapter.damage.add(b.playerAdapter.proxy,1000,{});
    b.update();
    assert.equal(b.finished,false);assert.equal(b.results.length,0);assert.equal(b.defeatSequence.age,0);
    for(let frame=0;frame<60;frame++)b.update();
    assert.equal(b.finished,true);assert.equal(b.results.length,1);assert.equal(b.phaseFrame,179);
    assert.equal(b.playerAdapter.items.spawnCounter,0);
    assert.ok(!b.projectiles.entities().some(e=>e.alive&&e.group==='bullet'));
  }finally{b.dispose();}
});

test('ordinary timeout suppresses Boss rewards while survival completion and failed-bonus defeat retain them',()=>{
  for(const [reason,survival,failed,expected]of [
    ['timeout',false,false,0],['timeout',true,false,30],['defeated',false,true,30]]){
    const phases=BOSSES[0].phases.map(p=>({...p,survival}));
    const b=new RushBattle(phases,{profile:'portrait',invincible:true,spellIndex:1});
    try{
      if(failed){b.playerAdapter.spell.age.set(100);b.playerAdapter.spell.notifyPlayerMiss();}
      b.endPhase(reason);assert.equal(b.playerAdapter.items.items.length,expected,`${reason}/${survival}/${failed}`);
    }finally{b.dispose();}
  }
});

const reference=process.env.TOUHOU20_REFERENCE??path.resolve('../Touhou20Reconstruction');
test('business drop quantities and center fragments are transcribed from their source BossItem calls',{
  skip:!fs.existsSync(path.join(reference,'scripts/recovered/ecl/st03bs.ecl.txt'))},()=>{
  for(const profile of Object.values(RUSH_BOSS_DROP_PROFILES))for(const drop of Object.values(profile)){
    const line=fs.readFileSync(path.join(reference,drop.source.file),'utf8').split(/\r?\n/)[drop.source.line-1];
    assert.equal(line.trim(),`@BossItem(${drop.centerType}, ${drop.counts.power}, ${drop.counts.point});`,`${drop.source.file}:${drop.source.line}`);
  }
});
