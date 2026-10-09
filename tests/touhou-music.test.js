import test from 'node:test';
import assert from 'node:assert/strict';
import {TouhouMusic} from '../packages/thlib/dist/touhou/music.js';
import {touhouMusicVolume} from '../packages/thlib/dist/touhou/audio.js';

const gain=(volume,attenuation=0)=>10**(touhouMusicVolume(attenuation,volume*100)/2000);
function fixture(options){
  let next=0;const calls=[],streams=new Map();
  const tracks={stage:{file:'stage.wav',loopStart:.5,loopEnd:40},temporary:{file:'temporary.wav'},title:{file:'title.wav',loopEnd:60}};
  const host={
    loadMusic(path){const id=++next;streams.set(id,{path,time:0,playing:false,paused:false});calls.push(['load',id,path]);return id;},
    setMusicLoop:(...args)=>calls.push(['loop',...args]),
    playMusic(id,volume){Object.assign(streams.get(id),{playing:true,paused:false,volume});calls.push(['play',id,volume]);},
    stopMusic(id){Object.assign(streams.get(id),{time:0,playing:false,paused:false});calls.push(['stop',id]);},
    seekMusic(id,time){streams.get(id).time=time;calls.push(['seek',id,time]);},
    getMusicTime:id=>streams.get(id).time,
    pauseMusic(id){streams.get(id).paused=true;calls.push(['pause',id]);},
    resumeMusic(id){streams.get(id).paused=false;calls.push(['resume',id]);},
    setMusicVolume(id,volume){streams.get(id).volume=volume;calls.push(['volume',id,volume]);},
    unloadMusic:id=>calls.push(['unload',id]),
  };
  return{calls,streams,host,music:new TouhouMusic(host,tracks,options)};
}

test('portable music caches lazily, accepts second-based loops and rewinds explicit restarts',()=>{
  const {music,calls,streams}=fixture();assert.deepEqual(calls,[]);
  music.play('stage');const id=music.current;
  assert.deepEqual(calls,[['load',id,'stage.wav'],['loop',id,.5,40],['seek',id,0],['play',id,1]]);
  streams.get(id).time=17;calls.length=0;
  assert.equal(music.play('stage'),false);assert.deepEqual(calls,[]);assert.equal(streams.get(id).time,17);
  music.play('stage',{restart:true});assert.equal(streams.get(id).time,0);
  assert.deepEqual(calls,[['stop',id],['seek',id,0],['play',id,1]]);
  music.play('title');music.play('stage');assert.equal(music.handles.size,2);
  assert.deepEqual(calls.find(row=>row[0]==='loop'&&row[1]!==id),['loop',2,0,60]);
  const prefixed=fixture({basePath:'assets/',volume:.7});prefixed.music.play('temporary');
  assert.equal(prefixed.streams.get(prefixed.music.current).path,'assets/temporary.wav');
  assert.equal(prefixed.streams.get(prefixed.music.current).volume,gain(.7));
});

test('pause and volume preserve the cursor; fade freezes while paused and stops at completion',()=>{
  const {music,streams}=fixture();music.play('stage');const stream=streams.get(music.current);stream.time=12;
  const fade=music.fadeOut();for(let i=0;i<30;i++)music.update();
  music.pause();music.pause();music.setVolume(.4);for(let i=0;i<20;i++)music.update();
  assert.equal(fade.frame,30);assert.equal(stream.time,12);assert.equal(stream.volume,gain(.4,fade.attenuation));
  music.resume();music.resume();for(let i=0;i<90;i++)music.update();
  assert.equal(fade.alive,false);assert.equal(music.current,null);assert.equal(music.fade,null);assert.equal(stream.playing,false);
});

test('temporary music restores the exact cursor, paused state and frozen fade with the latest volume',()=>{
  const {music,streams}=fixture({volume:.7});music.play('stage');const id=music.current,stream=streams.get(id);
  const fade=music.fadeOut();for(let i=0;i<24;i++)music.update();stream.time=19.25;music.pause();
  const token=music.interrupt('temporary');const temporary=streams.get(music.current);
  assert.equal(music.paused,false);assert.equal(temporary.time,0);assert.equal(music.fade,null);assert.equal(fade.alive,true);
  for(let i=0;i<40;i++)music.update();assert.equal(fade.frame,24);
  music.setVolume(.3);token.restore();
  assert.equal(music.current,id);assert.equal(stream.time,19.25);assert.equal(stream.paused,true);
  assert.equal(music.fade,fade);assert.equal(fade.frame,24);assert.equal(stream.volume,gain(.3,fade.attenuation));
  assert.equal(temporary.playing,false);token.restore();token.discard();assert.equal(music.current,id);
  music.update();assert.equal(fade.frame,24);music.resume();music.update();assert.equal(fade.frame,25);
});

test('replacement interruption keeps one recovery point and invalidates the replaced token',()=>{
  const {music,streams}=fixture();music.play('stage');const id=music.current;streams.get(id).time=31;
  const first=music.interrupt('temporary');streams.get(music.current).time=5;
  const second=music.interrupt('title'),title=music.current;
  first.restore();first.discard();assert.equal(music.current,title);
  second.restore();assert.equal(music.current,id);assert.equal(streams.get(id).time,31);
});

test('an interruption of the same track restarts temporarily and restores its old cursor',()=>{
  const {music,streams}=fixture();music.play('stage');const id=music.current;streams.get(id).time=8;
  const token=music.interrupt('stage');assert.equal(streams.get(id).time,0);assert.equal(music.handles.size,1);
  token.restore();assert.equal(streams.get(id).time,8);
});

test('explicit transport decisions prevent stale tokens from reviving previous music',()=>{
  for(const action of ['other','same','restart','stop','dispose']){
    const {music,calls,streams}=fixture();music.play('stage');const fade=music.fadeOut();music.update();
    const token=music.interrupt('temporary');
    if(action==='other')music.play('title');
    else if(action==='same')assert.equal(music.play('temporary'),false);
    else if(action==='restart')music.play('temporary',{restart:true});
    else music[action]();
    assert.equal(fade.alive,false,action);const current=music.current;calls.length=0;
    if(current!==null)streams.get(current).time=6;
    token.restore();token.discard();assert.equal(music.current,current,action);assert.deepEqual(calls,[],action);
    if(current!==null)assert.equal(streams.get(current).time,6,action);
  }
});

test('discard stops temporary music and destroys the saved fade without restoring it',()=>{
  const {music,streams}=fixture();music.play('stage');const fade=music.fadeOut();
  const token=music.interrupt('temporary'),temporary=streams.get(music.current);token.discard();
  assert.equal(music.current,null);assert.equal(music.key,null);assert.equal(temporary.playing,false);assert.equal(fade.alive,false);
  token.restore();assert.equal(music.current,null);
});

test('unknown requests leave an active interruption intact; empty origins restore silence',()=>{
  const {music,calls}=fixture();const token=music.interrupt('temporary'),id=music.current;calls.length=0;
  for(const key of ['missing','toString']){
    assert.equal(music.play(key),false);assert.throws(()=>music.interrupt(key),/Unknown music track/);
  }
  assert.deepEqual(calls,[]);assert.equal(music.current,id);token.restore();assert.equal(music.current,null);
});

test('minimal adapters work and disposal releases each cached stream exactly once',()=>{
  const minimal=new TouhouMusic({loadMusic:()=>1},{track:{file:'track.wav'}});
  minimal.play('track');const token=minimal.interrupt('track');token.restore();minimal.dispose();
  assert.throws(()=>minimal.play('track'),/disposed/);assert.throws(()=>minimal.interrupt('track'),/disposed/);
  const {music,calls}=fixture();music.play('stage');music.play('temporary');music.dispose();music.dispose();
  assert.deepEqual(calls.filter(row=>row[0]==='unload'),[['unload',1],['unload',2]]);
  assert.equal(music.handles.size,0);
  for(const volume of [-1,1.1,NaN,Infinity])assert.throws(()=>fixture({volume}),RangeError);
});
