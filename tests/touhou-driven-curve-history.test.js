import test from 'node:test';
import assert from 'node:assert/strict';
import {TouhouLaserField} from '@ts-stg/thlib/touhou';
import {bulletTestStyles} from './fixtures/th20-bullet-bank.js';

const field=()=>new TouhouLaserField({styles:bulletTestStyles()});
const history=count=>Array.from({length:count},(_,i)=>({position:{x:i*8,y:100,z:0},velocity:{x:8,y:0,z:0},angle:0,speed:8,actor:{index:i}}));

test('driven curve without materialized history retains the full birth buffer and can be cancelled immediately',()=>{
  const owner=field(),laser=owner.spawnDriven(2,{x:20,y:100,z:2,angle:.5,speed:6,count:12,radialOffset:16});
  const birth={...laser.position};
  assert.equal(laser.samples.length,12);assert.equal(laser.p.count,12);
  owner.updateDrivenCurve(laser,[]);
  assert.equal(laser.samples.length,12);assert.equal(laser.p.count,12);
  for(const node of laser.samples){
    assert.deepEqual(node.position,birth);assert.deepEqual(node.velocity,{x:0,y:0,z:0});
    assert.equal(node.angle,Math.fround(.5));assert.equal(node.speed,6);
  }
  assert.equal(new Set(laser.samples).size,12,'padding samples remain independent records');
  assert.equal(owner.cancelCircle(birth.x,birth.y,1),12);
  assert.equal(laser.killPending,true);owner.update();assert.equal(owner.count,0);
  owner.updateDrivenCurve(laser,history(12));assert.equal(laser.alive,false,'external updates never revive a retired owner');
});

test('partial external history uses original pre-birth samples instead of shrinking capacity or extrapolating a tail',()=>{
  const owner=field(),laser=owner.spawnDriven(2,{x:-40,y:100,angle:.3,speed:5,count:8});
  const nodes=history(2);owner.updateDrivenCurve(laser,nodes);
  assert.equal(laser.p.count,8);assert.equal(laser.samples.length,8);assert.equal(laser.live,true);
  assert.equal(laser.samples[0].actor,nodes[0].actor);assert.equal(laser.samples[1].actor,nodes[1].actor);
  assert.notEqual(laser.samples[0].position,nodes[0].position,'external geometry is copied at the float32 boundary');
  for(const node of laser.samples.slice(2)){
    assert.deepEqual(node.position,{x:-40,y:100,z:0});assert.equal(node.angle,Math.fround(.3));assert.equal(node.speed,5);
    assert.deepEqual(node.velocity,{x:0,y:0,z:0});assert.equal(node.actor,undefined);
  }
  Object.assign(laser.p,{x:150,y:200,angle:1,speed:9});
  owner.updateDrivenCurve(laser,nodes);
  assert.deepEqual(laser.samples[7].position,{x:-40,y:100,z:0},'moving the external head cannot move pre-birth padding');
  assert.equal(laser.samples[7].angle,Math.fround(.3));assert.equal(laser.samples[7].speed,5);
});

test('source local cancellation permanently limits driven history and preserves retained sample owners',()=>{
  const owner=field(),laser=owner.spawnDriven(2,{x:0,y:100,count:12,time:100}),nodes=history(12);
  owner.updateDrivenCurve(laser,nodes);
  assert.equal(owner.cancelCircle(40,100,1),1);assert.equal(laser.p.count,5);
  assert.equal(owner.count,1,'external live curves do not invent detached analytic-path tails');
  assert.deepEqual(laser.samples.map(node=>node.actor),nodes.slice(0,5).map(node=>node.actor));
  owner.updateDrivenCurve(laser,history(30));
  assert.equal(laser.p.count,5);assert.equal(laser.samples.length,5);
  owner.updateDrivenCurve(laser,[]);assert.equal(laser.p.count,5);assert.equal(laser.samples.length,5);
  assert.equal(owner.cancelCircle(0,100,1),5);assert.equal(laser.killPending,true);
});

test('head cancellation keeps source time shift and leaves the shortened capacity under source ownership',()=>{
  const owner=field(),laser=owner.spawnDriven(2,{x:0,y:100,count:12,time:100}),nodes=history(12);
  owner.updateDrivenCurve(laser,nodes);
  assert.equal(owner.cancelCircle(0,100,8),2);assert.equal(laser.time.value,98);assert.equal(laser.p.count,10);
  assert.equal(laser.samples[0].actor,nodes[2].actor);
  owner.updateDrivenCurve(laser,nodes.slice(2));
  assert.equal(laser.samples.length,10);assert.equal(laser.samples[0].actor,nodes[2].actor);
  assert.equal(laser.time.value,98,'adopting geometry does not undo the source cancellation clock');
  const other=field();assert.throws(()=>other.updateDrivenCurve(laser,[]),/spawned by this field/);
  const straight=owner.spawnDriven(1);assert.throws(()=>owner.updateDrivenCurve(straight,[]),/spawned by this field/);
});

test('driven autoBounds preserves the complete tail until all source width-expanded samples leave the field',()=>{
  // Source type2_frame.cpp tests all count samples with full width as both
  // viewport margins. Equality is outside: x=-192-width / 192+width,
  // y=-width / 448+width. The external head is not a separate expiry owner.
  const edges=[
    [{x:-208,y:100},{x:-207.99,y:100}],
    [{x:208,y:100},{x:207.99,y:100}],
    [{x:0,y:-16},{x:0,y:-15.99}],
    [{x:0,y:464},{x:0,y:463.99}],
  ];
  for(const [outside,inside]of edges){
    const owner=field(),laser=owner.spawnDriven(2,{x:0,y:100,count:8,width:16,autoBounds:true});
    laser.grace.set(0);
    const nodes=history(8).map(node=>({...node,position:{...outside,z:0}}));
    nodes[7].position={...inside,z:0};owner.updateDrivenCurve(laser,nodes);owner.update();
    assert.equal(laser.alive,true,'last tail sample is still within the original bounds');
    assert.equal(laser.grace.current,0,'expired grace does not keep decreasing without a wait command');
    nodes[7].position={...outside,z:0};owner.updateDrivenCurve(laser,nodes);owner.update();
    assert.equal(laser.alive,false);assert.equal(owner.count,0);assert.equal(owner.effects.length,0);
  }
});

test('driven and source curves share one grace tick, the thirty-frame boundary and wait-command exemption',()=>{
  const owner=field(),driven=owner.spawnDriven(2,{x:400,y:100,count:8,speed:0,autoBounds:true}),
    source=owner.spawnCurve({x:400,y:100,count:8,speed:0});
  owner.updateDrivenCurve(driven,[]);
  for(let frame=1;frame<=30;frame++){
    owner.update();assert.equal(driven.alive,true);assert.equal(source.alive,true);
    assert.equal(driven.grace.current,30-frame);assert.equal(source.grace.current,30-frame);
  }
  owner.update();assert.equal(driven.alive,false);assert.equal(source.alive,false);
  const waiting=owner.spawnDriven(2,{x:400,y:100,count:8,speed:0,autoBounds:true});
  owner.updateDrivenCurve(waiting,[]);waiting.grace.set(0);waiting.activeMask=0x100n;
  owner.update();assert.equal(waiting.alive,true);assert.equal(waiting.grace.current,-1);
  owner.update();assert.equal(waiting.alive,true);assert.equal(waiting.grace.current,-2);
  waiting.activeMask=0n;owner.update();assert.equal(waiting.alive,false);
});

test('driven autoBounds is opt-in and obeys pause, freeze and fractional source clock scale',()=>{
  const owner=field(),legacy=owner.spawnDriven(2,{x:400,y:100,count:8,speed:0}),
    laser=owner.spawnDriven(2,{x:400,y:100,count:8,speed:0,autoBounds:true});
  owner.updateDrivenCurve(legacy,[]);owner.updateDrivenCurve(laser,[]);
  owner.update(null,{paused:true});owner.update(null,{freezeBullets:true});assert.equal(laser.grace.value,30);
  owner.update(null,{clockScale:0});assert.equal(laser.grace.value,30);
  for(let frame=0;frame<59;frame++)owner.update(null,{clockScale:.5});
  assert.equal(laser.alive,true);assert.equal(laser.grace.value,.5);assert.equal(laser.grace.current,0);assert.equal(legacy.grace.value,30);
  owner.update(null,{clockScale:.5});assert.equal(laser.alive,false);assert.equal(legacy.alive,true);
});

test('driven history rejects values outside finite float32 before replacing the previous sample buffer',()=>{
  const owner=field(),laser=owner.spawnDriven(2,{x:0,y:100,count:8}),nodes=history(8);
  owner.updateDrivenCurve(laser,nodes);const before=laser.samples;
  for(const [section,key,value]of [['position','x',1e100],['velocity','y',-1e100],[null,'speed',1e100],[null,'angle','0.5']]){
    const invalid=history(8);if(section)invalid[3][section][key]=value;else invalid[3][key]=value;
    assert.throws(()=>owner.updateDrivenCurve(laser,invalid),/finite/);
    assert.equal(laser.samples,before);assert.deepEqual(laser.samples.map(node=>node.actor),nodes.map(node=>node.actor));
  }
});
