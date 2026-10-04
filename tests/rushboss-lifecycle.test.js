import test from 'node:test';
import assert from 'node:assert/strict';
import { RushBattle } from '../games/rushboss/src/runtime.js';
import { monstonePhases } from '../games/rushboss/src/monstone.js';

const phase = (options={}) => ({key:'fixture',number:1,hp:100,time:20,spell:true,bonus:1000000,
  end(ctx){ctx.cleanAuto(this.finalSpell?'final':this.spell?'spell':'nonspell',ctx.boss);},...options});
const step=(b,n)=>{for(let i=0;i<n;i++)b.update();};

test('Spell bonus uses the original per-frame integer subtraction and ten-point rounding',()=>{
  const battle=new RushBattle([phase()],{invincible:true});
  step(battle,300);assert.equal(battle.spellBonus,1000000);
  step(battle,1);assert.equal(battle.spellBonus,999260);
  step(battle,99);assert.equal(battle.spellBonus,926000);
  battle.endPhase('defeated');assert.equal(battle.results[0].bonus,926000);
});

test('Survival captures retain their full bonus, while a Bomb invalidates capture',()=>{
  const survival=phase({survival:true,time:6});
  const battle=new RushBattle([survival],{invincible:true,practice:true});
  step(battle,360);assert.equal(battle.finished,true);assert.equal(battle.results[0].bonus,1000000);
  const failed=new RushBattle([survival],{invincible:true,practice:true});
  step(failed,60);failed.playerAdapter.spell.notifyBombStart();step(failed,300);assert.equal(failed.results[0].captured,false);assert.equal(failed.results[0].bonus,0);
});

test('phase cleanup delegates to shared cancellation immediately, including birth fog, without a Rush cleaner actor',()=>{
  const battle=new RushBattle([phase(),phase({key:'next',number:2,spell:false})],{invincible:true});
  battle.boss.x=battle.boss.y=0;
  const inside=battle.spawn('XiaoYu',{x:10,y:0},{},0,{delay:0});
  const outside=battle.spawn('XiaoYu',{x:150,y:0},{},0,{delay:0});
  const fog=battle.spawn('XiaoYu',{x:0,y:0},{},0,{delay:15});
  battle.endPhase('defeated');
  assert.equal(inside.alive,false);assert.equal(outside.alive,false);assert.equal(fog.alive,false);
  step(battle,60);assert.equal(battle.phaseIndex,1);
  assert.ok(!battle.world.entities.some(e=>e.group==='cleaner'));
});

test('Final death freezes the card clock for sixty ticks and uses shared cancellation',()=>{
  const sounds=[],battle=new RushBattle([phase({finalSpell:true,deathDelay:60,time:0.05})],
    {invincible:true,practice:true,assets:{playSound(key){sounds.push(key);}}});
  step(battle,3);assert.equal(battle.phaseFrame,3);assert.equal(battle.dying.remaining,60);
  assert.equal(battle.results.length,0);assert.equal(battle.finished,false);
  const bullet=battle.spawn('XiaoYu',{x:200,y:0},{x:60,y:0},0,{delay:0});
  step(battle,1);assert.ok(bullet.x>200);assert.equal(battle.phaseFrame,3);
  step(battle,58);assert.equal(battle.results.length,0);
  step(battle,1);assert.equal(battle.results.length,1);assert.equal(battle.finished,true);
  assert.equal(battle.boss.alive,false);assert.equal(battle.results[0].frames,3);
  assert.equal(sounds.filter(s=>s==='se_enep00').length,1);
  assert.equal(battle.world.entities.filter(e=>e.group==='cleaner').length,0);
});

test('Restored respawn cancels bullets through the shared policy and preserves card emitters',()=>{
  const battle=new RushBattle([phase()],{invincible:false});
  battle.player.invulnerable=0;
  const shooter=battle.actor({x:0,y:100,cleanOnOutOfRange:false});
  const protectedBullet=battle.spawn('XiaoYu',{x:50,y:-200},{},0,{delay:0,cleanOnHit:false});
  const ordinary=battle.spawn('XiaoYu',{x:80,y:-200},{},0,{delay:0});
  const fog=battle.spawn('XiaoYu',{x:80,y:-200},{},0,{delay:15});
  battle.miss();step(battle,battle.sharedPlayer.deathbombFrames+1+30+30);
  assert.equal(ordinary.alive,false);assert.equal(shooter.alive,true);
  assert.equal(protectedBullet.alive,false);assert.equal(fog.alive,false);
});

test('Boss contact respects checking and immunity, including Monstone final dash body',()=>{
  const battle=new RushBattle(monstonePhases,{boss:'monstone',practice:true,spellIndex:8});
  assert.equal(battle.boss.tsRadius,20);
  const p=battle.player,b=battle.boss;p.invulnerable=0;p.x=b.x+Math.sqrt(400+p.radius*p.radius)+.01;p.y=b.y;
  battle.checkBossContact();assert.equal(p.deathbomb,0);
  p.x=b.x+20;b.checking=false;battle.checkBossContact();assert.equal(p.deathbomb,0);
  b.checking=true;p.invulnerable=1;battle.checkBossContact();assert.equal(p.deathbomb,0);
  p.invulnerable=0;battle.checkBossContact();assert.equal(p.deathbomb,battle.sharedPlayer.deathbombFrames);
  assert.equal(battle.statistics.misses,0);
});
