import test from 'node:test';
import assert from 'node:assert/strict';
import { Th20BulletField,th20BulletCommand as command } from '../games/touhou20/src/bullets.js';
import { bulletTestBank,bulletTestStyles } from './fixtures/th20-bullet-bank.js';
import {readFileSync} from 'node:fs';
import {verifyBulletVectors} from '../native/tests/bullet-compare.js';
const create=(options={})=>new Th20BulletField({bank:bulletTestBank(),styles:bulletTestStyles(),...options});
test('source C++ float-bit vectors: acceleration, angular, homing, turns and bounce',()=>{
  const result=verifyBulletVectors(JSON.parse(readFileSync(new URL('./fixtures/th20-bullet-vectors.json',import.meta.url),'utf8')));
  assert.equal(result.cases,60);assert.equal(result.values,11520);
});

test('original descending free pool, newest-first iteration, retained cancel type 5',()=>{
  const styles=bulletTestStyles();styles[1].cancelType=5;
  const field=create({capacity:2,styles});const [a,b]=field.emit({count:2,color:4});
  assert.deepEqual([a.slot,b.slot],[1,0]);assert.deepEqual(field.bullets.map(x=>x.id),[2,1]);assert.equal(field.emit({}).length,0);
  field.retire(a);assert.equal(field.count,1);const [c]=field.emit({type:1});assert.equal(c.slot,1);assert.equal(c.cancelScript,14);
  const fresh=create({styles});assert.equal(fresh.emit({type:1})[0].cancelScript,0);
});
test('normal shot starts active; explicit startup rewinds four velocities then half-steps until ANM flag',()=>{
  const field=create();const [a]=field.emit({x:0,y:100,speed:2});field.update();assert.equal(a.x,2);assert.equal(a.state,1);
  const [b]=field.emit({y:100,speed:2,commands:[command(1,{ints:[1]})]});assert.equal(b.x,-8);assert.equal(b.state,2);assert.deepEqual(b.animation.interrupts,[]);
  field.update();assert.equal(b.x,-7);b.animation.U(0x444,1);field.update();assert.equal(b.x,-4);assert.equal(b.state,1);
});
test('graze quota is three with sixty frame spacing and recharges after sixty outside frames',()=>{
  const field=create();const [b]=field.emit({y:100,speed:0});let collision=2,grazes=0;
  const player={collisionCircle:()=>collision,addGraze:()=>grazes++};
  for(let frame=0;frame<=120;frame++)field.update(player);assert.equal(grazes,3);assert.equal(b.grazesLeft,0);
  for(let frame=0;frame<100;frame++)field.update(player);assert.equal(grazes,3);
  collision=0;for(let frame=0;frame<60;frame++)field.update(player);assert.equal(b.grazesLeft,3);
  collision=2;field.update(player);assert.equal(grazes,4);
});
test('startup collision performs original second graze test at age eight',()=>{
  const field=create();field.emit({y:100,speed:0,commands:[command(1,{ints:[1]})]});let calls=0;
  const player={collisionCircle:()=>{calls++;return 0;}};
  for(let frame=0;frame<8;frame++)field.update(player);assert.equal(calls,8);field.update(player);assert.equal(calls,10);
});
test('hit animation and cancel animation follow distinct half-step and retirement paths',()=>{
  const field=create();const [b]=field.emit({y:100,speed:2});field.update({collisionCircle:()=>1});
  assert.equal(b.state,3);assert.equal(b.x,2);assert.equal(field.effects.length,1);assert.equal(field.effects[0].interpolations.get('position').duration,30);
  field.update();assert.equal(b.x,3);
  const [c]=field.emit({y:150,speed:2});assert.equal(field.cancelCircle(0,150,1),1);assert.equal(c.x,1);assert.equal(c.state,4);field.update();assert.equal(c.x,1);
  c.animation.alive=false;field.update();assert.equal(c.state,0);assert.equal(field.count,1);
});
test('cancellation circle uses half radius, rectangle uses full scaled radius and viewport',()=>{
  const field=create();const [a]=field.emit({x:11,y:100,speed:0});assert.equal(field.cancelCircle(0,100,10),1);
  const [b]=field.emit({x:13,y:100,speed:0});b.scale=2;assert.equal(field.cancelCircle(0,100,10),0);
  assert.equal(field.cancelRectangle(0,100,20,20),1);
  const [c]=field.emit({x:0,y:100,speed:0,commands:[command(7,{ints:[2]})]});assert.equal(field.cancelCircle(0,100,20),0);field.update();field.update();assert.equal(field.cancelCircle(0,100,20),1);
});
test('motion channels wait, accelerate, freeze, then resume commands in same completion frame',()=>{
  const field=create();const [b]=field.emit({y:100,speed:1,commands:[command(2,{floats:[1,0,0],ints:[2]}),command(26,{ints:[2]}),command(18,{floats:[0,4]})]});
  const frames=[];for(let i=0;i<6;i++){field.update();frames.push([b.x,b.speed,b.frozen,b.commandIndex]);}
  assert.deepEqual(frames,[[2,2,false,1],[5,3,false,1],[5,3,true,2],[5,3,true,2],[9,4,false,3],[13,4,false,3]]);
});
test('screen wrap uses sprite extents; grace allows five updates before offscreen retirement',()=>{
  const field=create();const [b]=field.emit({x:198,y:100,speed:1,commands:[command(12,{ints:[1,8]})]});field.update();assert.equal(b.x,-193);assert.equal(b.activeMask,0n);
  const [c]=field.emit({x:210,y:100,speed:0});for(let i=0;i<5;i++)field.update();assert.equal(c.state,1);field.update();assert.equal(c.state,0);
});
test('unsupported ownership opcodes fail before allocating pool or ANM resources',()=>{
  const field=create();for(const type of [13,24,27])assert.throws(()=>field.emit({commands:[command(type)]}),/Unsupported Touhou/);
  assert.equal(field.count,0);assert.equal(field.bank.instances.length,0);
});
