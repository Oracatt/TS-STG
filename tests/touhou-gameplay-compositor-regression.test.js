import test from 'node:test';
import assert from 'node:assert/strict';
import {DrawList} from '@ts-stg/thlib';
import {TouhouGameplayCompositor,TouhouRenderQueue} from '@ts-stg/thlib/touhou';
import {assertRenderScopes} from './fixtures/render-scopes.js';

// Literal scheduler registrations in graphics_callbacks.cpp and
// controller_callbacks.inc, independently specified rather than importing the
// compositor's pass boundaries. Embedded bullet/laser owners are 41/39.
const owners=[['opening',13],['aura',16],['spell-background',27],['laser',39],
  ['bullet',41],['HUD',64],['name',81],['full-screen-overlay',98]];
test('source callback schedule captures only the pre-15 opening; name draws after the final surface copy',()=>{
  const queue=new TouhouRenderQueue(),draw=new DrawList();
  for(const [label,priority] of owners)queue.enqueuePriority(priority,d=>d.push(['fixture-owner',label]));
  const compositor=new TouhouGameplayCompositor({renderTarget:101,compositeTarget:102});
  compositor.draw(draw,queue,{drawDistortion:(d,texture)=>d.push(['fixture-distortion',texture])});
  assertRenderScopes(draw.commands);
  let target=null,clip=null;
  const records=[];
  for(const c of draw.commands){
    if(c[0]==='targetBegin')target=c[1];else if(c[0]==='targetEnd')target=null;
    else if(c[0]==='scissor')clip=c.slice(1);else if(c[0]==='scissorEnd')clip=null;
    else if(c[0].startsWith('fixture-'))records.push({kind:c[0],label:c[1],target,clip});
  }
  assert.deepEqual(records.map(r=>[r.label,r.target]),[
    ['opening',101],[101,102],['aura',102],['spell-background',101],['laser',101],
    ['bullet',101],['HUD',102],['name',null],['full-screen-overlay',null],
  ]);
  const gameplayCamera=[24,0,624,720],playfield=[48,24,576,672];
  for(const label of ['opening','aura','spell-background','laser','bullet'])
    assert.deepEqual(records.find(r=>r.label===label).clip,gameplayCamera,label);
  assert.deepEqual(records.find(r=>r.label==='name').clip,playfield);
  for(const label of ['HUD','full-screen-overlay'])assert.equal(records.find(r=>r.label===label).clip,null);
  assert.deepEqual(draw.commands.filter(c=>c[0]==='sprite').map(c=>c[1]),[101,102,101,102]);
});

test('source pass transfers replace both color and alpha and never sample the active target',()=>{
  const queue=new TouhouRenderQueue(),draw=new DrawList(),comp=new TouhouGameplayCompositor({renderTarget:501,compositeTarget:502});
  for(const priority of [5,13,16,24,27,46,49,65,68,81])queue.enqueuePriority(priority,d=>d.rect(priority,0,1,1,0xffffffff));
  comp.draw(draw,queue);
  let active=null;
  for(let i=0;i<draw.commands.length;i++){
    const c=draw.commands[i];if(c[0]==='targetBegin')active=c[1];else if(c[0]==='targetEnd')active=null;
    if(c[0]==='sprite'){
      assert.notEqual(c[1],active,'Feedback would sample an unfinished surface');
      assert.deepEqual(draw.commands[i-1],['blendFactors','one','zero','add','one','zero','add']);
      assert.deepEqual(draw.commands[i+1],['blendEnd']);
    }
  }
  assert.equal(queue.entries.length,0);assertRenderScopes(draw.commands);
});
