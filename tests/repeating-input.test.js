import test from 'node:test';import assert from 'node:assert/strict';
import {RepeatingInput} from '../packages/thlib/dist/repeating-input.js';

test('repeat channels have independent delay/period and exact first-repeat frames',()=>{
 const input=new RepeatingInput({channels:{fast:{delay:3,interval:2},slow:{delay:6,interval:11},immediate:{delay:0,interval:4}},defaultChannel:'fast'});
 const frames={fast:[],slow:[],immediate:[]};
 for(let frame=1;frame<=30;frame++){
  input.update(1);for(const name of Object.keys(frames))if(input.repeat(1,name,false))frames[name].push(frame);
  assert.equal(input.justPressed(1),frame===1);assert.equal(input.down(1),true);
 }
 assert.deepEqual(frames.fast,[4,6,8,10,12,14,16,18,20,22,24,26,28,30]);
 assert.deepEqual(frames.slow,[7,18,29]);assert.deepEqual(frames.immediate,[1,5,9,13,17,21,25,29]);
});

test('release/repress resets each key independently and reset produces no phantom edge',()=>{
 const input=new RepeatingInput({delay:2,interval:2});
 input.update(1);assert.equal(input.repeat(1),true);assert.equal(input.repeat(1,undefined,false),false);
 input.update(3);assert.equal(input.pressed,2);assert.equal(input.repeat(3),true);
 input.update(3);assert.equal(input.repeatMask(),1);assert.deepEqual([...input.held.slice(0,2)],[3,2]);
 input.update(2);assert.equal(input.released,1);assert.equal(input.justReleased(1),true);assert.equal(input.repeatMask(),2);
 input.update(3);assert.equal(input.pressed,1);assert.equal(input.held[0],1);assert.equal(input.repeatMask()&1,0);
 input.reset();assert.equal(input.current|input.previous|input.pressed|input.released|input.repeatMask(),0);assert.ok(input.held.every(n=>n===0));
 input.update(0);assert.equal(input.released,0);
});

test('unsigned input/counters and signed edge masks preserve bit31 and wraparound',()=>{
 const input=new RepeatingInput({delay:25,interval:8}),bit=0x80000000;
 input.update(bit);assert.equal(input.current,bit);assert.equal(input.pressed,-2147483648);assert.equal(input.repeat(bit),true);
 input.held[31]=0xffffffff;input.channels.default.counters[31]=0xffffffff;
 input.update(bit);assert.equal(input.held[31],0);assert.equal(input.channels.default.counters[31],0);assert.equal(input.repeatMask(),0);
 input.update(0);assert.equal(input.released,-2147483648);assert.equal(input.current,0);
 input.update(-1);assert.equal(input.current,0xffffffff);assert.equal(input.pressed,-1);
 input.update(0x100000001);assert.equal(input.current,1);assert.equal(input.released,-2);
});

test('configurations are copied per instance and invalid channels fail explicitly',()=>{
 const definitions={navigation:{delay:3,interval:2}},a=new RepeatingInput({channels:definitions}),b=new RepeatingInput({channels:definitions});
 definitions.navigation.delay=100;a.update(1);a.update(1);a.update(1);a.update(1);
 assert.equal(a.repeatMask(),1);assert.equal(b.repeatMask(),0);assert.notEqual(a.channels.navigation.counters,b.channels.navigation.counters);
 for(const options of [{delay:-1},{delay:1.5},{interval:0},{interval:0x100000000},{channels:{}},{channels:{x:{}},defaultChannel:'missing'}])assert.throws(()=>new RepeatingInput(options),RangeError);
 assert.throws(()=>a.repeatMask('missing'),RangeError);
});

test('business adapter retains source25 delay with 8/12 cadence and old32bit counters',async()=>{
 const {Th20Buttons}=await import('../games/touhou20/src/menu.js');
 const buttons=new Th20Buttons(),repeat8=[],repeat12=[];
 assert.ok(buttons instanceof RepeatingInput);
 for(let frame=1;frame<=60;frame++){buttons.update(1);if(buttons.repeat8)repeat8.push(frame);if(buttons.repeat12)repeat12.push(frame);}
 assert.deepEqual(repeat8,[26,34,42,50,58]);assert.deepEqual(repeat12,[26,38,50]);
 // Independent transcription of input/input_state.cpp::update_buttons,
 // restricted to the fields previously exposed by the game adapter.
 const reference={current:0,previous:0,pressed:0,released:0,repeat8:0,repeat12:0,count8:new Uint32Array(32),count12:new Uint32Array(32),held:new Uint32Array(32)};
 const update=mask=>{
  reference.previous=reference.current;reference.current=mask>>>0;reference.repeat8=reference.repeat12=0;
  for(let i=0;i<32;i++){const bit=1<<i;if(!(mask&bit)){reference.count8[i]=reference.count12[i]=reference.held[i]=0;}else{
   reference.count8[i]++;reference.count12[i]++;reference.held[i]++;
   if(reference.count8[i]>25){reference.repeat8|=bit;reference.count8[i]-=8;}
   if(reference.count12[i]>25){reference.repeat12|=bit;reference.count12[i]-=12;}
  }}
  reference.pressed=(reference.current^reference.previous)&reference.current;reference.released=(reference.current^reference.previous)&~reference.current;
 };
 buttons.reset();let mask=0xffffffff,seed=7;
 for(let frame=0;frame<2000;frame++){
  if(frame%47===0){seed=(Math.imul(seed,1664525)+1013904223)>>>0;mask=seed;}
  if(frame%113===0)mask=0;
  if(frame===1000){buttons.count8[31]=reference.count8[31]=0xffffffff;buttons.count12[31]=reference.count12[31]=0xffffffff;buttons.held[31]=reference.held[31]=0xffffffff;mask|=0x80000000;}
  buttons.update(mask);update(mask);
  for(const field of ['current','previous','pressed','released','repeat8','repeat12','count8','count12','held'])assert.deepEqual(buttons[field],reference[field],`frame${frame} ${field}`);
 }
});
