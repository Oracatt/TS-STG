import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createTouhouResources} from '@ts-stg/thlib/touhou';
import {RushBattle} from '../games/rushboss/src/runtime.js';
import {BOSSES} from '../games/rushboss/src/catalog.js';

test('a new health group records incoming batches without losing HP for exactly its ECL515 interval',()=>{
  const b=new RushBattle(BOSSES[0].phases,{boss:'sunny',profile:'portrait',spellIndex:2,invincible:true});
  try{
    const a=b.playerAdapter,p=b.sharedPlayer,initial=b.boss.hp;
    p.state=1;p.timer.set(100);
    for(let frame=0;frame<120;frame++){
      a.syncBoss();a.damage.add(a.proxy,70,{x:0,y:128});b.update();
      assert.equal(b.boss.hp,initial,`frame${frame}`);
      assert.equal(b.boss.damageInvulnerability.current,119-frame);
    }
    assert.equal(a.health.damageTotal,8400);assert.ok(b.score>0,'protected hits still score');
    a.damage.add(a.proxy,70,{});b.update();assert.equal(b.boss.hp,initial-70);
  }finally{b.dispose();}
});

test('the final standalone spell inherits only the unconsumed wrapper protection; ordinary spell does not reset it',()=>{
  for(const key of ['sunny','monstone']){
    const spec=BOSSES.find(b=>b.key===key),index=spec.phases.length-1;
    const b=new RushBattle(spec.phases,{boss:key,profile:'portrait',spellIndex:index,invincible:true});
    try{
      assert.equal(b.boss.damageInvulnerability.current,20);const before=b.boss.hp;
      assert.equal(b.damage(700),0);assert.equal(b.boss.hp,before);
      for(let i=0;i<20;i++)b.update();assert.equal(b.damage(700),100);
      b.boss.damageInvulnerability.set(7);b.beginPhase(1);
      assert.equal(b.boss.damageInvulnerability.current,7,'plain spell entry preserves the existing timer');
      assert.equal(b.damage(700),0);b.boss.damageInvulnerability.set(0);
      assert.equal(b.damage(700),100,'no invented per-spell invincibility');
    }finally{b.dispose();}
  }
});

test('entrance and dialogue consume protection, and spell practice bypasses normal-route wrappers',()=>{
  const b=new RushBattle(BOSSES[0].phases,{profile:'portrait',deferStart:true,practice:true,spellIndex:6});
  try{
    b.revealBoss({mode:'flyIn',damageProtectionFrames:120}).setDialogue(true);
    for(let i=0;i<101;i++)b.update();assert.equal(b.boss.damageInvulnerability.current,19);
    b.startCombat(6);assert.equal(b.boss.damageInvulnerability.current,19,'practice does not replace entrance remainder by final wrapper20');
    for(let i=0;i<19;i++)b.update();assert.equal(b.boss.damageInvulnerability.current,0);
    b.beginPhase(2);assert.equal(b.boss.damageInvulnerability.current,0,'practice never installs Boss2 normal-route120');
  }finally{b.dispose();}
});

test('the public HUD receives the same protection timer as damage and starts the source fill only after expiry',()=>{
  let id=0;const resources=createTouhouResources({readText:p=>fs.readFileSync(p,'utf8'),loadTexture:()=>++id});
  const b=new RushBattle(BOSSES[0].phases,{profile:'portrait',resources,spellIndex:2,invincible:true});
  try{
    assert.equal(b.presentation.proxyBoss.damageInvulnerability,b.boss.damageInvulnerability);
    const panel=b.presentation.shared.hud.panels[0];
    for(let i=0;i<119;i++)b.update();assert.equal(panel.animations.length,0);
    b.update();assert.equal(b.boss.damageInvulnerability.current,0);assert.equal(panel.animations.length,7);
    assert.equal(panel.target,1);assert.equal(panel.fraction,Math.fround(.025));
    for(let i=0;i<40;i++)b.update();assert.equal(panel.fraction,1);
  }finally{b.dispose();resources.dispose();}
});
