import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AnmBank } from '../games/touhou20/src/anm.js';
import { DrawList } from '../packages/thlib/dist/render.js';
import {expandDrawCommands} from './fixtures/th20/quad.js';
const data=JSON.parse(fs.readFileSync(new URL('../games/touhou20/assets/anm/pl00.json',import.meta.url)));

test('all original D3D blend states retain the separate alpha equation',()=>{
  // sprite_renderer/render_state.cpp9-12: D3DBLEND values, mapped by name.
  const expected=[['srcAlpha','oneMinusSrcAlpha','add'],['srcAlpha','one','add'],
    ['srcAlpha','one','reverseSubtract'],['one','zero','add'],
    ['oneMinusDstColor','oneMinusSrcColor','add'],['dstColor','zero','add'],
    ['oneMinusSrcColor','oneMinusSrcAlpha','add'],['dstAlpha','oneMinusDstAlpha','add'],
    ['srcAlpha','one','min'],['srcAlpha','one','max']];
  const bank=new AnmBank(data,{loadTexture:()=>1});
  for(let mode=0;mode<10;mode++){
    const vm=bank.create(0),draw=new DrawList();vm.B(0x499,mode);vm.draw(draw);
    const expanded=expandDrawCommands(draw.commands);
    assert.deepEqual(expanded.find(c=>c[0]==='blendFactors'),['blendFactors',...expected[mode],'one','zero','add']);
    assert.deepEqual(expanded.filter(c=>c[0]==='alphaTest'),[['alphaTest',mode===3?0:1/255],['alphaTest',0]]);
  }
});
