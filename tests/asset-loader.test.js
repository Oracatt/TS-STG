import test from 'node:test';
import assert from 'node:assert/strict';
import {AssetLoader} from '../packages/thlib/dist/asset-loader.js';
import {TouhouApplication} from '../packages/thlib/dist/touhou/application.js';

function fixture(delay=3){
  let next=1,polls=0;const pending=new Map(),freed=[];
  const native={loadResourceAsync(kind,path){const id=next++;pending.set(id,{kind,path,delay});return id;},
    pollResourceLoad(id){polls++;const p=pending.get(id);assert.ok(p);if(p.delay-->0)return{state:'pending'};
      pending.delete(id);return p.path==='missing'?{state:'error',error:'missing file'}:{state:'ready',handle:id};},
    cancelResourceLoad(id){assert.ok(pending.delete(id));},
    loadTexture(){return next++;},unloadTexture:id=>freed.push(id),unloadModel:id=>freed.push(id),
    unloadSound:id=>freed.push(id),unloadMusic:id=>freed.push(id)};
  return{loader:new AssetLoader(native),pending,freed,get polls(){return polls;}};
}
const texture={kind:'texture',path:'stage.png'};
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
