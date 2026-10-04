import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TouhouBossPhasePlan } from '@ts-stg/thlib/touhou';
import { BOSSES, allPhases } from '../games/rushboss/src/catalog.js';
import { RushBattle } from '../games/rushboss/src/runtime.js';
import { RUSH_BOSS_HEALTH_PROFILES, rushBossHealth } from '../games/rushboss/src/boss-health-profile.js';

const health = {
  sunny: [20000,3000,20000,3200,19800,3400,3400],
  monstone: [20000,2800,20000,2800,20300,2500,20300,3200,4300],
  artia: [18000,3900,18000,3900,16000,4000,16000,4000,13000,4000,13000,4500,12000],
};
const seconds = {
  sunny: [40,40,42,41,40,46,60],
  monstone: [36,40,39,44,45,48,44,40,55],
  artia: [40,48,40,36,45,39,53,44,48,46,39,40,60],
};

test('all 29 Demo phases use ordinary ECL health while preserving Rush time limits and 16 cards', () => {
  assert.equal(allPhases.length,29);assert.equal(allPhases.filter(p=>p.spell).length,16);
  assert.deepEqual(allPhases.filter(p=>p.survival).map(p=>[p.boss,p.number]),[['monstone',8],['artia',13]]);
  for(const {key,phases} of BOSSES){
    assert.deepEqual(phases.map(p=>p.hp),health[key]);assert.deepEqual(phases.map(p=>p.time),seconds[key]);
    phases.forEach((p,index)=>{
      assert.equal(rushBossHealth(key,index+1),p.hp);assert.equal(p.healthWeight,undefined);
      assert.equal(RUSH_BOSS_HEALTH_PROFILES[key][index].source.flow,'normal');
      assert.equal(RUSH_BOSS_HEALTH_PROFILES[key][index].source.difficulties,'ENHL');
    });
  }
  // Original stage-three practice uses 5000, but both Demo routes deliberately
  // use the ordinary Boss4's 3400; final stage-six card resets 4500 to 12000.
  assert.equal(RUSH_BOSS_HEALTH_PROFILES.sunny[6].source.healthLine,513);
  assert.equal(RUSH_BOSS_HEALTH_PROFILES.artia[12].source.healthLine,1646);
});

test('normal and selected-phase practice initialize the same HP and seventh-damage mode on all four difficulties',()=>{
  for(const {key,phases} of BOSSES)for(let difficulty=0;difficulty<4;difficulty++)for(const practice of [false,true]){
    const battle=new RushBattle(phases,{boss:key,difficulty,practice,profile:'portrait',invincible:true});
    try{for(let index=0;index<phases.length;index++){
      // beginPhase is shared by ordinary transitions and selected practice.
      battle.beginPhase(index);
      const expected=health[key][index];
      assert.deepEqual([battle.boss.hp,battle.boss.maxHp,battle.playerAdapter.health.maximum],[expected,expected,expected]);
      assert.equal(!!(battle.playerAdapter.health.flags&1),phases[index].spell);
      assert.equal(battle.playerAdapter.health.scaledHp,expected*7);
    }}finally{battle.dispose();}
  }
  for(const {key,phases} of BOSSES)for(let index=0;index<phases.length;index++){
    const battle=new RushBattle(phases,{boss:key,practice:true,spellIndex:index,profile:'portrait'});
    assert.equal(battle.phaseIndex,index);assert.equal(battle.boss.hp,health[key][index]);battle.dispose();
  }
});

test('shared real HP creates source-sized spell sections without Rush lifeBar weights or a refill between phases',()=>{
  for(const {phases} of BOSSES){
    const plan=new TouhouBossPhasePlan(phases);
    for(let i=0;i<phases.length;i++)if(!phases[i].spell&&phases[i+1]?.spell){
      const non=plan.hudState(i,{hp:0}).healthBars[0],spell=plan.hudState(i+1).healthBars[0];
      assert.equal(non.current,phases[i+1].hp);assert.equal(non.current,spell.current);
      assert.equal(non.maximum,phases[i].hp+phases[i+1].hp);
      assert.deepEqual(non.markers,[Math.fround(spell.current/spell.maximum)]);
      assert.ok(non.markers[0]>.10&&non.markers[0]<.26);
      const practice=new TouhouBossPhasePlan([phases[i+1]]).hudState(0).healthBars[0];
      assert.equal(practice.maximum,phases[i+1].hp);assert.equal(practice.current,practice.maximum);
    }
  }
});

test('actual Rush damage path keeps one-to-one nonspell damage and seventh spell damage',()=>{
  for(const index of [0,1]){
    const phases=BOSSES[0].phases,battle=new RushBattle(phases,{boss:'sunny',practice:true,spellIndex:index,profile:'portrait'});
    // Before timeout; use a multiple of seven to avoid integer display
    // rounding obscuring the source rule. No private Rush resistance applies.
    battle.phaseFrame=1200;battle.boss.invulnerable=false;battle.boss.immuneDamage=false;
    const before=battle.boss.hp;assert.equal(battle.damage(700),index===0?700:100);
    assert.equal(battle.boss.hp,before-(index===0?700:100));battle.dispose();
  }
  assert.equal(450/(1000*7),.06428571428571428,'previous Sunny nonspell durability was only 6.43% of its spell');
  assert.ok(20000/(3000*7)>.95,'new logical HP follows the original 23000/3000 ECL group');
});

const reference=process.env.TOUHOU20_REFERENCE??path.resolve('../Touhou20Reconstruction');
const hashes={
  3:'76a3deabc8b36a276211a065ac066a5c9a1e4e99b7a8eed4edca05118f308833',
  4:'506a971eb46718c80198e8c06015acd223a8e542c332af8a20a681cb08a6a4a7',
  5:'e6d28972095acb0c97762e2a1806e4ce523b5ffd13a5678ba0a58530c222e93e',
  6:'75fb5fa85bd91569f93e80c6ae70a9c41986c15e6cc28b4e866533e2d9e95adb',
};
test('profile health/threshold/time references match the read-only ECL source and unrestricted difficulty lines',{
  skip:!fs.existsSync(path.join(reference,'scripts/recovered/ecl/st03bs.ecl.txt')),
},()=>{
  const sources=new Map();
  for(const [stage,hash] of Object.entries(hashes)){
    const name=`scripts/recovered/ecl/st0${stage}bs.ecl.txt`,bytes=fs.readFileSync(path.join(reference,name));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);
    sources.set(name,bytes.toString('utf8').split(/\r?\n/));
  }
  for(const rows of Object.values(RUSH_BOSS_HEALTH_PROFILES))for(const {hp,source:s} of rows){
    const lines=sources.get(s.file),line=n=>lines[n-1].trim();
    assert.equal(line(s.healthLine),`ins_511(${s.initialHp});`);
    if(s.thresholdLine)assert.ok(line(s.thresholdLine).startsWith(`ins_514(0, ${s.thresholdHp}, `));
    const spell=s.phase.startsWith('BossCard');
    assert.ok(line(s.timeLine).startsWith(`ins_514(0, ${spell?0:s.thresholdHp}, ${s.timeFrames}, `));
    assert.equal(hp,spell?(s.thresholdHp||s.initialHp):s.initialHp-s.thresholdHp);
    for(const n of [s.healthLine,s.thresholdLine,s.timeLine].filter(Boolean)){
      assert.ok(!line(n-1).startsWith('!'),`${s.file}:${n} must not be restricted to a difficulty`);
    }
  }
});
