import test from 'node:test';
import assert from 'node:assert/strict';
import {SpellCardPreviewModel} from '../tools/spellcard-editor/preview.js';
import {createTouhouSpellCard} from '../packages/thlib/src/touhou/spellcard.js';

// Authored stationary ANM stubs isolate geometry and lifecycle from local media.
// Gameplay still runs through the real public ANM VM, bullets and laser owners.
function archive(name){return{format:'touhou-anm-v8',name,
  entries:[{index:0,width:16,height:16,texture:{path:'fixture.png'}}],
  sprites:Array.from({length:700},(_,index)=>({index,entry:0,width:8,height:8,x:0,y:0})),
  scripts:Array.from({length:340},(_,index)=>({index,entry:0,instructions:[{offset:0,opcode:2,time:0,mask:0,args:[]}]}))};}
function fixture(){
  const doc={...createTouhouSpellCard(),duration:120,events:[
    {...createTouhouSpellCard().events[1],id:'random',frame:0,duration:120,interval:4,count:5,pattern:8,speed:1,speedStep:1,angleStep:.2},
    {id:'move',type:'move',frame:0,duration:30,x:24,y:96,easing:'smooth'},
    {id:'laser',type:'laser',frame:3,duration:1,interval:1,x:0,y:0,origin:'boss',kind:'infinite',color:4,angle:Math.PI/2,
      rotation:0,speed:0,width:8,length:100,delay:2,grow:2,sustain:80,shrink:5},
  ]};
  return new SpellCardPreviewModel(doc,{bulletArchive:archive('bullet'),effectArchive:archive('effect')});
}

test('geometry preview seek reconstructs the same fixed-frame world and seed as forward stepping',async()=>{
  const direct=fixture(),seeked=fixture();
  try{
    for(let i=0;i<53;i++)direct.step();assert.equal(await seeked.seek(53),true);
    assert.deepEqual(seeked.snapshot(),direct.snapshot());assert.ok(direct.bullets.length>0);assert.ok(direct.lasers.length>0);
    assert.ok(direct.laserSegments().every(segment=>Object.values(segment).every(Number.isFinite)));
    const expected=seeked.snapshot();assert.equal(await seeked.seek(10),true);assert.equal(await seeked.seek(53),true);
    assert.deepEqual(seeked.snapshot(),expected,'backward seeks reconstruct rather than mutate an old frame');
  }finally{direct.dispose();seeked.dispose();}
});

test('target edits are clamped, retained by resets and used by the shared aimed emitter',async()=>{
  const model=fixture();try{
    model.setTarget(999,-100);assert.deepEqual(model.player,{x:192,y:0});
    await model.seek(0);assert.deepEqual(model.player,{x:192,y:0});
    assert.throws(()=>model.setTarget(NaN,0),/finite/);
    model.document.events=[{...createTouhouSpellCard().events[1],id:'aim',frame:0,duration:1,interval:1,pattern:0,count:1,rotation:0}];
    model.reset();model.step();const bullet=model.bullets[0];assert.ok(bullet.vx>0);assert.ok(bullet.vy<0);
  }finally{model.dispose();}
});

test('new seeks supersede pending seeks and aborting a seek never reaches its abandoned target',async()=>{
  const model=fixture();try{
    const old=model.seek(110),newer=model.seek(5);assert.equal(await newer,true);assert.equal(await old,false);assert.equal(model.frame,5);
    const controller=new AbortController(),pending=model.seek(110,{signal:controller.signal});controller.abort();
    assert.equal(await pending,false);assert.ok(model.frame<110);
  }finally{model.dispose();}
});

test('preview disposal cancels an in-flight seek and retains released animation banks',async()=>{
  const model=fixture(),pending=model.seek(110),bulletBank=model.bulletBank,effectBank=model.effectBank;
  model.dispose();assert.equal(await pending,false);assert.equal(bulletBank.disposed,true);assert.equal(effectBank.disposed,true);
  const frame=model.frame;model.step();assert.equal(model.frame,frame);model.dispose();
});
