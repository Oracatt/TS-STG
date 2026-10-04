import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createTouhouResources,SaveStore,invalidTouhouSpellTime} from '@ts-stg/thlib';
import {RushPortraitApplication} from '../games/rushboss/src/portrait-application.js';
import {RushBattle} from '../games/rushboss/src/runtime.js';

const tick=(app,count)=>{for(let i=0;i<count;i++)app.update();};
function fixture(options={}){
  let id=0;const paths=new Map(),played=[],notices=[];
  const host={readText:path=>fs.readFileSync(path,'utf8'),loadTexture:()=>++id,createTexture:()=>++id,
    createRenderTarget:()=>++id,unloadTexture(){},stopSound(){},unloadSound(){},
    loadSound(path){assert.equal(fs.readFileSync(path).toString('ascii',0,4),'RIFF');paths.set(++id,path);return id;},
    playSound(handle){played.push(paths.get(handle).split('/').at(-1));}};
  const resources=createTouhouResources(host);
  const graphics={options:{},clearBattle(){},draw(draw,battle,{hud}){draw.clear();hud.draw(draw,battle.sharedPlayer);},snapshot:()=>({test:true})};
  const app=new RushPortraitApplication(host,{resources,graphics,store:new SaveStore(),startBoss:'sunny',phaseIndex:1,
    mode:'stage',invincible:true,skipDialogue:true,...options});
  const session=app.application.game,notice=session.hud.notice.bind(session.hud);
  session.hud.notice=(type,value,detail)=>{notices.push({type,value});return notice(type,value,detail);};
  return{app,session,played,notices,close(){app.destroy();resources.dispose();}};
}

test('Rush capture and failed defeat reach the common HUD once, without duplicating score or sounds',()=>{
  for(const failed of [false,true]){
    const f=fixture();tick(f.app,120);const b=f.app.battle;
    f.played.length=0;
    if(failed){b.invincible=false;b.sharedPlayer.invulnerability.set(0);assert.equal(b.miss(),true);}
    assert.equal(f.session.hud.activeNotice,false,'Loss of capture eligibility alone does not finish the card');
    const score=b.score,bonus=failed?0:b.spellBonus;
    b.boss.invulnerable=false;b.damage(100000000);f.app.update();
    assert.deepEqual(f.notices,[{type:failed?1:0,value:bonus}]);
    assert.equal(b.score,score+bonus);assert.equal(b.results.length,1);
    assert.equal(f.session.hud.activeNotice,true);assert.equal(f.session.paused,false);
    assert.equal(b.presentation.shared.hasDeathEffects,false,'A nonfinal spell is not Boss death');
    assert.equal(f.played.filter(name=>name==='se_cardget.wav').length,failed?0:1);
    assert.equal(f.played.includes('se_fault.wav'),false,'Original fault sound belongs to timeout only');
    f.app.render();f.close();
  }
});

test('Rush life pickup and third life fragment use public Extend feedback, including full-stock pickup',()=>{
  for(const kind of ['life','fragment','full-stock']){
    const f=fixture();tick(f.app,5);const b=f.app.battle,p=b.sharedPlayer,items=b.playerAdapter.items;
    p.lives=kind==='full-stock'?7:2;p.lifeFragments=kind==='fragment'?2:0;
    f.played.length=0;
    const item=items.spawn({type:kind==='fragment'?4:5,x:p.x,y:p.y,speed:0});
    f.app.update();
    assert.equal(item.state,0);assert.equal(p.lives,kind==='full-stock'?7:3);assert.equal(p.lifeFragments,0);
    assert.deepEqual(f.notices,[{type:4,value:0}]);assert.equal(f.session.hud.activeNotice,true);
    assert.equal(f.played.filter(name=>name==='se_extend.wav').length,1);
    tick(f.app,120);assert.equal(f.session.hud.activeNotice,false);f.close();
  }
});

test('Boss death and spell feedback continue before practice results freeze the scene',()=>{
  const f=fixture({phaseIndex:6,mode:'spell'}),b=f.app.battle;
  tick(f.app,120);b.boss.invulnerable=false;b.damage(100000000);
  assert.ok(b.dying);assert.equal(b.presentation.shared.hasDeathEffects,false);
  tick(f.app,b.phase.deathDelay);assert.equal(b.finished,true);
  assert.equal(f.session.state,'ending');assert.equal(f.session.paused,false);
  assert.equal(b.presentation.shared.hasDeathEffects,true);assert.equal(f.session.hud.activeNotice,true);
  assert.deepEqual(b.presentation.shared.deaths[0].roots.map(vm=>vm.scriptId),[25,57]);
  tick(f.app,30);assert.equal(f.session.paused,false);f.app.render();
  tick(f.app,180);assert.equal(b.presentation.shared.hasDeathEffects,false);assert.equal(f.session.hud.activeNotice,false);
  assert.equal(f.session.state,'result');assert.equal(f.session.paused,true);
  f.close();
});

test('injected application clock reaches the actual notice and records the source encoded time',()=>{
  let seconds=100;
  const f=fixture({clock:()=>seconds});
  for(let i=0;i<120;i++){seconds+=1/60;f.app.update();}
  f.app.battle.completePhase('defeated');seconds+=1/60;f.app.update();f.app.update();
  const spell=f.app.battle.presentation.shared.spell,time=f.session.hud.snapshot().time;
  assert.equal(invalidTouhouSpellTime(spell.encodedTime),false);
  assert.equal(time.encodedTime,spell.encodedTime);assert.equal(spell.captureIndex,1);
  assert.equal(f.app.recorder.config.spellTimes['0:0'],spell.encodedTime);
  f.close();
});

test('clock-enabled spell timeout and ending replay from recorded times, independent of playback wall time',()=>{
  let seconds=100;
  const f=fixture({clock:()=>seconds,mode:'spell',
    createBattle:(phases,config)=>new RushBattle(phases.map(phase=>({...phase,time:2.2,update(){}})),config)});
  for(let guard=0;guard<500&&!f.app.recordingComplete;guard++){seconds+=.025;f.app.update();}
  assert.equal(f.app.recordingComplete,true);
  const expected=f.session.snapshot(),data=f.app.exportReplay();
  assert.equal(data.config.spellClock,true);assert.equal(invalidTouhouSpellTime(data.config.spellTimes['0:0']),false);
  f.app.playReplay(data);seconds=99999;
  for(let i=0;i<data.frames;i++){seconds+=3;f.app.update();}
  assert.equal(f.app.playback.desync,null);assert.equal(f.app.playback.finished,true);
  assert.deepEqual(f.app.application.game.snapshot(),expected);
  f.close();
});
