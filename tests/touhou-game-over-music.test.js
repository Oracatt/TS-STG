import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TouhouGameOver} from '../packages/thlib/dist/touhou/game-over.js';
import {TouhouMusic} from '../packages/thlib/dist/touhou/music.js';
import {TouhouPlayer} from '../packages/thlib/dist/touhou/player.js';
import {AnmBank} from '../packages/thlib/dist/touhou/anm.js';
import {Keys} from '../packages/thlib/dist/input.js';

const read=file=>JSON.parse(fs.readFileSync(new URL(`../packages/thlib/assets/touhou-common/${file}.json`,import.meta.url)));
function fixture(){
  let next=0;const calls=[],streams=new Map();
  const host={
    loadMusic(path){const id=++next;streams.set(id,{path,time:0,playing:false,paused:false});calls.push(['load',id,path]);return id;},
    playMusic(id,volume){Object.assign(streams.get(id),{playing:true,paused:false,volume});calls.push(['play',id]);},
    stopMusic(id){Object.assign(streams.get(id),{time:0,playing:false,paused:false});calls.push(['stop',id]);},
    seekMusic(id,time){streams.get(id).time=time;calls.push(['seek',id,time]);},
    getMusicTime:id=>streams.get(id).time,
    pauseMusic(id){streams.get(id).paused=true;},resumeMusic(id){streams.get(id).paused=false;},
    setMusicVolume(id,volume){streams.get(id).volume=volume;},
  };
  const music=new TouhouMusic(host,{stage:{file:'stage.wav'},'game-over':{file:'score.wav'},custom:{file:'custom.wav'},title:{file:'title.wav'}});
  music.play('stage');const stage=music.current;streams.get(stage).time=42.25;calls.length=0;
  const player=new TouhouPlayer({sht:read('shots/pl00'),lives:-1,bombs:0,power:0});
  const bank=new AnmBank(read('anm/front'),{loadTexture:()=>1});
  return{music,streams,calls,stage,player,bank,
    open:options=>new TouhouGameOver({bank,player,musicPlayer:music,onExit(){},onRestart(){},...options})};
}
const advance=(menu,count)=>{for(let i=0;i<count;i++)menu.update();};
const choose=(menu,index)=>{advance(menu,11);menu.select(index);menu.update(Keys.CONFIRM);advance(menu,12);};

test('failure automatically starts the score cue and Continue restores the interrupted stage before callbacks',()=>{
  const {open,music,stage,streams,player}=fixture();const events=[];
  const menu=open({onOpen:data=>{events.push(['open',music.key,data]);},onContinue:data=>{
    events.push(['continue',music.key]);assert.equal(data.player,player);assert.equal(player.lives,2);
    assert.equal(streams.get(stage).time,42.25);assert.equal(streams.get(stage).playing,true);
  }});
  assert.equal(music.key,'game-over');const score=music.current;assert.equal(streams.get(score).time,0);
  assert.equal(streams.get(stage).playing,false);
  assert.deepEqual(events,[['open','game-over',{music:'game-over',pauseMusic:true,savedInput:1,clockScale:1}]]);
  streams.get(score).time=8;choose(menu,0);
  assert.equal(menu.active,false);assert.equal(music.current,stage);assert.equal(streams.get(score).playing,false);
  assert.deepEqual(events.at(-1),['continue','stage']);assert.equal(menu.session.continues,1);
  menu.destroy();assert.equal(music.current,stage,'destroying the finished menu must not stop resumed stage music');
});

test('Exit, Retry and destroying an unfinished result discard the score cue and frozen stage fade',()=>{
  for(const action of ['exit','retry','destroy']){
    const {open,music,stage,streams}=fixture();const fade=music.fadeOut();music.update();
    let callback=null;
    const menu=open({onExit(){callback='exit';assert.equal(music.current,null);},onRestart(){callback='retry';assert.equal(music.current,null);}});
    const score=music.current;
    if(action==='destroy')menu.destroy();else choose(menu,action==='exit'?1:5);
    assert.equal(callback,action==='destroy'?null:action);assert.equal(music.current,null,action);
    assert.equal(streams.get(stage).playing,false,action);assert.equal(streams.get(score).playing,false,action);
    assert.equal(fade.alive,false,action);menu.destroy();assert.equal(music.current,null,action);
  }
});

test('clear results, spell practice and the immediate restart entrance leave current music untouched',()=>{
  for(const options of [{completed:true},{session:{mode:2}},{restart:true}]){
    const {open,music,stage,streams,calls}=fixture();let opened;
    const menu=open({...options,onOpen:data=>{opened=data;}});
    assert.equal(music.current,stage);assert.equal(streams.get(stage).time,42.25);assert.deepEqual(calls,[]);
    if(options.restart)assert.equal(opened,undefined);
    else assert.deepEqual(opened,{music:null,pauseMusic:false,savedInput:1,clockScale:1});
    menu.destroy();assert.equal(music.current,stage);assert.deepEqual(calls,[]);
  }
});

test('stage-practice failure still switches the score cue without offering Continue',()=>{
  const {open,music}=fixture();const menu=open({session:{mode:1}});
  assert.equal(music.key,'game-over');advance(menu,11);assert.ok(menu.excluded.has(0));
  menu.destroy();assert.equal(music.current,null);
});

test('applications can select a custom failure track or disable automatic switching',()=>{
  const custom=fixture();let opened;
  const menu=custom.open({music:'custom',onOpen:data=>{opened=data;}});
  assert.equal(custom.music.key,'custom');assert.equal(opened.music,'custom');choose(menu,0);
  assert.equal(custom.music.current,custom.stage);assert.equal(custom.streams.get(custom.stage).time,42.25);
  const disabled=fixture(),silent=disabled.open({music:null});
  assert.equal(disabled.music.current,disabled.stage);assert.deepEqual(disabled.calls,[]);choose(silent,0);
  assert.equal(disabled.music.current,disabled.stage);assert.deepEqual(disabled.calls,[]);
});

test('legacy onOpen adapters remain usable without a music owner and onContinue keeps its ordering',()=>{
  const {open,music}=fixture();const events=[];
  const menu=open({musicPlayer:null,onOpen:data=>events.push(['open',data.music]),onContinue:()=>events.push(['continue'])});
  assert.equal(music.key,'stage');choose(menu,0);assert.deepEqual(events,[['open','game-over'],['continue']]);
  const next=open({onContinue:()=>{assert.equal(music.key,'stage');music.play('title');}});choose(next,0);
  next.destroy();assert.equal(music.key,'title','post-continue application music must survive result cleanup');
});

test('a newer scene track invalidates the result restoration and survives stale menu cleanup',()=>{
  for(const finish of ['continue','destroy']){
    const {open,music,streams}=fixture();const menu=open();music.play('title');
    const title=music.current;streams.get(title).time=3;
    if(finish==='continue')choose(menu,0);else menu.destroy();
    assert.equal(music.current,title);assert.equal(streams.get(title).time,3);assert.equal(streams.get(title).playing,true);
  }
});
