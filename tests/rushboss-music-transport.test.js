import test from 'node:test';
import assert from 'node:assert/strict';
import {RushMusic} from '../games/rushboss/src/music.js';

function fixture(){
  let next=0;const calls=[],streams=new Map();
  const tracks={stage:{file:'stage.wav',sampleRate:100,channels:2,loopBegin:100,loopEnd:400},
    title:{file:'title.wav',sampleRate:100,channels:2,loopBegin:0,loopEnd:800}};
  const host={
    loadMusic(path){const id=++next;streams.set(id,{path,time:0,playing:false,paused:false});calls.push(['load',id,path]);return id;},
    setMusicLoop:(...args)=>calls.push(['loop',...args]),
    playMusic(id,volume){Object.assign(streams.get(id),{playing:true,paused:false,volume});calls.push(['play',id,volume]);},
    stopMusic(id){Object.assign(streams.get(id),{time:0,playing:false,paused:false});calls.push(['stop',id]);},
    seekMusic(id,time){streams.get(id).time=time;calls.push(['seek',id,time]);},
    pauseMusic(id){streams.get(id).paused=true;calls.push(['pause',id]);},
    resumeMusic(id){streams.get(id).paused=false;calls.push(['resume',id]);},
    setMusicVolume(id,volume){streams.get(id).volume=volume;calls.push(['volume',id,volume]);},
    unloadMusic:id=>calls.push(['unload',id]),
  };
  return{calls,streams,music:new RushMusic(host,tracks)};
}

test('new runs explicitly rewind even the same cached track; continuous dialogue requests are idempotent',()=>{
  const {calls,streams,music}=fixture();music.play('stage',{restart:true});const id=music.current;
  assert.deepEqual(calls.slice(0,3),[['load',id,'games/rushboss/assets/stage.wav'],['loop',id,.5,2],['seek',id,0]]);
  assert.equal(streams.get(id).volume,10**(-450/2000));streams.get(id).time=37;calls.length=0;
  assert.equal(music.play('stage'),false);assert.equal(streams.get(id).time,37);assert.deepEqual(calls,[]);
  music.play('stage',{restart:true});assert.equal(streams.get(id).time,0);
  assert.deepEqual(calls,[['stop',id],['seek',id,0],['play',id,10**(-450/2000)]]);
  assert.equal(music.handles.size,1);music.dispose();
});

test('pause, settings and resume preserve the cursor while returning to a cached stage starts at zero',()=>{
  const {calls,streams,music}=fixture();music.play('stage');const id=music.current;streams.get(id).time=23;calls.length=0;
  music.pause();music.pause();music.setVolume(.5);music.resume();music.resume();
  assert.equal(streams.get(id).time,23);assert.equal(streams.get(id).paused,false);
  assert.deepEqual(calls,[['pause',id],['volume',id,10**(-1250/2000)],['resume',id]]);
  music.play('title');streams.get(id).time=99;calls.length=0;music.play('stage');
  assert.equal(streams.get(id).time,0);assert.equal(calls.filter(row=>row[0]==='load').length,0);
  assert.deepEqual(calls.slice(-3),[['stop',id],['seek',id,0],['play',id,10**(-1250/2000)]]);music.dispose();
});

test('public fade applies volume only, pauses its frame clock and cleans up on completion or a replacement track',()=>{
  const {calls,streams,music}=fixture();music.play('stage');const id=music.current;streams.get(id).time=8;
  const fade=music.fadeOut();calls.length=0;
  for(let i=0;i<60;i++)music.update();assert.equal(fade.frame,60);assert.equal(streams.get(id).volume,10**(-2725/2000));
  assert.ok(calls.every(row=>row[0]==='volume'));assert.equal(streams.get(id).time,8);
  music.pause();for(let i=0;i<120;i++)music.update();assert.equal(fade.frame,60);assert.equal(streams.get(id).time,8);
  music.resume();for(let i=0;i<60;i++)music.update();
  assert.equal(fade.alive,false);assert.equal(music.current,null);assert.equal(music.key,null);assert.equal(music.fade,null);
  music.play('stage');const aborted=music.fadeOut();music.update();music.play('title');
  assert.equal(aborted.alive,false);const next=music.current;calls.length=0;
  for(let i=0;i<180;i++)music.update();assert.deepEqual(calls,[]);assert.equal(streams.get(next).playing,true);music.dispose();
});
