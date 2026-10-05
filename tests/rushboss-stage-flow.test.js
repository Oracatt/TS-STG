import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Keys,SaveStore,createTouhouResources} from '@ts-stg/thlib';
import {RushPortraitApplication} from '../games/rushboss/src/portrait-application.js';

const tick=(owner,count,mask=0)=>{for(let i=0;i<count;i++)owner.update(mask);};
function fixture(options={}){
  let id=0;const host={readText:p=>fs.readFileSync(p,'utf8'),loadTexture:()=>++id,createTexture:()=>++id,
    createRenderTarget:()=>++id,unloadTexture(){},encodeText:text=>new Uint8Array(text.length*2),
    hasSystemFont:()=>false,updateTextureRegion(){},rasterizeBitmapText:(_text,o)=>({width:o.width,height:o.height,pixels:new Uint8Array(o.width*o.height*4)})};
  const resources=createTouhouResources(host),events=[];
  const graphics={clearBattle(){},advanceStageBackground(){events.push('background');},
    draw(draw){draw.clear();},snapshot:()=>({fixture:true}),
    playMusic:(key,opts)=>events.push(['music',key,!!opts?.restart]),fadeMusic:seconds=>events.push(['fade',seconds]),
    updateMusic(){},setMusicVolume:volume=>events.push(['volume',volume])};
  const app=new RushPortraitApplication(host,{resources,graphics,store:new SaveStore(),startBoss:'sunny',
    skipDialogue:true,invincible:true,...options});
  return{app,events,close(){app.destroy();resources.dispose();}};
}

test('stage clear preserves movement but gates shots, then covers only before resetting and revealing the next stage',()=>{
  const f=fixture(),{app}=f,s=app.application.game,b=app.battle,p=b.sharedPlayer;
  try{
    p.setPosition(60,400);p.lives=1;p.bombs=2;p.setPower(234);p.lifeFragments=2;p.bombFragments=1;b.score=123450;
    p.pointValue=54320;p.pointItems=19;p.extendCount=4;
    b.finished=true;app.update(Keys.SHOOT);assert.equal(s.state,'stageClear');
    const shotId=p.nextShotId;tick(app,120,Keys.SHOOT|Keys.LEFT);
    assert.ok(p.x<60);assert.equal(p.nextShotId,shotId);assert.equal(s.stageClear.phase,'display','inherited held fire is not a new confirm');
    app.update();app.update(Keys.CONFIRM);assert.equal(s.stageClear.phase,'exit');assert.deepEqual(f.events.at(-1),['fade',2]);
    tick(app,9);assert.equal(s.bossIndex,0);assert.equal(s.stageTransition,null);
    app.update();assert.equal(s.state,'stageTransition');assert.equal(s.stageTransition.age,0);
    const x=p.x,playerFrame=p.frame,battleFrame=b.frame,coverShotId=p.nextShotId;
    tick(app,29,Keys.RIGHT|Keys.SHOOT);assert.equal(s.bossIndex,0);assert.ok(p.x>x);
    assert.equal(p.frame,playerFrame+29);assert.equal(p.nextShotId,coverShotId);
    assert.equal(b.frame,battleFrame);assert.equal(s.stageTransition.alpha,246);
    const beforeHandoffX=p.x;
    app.update(Keys.RIGHT|Keys.SHOOT);assert.equal(s.bossIndex,1);assert.equal(s.stageTransition.phase,'reveal');assert.equal(s.stageTransition.alpha,255);
    assert.ok(p.x>beforeHandoffX);assert.equal(p.frame,playerFrame+30);assert.equal(p.nextShotId,coverShotId);
    assert.equal(b.frame,battleFrame,'cover never advances old Boss or enemy bullet simulation');
    const next=app.battle.sharedPlayer;assert.notEqual(next,p);assert.equal(next.x,p.x);assert.equal(next.y,p.y);
    for(const option of next.options.filter(value=>value.active)){
      assert.equal(option.fixedX,next.fixedX+Math.trunc(option.normalOffset.x*128));
      assert.equal(option.animation.x,option.x,'new option appears at the carried position before its first update');
    }
    assert.deepEqual([next.lives,next.bombs,next.power,next.lifeFragments,next.bombFragments],[1,2,234,2,1]);
    assert.deepEqual([next.pointValue,next.pointItems,next.extendCount],[54320,19,4]);
    assert.equal(app.battle.score,123450);assert.equal(app.battle.frame,0);assert.equal(next.shots.length,0);
    tick(app,30);assert.equal(s.stageTransition,null);assert.equal(s.state,'combat');
    assert.equal(app.battle.frame,30);assert.equal(s.completedBattles.length,1);
    assert.equal(f.events.filter(e=>e==='background').length,30);
  }finally{f.close();}
});

test('real dialogue tail starts stage clear at exit1, retains portraits through exit30 and completes at31',()=>{
  const f=fixture(),{app}=f,s=app.application.game;
  try{
    s.settings={...s.settings,skipDialogue:false};app.battle.finished=true;app.battle.boss.alive=false;s.openDialogue('after');
    const d=s.dialogue;tick(app,45);assert.ok(d.box);d.finish();
    assert.equal(d.complete,false);assert.equal(d.exitState.frame,0);assert.equal(s.stageClear,null);
    app.update();assert.equal(s.state,'stageClear');assert.equal(s.stageClear.age,0);assert.equal(d.exitState.frame,1);
    tick(app,29);assert.equal(d.complete,false);assert.equal(d.exitState.frame,30);
    app.update();assert.equal(d.complete,true);assert.equal(s.stageClear.age,30);assert.equal(s.completedBattles.length,1);
    assert.equal(s.bossIndex,0,'the next stage waits for the source clear gate, not just dialogue disposal');
  }finally{f.close();}
});

test('pausing freezes stage-clear/cover clocks and disposal never starts the next stage',()=>{
  const f=fixture(),{app}=f,s=app.application.game;
  try{
    app.battle.finished=true;app.update();tick(app,5);
    app.update(Keys.PAUSE);const age=s.stageClear.age;tick(app,20);assert.equal(s.stageClear.age,age);
    app.update(Keys.PAUSE);tick(app,12);assert.equal(s.paused,false);
    s.stageClear.dismiss();tick(app,10);const transition=s.stageTransition;
    assert.equal(transition.frame,0);app.update(Keys.PAUSE);tick(app,20);assert.equal(transition.frame,0);
    app.destroy();assert.equal(transition.alive,false);assert.equal(s.bossIndex,0);
  }finally{f.close();}
});

test('stage replay stores effective timing and rejects the preceding deterministic revision',()=>{
  const f=fixture({stageClearTiming:{minFrames:20,autoFrames:40,exitFrames:10},stageTransitionTiming:{coverFrames:30,revealFrames:30}});
  try{
    tick(f.app,10);const replay=f.app.exportReplay();assert.equal(replay.config.revision,13);
    assert.deepEqual(replay.config.settings.stageClearTiming,{minFrames:20,autoFrames:40,exitFrames:10});
    assert.deepEqual(replay.config.settings.stageTransitionTiming,{coverFrames:30,revealFrames:30});
    const old=structuredClone(replay);old.config.revision=12;assert.throws(()=>f.app.playReplay(old),/different game revision/);
  }finally{f.close();}
});
