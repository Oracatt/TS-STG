import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AnmBank} from '../packages/thlib/src/touhou/anm.js';
import {TouhouSpell} from '../packages/thlib/src/touhou/spell.js';
import {TouhouTextRenderer} from '../packages/thlib/src/touhou/text-renderer.js';
import {TouhouRenderQueue} from '../packages/thlib/src/touhou/render-queue.js';
import {DrawList} from '../packages/thlib/src/render.js';

const data=name=>JSON.parse(readFileSync(new URL(`../packages/thlib/assets/touhou-common/anm/${name}.json`,import.meta.url)));
function fixture(){
  const ascii=new AnmBank(data('ascii_960'),{loadTexture:()=>11});
  const text=new AnmBank(data('text'),{resolveTexture:()=>12});
  const writes=[],calls=[];
  const host={hasSystemFont:()=>false,encodeText:value=>new Uint8Array(value.length),
    rasterizeBitmapText(value,options){
      calls.push({value,options});const {width,height}=options,pixels=options.pixels??new Uint8Array(width*height*4);
      if(!options.pixels)for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
      return{width,height,pixels};
    },updateTextureRegion:(...args)=>writes.push(args)};
  const renderer=new TouhouTextRenderer({host,bank:text});
  const spell=new TouhouSpell({textBank:ascii,playback:true,player:{x:0,y:400,bomb:null},
    context:{createNameAnimation:(name,options)=>renderer.createNameAnimation(name,options)}});
  return{ascii,text,renderer,spell,writes,calls,destroy(){spell.destroy();renderer.dispose();ascii.dispose();text.dispose();}};
}
function advance(spell,frames){for(let i=0;i<frames;i++)spell.update();}
function submittedInfo(spell){
  const queue=new TouhouRenderQueue(),draw=new DrawList();spell.draw(queue);
  assert.equal(queue.entries.length,3,'the original name plate, dynamic text and record plate are independently queued');
  assert.ok(queue.entries.every(entry=>entry.priority===81),'all three retain original layer32 callback priority81');
  queue.flush(draw);
  return draw.commands.filter(command=>command[0]==='statefulQuad');
}

test('spell name plate, fresh dynamic title and record plate submit in the original registration order',()=>{
  const scene=fixture();
  try{
    scene.spell.begin({name:'Reusable Spell',duration:600});advance(scene.spell,150);
    assert.deepEqual(scene.spell.info.map(vm=>[vm.bank===scene.text?'text':'ascii_960',vm.scriptId]),
      [['ascii_960',0],['text',22],['ascii_960',1]]);
    // Actual bank registration and TouhouRenderQueue sorting control these
    // commands; changing the order of spell.info at draw time cannot fix them.
    const commands=submittedInfo(scene.spell);
    assert.equal(commands.length,3);
    assert.deepEqual(commands.map(command=>command[1]),[11,12,11],
      'source card_system/start.cpp registers background0 -> text22 -> record1');
    assert.ok(scene.spell.info.every(vm=>vm.effectiveLayer===32&&vm.alpha===255));
    assert.equal(scene.writes.length,1,'dynamic name pixels are written through the real text renderer');
  }finally{scene.destroy();}
});

test('cached name bitmap creates a new correctly ordered title while the outgoing trio finishes its exit',()=>{
  const scene=fixture();
  try{
    scene.spell.begin({name:'Reusable Spell',duration:600});advance(scene.spell,150);
    const previous=scene.spell.info.slice(),rasterCalls=scene.calls.length;
    scene.spell.finish();scene.spell.begin({name:'Reusable Spell',duration:600});
    const current=scene.spell.info.slice();
    assert.notStrictEqual(current[1],previous[1],'the factory caches bitmap pixels, never a live title VM');
    assert.equal(scene.calls.length,rasterCalls,'the second identical name reuses rasterized bitmap pixels');
    assert.equal(scene.writes.length,2,'each fresh title writes its dynamic sprite region');
    assert.deepEqual(scene.spell.retiredInfo,previous,'the whole outgoing trio retains its existing exit lifetime');
    assert.ok(previous.every(vm=>vm.alive));
    advance(scene.spell,50);
    assert.ok(previous.every(vm=>!vm.alive),'outgoing source ANMs retire after their original exit');
    assert.equal(scene.spell.retiredInfo.length,0);
    advance(scene.spell,100);
    assert.deepEqual(submittedInfo(scene.spell).map(command=>command[1]),[11,12,11],
      'cached pixels do not change the fresh trio registration order');
  }finally{scene.destroy();}
});
