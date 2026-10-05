import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Keys,SaveStore} from '@ts-stg/thlib';
import {TouhouGameOver,TouhouMusic} from '@ts-stg/thlib/touhou';
import {RushPortraitApplication} from '../games/rushboss/src/portrait-application.js';
import {RushMusic} from '../games/rushboss/src/music.js';

function fixture(options={}){
  let id=0;const streams=new Map(),calls=[];
  const host={
    readText:file=>fs.readFileSync(file,'utf8'),loadTexture:()=>++id,unloadTexture(){},
    createTexture:()=>++id,createRenderTarget:()=>++id,
    loadMusic:file=>{const handle=++id;streams.set(handle,{file,time:0,playing:false,paused:false});calls.push(['load',handle,file]);return handle;},
    setMusicLoop:(handle,begin,end)=>calls.push(['loop',handle,begin,end]),
    getMusicTime:handle=>streams.get(handle).time,
    seekMusic:(handle,time)=>{streams.get(handle).time=time;calls.push(['seek',handle,time]);},
    playMusic:(handle,volume)=>{Object.assign(streams.get(handle),{playing:true,paused:false,volume});calls.push(['play',handle,streams.get(handle).time]);},
    stopMusic:handle=>{Object.assign(streams.get(handle),{time:0,playing:false,paused:false});calls.push(['stop',handle]);},
    pauseMusic:handle=>{streams.get(handle).paused=true;calls.push(['pause',handle]);},
    resumeMusic:handle=>{streams.get(handle).paused=false;calls.push(['resume',handle]);},
    setMusicVolume:(handle,volume)=>{streams.get(handle).volume=volume;},
    unloadMusic:handle=>calls.push(['unload',handle]),
  };
  const app=new RushPortraitApplication(host,{store:new SaveStore(),startBoss:'sunny',skipDialogue:true,lives:0,...options});
  const music=app.graphics.musicPlayer;
  assert.ok(music instanceof RushMusic);assert.ok(music instanceof TouhouMusic);
  return{app,music,streams,calls,
    advanceAudio(seconds){for(const stream of streams.values())if(stream.playing&&!stream.paused)stream.time+=seconds;},
    close(){app.destroy();},
  };
}

function until(app,predicate,message,max=300){
  for(let frame=0;frame<max&&!predicate();frame++)app.update(0);
  assert.ok(predicate(),message);
}

function exhaustLastLife(f){
  const {app}=f,game=app.application.game,battle=app.battle,player=battle.sharedPlayer;
  until(app,()=>game.state==='combat'&&player.state===1,'player becomes active');
  player.lives=0;player.invulnerability.set(0);
  assert.equal(battle.miss(),true,'the shared player accepts the final-life hit');
  assert.notEqual(game.state,'gameover','the deathbomb/death timeline must run first');
  until(app,()=>game.state==='gameover','shared death lifecycle emits gameover');
  assert.equal(player.lives,-1);assert.ok(game.pauseVisual instanceof TouhouGameOver);
  return game.pauseVisual;
}

function choose(app,choice){
  const menu=app.application.game.pauseVisual;
  until(app,()=>menu.phase===6,'result selection becomes active',30);
  for(let i=0;i<6&&menu.selection!==choice;i++){app.update(Keys.DOWN);app.update(0);}
  assert.equal(menu.selection,choice);
  app.update(Keys.CONFIRM);
  until(app,()=>!menu.active,'confirmed result action finishes',30);
}

test('last-life death plays Player\'s Score from zero and Continue restores the current Boss track',()=>{
  const f=fixture();try{
    const {app,music,streams,calls}=f,stage=music.current,battle=app.battle;
    f.advanceAudio(17.25);const phase=battle.phaseIndex;
    exhaustLastLife(f);
    const result=music.current;
    assert.equal(music.key,'game-over');assert.equal(streams.get(result).file,"games/rushboss/assets/bgm/Player's Score.wav");
    assert.deepEqual(calls.findLast(call=>call[0]==='play'),['play',result,0]);
    assert.equal(streams.get(stage).playing,false);assert.equal(streams.get(result).paused,false);
    f.advanceAudio(3);app.update(0);assert.equal(streams.get(result).time,3,'result music continues beneath the menu');
    choose(app,0);
    assert.equal(app.battle,battle);assert.equal(battle.phaseIndex,phase);assert.equal(app.application.game.state,'combat');
    assert.equal(music.key,'grassland');assert.equal(music.current,stage);assert.equal(streams.get(stage).time,17.25);
    assert.equal(streams.get(result).playing,false);assert.equal(battle.sharedPlayer.lives,2);
    assert.equal(app.application.game.session.continues,1);

    f.advanceAudio(8.5);exhaustLastLife(f);
    assert.equal(music.current,result,'a second defeat reuses the result stream');
    assert.equal(streams.get(result).time,0,'cached Player\'s Score restarts from zero');
    assert.equal(calls.filter(call=>call[0]==='load'&&call[1]===result).length,1);
    choose(app,0);assert.equal(music.current,stage);assert.equal(streams.get(stage).time,25.75);
    assert.equal(app.application.game.session.continues,2);
  }finally{f.close();}
});

for(const [choice,target]of [[1,'title'],[5,'grassland']])test(`result ${choice===1?'return to title':'retry'} discards the interrupted track position`,()=>{
  const f=fixture();try{
    const {app,music,streams,calls}=f;f.advanceAudio(23.5);
    const overlay=exhaustLastLife(f),interruption=overlay.musicInterruption;
    const first=calls.length;choose(app,choice);
    assert.equal(music.key,target);assert.equal(streams.get(music.current).time,0);
    assert.ok(!calls.slice(first).some(call=>call[0]==='seek'&&call[2]===23.5),'leaving never transiently restarts the abandoned Boss song');
    const current=music.current;interruption.restore();
    assert.equal(music.current,current);assert.equal(streams.get(current).time,0,'obsolete result callbacks cannot restore old music');
    if(choice===1){
      app.start({mode:'normal',bossIndex:0,phaseIndex:0});
      assert.equal(music.key,'grassland');assert.equal(streams.get(music.current).time,0);
    }else assert.equal(app.application.game.session.continues,0);
  }finally{f.close();}
});

test('completed results keep the ongoing music without loading the failure track',()=>{
  const f=fixture();try{
    const {app,music,streams,calls}=f,stage=music.current;f.advanceAudio(12.75);
    app.application.game.openResult(true);
    assert.equal(app.application.game.state,'result');assert.equal(music.current,stage);
    assert.equal(streams.get(stage).playing,true);assert.equal(streams.get(stage).paused,false);
    f.advanceAudio(2);app.update(0);assert.equal(streams.get(stage).time,14.75);
    assert.ok(!calls.some(call=>call[0]==='load'&&call[2].endsWith("Player's Score.wav")));
  }finally{f.close();}
});

test('spell-practice final-life failure keeps its Boss music running through the retry menu',()=>{
  const f=fixture({mode:'spell',phaseIndex:1});try{
    const {app,music,streams,calls}=f,stage=music.current;f.advanceAudio(9.5);
    exhaustLastLife(f);
    assert.equal(app.application.game.session.mode,2);assert.equal(music.current,stage);
    assert.equal(streams.get(stage).playing,true);assert.equal(streams.get(stage).paused,false);
    f.advanceAudio(1.5);app.update(0);assert.equal(streams.get(stage).time,11);
    assert.ok(!calls.some(call=>call[0]==='load'&&call[2].endsWith("Player's Score.wav")));
    choose(app,5);assert.equal(music.key,'grassland');assert.equal(streams.get(music.current).time,0);
  }finally{f.close();}
});
