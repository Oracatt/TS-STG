import test from 'node:test';
import assert from 'node:assert/strict';
import {AssetLoader} from '../packages/thlib/dist/asset-loader.js';
import {TouhouApplication} from '../packages/thlib/dist/touhou/application.js';
import {TouhouAudio} from '../packages/thlib/dist/touhou/audio.js';

function fixture(delay=3){
  let next=1,polls=0;const pending=new Map(),freed=[],voices=new Map();
  const native={loadResourceAsync(kind,path){const id=next++;pending.set(id,{kind,path,delay});return id;},
    pollResourceLoad(id){polls++;const p=pending.get(id);assert.ok(p);if(p.delay-->0)return{state:'pending'};
      pending.delete(id);return p.path==='missing'?{state:'error',error:'missing file'}:{state:'ready',handle:id};},
    cancelResourceLoad(id){assert.ok(pending.delete(id));},
    loadTexture(){return next++;},unloadTexture:id=>freed.push(id),unloadModel:id=>freed.push(id),
    cloneSound:source=>{const id=next++;voices.set(id,{source,playing:false});return id;},
    playSound:id=>{voices.get(id).playing=true;},stopSound:id=>{voices.get(id).playing=false;},
    unloadSound:id=>{freed.push(id);voices.delete(id);},unloadMusic:id=>freed.push(id)};
  return{loader:new AssetLoader(native),pending,freed,voices,get polls(){return polls;}};
}
const texture={kind:'texture',path:'stage.png'};

test('cached sound definitions share samples while keeping independent playback and lifetimes',()=>{
  const f=fixture(0),asset={kind:'sound',path:'shared.wav'},batch=f.loader.preload([asset,asset]);
  batch.update();assert.equal(batch.total,1);assert.equal(batch.done,true);
  const host=f.loader.host,audio=new TouhouAudio({files:[{path:asset.path}],definitions:[
    {id:21,fileIndex:0,volume:-2400,playFlags:0},{id:27,fileIndex:0,volume:-1100,playFlags:0},
  ]},{load:path=>host.loadSound(path),play:id=>host.playSound(id),stop:id=>host.stopSound(id)});
  audio.request(27);audio.flush();const explosion=audio.handles.get(27),source=f.voices.get(explosion).source;
  audio.request(21);audio.flush();const emission=audio.handles.get(21);
  assert.notEqual(explosion,emission);assert.equal(f.voices.get(emission).source,source);
  audio.stop(21);audio.flush();assert.equal(f.voices.get(explosion).playing,true);assert.equal(f.voices.get(emission).playing,false);
  assert.equal(f.loader.synchronousMisses,0,'voice creation never reads/decodes the WAV again');
  f.loader.retainOnly([]);assert.deepEqual(f.freed,[],'active voices keep their samples resident');
  host.unloadSound(emission);f.loader.retainOnly([]);assert.deepEqual(f.freed,[emission]);
  host.unloadSound(explosion);f.loader.retainOnly([]);assert.deepEqual(f.freed,[emission,explosion,source]);
  f.loader.dispose();assert.equal(f.freed.length,3);
});

test('loader disposal releases outstanding sound voices before the shared sample owner',()=>{
  const f=fixture(0),batch=f.loader.preload([{kind:'sound',path:'shared.wav'}]);batch.update();
  const a=f.loader.host.loadSound('shared.wav'),b=f.loader.host.loadSound('shared.wav'),source=f.voices.get(a).source;
  f.loader.dispose();assert.deepEqual(f.freed,[a,b,source]);f.loader.dispose();assert.equal(f.freed.length,3);
});
test('decode delay never blocks a presentation tick; duplicate requests and ownership are shared',()=>{
  const f=fixture(),batch=f.loader.preload([texture,texture,{kind:'model',path:'road.glb'}]);
  assert.equal(batch.total,2);
  while(!batch.done){const p=f.polls;batch.update();assert.ok(f.polls-p<=1);assert.ok(f.pending.size<=2);}
  assert.equal(batch.error,null);
  const a=f.loader.host.loadTexture('stage.png'),b=f.loader.host.loadTexture('stage.png');assert.equal(a,b);
  f.loader.retainOnly([]);assert.equal(f.freed.length,1,'unused model is evicted');
  f.loader.host.unloadTexture(a);f.loader.retainOnly([]);assert.equal(f.freed.length,1);
  f.loader.host.unloadTexture(b);f.loader.retainOnly([]);assert.equal(f.freed.length,2);
  assert.equal(f.loader.synchronousMisses,0);f.loader.dispose();
});
test('error/cancel drains jobs and allows retry without stale tickets or double frees',()=>{
  const f=fixture(0),failed=f.loader.preload([{kind:'texture',path:'missing'},texture]);failed.update();
  assert.match(failed.error.message,/missing/);assert.equal(f.pending.size,0);
  const retry=f.loader.preload([texture]);retry.update();assert.equal(retry.done,true);
  const cancel=f.loader.preload([{kind:'model',path:'cancel.glb'}]);cancel.update();cancel.cancel();
  assert.equal(f.pending.size,0);f.loader.dispose();assert.equal(new Set(f.freed).size,f.freed.length);
});
test('scene loading freezes update callbacks and retains outgoing scene until readiness',()=>{
  let remaining=4,sim=0,post=0,destroyed=0,prepTicks=0,cancelled=0;
  const app=new TouhouApplication({initialScene:'old',transitionOptions:false,
    prepareScene:mode=>mode==='new'?{get ready(){return remaining===0;},update(){remaining--;prepTicks++;},cancel(){cancelled++;}}:null,
    onAfterUpdate(){post++;},scenes:{old:()=>({update(){sim++;},draw(){},destroy(){destroyed++;}}),new:()=>({update(){sim++;},render:()=>[]})}});
  app.update();app.switchScene('new');
  for(let i=0;i<3;i++){app.update(255);app.render();assert.equal(sim,1);assert.equal(post,1);assert.equal(destroyed,0);}
  app.update();assert.equal(app.mode,'new');assert.equal(destroyed,1);assert.equal(sim,1);
  app.update();assert.equal(sim,2);assert.equal(post,2);assert.equal(prepTicks,4);assert.equal(cancelled,0);app.destroy();
});
test('initial loading can draw with no scene; redirection cancels preparation',()=>{
  let cancelled=0;
  const app=new TouhouApplication({initialScene:'pending',prepareScene:mode=>mode==='pending'?{ready:false,update(){},cancel(){cancelled++;}}:null,
    scenes:{pending:()=>{throw Error('not ready');},ready:()=>({update(){},draw(){}})}});
  assert.deepEqual(app.render(),[['clear',0x000000ff]]);app.switchScene('ready');assert.equal(cancelled,1);app.destroy();
});
