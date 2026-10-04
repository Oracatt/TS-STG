import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createTouhouResources,TouhouSpell,SaveStore} from '@ts-stg/thlib';
import {RushPortraitApplication,RUSH_PORTRAIT_SPELLS} from '../games/rushboss/src/portrait-application.js';

function fixture(options={}){
  let handle=0;const paths=new Map(),played=[];
  const host={readText:p=>fs.readFileSync(p,'utf8'),loadTexture:()=>++handle,createTexture:()=>++handle,
    createRenderTarget:()=>++handle,unloadTexture(){},stopSound(){},unloadSound(){},
    loadSound(path){assert.equal(fs.readFileSync(path).toString('ascii',0,4),'RIFF');paths.set(++handle,path);return handle;},
    playSound(id){played.push(paths.get(id).split('/').at(-1));}};
  const resources=createTouhouResources(host);
  const graphics={options:{},clearBattle(){},draw(draw){draw.clear();},snapshot:()=>({test:true})};
  const app=new RushPortraitApplication(host,{resources,graphics,store:new SaveStore(),startBoss:'sunny',phaseIndex:1,
    mode:'stage',invincible:true,skipDialogue:true,...options});
  return {resources,app,played,close(){app.destroy();resources.dispose();}};
}

test('public spell timeout flushes the original failure sound from the portable pack',()=>{
  const f=fixture(),sound=(id,x)=>f.resources.audio.request(id,x);
  const spell=new TouhouSpell({context:{sound},player:{x:0,y:400}});
  spell.begin({duration:600});spell.age.set(600);spell.timeout();
  f.resources.audio.flush();assert.ok(f.played.includes('se_fault.wav'));
  assert.equal(spell.result.timeout,true);assert.equal(spell.result.captured,false);f.close();
});

test('all sixteen real portrait practice openings flush the unchanged original spell sound exactly once',()=>{
  const f=fixture({mode:'spell'});f.resources.audio.flush();
  try{
    const definition=f.resources.audioManifest.definitions.find(row=>row.id===33);
    const file=f.resources.audioManifest.files[definition.fileIndex];
    assert.equal(file.name,'se_cat00.wav');assert.equal(definition.volume,-900);
    assert.equal(createHash('sha256').update(fs.readFileSync(file.path)).digest('hex'),file.sha256);
    for(const card of RUSH_PORTRAIT_SPELLS){
      f.played.length=0;f.app.start({mode:'spell',bossIndex:card.bossIndex,phaseIndex:card.phaseIndex});
      assert.equal(f.resources.audio.queue.find(item=>item.id===33)?.pans.length,1,card.key);
      f.app.update();assert.equal(f.played.filter(name=>name==='se_cat00.wav').length,1,card.key);
      for(let frame=0;frame<10;frame++)f.app.update();
      assert.equal(f.played.filter(name=>name==='se_cat00.wav').length,1,`${card.key} must not retrigger per frame`);
    }
  }finally{f.close();}
});

test('nonspells stay silent and the source 160-frame wrapper emits the spell opening only when the card activates',()=>{
  const f=fixture({mode:'stage',phaseIndex:0});
  try{
    f.app.update();assert.ok(!f.played.includes('se_cat00.wav'));
    f.app.battle.endPhase('defeated');f.app.update();
    assert.equal(f.played.filter(name=>name==='se_cat00.wav').length,1,'paired spell starts in the nonspell defeat frame');
    f.app.start({mode:'stage',bossIndex:0,phaseIndex:5});f.resources.audio.flush();f.played.length=0;
    f.app.battle.endPhase('defeated');f.resources.audio.flush();
    assert.equal(f.app.battle.phase.number,7);assert.equal(f.app.battle.phaseEntry.clock.frame,0);
    for(let frame=0;frame<159;frame++)f.app.update();
    assert.ok(!f.played.includes('se_cat00.wav'));f.app.update();
    assert.equal(f.played.filter(name=>name==='se_cat00.wav').length,1);
  }finally{f.close();}
});

test('capture, failed defeat and survival timeout keep their original distinct sound events',()=>{
  const f=fixture();f.resources.audio.flush();
  for(const kind of ['capture','failed-defeat','survival-timeout']){
    const spell=new TouhouSpell({context:{sound:(id,x)=>f.resources.audio.request(id,x)},player:{x:0,y:400}});
    spell.begin({duration:600,survival:kind==='survival-timeout'});f.resources.audio.flush();f.played.length=0;
    spell.age.set(600);if(kind==='failed-defeat')spell.notifyPlayerMiss();
    if(kind==='survival-timeout')spell.timeout();else spell.finish();
    f.resources.audio.flush();
    assert.deepEqual(f.played,kind==='failed-defeat'?[]:['se_cardget.wav'],kind);
    assert.equal(spell.result.captured,kind!=='failed-defeat',kind);
  }
  f.close();
});

test('real application audio flush survives spell timeout and advances to the next phase',()=>{
  const f=fixture(),battle=f.app.battle,phase=battle.phase;
  battle.phaseFrame=Math.round(phase.time*60)-1;battle.playerAdapter.spell.age.set(battle.phaseFrame);
  f.app.update();assert.equal(battle.results[0].reason,'timeout');assert.equal(battle.results[0].captured,false);
  assert.equal(f.played.filter(name=>name==='se_fault.wav').length,1);
  for(let i=0;i<65;i++)f.app.update();
  assert.equal(battle.phaseIndex,2);assert.equal(battle.boss.alive,true);assert.equal(battle.finished,false);f.close();
});

test('all sixteen practice cards complete timeout/death-delay with sound enabled, including survival capture',()=>{
  const f=fixture({mode:'spell'});
  for(const card of RUSH_PORTRAIT_SPELLS){
    f.app.start({mode:'spell',bossIndex:card.bossIndex,phaseIndex:card.phaseIndex});
    const battle=f.app.battle,phase=battle.phase;f.played.length=0;
    battle.phaseFrame=Math.round(phase.time*60)-1;battle.playerAdapter.spell.age.set(battle.phaseFrame);
    // Ending feedback remains live before the result screen freezes the scene.
    for(let i=0;i<(phase.deathDelay??60)+210;i++)f.app.update();
    assert.equal(battle.results.length,1,card.key);assert.equal(battle.results[0].reason,'timeout',card.key);
    assert.equal(battle.results[0].captured,!!phase.survival,card.key);
    assert.equal(f.played.filter(name=>name==='se_fault.wav').length,phase.survival?0:1,card.key);
    if(phase.survival)assert.ok(f.played.includes('se_cardget.wav'),card.key);
    assert.equal(f.app.application.game.state,'result',card.key);
  }
  f.close();
});
