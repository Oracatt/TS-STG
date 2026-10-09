import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AnmBank,TouhouTextRenderer} from '../packages/thlib/dist/touhou/index.js';

test('source text keeps CP932 by default and isolates caller-selected Chinese bitmap caches',()=>{
  const calls=[],writes=[],bank=new AnmBank(JSON.parse(readFileSync(new URL('../packages/thlib/assets/touhou-common/anm/text.json',import.meta.url))),{resolveTexture:()=>1});
  const host={hasSystemFont:()=>false,encodeText:(text,codePage)=>new Uint8Array(codePage===936?4:2),
    rasterizeBitmapText(text,options){calls.push(options);const {width,height}=options,pixels=options.pixels??new Uint8Array(width*height*4);
      if(!options.pixels)for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
      return{width,height,pixels};},updateTextureRegion:(...args)=>writes.push(args)};
  const renderer=new TouhouTextRenderer({host,bank});
  renderer.createNameAnimation('跃动');renderer.createNameAnimation('跃动',{codePage:936});renderer.createNameAnimation('跃动',{codePage:936});
  assert.deepEqual(calls.map(call=>call.codePage),[932,932,936,936]);assert.notEqual(calls[0].x,calls[2].x);
  assert.equal(writes.length,3);assert.equal(writes[0][1],0);assert.equal(writes[0][2],1208);
  renderer.dispose();bank.dispose();
});
