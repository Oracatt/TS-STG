import test from 'node:test';
import assert from 'node:assert/strict';
import {DrawList} from '@ts-stg/thlib';
import {TouhouGameplayCompositor,TouhouRenderQueue} from '@ts-stg/thlib/touhou';
import {RushStageArtwork,rushArtworkCoverUv,RUSH_STAGE_ARTWORK_TEXTURES,RUSH_SPELL_ARTWORK_TEXTURES} from '../games/rushboss/src/stage-artwork.js';
import {assertRenderScopes} from './fixtures/render-scopes.js';

// Independent source asset dimensions; no ignored PNG, native host or source
// checkout is needed to test scene schedules and the generic drawing boundary.
const dimensions={src_grassland:[512,512],src_leaf:[256,256],src_sunlight:[256,256],
  src_river_ground:[512,512],src_water:[128,128],src_cloud_1:[128,128],src_cloud_2:[128,128],
  src_snow_ground:[512,512],src_forest1:[512,512],src_tree1:[256,256],src_tree2:[256,256],src_snow:[41,41],
  src_dummy:[1,1],src_sunnymilk_cdbg1:[256,256],src_sunnymilk_cdbg2:[352,352],
  src_monstone_cdbg1:[528,396],src_monstone_cdbg2:[256,256],src_artia_cdbg1:[384,448],src_artia_cdbg2:[350,512]};
function fixture(){const textures=new Map(),calls=[],host={createShader(fragment,vertex){calls.push(['createShader',fragment,vertex]);return 600;},
  unloadShader(id){calls.push(['unloadShader',id]);}};
  const assets={host,manifest:{textures:{}},size(name){assert.ok(dimensions[name],name);const [width,height]=dimensions[name];return{width,height};},
    texture(name){assert.ok(dimensions[name],name);if(!textures.has(name))textures.set(name,textures.size+1);return textures.get(name);}};
  const art=new RushStageArtwork(assets);return{art,assets,calls,textures};}
const battle=(key,active=false,phaseIndex=1)=>({bossKey:key,frame:0,phaseIndex,phase:{spell:active},combatStarted:true,finished:false,
  presentation:{shared:{spell:{active}}}});
const F=Math.fround;
function sumPerFrame(step,frames,initial=0){let n=initial;for(let i=0;i<frames;i++)n=F(n+F(step));return n;}
function project(point,matrix){const clip=Array.from({length:4},(_,i)=>point[0]*matrix[i]+point[1]*matrix[4+i]+point[2]*matrix[8+i]+matrix[12+i]);
  return[(clip[0]/clip[3]+1)*480,(1-clip[1]/clip[3])*360];}

test('source camera speeds, pitches and fog are preserved for all three stages',()=>{
  const {art}=fixture();
  for(const [key,speed,pitch,fog,start]of [['sunny',2,Math.PI/4,[.3,.3,.15],2],['monstone',4,Math.PI/4,[.8,.8,.9],4],['artia',5,Math.PI/7,[0,0,0],4]]){
    art.setStage(key);art.update({frame:120,battle:battle(key)});const state=art.snapshot();
    assert.equal(state.camera.z,sumPerFrame(speed/60,120));assert.equal(state.camera.pitch,pitch);
    assert.deepEqual(state.fog,{color:fog,start,range:35});assert.equal(state.camera.fieldOfView,Math.PI/3);
  }art.destroy();
});

test('portrait projection retains equal physical X/Y scale instead of stretching 3D geometry',()=>{
  const {art}=fixture();art.setStage('monstone');
  const center=project([0,-12,12],art.matrix),right=project([1,-12,12],art.matrix),up=project([0,-12+Math.SQRT1_2,12+Math.SQRT1_2],art.matrix);
  assert.ok(Math.abs(center[0]-336)<.001);assert.ok(Math.abs(center[1]-360)<.001);
  assert.ok(Math.abs((right[0]-center[0])-(center[1]-up[1]))<.001);
  art.destroy();
});

test('source row geometry, river mirroring and original Cloud_2 texture binding survive',()=>{
  const {art}=fixture();art.setStage('monstone');
  assert.deepEqual(art.floor.filter(o=>o.z===0).map(o=>[o.x,o.y,o.width,o.height]),[[-20,-12,10,10],[-10,-12,-10,10],[0,-12,10,10],[10,-12,-10,10],[20,-12,10,10]]);
  assert.ok(art.water.every(o=>o.y===-11&&o.alpha===.6));assert.ok(art.weather.every(o=>o.name==='src_cloud_1'&&o.alpha===.15));
  const cloud=art.weather[0],z=cloud.z;art.update({frame:60,battle:battle('monstone')});
  assert.equal(cloud.z,sumPerFrame(-.05,60,z));assert.equal(art.snapshot().sourceCloud2Texture,'src_cloud_1');
  art.setStage('artia');assert.equal(art.floor.filter(o=>o.z===0).length,7);
  assert.ok(art.decor.some(o=>o.name==='src_tree1')&&art.decor.some(o=>o.name==='src_tree2'));art.destroy();
});

test('source world objects scroll without unbounded retention and snow is generated once per fixed frame',()=>{
  const {art}=fixture();art.setStage('artia');art.update({frame:120,battle:battle('artia')});
  assert.equal(art.weather.length,120);assert.ok(art.weather.every(o=>o.name==='src_snow'&&o.width===.65&&o.alpha===.5));
  art.update({frame:1200,battle:battle('artia')});const state=art.snapshot();
  assert.ok(state.counts.weather<220);assert.ok(state.counts.floor<90);assert.ok(state.counts.decor<150);
  assert.ok(art.weather.every(o=>o.y>=-13&&o.z-art.cameraZ>=-10));art.destroy();
});

test('jumping frames and sequential updates produce the same visual state without touching gameplay',()=>{
  const a=fixture().art,b=fixture().art,model=battle('artia',true),before=JSON.stringify(model);
  a.setStage('artia');b.setStage('artia');a.update({frame:300,battle:model});for(let frame=1;frame<=300;frame++)b.update({frame,battle:model});
  assert.deepEqual(a.snapshot(),b.snapshot());assert.deepEqual(a.weather,b.weather);assert.equal(JSON.stringify(model),before);
  const state=a.snapshot();a.update({frame:300,battle:model});assert.deepEqual(a.snapshot(),state);a.destroy();b.destroy();
});

test('spell skin source fades, scrolling, overlay caps and independent retiring surfaces are retained',()=>{
  const {art}=fixture(),model=battle('monstone',true);art.setStage('monstone');
  art.update({frame:1,battle:model});assert.equal(art.cards[0].alpha,F(.02));
  art.update({frame:60,battle:model});assert.equal(art.cards[0].alpha,1);assert.equal(art.cards[0].overlayAlpha,.75);
  assert.equal(art.cards[0].scroll,sumPerFrame(.003,60));
  model.phaseIndex=3;art.update({frame:61,battle:model});assert.equal(art.cards.length,2);
  assert.equal(art.cards[0].leaving,true);assert.equal(art.cards[0].alpha,F(1-F(.1)));assert.equal(art.cards[1].alpha,F(.02));
  model.presentation.shared.spell.active=false;art.update({frame:80,battle:model});assert.equal(art.cards.length,0);art.destroy();
});

test('static and repeating spell artwork is cropped with one texel scale for both axes',()=>{
  const viewport={width:576,height:672};
  assert.deepEqual(rushArtworkCoverUv({width:384,height:448},viewport),[0,0,1,1]);
  for(const [size,uv]of [[{width:352,height:352},[0,.125,1,.75]],[{width:256,height:256},[.2,.3,2.4,1.8]],[{width:350,height:512},[0,.5,2.5,1.6]]]){
    const crop=rushArtworkCoverUv(size,viewport,uv);
    assert.ok(Math.abs(viewport.width/(size.width*crop[2])-viewport.height/(size.height*crop[3]))<1e-9);
    assert.ok(crop[0]>=uv[0]&&crop[1]>=uv[1]);assert.ok(crop[2]<=uv[2]&&crop[3]<=uv[3]);
  }assert.throws(()=>rushArtworkCoverUv({width:0,height:1},viewport),RangeError);
});

test('private stage and spell drawing close shader/blend scopes before common thlib effects',()=>{
  const {art,calls,textures}=fixture();assert.equal(calls.length,0,'title-only construction compiles no shader');
  for(const key of ['sunny','monstone','artia']){
    art.setStage(key);art.update({frame:120,battle:battle(key,true)});const queue=new TouhouRenderQueue(),draw=new DrawList();
    queue.enqueuePriority(11,target=>art.drawSpell(target));queue.enqueuePriority(13,target=>target.rect(200,200,8,8,0xff00ffff));
    new TouhouGameplayCompositor({renderTarget:700,compositeTarget:701}).draw(draw,queue,{drawBackground:target=>art.drawStage(target)});
    assertRenderScopes(draw.commands,key);assert.ok(draw.commands.some(c=>c[0]==='mesh3d'));assert.ok(draw.commands.some(c=>c[0]==='shaderBegin'));
    const state=art.snapshot(),again=new DrawList();art.draw(again,{spell:true});assert.deepEqual(art.snapshot(),state,'drawing advances no frame or particles');
    for(const name of RUSH_STAGE_ARTWORK_TEXTURES[key].filter(name=>name!=='src_cloud_2'))assert.ok(textures.has(name),name);
    for(const name of RUSH_SPELL_ARTWORK_TEXTURES[key])assert.ok(textures.has(name),name);
  }
  assert.equal(calls.filter(c=>c[0]==='createShader').length,1);art.destroy();art.destroy();
  assert.deepEqual(calls.filter(c=>c[0]==='unloadShader'),[['unloadShader',600]]);
});

test('reset restarts a same-boss stage while preserving its shader resource',()=>{
  const {art,calls}=fixture();art.update({frame:200,battle:battle('sunny',true)});art.draw(new DrawList(),{spell:true});
  art.reset();assert.equal(art.frame,0);assert.equal(art.cameraZ,0);assert.equal(art.lastFrame,-1);assert.equal(art.cards.length,0);
  art.update({frame:10,battle:battle('sunny')});assert.equal(art.cameraZ,sumPerFrame(2/60,10));
  art.drawStage(new DrawList());assert.equal(calls.filter(c=>c[0]==='createShader').length,1);art.destroy();
});
