import test from 'node:test';
import assert from 'node:assert/strict';
import {TouhouPlayer} from '../packages/thlib/src/touhou/player.js';
import {TouhouItems} from '../packages/thlib/src/touhou/items.js';
import {getTouhouPlayerData} from '../packages/thlib/src/touhou/player-data.js';

const create=()=>new TouhouPlayer({sht:getTouhouPlayerData(0),y:100});

test('a registered business collectible reuses original attraction and collection exactly once',()=>{
  const p=create(),events=[],sounds=[],context={onEvent:(name,data)=>events.push([name,data]),sound:id=>sounds.push(id)};
  const items=new TouhouItems({player:p,context,definitions:[['medal',{collect(item,player,ctx,owner){
    assert.equal(owner,items);assert.equal(ctx,context);player.medals=(player.medals??0)+1;return 77;
  }}]]});
  const medal=items.spawn({type:'medal',x:140,y:300,speed:0}),ordinary=items.spawn({type:'point',x:140,y:300,speed:0});
  for(let frame=0;frame<120&&medal.state;frame++){
    items.update();assert.deepEqual([medal.x,medal.y,medal.state],[ordinary.x,ordinary.y,ordinary.state],'custom reward does not replace common movement and attraction');
  }
  assert.equal(p.medals,1);assert.equal(items.items.length,0);
  const collected=events.filter(([name,data])=>name==='itemCollect'&&data.item===medal);
  assert.equal(collected.length,1);assert.equal(collected[0][1].amount,77);assert.equal(sounds.filter(id=>id===37).length,2);
  items.update();assert.equal(p.medals,1);
});

test('custom animation and delayed spawn effects are local to their item definition',()=>{
  const p=create(),created=[],effects=[],bank={create(script){const vm={script,alive:true,U(){},destroy(){this.alive=false;},update(){}};created.push(vm);return vm;}};
  const items=new TouhouItems({player:p});
  items.register(42,{bank,script:7,upScript:8,collect(){},spawnEffect:item=>effects.push(item.id)});
  const item=items.spawn({type:42,x:0,y:300,delay:2});
  assert.deepEqual(created.map(vm=>vm.script),[7,8]);assert.equal(effects.length,0);
  items.update();items.update();assert.deepEqual(effects,[item.id]);items.retire(item);
  assert.ok(created.every(vm=>!vm.alive));
  assert.throws(()=>items.spawn({type:13}),/register/,'unregistered title-specific IDs are still absent');
});

test('re-registering a reward changes future spawns without changing a live collectible',()=>{
  const p=create(),calls=[],items=new TouhouItems({player:p});
  items.register('medal',{collect:()=>calls.push('old')});const old=items.spawn({type:'medal'});
  items.register('medal',{collect:()=>calls.push('new')});const newer=items.spawn({type:'medal'});
  items.collect(old);items.collect(newer);assert.deepEqual(calls,['old','new']);
});

test('registered items participate in common deterministic enemy drop placement',()=>{
  const p=create(),items=new TouhouItems({player:p,definitions:[['medal',{collect(){}}],[42,{collect(){}}]]});
  const drops=items.spawnEnemyDrops({x:0,y:200},{centerType:'medal',counts:{medal:2,42:1,power:1},radius:16});
  assert.deepEqual(drops.map(item=>item.type),['medal',1,42,'medal','medal']);
  assert.ok(drops.every(item=>Math.abs(item.x)<=16&&Math.abs(item.y-200)<=16));
});

test('item capacity is selected by the consumer while full pools retain the source null result',()=>{
  const p=create(),items=new TouhouItems({player:p,capacity:2});
  const first=items.spawn({x:100,y:300});assert.ok(first);assert.ok(items.spawn({x:120,y:300}));
  assert.equal(items.spawn(),null);items.retire(first);items.update();assert.ok(items.spawn());
  assert.equal(new TouhouItems({player:p}).capacity,512);
  assert.throws(()=>new TouhouItems({player:p,capacity:-1}),/capacity/);
});
