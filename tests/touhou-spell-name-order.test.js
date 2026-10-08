import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AnmBank} from '../packages/thlib/src/touhou/anm.js';
import {TouhouSpell} from '../packages/thlib/src/touhou/spell.js';
import {TouhouTextRenderer} from '../packages/thlib/src/touhou/text-renderer.js';
import {TouhouRenderQueue} from '../packages/thlib/src/touhou/render-queue.js';
import {DrawList} from '../packages/thlib/src/render.js';

const data=name=>JSON.parse(readFileSync(new URL(`../packages/thlib/assets/touhou-common/anm/${name}.json`,import.meta.url)));
function fixture({character=0,viewIndex=0,codePage=932}={}){
  const ascii=new AnmBank(data('ascii_960'),{loadTexture:()=>11});
  const text=new AnmBank(data('text'),{resolveTexture:()=>12});
  const writes=[],calls=[];
  const host={hasSystemFont:()=>false,encodeText:value=>new Uint8Array([...value].reduce((size,char)=>size+(char.charCodeAt(0)>127?2:1),0)),
    rasterizeBitmapText(value,options){
      calls.push({value,options});const {width,height}=options,pixels=options.pixels??new Uint8Array(width*height*4);
      if(!options.pixels)for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
      return{width,height,pixels};
    },updateTextureRegion:(...args)=>writes.push(args)};
  const renderer=new TouhouTextRenderer({host,bank:text});
  const spell=new TouhouSpell({textBank:ascii,playback:true,viewIndex,player:{character,x:0,y:400,bomb:null},
    context:{createNameAnimation:(name,options)=>renderer.createNameAnimation(name,{...options,codePage})}});
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

test('one playfield uses the same original moving spell title for both player characters',()=>{
  const poses=[];
  for(const character of [0,1]){
    const scene=fixture({character,codePage:936});
    try{
      scene.spell.begin({name:'言灵「没有说出口的第一个名字」',duration:600});
      const [plate,title]=scene.spell.info;
      assert.equal(title.scriptId,22,'viewIndex is the session viewport, never the selected character');
      assert.equal(title.spriteIndex,28);assert.equal(title.width,768);assert.equal(title.height,40);
      assert.equal(scene.calls[0].options.codePage,936,'language selection does not select another ANM');
      const sampled=[];
      for(let age=0;age<=120;age++){
        if([0,15,30,60,75,90,120].includes(age)){
          const before=scene.spell.info.map(vm=>vm.snapshot());
          const queue=new TouhouRenderQueue(),draw=new DrawList();scene.spell.draw(queue);
          const entries=queue.entries.slice();queue.flush(draw);
          assert.deepEqual(scene.spell.info.map(vm=>vm.snapshot()),before,'rendering must not advance either animation');
          const entry=entries.find(entry=>entry.order===title.renderOrder);
          if(title.alpha){
            assert.equal(entry.priority,81,'the name remains in the source playfield-UI callback during entrance');
            const command=draw.commands.find(command=>command[0]==='statefulQuad'&&command[1]===12);
            assert.ok(command,'a visible title is submitted while it is still entering, not delayed until stable');
            const point=title.worldPosition({screenScale:1.5});
            assert.equal(command[3],point.x);assert.equal(command[4],point.y);
            assert.deepEqual(command.slice(5,8),[1,336,24],'the title uses the same viewport as its patterned plate');
            assert.equal(command[2][0],Math.fround(-768*Math.fround(title.scaleX*.75)),
              'the actual title quad retains the source animated scale');
            const visible=entries.map(entry=>entry.order);
            if(plate.alpha)assert.ok(visible.indexOf(plate.renderOrder)<visible.indexOf(title.renderOrder),
              'the pattern is submitted below the moving title');
          }
          sampled.push({age,plateY:plate.worldPosition().y,titleY:title.worldPosition().y,
            plateScale:plate.scaleX,titleScale:title.scaleX,alpha:title.alpha});
        }
        if(age<120)scene.spell.update();
      }
      assert.equal(sampled[0].titleY,768);assert.equal(sampled[0].plateY,784);
      assert.ok(sampled[1].titleScale>1&&sampled[1].alpha>0,'the title visibly scales during the opening');
      assert.equal(sampled[2].titleY,768);assert.equal(sampled[2].titleScale,1);
      assert.ok(sampled[4].titleY<768&&sampled[4].titleY>sampled[5].titleY&&sampled[5].titleY>0,
        'the name moves upward with the patterned entrance rather than appearing fixed at the top');
      assert.equal(sampled[6].titleY,0);assert.equal(sampled[6].plateY,16);
      assert.equal(sampled[6].alpha,255);assert.equal(sampled[6].plateScale,1);
      poses.push(sampled);
    }finally{scene.destroy();}
  }
  assert.deepEqual(poses[0],poses[1],'changing the player does not change the viewport title animation');
});

test('the original session-index mapping is retained rather than treating text23 as a character skin',()=>{
  const scene=fixture({viewIndex:1});
  try{
    scene.spell.begin({name:'Secondary context',duration:600});
    const title=scene.spell.info[1];
    assert.equal(title.scriptId,23);assert.equal(title.layer,34);
    const position=title.worldPosition();advance(scene.spell,120);
    assert.deepEqual(title.worldPosition(),position,'text23 has no spell-name entrance motion in the source archive');
  }finally{scene.destroy();}
});
