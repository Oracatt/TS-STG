import test from 'node:test';import assert from 'node:assert/strict';
import {AnmInterpolation} from '../games/touhou20/src/anm-interpolation.js';
import {AnmBank} from '../games/touhou20/src/anm-vm.js';

test('public interpolation samples never alias track state or earlier results',()=>{
 for(const mode of [0,1,4,7,8,9,17,18,22,31]){
  const track=new AnmInterpolation([1,2],[9,12],3,mode,{tangents:[[2,3],[4,5]]});
  const first=track.sample(),saved=first.slice(),second=track.sample();
  assert.deepEqual(first,saved,`later sample mutated mode ${mode} result`);
  assert.notEqual(first,second);first[0]=999;assert.notEqual(track.current[0],999);
  assert.notEqual(track.start[0],999);assert.notEqual(track.end[0],999);
  const end=track.sample(),again=track.sample();assert.notEqual(end,again);end[0]=1000;
  assert.notEqual(track.start[0],1000);assert.notEqual(track.end[0],1000);
 }
});

test('borrowed internal interpolation is numerically identical and preserves endpoint current',()=>{
 for(let mode=0;mode<=31;mode++)for(const duration of [0,1,2,5])for(const integer of [false,true]){
  const options={integer,tangents:[[2,3],[4,5]]},copied=new AnmInterpolation([1,2],[9,12],duration,mode,options),borrowed=new AnmInterpolation([1,2],[9,12],duration,mode,options);
  for(let i=0;i<6;i++){
   const actual=borrowed.sample(1,false),expected=copied.sample();assert.deepEqual(actual,expected);
   assert.deepEqual(borrowed.current,copied.current);assert.equal(borrowed.duration,copied.duration);
   assert.equal(actual,borrowed.duration?borrowed.current:mode===7||mode===17?borrowed.start:borrowed.end);
  }
 }
 const rgb=new AnmInterpolation([10,20,30],[110,120,130],2,0,{integer:true});
 assert.deepEqual(rgb.sample(1,false),[60,70,80]);const current=rgb.current;
 assert.equal(rgb.sample(1,false),rgb.end);assert.equal(rgb.current,current);assert.deepEqual(rgb.current,[60,70,80]);
 for(const mode of [7,17]){const track=new AnmInterpolation([1],[9],1,mode);assert.equal(track.sample(1,false),track.start);assert.deepEqual(track.current,[1]);}
});

test('bank collection keeps empty lists and preserves live child order without advancing',()=>{
 const data={format:'th20-anm-v8',name:'collection',entries:[],sprites:[],scripts:[{instructions:[{opcode:3,args:[],mask:0,time:0,offset:0,size:8}]}]};
 const bank=new AnmBank(data),owner=bank.create(0),empty=bank.create(0),child1=owner.spawn(0),child2=owner.spawn(0),child3=owner.spawn(0),detached1=owner.spawn(0,true),detached2=owner.spawn(0,true);
 child2.destroy();detached1.destroy();const children=empty.children,detached=empty.detached,time=child1.time;
 assert.equal(bank.collect(),5);assert.equal(empty.children,children);assert.equal(empty.detached,detached);
 assert.deepEqual(owner.children,[child1,child3]);assert.deepEqual(owner.detached,[detached2]);assert.equal(child1.time,time);
});
