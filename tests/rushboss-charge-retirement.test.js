import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTouhouResources} from '@ts-stg/thlib/touhou';
import {RushBattle} from '../games/rushboss/src/runtime.js';
import {BOSSES} from '../games/rushboss/src/catalog.js';

const tick=(battle,frames)=>{for(let frame=0;frame<frames;frame++)battle.update();};
function fixture(spellIndex=1){
  let handle=0;
  const sounds=[],resources=createTouhouResources({readText:file=>readFileSync(file,'utf8'),
    loadTexture:()=>++handle,createTexture:()=>++handle,unloadTexture(){}});
  const battle=new RushBattle(BOSSES[0].phases,{boss:'sunny',profile:'portrait',spellIndex,
    resources,assets:{playSound:key=>sounds.push(key)},invincible:true});
  return{battle,sounds,dispose(){battle.dispose();resources.dispose();}};
}

for(const reason of ['defeated','timeout'])test(`a ${reason} spell retires its old charge and waits for the next nonspell's retained attack charge`,()=>{
  const f=fixture(),b=f.battle;
  try{
    tick(b,5);
    const old=b.presentation.charges[0],particles=old.display.roots.flatMap(vm=>vm.children);
    assert.equal(old.display.released,false);assert.ok(particles.some(vm=>vm.alive));
    b.endPhase(reason);
    assert.equal(b.phaseIndex,2);assert.equal(old.effect.alive,false);assert.equal(old.display.stopped,true);
    assert.ok(particles.some(vm=>vm.alive),'phase termination leaves already spawned ANMs alive');
    assert.equal(b.phaseCharges.length,0,'handoff no longer creates a blue charge');f.sounds.length=0;
    b.update();assert.ok(particles.some(vm=>vm.alive),'existing particles continue their normal animation');
    tick(b,79);
    assert.equal(old.display.released,false,'the old spell must not emit its pending release in the following phase');
    assert.ok(!f.sounds.includes('se_enep02'),'a canceled charge must not play its release sound');
    tick(b,39);assert.equal(b.phaseFrame,119);assert.equal(b.phaseCharges.length,0);
    b.update();const next=b.phaseCharges[0];
    assert.equal(b.phaseFrame,120);assert.deepEqual(next.roots.map(vm=>vm.scriptId),[72]);
    assert.equal(next.stopped,false);assert.equal(next.released,false);
    tick(b,59);assert.equal(next.released,false);
    b.update();assert.equal(b.phaseFrame,180);assert.equal(next.released,true,'the attack charge retains its frame180 release');
    assert.ok(next.roots.some(vm=>vm.scriptId===89));
    assert.equal(b.presentation.shared.charges.some(charge=>charge.color==='blue'||charge.releaseColor==='magenta'),false);
    tick(b,20);
    assert.equal(old.display.alive,false);assert.ok(particles.every(vm=>!vm.alive),'detached tails retire naturally');
  }finally{f.dispose();}
});

for(const reason of ['defeated','timeout'])test(`a final spell ${reason} stops attack charges before the 60-frame defeat wait`,()=>{
  const f=fixture(6),b=f.battle;
  try{
    tick(b,40);
    const old=b.presentation.charges[0],particles=old.display.roots.flatMap(vm=>vm.children);
    assert.equal(old.display.released,false);assert.ok(particles.some(vm=>vm.alive));
    b.endPhase(reason);f.sounds.length=0;
    assert.ok(b.dying);assert.equal(b.results.length,0,'settlement still waits for the original burst');
    assert.equal(old.effect.alive,false);assert.equal(old.display.stopped,true);
    assert.ok(particles.some(vm=>vm.alive));
    tick(b,59);
    assert.ok(b.dying);assert.equal(old.display.released,false);
    assert.ok(!f.sounds.includes('se_enep02'),'a final defeat cannot trigger a delayed attack-charge release');
    b.update();assert.equal(b.finished,true);assert.equal(b.results.length,1);
    assert.equal(old.display.released,false);
  }finally{f.dispose();}
});

test('phase handoff cancels unspawned charge repeats while keeping its first detached cohort',()=>{
  const f=fixture(),b=f.battle;
  try{
    b.effect('maple',b.boss,{storetimes:3,blast:true});
    const old=b.presentation.charges[0];tick(b,5);
    assert.equal(old.display.emitted,1);
    b.completePhase('defeated');assert.equal(old.display.stopped,true);
    const first=old.display.roots[0];assert.equal(first.alive,true);
    tick(b,140);
    assert.equal(old.display.emitted,1);assert.equal(old.display.released,false);assert.equal(first.alive,false);
  }finally{f.dispose();}
});
