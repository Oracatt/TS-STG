import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DrawList} from '@ts-stg/thlib';
import {createTouhouResources,TouhouLaserField,TouhouRenderQueue,TOUHOU_OWNER_PRIORITIES} from '@ts-stg/thlib/touhou';
import {RushBattle} from '../games/rushboss/src/runtime.js';

const resources=()=>createTouhouResources({readText:file=>readFileSync(file,'utf8'),loadTexture:()=>17});
const fixture=()=>{const res=resources(),battle=new RushBattle([{hp:10000,time:120,init(){},update(){}}],
  {resources:res,profile:'portrait',invincible:true});return{res,battle};};

test('portrait straight and curve lasers are public source owners with additive ANM bodies and one curve mesh',()=>{
  const {res,battle}=fixture();
  const straight=battle.laser({x:-80,y:20},0,3,{length:180,width:6,cleanOnOutOfRange:false});
  const curved=battle.laser({x:-80,y:100},0,5,{curve:60,speed:240,width:20,cleanOnOutOfRange:false});
  for(let i=0;i<20;i++)battle.update();
  const owner=battle.projectiles.debris;
  assert.ok(owner instanceof TouhouLaserField);assert.equal(owner.count,2);
  assert.equal(battle.projectiles.lasers.get(straight).animation.B(0x499),1);
  assert.equal(battle.projectiles.lasers.get(curved).animation.B(0x499),1);
  const queue=new TouhouRenderQueue(),draw=new DrawList();battle.projectiles.draw(queue,battle.playerView);
  assert.ok(queue.entries.some(entry=>entry.priority===TOUHOU_OWNER_PRIORITIES.laser));queue.flush(draw);
  const mesh=draw.commands.filter(command=>command[0]==='mesh');
  assert.equal(mesh.length,1,'one whole source curve, not independently drawn Rush Parts');
  assert.equal(mesh[0][2].length,120);assert.equal(mesh[0][3].length,354);
  const samples=battle.projectiles.lasers.get(curved).samples;
  assert.equal(samples.filter(sample=>sample.actor).length,20);
  assert.ok(samples.slice(20).every(sample=>sample.position.x===-80),'source mesh includes the collapsed pre-birth history');
  assert.ok(draw.commands.some(command=>command[0]==='blendFactors'&&command[1]==='srcAlpha'&&command[2]==='one'));
  assert.ok(draw.commands.some(command=>command[0]==='statefulQuad'&&command[17][1]==='srcAlpha'&&command[17][2]==='one'));
  battle.dispose();res.dispose();
});

test('public driven laser rendering is pure and its source blend state is scoped to priority39',()=>{
  const {res,battle}=fixture();battle.laser({x:-80,y:20},0,3,{length:180,width:6});battle.update();
  const owner=battle.projectiles.debris,before=JSON.stringify(owner.snapshot()),queue=new TouhouRenderQueue(),draw=new DrawList();
  battle.projectiles.draw(queue,battle.playerView);queue.enqueuePriority(40,target=>target.point(10,20,0x123456ff));
  assert.equal(draw.commands.length,0);queue.flush(draw);
  assert.equal(draw.commands.at(-1)[0],'point');assert.equal(JSON.stringify(owner.snapshot()),before);
  assert.equal(owner.lasers[0].animation.B(0x499),1);battle.dispose();res.dispose();
});
