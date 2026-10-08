import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AnmBank,TouhouDialogue,createTouhouResources,anmSpriteVertices,TOUHOU_DIALOGUE_PORTRAITS} from '../packages/thlib/src/touhou/index.js';
import {DrawList} from '../packages/thlib/src/index.js';
import {f32,add,mul} from '../packages/thlib/src/touhou/math.js';

const tick=(owner,count)=>{for(let i=0;i<count;i++)owner.update(0);};
const descendants=vm=>vm?[...vm.children,...vm.children.flatMap(descendants)]:[];
const find=(vm,script)=>descendants(vm).find(child=>child.scriptId===script);
const shown={left:{present:true,emotion:'NOTICE'},right:{present:true}};
const hidden={left:{present:false},right:{present:false}};
function fixture(){
  let handle=0;const writes=[],textures=new Map(),banks=[];
  const host={readText:file=>fs.readFileSync(file,'utf8'),loadTexture:file=>{if(!textures.has(file))textures.set(file,++handle);return textures.get(file);},
    createTexture:()=>++handle,unloadTexture(){},encodeText:text=>new Uint8Array([...text].reduce((sum,ch)=>sum+(ch.codePointAt(0)>127?2:1),0)),
    hasSystemFont:()=>false,rasterizeBitmapText:(text,options)=>{writes.push(text);return{width:options.width,height:options.height,pixels:options.pixels??new Uint8Array(options.width*options.height*4)};},updateTextureRegion(){}};
  const resources=createTouhouResources(host),createBank=resources.createBank.bind(resources);
  resources.createBank=name=>{const bank=createBank(name);banks.push(bank);return bank;};
  return{resources,writes,textures,banks};
}
function sourceRight(dialogue){
  const bank=new AnmBank({...dialogue.rightPortraitBank.data,scripts:dialogue.rightPortraitBank.scripts});
  const body=bank.create(62,{x:496,front:true});body.interruptNow(3,true);return{bank,body};
}
function sameMotion(actual,expected,label){
  assert.equal(actual.alive,expected.alive,`${label}: lifetime`);
  if(expected.alive){assert.deepEqual(actual.worldPosition({screenScale:1}),expected.worldPosition({screenScale:1}),`${label}: source position`);assert.equal(actual.color,expected.color,`${label}: source shade/alpha`);}
}

test('actor balloons select the actual mode2 single/double-line ANMs without creating portraits',()=>{
  const f=fixture();
  try{
    for(const boxStyle of [0,1,3])for(const twoLine of [false,true]){
      const dialogue=new TouhouDialogue({resources:f.resources,steps:[{speaker:'right',boxMode:2,boxStyle,x:496,y:128,text:twoLine?'A voice\nA reply':'A voice',portraits:hidden}]});
      try{
        assert.equal(dialogue.mode,2);assert.equal(dialogue.boxType,boxStyle*3+2+(twoLine?24:0));
        assert.equal(dialogue.box.scriptId,272+boxStyle*3+(twoLine?24:0));
        assert.equal(dialogue.box.x,496);assert.equal(dialogue.box.y,128);
        assert.equal(dialogue.portrait,undefined);assert.equal(dialogue.rightPortraitMotion,undefined);
        assert.equal(dialogue.portraitState('left'),null);assert.equal(dialogue.portraitState('right'),null);
        tick(dialogue,12);const draw=new DrawList();dialogue.draw(draw);
        assert.ok(draw.commands.some(command=>command[0]==='statefulQuad'),'The selected source bubble actually paints');
        assert.ok([...f.textures.keys()].every(file=>!file.includes('/pl00/')&&!file.includes('/pl01/')),'No player/right portrait texture is requested');
      }finally{dialogue.dispose();}
    }
  }finally{f.resources.dispose();}
});

test('actor arrow orientation/anchors and growing text position match independent common ANMs at every frame',()=>{
  const f=fixture();
  try{
    for(const twoLine of [false,true]){
      const dialogue=new TouhouDialogue({resources:f.resources,steps:[{speaker:'right',boxMode:2,x:496,y:128,text:twoLine?'A voice beyond the leaves\nAn echo':'A voice beyond the leaves'}]});
      const source=f.resources.createBank('front'),root=source.create(twoLine?296:272,{x:496,y:128});
      const sourceText=f.resources.createBank('text'),textRows=[sourceText.create(20),sourceText.create(20)];textRows[1].interruptNow(7);
      for(const [index,vm]of textRows.entries()){
        vm.interruptNow(3);f.resources.writeAnimationText(vm,index?'An echo':'A voice beyond the leaves',
          {font:4,color:0x000000,shadowColor:0x20000000,outlineScale:f32(.6000000238418579),codePage:932});vm.interruptNow(2);
      }
      for(const child of descendants(root))child.F(0x454,add(dialogue.boxWidth,16));
      try{
        for(let frame=0;frame<=12;frame++){
          if(frame===6){dialogue.box.x+=64;dialogue.box.y+=24;root.x+=64;root.y+=24;}
          if(frame){dialogue.update();source.update();sourceText.update();}
          const arrow=find(dialogue.box,twoLine?266:262),expectedArrow=find(root,twoLine?266:262),body=find(root,twoLine?192:168);
          assert.equal(arrow.spriteIndex,twoLine?147:135,'Use the original upper-pointing actor tail, not a portrait-side tail');
          assert.equal(arrow.rotation,0);assert.equal(arrow.scaleX,1);assert.equal(arrow.scaleY,1,'Do not mirror the source upper-pointing arrow');
          assert.deepEqual(arrow.worldPosition({screenScale:1}),{x:root.x/2+16,y:root.y/2+(twoLine?0:-1),z:0},'Raw MSG28 anchor retains original tail offsets');
          assert.deepEqual(anmSpriteVertices(arrow,{screenScale:1.5}),anmSpriteVertices(expectedArrow,{screenScale:1.5}),`Actual source arrow vertices/UV frame ${frame}`);
          const p=body.worldPosition({screenScale:1}),x=add(add(mul(add(body.scaleX,.125),16),-6),mul(p.x,2)),y=mul(p.y,2);
          assert.ok(dialogue.texts.every(vm=>vm.x===x&&vm.y===y),`Mode2 text follows the source growing body at frame ${frame}`);
          if(twoLine)assert.equal(dialogue.texts[1].worldPosition({screenScale:1}).y-dialogue.texts[0].worldPosition({screenScale:1}).y,
            textRows[1].worldPosition({screenScale:1}).y-textRows[0].worldPosition({screenScale:1}).y,'The second line retains its independent source text offset/animation');
        }
      }finally{dialogue.dispose();source.dispose();sourceText.dispose();}
    }
  }finally{f.resources.dispose();}
});

test('omitted box mode preserves legacy left/right anchors and explicit modes 0/1',()=>{
  const f=fixture();
  try{
    for(const speaker of ['left','right'])for(const twoLine of [false,true]){
      const step={speaker,text:twoLine?'First\nSecond':'First'},mode=speaker==='left'?0:1;
      const legacy=new TouhouDialogue({resources:f.resources,steps:[step]}),explicit=new TouhouDialogue({resources:f.resources,steps:[{...step,boxMode:mode}]});
      try{
        assert.equal(legacy.box.scriptId,270+mode+(twoLine?24:0));assert.equal(legacy.box.x,mode===0?232:720);assert.equal(legacy.box.y,480);
        for(let frame=0;frame<12;frame++){
          assert.deepEqual(legacy.box.snapshot(),explicit.box.snapshot());assert.deepEqual(legacy.texts.map(vm=>[vm.x,vm.y]),explicit.texts.map(vm=>[vm.x,vm.y]));legacy.update();explicit.update();
        }
      }finally{legacy.dispose();explicit.dispose();}
    }
  }finally{f.resources.dispose();}
});

test('actor mode makes both native and custom portraits inactive independently of speaker identity',()=>{
  const f=fixture(),steps=[{speaker:'left',text:'Portrait',portraits:shown},{speaker:'right',boxMode:2,text:'Actor',portraits:shown}];
  const native=new TouhouDialogue({resources:f.resources,steps}),calls=[];
  const custom=new TouhouDialogue({resources:f.resources,steps,createPortrait:side=>({draw(){},setActive:active=>calls.push([side,active])})});
  try{
    tick(native,20);assert.equal(native.portraitMotion.layer,36);assert.equal(native.rightPortraitMotion.layer,35);
    native.advance();custom.advance();assert.equal(native.portraitMotion.layer,35);assert.equal(native.rightPortraitMotion.layer,35);
    assert.deepEqual(calls,[['left',true],['right',false],['left',false],['right',false]]);
  }finally{native.dispose();custom.dispose();f.resources.dispose();}
});

test('explicit absent portraits run the original pending exits once and omitted presence cannot reactivate tails',()=>{
  for(const character of [0,1]){
    const f=fixture(),profile=character?TOUHOU_DIALOGUE_PORTRAITS.marisa:TOUHOU_DIALOGUE_PORTRAITS.reimu;
    const dialogue=new TouhouDialogue({resources:f.resources,character,steps:[{speaker:'left',text:'Portraits',portraits:shown},
      {speaker:'left',boxMode:2,text:'Actor',portraits:hidden},{speaker:'right',boxMode:2,text:'Still actor',portraits:hidden},
      {speaker:'left',text:'No new portrait request'}]});
    const leftSource=f.resources.createBank(character?'pl01':'pl00'),left=leftSource.create(profile.root),leftBody=find(left,profile.body);
    left.interruptNow(17,true);left.interruptNow(2,true);const right=sourceRight(dialogue);
    try{
      tick(dialogue,20);tick(leftSource,20);tick(right.bank,20);dialogue.advance();left.interrupt(1,true);right.body.interrupt(1,true);
      for(let frame=0;frame<=31;frame++){
        if(frame){dialogue.update();leftSource.update();right.bank.update();}
        if(frame===8)dialogue.advance(); // A repeated false must not reset an in-progress exit.
        if(frame===16)dialogue.advance(); // Omitted presence keeps both sides absent.
        sameMotion(dialogue.portraitMotion,leftBody,`left ${character} frame ${frame}`);sameMotion(dialogue.rightPortraitMotion,right.body,`right ${character} frame ${frame}`);
        assert.equal(dialogue.portraitState('left')!==null,leftBody.alive);assert.equal(dialogue.portraitState('right')!==null,right.body.alive);
        if(frame===8){const draw=new DrawList();dialogue.draw(draw);const ids=new Set([...dialogue.portraitBank.textures.values()]);assert.ok(draw.commands.some(command=>command[0]==='statefulQuad'&&ids.has(command[1])),'The native player exit tail remains actually drawable');}
      }
      assert.equal(dialogue.portraitMotion.alive,false);assert.equal(dialogue.rightPortraitMotion.alive,false);
    }finally{dialogue.dispose();leftSource.dispose();right.bank.dispose();f.resources.dispose();}
  }
});

test('quick portrait re-entry uses fresh native templates and disposes the old right motion bank',()=>{
  const f=fixture(),dialogue=new TouhouDialogue({resources:f.resources,steps:[{speaker:'left',text:'Before',portraits:shown},
    {speaker:'right',boxMode:2,text:'Hidden',portraits:hidden},{speaker:'left',text:'Return',portraits:shown},{speaker:'right',text:'Remain',portraits:shown}]});
  try{
    tick(dialogue,20);const left=dialogue.portrait,right=dialogue.rightPortraitMotion,rightBank=dialogue.rightPortraitBank;
    dialogue.advance();tick(dialogue,5);assert.ok(left.alive&&right.alive,'Re-entry is tested during the actual unfinished exit');
    dialogue.advance();assert.notEqual(dialogue.portrait,left);assert.equal(left.alive,false);
    assert.notEqual(dialogue.rightPortraitMotion,right);assert.equal(rightBank.disposed,true);assert.equal(right.alive,false);
    const source=f.resources.createBank('pl00'),sourceRoot=source.create(66);sourceRoot.interruptNow(17,true);sourceRoot.interruptNow(2,true);
    sameMotion(dialogue.portraitMotion,find(sourceRoot,62),'Re-entry is a fresh source entrance rather than the old exit PC');source.dispose();
    const freshLeft=dialogue.portrait,freshRightBank=dialogue.rightPortraitBank;dialogue.advance();
    assert.equal(dialogue.portrait,freshLeft,'Repeated true preserves the existing portrait');assert.equal(dialogue.rightPortraitBank,freshRightBank);
    assert.equal(f.banks.filter(bank=>bank===rightBank&&!bank.disposed).length,0);
  }finally{dialogue.dispose();f.resources.dispose();}
});

test('custom presence hooks own fades; legacy custom portraits hide draw/state while retaining update/dispose ownership',()=>{
  for(const withHook of [false,true]){
    const f=fixture(),calls={presence:[],active:[],step:0,update:0,finish:0,dispose:0},state={x:0,y:0,width:10,height:10,color:0xffffff,alpha:255,layer:35};
    const dialogue=new TouhouDialogue({resources:f.resources,exit:'beforeBoss',steps:[{speaker:'left',text:'First',portraits:{left:{present:true}}},
      {speaker:'left',boxMode:2,text:'Hidden',portraits:{left:{present:false}}},{speaker:'right',boxMode:2,text:'Again',portraits:{left:{present:false}}},
      {speaker:'left',text:'Return',portraits:{left:{present:true}}}],createPortrait:()=>({draw:draw=>draw.push(['custom-portrait']),
        ...(withHook?{setPresent:present=>calls.presence.push(present)}:{}),state:()=>state,setStep:()=>calls.step++,setActive:active=>calls.active.push(active),
        update:()=>calls.update++,finish:()=>calls.finish++,dispose:()=>calls.dispose++})});
    try{
      const custom=dialogue.customPortraits.left;dialogue.advance();tick(dialogue,5);dialogue.advance();
      assert.deepEqual(calls.active,[true],'Hidden custom portraits do not receive activation');assert.equal(calls.step,1,'Hidden custom portraits do not receive new emotion/step poses');
      assert.equal(calls.update,5);assert.equal(calls.finish,0,'A side disappearing is not a conversation finish');
      assert.equal(dialogue.portraitState('left'),withHook?state:null);
      const draw=new DrawList();dialogue.draw(draw);assert.equal(draw.commands.some(command=>command[0]==='custom-portrait'),withHook);
      dialogue.advance();assert.equal(dialogue.customPortraits.left,custom);assert.equal(dialogue.portraitState('left'),state);
      assert.deepEqual(calls.presence,withHook?[true,false,true]:[]);assert.deepEqual(calls.active,[true,true]);
      dialogue.finish();assert.equal(calls.finish,1);dialogue.dispose();assert.equal(calls.dispose,1);
    }finally{dialogue.dispose();f.resources.dispose();}
  }
});

test('a later staged actor step leaves the old line, reveals at60 and opens input at94 with ordered side effects',()=>{
  const f=fixture(),events=[],timing={portraitFrame:0,speakerFrame:0,textFrame:60,inputFrame:94};
  const dialogue=new TouhouDialogue({resources:f.resources,steps:[{speaker:'left',text:'Existing player line',portraits:{left:{present:true}}},
    {speaker:'right',boxMode:2,text:'The voice from above',x:496,y:128,portraits:hidden,entrance:timing,events:[
      {type:'appear',entranceStage:'portraits'},{type:'active',entranceStage:'speaker'},{type:'text'}]},
    {speaker:'left',text:'Player returns',portraits:{left:{present:true}}}],onEvent:(event,_step,owner)=>events.push([event.type,owner.entranceState.frame])});
  try{
    tick(dialogue,20);const oldBox=dialogue.box;dialogue.advance();assert.equal(oldBox.alive,false);assert.equal(dialogue.box,null);
    assert.deepEqual(dialogue.snapshot().lines,[]);assert.deepEqual(events,[['appear',0],['active',0]]);assert.equal(dialogue.advance(),false);
    const before=f.writes.length;tick(dialogue,59);assert.equal(dialogue.box,null);assert.equal(f.writes.length,before,'No next-line surface is written before its authored reveal');
    assert.equal(dialogue.portraitState('left'),null,'The source player exit has completed before the actor voice appears');
    const empty=new DrawList();dialogue.draw(empty);assert.equal(empty.commands.length,0,'Between portrait exit and text reveal the scene is truly empty');
    dialogue.update();assert.equal(dialogue.box.scriptId,272);assert.ok(f.writes.includes('The voice from above'));assert.deepEqual(events.at(-1),['text',60]);
    tick(dialogue,33);assert.equal(dialogue.entranceState.frame,93);assert.equal(dialogue.advance(),false);
    dialogue.update();assert.equal(dialogue.entranceState.frame,94);assert.equal(dialogue.entranceState.inputReady,true);assert.equal(dialogue.advance(),true);
    assert.equal(dialogue.index,2);assert.equal(dialogue.entranceState,null,'Later ordinary steps retain immediate legacy entry');assert.equal(dialogue.box.scriptId,270);assert.ok(dialogue.portraitMotion.alive);
  }finally{dialogue.dispose();f.resources.dispose();}
});

test('per-step entrance overrides are validated and explicit null preserves immediate entry',()=>{
  const f=fixture(),owners=[];
  try{
    const immediate=new TouhouDialogue({resources:f.resources,entrance:'afterBoss',steps:[{text:'Immediate',speaker:'left',entrance:null}]});owners.push(immediate);
    assert.equal(immediate.entranceState,null);assert.equal(immediate.box.scriptId,270);
    for(const boxMode of [-1,3,'2',null])assert.throws(()=>new TouhouDialogue({resources:f.resources,steps:[{text:'Invalid',boxMode}]}),/box mode/);
    const invalid=new TouhouDialogue({resources:f.resources,steps:[{text:'Valid'},{text:'Invalid',entrance:{portraitFrame:0,speakerFrame:4,textFrame:3,inputFrame:94}}]});owners.push(invalid);
    assert.throws(()=>invalid.advance(),/entrance/);
  }finally{for(const owner of owners)owner.dispose();f.resources.dispose();}
});
