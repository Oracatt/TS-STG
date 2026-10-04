import test from 'node:test';
import assert from 'node:assert/strict';
import {TouhouItems,TouhouItemType,TouhouRNG} from '@ts-stg/thlib/touhou';
import {PI,div,polar,f32} from '../packages/thlib/src/touhou/math.js';

const player=()=>({x:0,y:400,state:1,power:100,lives:2,bombs:2});

test('enemy reward scatter follows ECL type order and emits its optional center reward before the ellipse',()=>{
  const calls=[],unit=[0,1,.5],rng={signed(){calls.push('angle');return 0;},unit(){calls.push('radius');return unit.shift();}};
  const items=new TouhouItems({player:player(),rng});
  const counts={point:1,power:2},drops=items.spawnEnemyDrops({x:10,y:120},{counts,centerType:'lifeFragment',radius:64});
  assert.deepEqual(drops.map(item=>item.type),[4,1,1,2]);
  assert.deepEqual([drops[0].x,drops[0].y],[10,120]);
  // enemy_drop.cpp: initial angle0; half-radius; quarter-turn; full-radius;
  // quarter-turn; three-quarter-radius. These are positions, not velocities.
  const expected=[[42,120],[10,184],[-38,120]];
  for(let i=0;i<expected.length;i++)for(let axis=0;axis<2;axis++)
    assert.ok(Math.abs(drops[i+1][axis?'y':'x']-expected[i][axis])<.00002);
  assert.deepEqual(calls,['angle','radius','angle','radius','angle','radius','angle']);
  assert.deepEqual(counts,{point:1,power:2},'caller-owned reward configuration is immutable');
  const velocity=polar(div(-PI,2),f32(2.2));
  for(const item of drops){assert.equal(item.vx,velocity.x);assert.equal(item.vy,velocity.y);assert.equal(item.state,1);}
});

test('empty enemy drops still consume the source initial angle, and the ordinary default radius is32',()=>{
  const rng=new TouhouRNG(17),oracle=new TouhouRNG(17),items=new TouhouItems({player:player(),rng});
  assert.deepEqual(items.spawnEnemyDrops({x:0,y:128}),[]);oracle.signed();assert.equal(rng.state,oracle.state);
  const a=new TouhouItems({player:player(),rng:new TouhouRNG(170)}),b=new TouhouItems({player:player(),rng:new TouhouRNG(170)});
  const small=a.spawnEnemyDrops({x:0,y:0},{counts:{power:10,point:10}});
  const boss=b.spawnEnemyDrops({x:0,y:0},{counts:{power:10,point:10},radius:64});
  assert.equal(a.rng.state,b.rng.state);
  for(let i=0;i<small.length;i++){
    assert.equal(boss[i].x,f32(small[i].x*2));assert.equal(boss[i].y,f32(small[i].y*2));
    const distance=Math.hypot(boss[i].x,boss[i].y);assert.ok(distance>=31.99999&&distance<=64.00001);
  }
});

test('configured Boss rewards stay local and the source spawn clamp applies at playfield edges',()=>{
  const items=new TouhouItems({player:player(),rng:new TouhouRNG(777)});
  const drops=items.spawnEnemyDrops({x:170,y:128},{counts:{power:60,point:60},centerType:'bombFragment',radius:{x:64,y:32}});
  assert.equal(drops.length,121);assert.equal(drops.filter(i=>i.type===1).length,60);assert.equal(drops.filter(i=>i.type===2).length,60);
  assert.equal(drops[0].type,6);assert.deepEqual([drops[0].x,drops[0].y],[170,128]);
  assert.ok(drops.every(i=>i.x>=106&&i.x<=192&&i.y>=96&&i.y<=160));
  assert.ok(drops.some(i=>i.x===192));
});

test('Boss rewards use normal item flight until source collection-line, Bomb or dialogue conditions apply',()=>{
  for(const mode of ['normal','line','bomb','dialogue']){
    const p=player(),items=new TouhouItems({player:p,rng:new TouhouRNG(3)});
    const [item]=items.spawnEnemyDrops({x:100,y:160},{centerType:'lifeFragment'});
    const context={};
    if(mode==='line')p.y=127;
    if(mode==='bomb')p.bomb={alive:true,timer:{current:59}};
    if(mode==='dialogue')context.bossCollecting=true;
    items.update(context);
    assert.equal(item.state,mode==='normal'?1:3);
    if(mode==='normal'){assert.equal(item.y,f32(160+f32(-2.2)));assert.equal(item.attractionSpeed,0);}
    else assert.equal(item.attractionSpeed,f32(5.2));
  }
});

test('source15 remains a counted ordinary point, never an automatically collected small cancellation item',()=>{
  const p=player(),items=new TouhouItems({player:p,difficulty:1});
  assert.equal(TouhouItemType.COUNTED_POINT,15);assert.equal(TouhouItemType.CANCEL_POINT,15);
  for(let i=0;i<4;i++)assert.equal(items.spawn({type:'countedPoint',x:100,y:160}),null);
  const item=items.spawn({type:'cancelPoint',x:100,y:160});
  assert.equal(item.type,2);assert.equal(item.state,1);items.update();assert.equal(item.state,1);
});

test('invalid enemy reward configuration is rejected before RNG, animations or item state change',()=>{
  const items=new TouhouItems({player:player(),rng:new TouhouRNG(123)}),state=items.rng.state;
  for(const options of [{counts:{13:1}},{centerType:9},{radius:-1},{radius:{x:1,y:Infinity}},{counts:{power:-1}},
    {counts:{point:1.5}},{counts:{power:0x80000000}}]){
    assert.throws(()=>items.spawnEnemyDrops({x:0,y:128},options),RangeError);
    assert.equal(items.items.length,0);assert.equal(items.spawnCounter,0);assert.equal(items.rng.state,state);
  }
});

test('BossItem suppresses ordinary timeouts and spell practice without consuming RNG or allocating items',()=>{
  for(const mode of [0,1,2])for(const timedOut of [false,true])for(const survival of [false,true]){
    const events=[],items=new TouhouItems({player:player(),rng:new TouhouRNG(91),context:{onEvent:(...event)=>events.push(event)}});
    const before=items.snapshot(),randomBefore=items.rng.state;
    const options={counts:{power:3,point:4},centerType:'lifeFragment'},position={x:0,y:128};
    const drops=items.spawnBossDrops(position,{...options,mode,timedOut,survival});
    if(mode===2||timedOut&&!survival){
      assert.deepEqual(drops,[]);assert.deepEqual(items.snapshot(),before);
      assert.equal(items.rng.state,randomBefore);assert.equal(items.nextId,1);assert.deepEqual(events,[]);
    }else{
      const reference=new TouhouItems({player:player(),rng:new TouhouRNG(91)});
      reference.spawnEnemyDrops(position,{...options,radius:64});
      assert.equal(drops.length,8);assert.deepEqual(items.snapshot(),reference.snapshot());assert.equal(items.rng.state,reference.rng.state);
    }
  }
});

test('BossItem uses the same scatter owner and preserves an explicitly configured radius',()=>{
  const items=new TouhouItems({player:player(),rng:new TouhouRNG(19)}),reference=new TouhouItems({player:player(),rng:new TouhouRNG(19)});
  const options={counts:{power:2,point:2},centerType:'bombFragment',radius:{x:48,y:24}},position={x:0,y:128};
  items.spawnBossDrops(position,options);reference.spawnEnemyDrops(position,options);
  assert.deepEqual(items.snapshot(),reference.snapshot());assert.equal(items.rng.state,reference.rng.state);
});
