import test from 'node:test';
import assert from 'node:assert/strict';
import {Th20LaserField,th20CurveSample} from '../games/touhou20/src/lasers.js';
import {th20BulletCommand as command} from '../games/touhou20/src/bullets.js';
import {bulletTestBank,bulletTestStyles} from './fixtures/th20-bullet-bank.js';
import {readFileSync} from 'node:fs';
import {verifyLaserVectors} from '../native/tests/laser-compare.js';
const create=()=>new Th20LaserField({bank:bulletTestBank(),styles:bulletTestStyles()});
test('source C++ curve vectors compare absolute and backward sampling float bits',()=>{
  const result=verifyLaserVectors(JSON.parse(readFileSync(new URL('./fixtures/th20-laser-vectors.json',import.meta.url),'utf8')));
  assert.deepEqual(result,{cases:48,values:1920});
});
test('straight grows from root, then moves tail, then shrinks to length limit',()=>{
  const field=create(),l=field.spawnStraight({y:100,speed:4,length:8,lengthLimit:20});const frames=[];
  for(let i=0;i<6;i++){field.update();frames.push([l.position.x,l.length,l.travel,l.alive]);}
  assert.deepEqual(frames,[[0,4,0,true],[0,8,0,true],[4,8,4,true],[8,8,8,true],[12,8,12,true],[16,4,16,true]]);
  field.update();assert.equal(l.alive,false);
});
test('infinite laser preserves original delay/grow/sustain/shrink boundary frames',()=>{
  const field=create(),l=field.spawnInfinite({y:100,length:60,width:12,delay:2,grow:3,sustain:2,shrink:3});const frames=[];
  for(let i=0;i<11;i++){field.update();frames.push([l.state,l.age.current,l.width,l.alive]);}
  assert.deepEqual(frames,[[3,1,2,true],[3,2,2,true],[4,1,2,true],[4,2,4,true],[4,3,8,true],[2,1,12,true],[2,2,12,true],[5,1,12,true],[5,2,8,true],[5,3,4,true],[5,3,4,false]]);
});
test('original collision trimming uses distinct straight and infinite width formulas',()=>{
  const field=create(),a=field.spawnStraight({initialLength:100,length:100,width:40}),b=field.spawnInfinite({length:100,width:40,delay:0,grow:0,sustain:99});
  assert.equal(field.segments(a)[0].width,12);assert.equal(field.segments(a)[0].length,80);
  field.update();field.update();assert.equal(field.segments(b)[0].width,Math.fround(40-Math.fround(56/3)));assert.equal(field.segments(b)[0].length,95);
});
test('laser graze occurs each eight contact frames; repeated overlap does not erase beam',()=>{
  const field=create(),l=field.spawnStraight({y:100,initialLength:100,length:100,speed:0});let grazes=0;
  const player={x:50,y:120,collisionRectangle:()=>2,addGraze:()=>grazes++};for(let i=0;i<25;i++)field.update(player);
  assert.equal(grazes,4);assert.equal(l.alive,true);assert.equal(l.touching,25);
});
test('circle cancellation splits straight surviving intervals, omitting fragments <=24',()=>{
  const field=create(),l=field.spawnStraight({y:100,initialLength:160,length:160,speed:0});
  assert.equal(field.cancelCircle(72,100,9),1);assert.equal(field.cancelCounter,1);assert.equal(l.length,64);
  assert.equal(field.count,2);const tail=field.lasers[0];assert.equal(tail.position.x,80);assert.equal(tail.length,80);
});
test('infinite cancellation retains root and emits straight surviving tail at speed8',()=>{
  const field=create(),l=field.spawnInfinite({y:100,length:160,lengthLimit:200,width:20});
  assert.equal(field.cancelCircle(72,100,9),1);assert.equal(l.length,64);const tail=field.lasers[0];assert.equal(tail.kind,0);assert.equal(tail.speed,8);assert.equal(tail.position.x,80);assert.equal(tail.p.lengthLimit,120);
});
test('curve straight sampling and finite angular path preserve head/tail timing',()=>{
  const field=create(),l=field.spawnCurve({x:0,y:100,count:8,speed:2,time:4});
  assert.deepEqual(l.samples.map(s=>s.position.x),[8,6,4,2,0,0,0,0]);field.update();assert.equal(l.samples[0].position.x,8);field.update();assert.equal(l.samples[0].position.x,10);
  const moving=field.spawnCurve({y:100,count:8,speed:2,commands:[command(3,{floats:[.1,.2],ints:[10,2]})]});field.update();assert.equal(moving.path.length,3);assert.deepEqual(moving.path.map(n=>[n.kind,n.begin,n.end]),[[0,0,2],[2,2,12],[0,12,999999]]);
});
test('live curve history shift moves head even when clockScale is zero, matching original',()=>{
  const field=create(),l=field.spawnCurve({y:100,count:8,speed:2,live:true});field.update(null,{clockScale:0});assert.equal(l.samples[0].position.x,2);assert.equal(l.time.value,0);
});
test('curve absolute and backward evaluator retains source non-angular acceleration quirk',()=>{
  const c={kind:1,begin:0,end:100,position:{x:0,y:0,z:0},direction:{x:1,y:0,z:0},speed:2,angle:0,acceleration:.5,angularAcceleration:-999};
  const a=th20CurveSample([c],4);assert.equal(a.position.x,15);assert.equal(a.speed,4);
  const b=th20CurveSample([c],3,a,true);assert.equal(b.position.x,11.5);assert.equal(b.speed,1.5);
});
test('unsupported original laser command rejects before allocating any animation',()=>{
  const field=create();assert.throws(()=>field.spawnStraight({commands:[command(13)]}),/Unsupported/);assert.equal(field.bank.instances.length,0);
});
