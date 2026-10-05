import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameStreamDecoder} from '../tools/spellcard-editor/frame-stream.mjs';

function packet(width,height,fill){
  const bytes=Buffer.alloc(16+width*height*4,fill);
  bytes.write('TSFR');bytes.writeUInt32LE(width,4);bytes.writeUInt32LE(height,8);bytes.writeUInt32LE(width*height*4,12);
  return bytes;
}

test('native frame decoder accepts split headers, split pixels and coalesced frames',()=>{
  const source=Buffer.concat([packet(3,2,71),packet(1,4,93)]);
  for(const chunkSize of [1,7,16,19,source.length]){
    const frames=[],decoder=new FrameStreamDecoder(frame=>frames.push(frame));
    for(let at=0;at<source.length;at+=chunkSize)decoder.push(source.subarray(at,at+chunkSize));
    assert.deepEqual(frames.map(({width,height,pixels})=>[width,height,[...pixels]]),[
      [3,2,Array(24).fill(71)],[1,4,Array(16).fill(93)],
    ]);
  }
});

test('native frame decoder emits only a complete payload and owns its output',()=>{
  const frames=[],decoder=new FrameStreamDecoder(frame=>frames.push(frame)),source=packet(2,2,37);
  decoder.push(source.subarray(0,-1));assert.equal(frames.length,0);
  decoder.push(source.subarray(-1));assert.equal(frames.length,1);
  source.fill(0);assert.deepEqual([...frames[0].pixels],Array(16).fill(37));
});

test('native frame decoder rejects malformed headers before allocating pixel payloads',()=>{
  for(const [offset,value] of [[0,0],[4,0],[8,4097],[12,3]]){
    const source=packet(1,1,42);source.writeUInt32LE(value,offset);
    assert.throws(()=>new FrameStreamDecoder(()=>assert.fail('invalid frame emitted')).push(source),/Invalid native frame header/);
  }
});
