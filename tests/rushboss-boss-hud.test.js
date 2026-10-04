import test from 'node:test';
import assert from 'node:assert/strict';
import {DrawList} from '@ts-stg/thlib';
import {RushBossHud} from '../games/rushboss/src/boss-hud.js';

test('Boss timer uses the source bitmap cells and its original 160 by 120 composition target',()=>{
  const calls=[],host={createRenderTarget:(w,h)=>{calls.push([w,h]);return 7;},unloadTexture:id=>calls.push(['unload',id])};
  const hud=new RushBossHud(host,{texture:key=>key==='src_ascii'?10:11,region:()=>{}}),draw=new DrawList();
  const battle={presentation:{hud:{time:40-1/60,bloodAlpha:1,timeAlpha:1,timeSize:1,red:false}},boss:{x:0,y:100,hp:100,maxHp:100},phase:{survival:true},phaseFrame:1};
  hud.draw(draw,battle);const digits=draw.commands.filter(c=>c[0]==='spriteRegion');
  assert.deepEqual(calls[0],[160,120]);assert.deepEqual(digits.map(c=>c[2]),[3,9,11,9,8].map(n=>n*32));
  assert.ok(digits.every(c=>c[3]===288&&c[4]===32&&c[5]===32));assert.deepEqual(digits.map(c=>c[8]),[18,18,18,12,12]);
  assert.ok(draw.commands.some(c=>c[0]==='sprite'&&c[1]===7&&c[2]===480&&c[3]===60&&c[4]===240&&c[5]===180));
  for(const id of [10,11])assert.ok(draw.commands.some(c=>c[0]==='sampler'&&c[1]===id&&c[2]==='anisotropic4x'&&c[3]==='wrap'&&c[4]==='wrap'));
  hud.dispose();assert.deepEqual(calls.at(-1),['unload',7]);
});

test('Boss blood geometry keeps the original half-triangle percent selection and cached local vertices',()=>{
  const hud=new RushBossHud({createRenderTarget:()=>7,unloadTexture:()=>{}},{texture:()=>11,region:()=>{}}),draw=new DrawList();
  const battle={presentation:{hud:{time:40,bloodAlpha:1,timeAlpha:1,timeSize:1,red:false}},boss:{x:0,y:100,hp:50,maxHp:100},phase:{lifeBar:{min:0,max:1,startFull:true}},phaseFrame:80};
  hud.draw(draw,battle);const rings=draw.commands.filter(c=>c[0]==='mesh');assert.equal(rings[0][3].length,3078);assert.equal(rings[1][3].length,1539);
  const index=rings[1][3],positions=hud.bar.positions;draw.reset();battle.boss.x=5;hud.draw(draw,battle);
  assert.equal(hud.bar.positions,positions);assert.equal(draw.commands.filter(c=>c[0]==='mesh')[1][3],index);
  assert.equal(hud.indexPrefixes.size,1);hud.dispose();
});
