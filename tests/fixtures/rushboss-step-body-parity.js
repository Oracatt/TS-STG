// SPDX-License-Identifier: GPL-3.0-only
// Portable frozen-implementation oracle, exercised by Node and actual QuickJS.
import {stepBody} from '../../games/rushboss/src/runtime.js';
import {referenceStepBody} from './rushboss-step-body-reference.js';
const memory=new DataView(new ArrayBuffer(4)),f=Math.fround;
const bits=value=>{memory.setFloat32(0,value,true);return memory.getUint32(0,true);};
const value=word=>{memory.setUint32(0,word,true);return memory.getFloat32(0,true);};
export function verifyStepBodyParity(){
  let cases=0,ticks=0,words=0,nanValues=0,seed=0x5413e74a,hash=0x811c9dc5;
  const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const check=(body,frames,label)=>{
    const actual={...body},expected={...body};cases++;
    for(let frame=0;frame<frames;frame++){
      stepBody(actual);referenceStepBody(expected);ticks++;
      for(const key of['x','y','vx','vy']){
        // JavaScript does not specify which NaN operand payload an arithmetic
        // operation propagates. Distinct but identical old functions can pick
        // different payloads after JIT compilation. Compare NaN presence and
        // use one canonical NaN only in this cross-runtime checksum.
        if(Number.isNaN(actual[key])||Number.isNaN(expected[key])){
          if(!Number.isNaN(actual[key])||!Number.isNaN(expected[key]))throw Error(`${label} frame ${frame} ${key}: NaN classification changed`);
          nanValues++;hash=Math.imul(hash^0x7fc00000,0x01000193)>>>0;continue;
        }
        const a=bits(actual[key]),b=bits(expected[key]);words++;
        if(a!==b)throw Error(`${label} frame ${frame} ${key}: ${a.toString(16)} != ${b.toString(16)}`);
        hash=Math.imul(hash^a,0x01000193)>>>0;
      }
    }
  };
  // Exhaust all signs for velocity, force and scalar/vector drag, including
  // the exact -0 + -0 cases that a simple unchanged-velocity shortcut loses.
  for(let signs=0;signs<64;signs++){
    const zeros=Array.from({length:6},(_,i)=>signs&(1<<i)?-0:0);
    for(const [x,y]of[[0,0],[-0,-0],[31.5,-47.25]]){
      const [vx,vy,fx,fy,dx,dy]=zeros;
      check({x,y,vx,vy,fx,fy,drag:{x:dx,y:dy}},4,`signed zero ${signs}`);
      if(Object.is(dx,dy))check({x,y,vx,vy,fx,fy,drag:dx},4,`scalar signed zero ${signs}`);
    }
  }
  const edge=[0,-0,Number.MIN_VALUE,-Number.MIN_VALUE,value(1),value(0x80000001),value(0x007fffff),value(0x807fffff),
    value(0x00800000),value(0x80800000),1,-1,123.456,-987.654,1e16,1e16+2,-1e16,-1e16-2,
    value(0x7f7fffff),value(0xff7fffff),Infinity,-Infinity,NaN,value(0x7fc01234)];
  for(let x=0;x<edge.length;x++)for(let y=0;y<edge.length;y++)for(let signs=0;signs<16;signs++){
    const fx=signs&1?-0:0,fy=signs&2?-0:0,dx=signs&4?-0:0,dy=signs&8?-0:0;
    check({x:31.25,y:-19.75,vx:edge[x],vy:edge[y],fx,fy,drag:{x:dx,y:dy}},2,`edge ${x}/${y}/${signs}`);
  }
  // Float32 lane values plus ordinary source-sized trajectories; nonzero
  // drag/force and values outside the conservative range use the old path.
  for(let index=0;index<20000;index++){
    const raw=index&1,vx=raw?value(next()):f((next()/0x100000000-.5)*5000),vy=raw?value(next()):f((next()/0x100000000-.5)*5000);
    const forced=index%5===0,dragged=index%7===0;
    const body={x:f((next()/0x100000000-.5)*600),y:f((next()/0x100000000-.5)*500),vx,vy,
      fx:forced?f((next()/0x100000000-.5)*2000):index&2?-0:0,
      fy:forced?f((next()/0x100000000-.5)*2000):index&4?-0:0,
      drag:dragged?f((next()/0x100000000-.5)*30):index&8?-0:0};
    if(index%11===0){delete body.drag;delete body.fx;delete body.fy;}
    check(body,raw?1:4,`random ${index}`);
  }
  return{cases,ticks,words,nanValues,mismatches:0,hash:hash.toString(16).padStart(8,'0'),scope:'Frozen original JS MoveBody versus fast path; every non-NaN float32 word, all zero signs, subnormals, finite-range boundaries, overflow/Infinity fallback and deterministic random lanes. NaN presence is exact; arithmetic payload propagation is unspecified by JavaScript.'};
}
let report;
globalThis.__tsstg_game={update(){report??=verifyStepBodyParity();},render(){return[];},snapshot(){return report;}};
