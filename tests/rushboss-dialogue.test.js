import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {RUSH_DIALOGUE_DATA,RushDialogue} from '../games/rushboss/src/dialogue.js';
import {importRushDialogue} from '../tools/import-rushboss-dialogue.mjs';
import {createTouhouResources,TouhouDialogue,wrapTouhouDialogue,AnmBank,decodeAnm,anmSpriteVertices,TOUHOU_DIALOGUE_PORTRAITS} from '../packages/thlib/dist/touhou/index.js';
import {DrawList,Keys} from '../packages/thlib/dist/index.js';
const source='D:/c++/TouhouRushBoss-main';
function fixture(){
  const writes=[],handles=new Map();let next=1;
  const encode=(text,codePage)=>{assert.equal(codePage,936);return new Uint8Array(Array.from(text).reduce((sum,ch)=>sum+(ch.codePointAt(0)>127?2:1),0));};
  const host={readText:path=>fs.readFileSync(path,'utf8'),loadTexture:()=>next++,unloadTexture:id=>handles.delete(id),createTexture:(width,height)=>{const id=next++;handles.set(id,{width,height});return id;},encodeText:encode,
    hasSystemFont:()=>false,rasterizeBitmapText:(text,options)=>{writes.push({text,options});return{width:options.width,height:options.height,pixels:options.pixels??new Uint8Array(options.width*options.height*4).fill(255)};},updateTextureRegion:()=>{}};
  return{resources:createTouhouResources(host),writes,handles};
}
test('all original Rush classes, 74 Chinese strings, 84 steps and source side effects are generated without omissions',{skip:!fs.existsSync(source)},()=>{
  assert.deepEqual(importRushDialogue(source),RUSH_DIALOGUE_DATA);assert.deepEqual(RUSH_DIALOGUE_DATA.counts,{classes:10,steps:84,lines:74});
  assert.equal(Object.values(RUSH_DIALOGUE_DATA.sequences).filter(s=>s.phase==='before').length,6);assert.equal(Object.values(RUSH_DIALOGUE_DATA.sequences).filter(s=>s.phase==='after').length,4);
  assert.ok(RUSH_DIALOGUE_DATA.missing['artia:0:after']);assert.ok(RUSH_DIALOGUE_DATA.missing['artia:1:after']);
});
test('every generated sequence runs through every step, fires reveal/music in order and uses only common banks',()=>{
  for(const sequence of Object.values(RUSH_DIALOGUE_DATA.sequences)){
    const {resources,writes}=fixture(),events=[];let finished=0;
    const dialogue=new RushDialogue(resources,{bossId:sequence.bossId,character:sequence.character,phase:sequence.phase,onEvent:event=>events.push(event),onComplete:()=>finished++});
    const seen=new Set();for(let frame=0;frame<5000&&!dialogue.complete;frame++){
      seen.add(dialogue.index);dialogue.update(Keys.FOCUS);
      if(frame%120===45&&!dialogue.startDelay&&!dialogue.complete){const draw=new DrawList();dialogue.draw(draw);assert.ok(draw.commands.length);}
    }
    assert.equal(dialogue.complete,true,sequence.id);assert.equal(finished,1);assert.deepEqual(events,sequence.steps.flatMap(step=>step.events));
    assert.ok(writes.some(write=>write.options.codePage===936));assert.ok(writes.every(write=>write.options.charSet===134));
    assert.ok(writes.every(write=>!write.text.includes('\ufffd')));assert.equal(dialogue.box.bank.data.name,'front');
    dialogue.dispose();resources.dispose();
  }
});
test('source cold frames gate input exactly; Unicode wrap and optional typewriter never cut a Han character',()=>{
  const {resources,writes}=fixture(),dialogue=new TouhouDialogue({resources,codePage:936,steps:[{text:'你好世界',speaker:'left',coldFrames:3,autoFrames:500},{terminal:true}],charsPerFrame:1});
  assert.equal(dialogue.advance(),false);for(let i=0;i<3;i++)dialogue.update(0);assert.equal(dialogue.index,0);
  assert.equal(dialogue.advance(),true);assert.equal(dialogue.index,0);assert.equal(dialogue.shownCharacters,Infinity);
  dialogue.advance();assert.equal(dialogue.complete,true);assert.ok(writes.some(write=>write.text==='你好世界'));
  const encode=text=>new Uint8Array(Array.from(text).reduce((n,c)=>n+(c.charCodeAt(0)>127?2:1),0));assert.deepEqual(wrapTouhouDialogue('a你好b世界',encode,{codePage:936,maxBytes:5}),['a你好','b世界']);
  dialogue.dispose();resources.dispose();
});
test('Artia has no invented after-battle dialogue and terminates once',()=>{
  const {resources}=fixture();let completed=0;const dialogue=new RushDialogue(resources,{bossId:'artia',phase:'after',onComplete:()=>completed++});
  assert.equal(dialogue.complete,true);for(let i=0;i<10;i++)dialogue.update(0);assert.equal(completed,1);dialogue.dispose();resources.dispose();
});

test('a custom portrait callback may retain the default player skin; void still replaces it',()=>{
  const {resources}=fixture(),steps=[{text:'你好',speaker:'left',portraits:{left:{present:true,emotion:'NOTICE'}}}];
  const dialogue=new TouhouDialogue({resources,steps,codePage:936});
  for(let frame=0;frame<30;frame++)dialogue.update(0);
  const normal=new DrawList();dialogue.draw(normal);
  const ids=new Set([...dialogue.portraitBank.textures.values()]);
  const own=draw=>draw.commands.filter(command=>['quad','statefulQuad','mesh'].includes(command[0])&&ids.has(command[1]));
  const player=own(normal);assert.equal(player.length,2,'original independent body and expression draw');
  const before=dialogue.snapshot();
  dialogue.drawPortrait=draw=>{draw.point(100,100,0xff1122ff);return false;};
  const retained=new DrawList();dialogue.draw(retained);
  assert.deepEqual(own(retained),player,
    'the shared default left portrait uses the identical texture, geometry and animation state');
  assert.ok(retained.commands.some(command=>command[0]==='point'&&command[3]===0xff1122ff));
  assert.deepEqual(dialogue.snapshot(),before,'the extension only adds rendering commands');
  dialogue.drawPortrait=draw=>{draw.point(100,100,0xff1122ff);};
  const replacement=new DrawList();dialogue.draw(replacement);
  assert.equal(own(replacement).length,0,
    'existing callbacks returning void retain complete replacement behavior');
  dialogue.dispose();resources.dispose();
});

const playerPortraitSteps=[
  {text:'你好',speaker:'left',coldFrames:2,autoFrames:500,portraits:{left:{present:true,emotion:'NOTICE'}}},
  {text:'你好',speaker:'right',coldFrames:2,autoFrames:500,portraits:{left:{present:true,emotion:'NOTICE'}}},
];
function playerCommands(dialogue,view){
  const before=dialogue.snapshot(),draw=new DrawList();dialogue.draw(draw,view);
  assert.deepEqual(dialogue.snapshot(),before,'drawing cannot advance dialogue or original ANM clocks');
  const ids=new Set([...dialogue.portraitBank.textures.values()]);
  return draw.commands.filter(command=>['quad','statefulQuad'].includes(command[0])&&ids.has(command[1]));
}

const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
const sourceAvailable=fs.existsSync('games/touhou20/assets/anm/pl00.json');
test('body and independent expression use original full-screen anchors, source geometry and 15-frame clocks',{skip:!sourceAvailable},()=>{
  for(const character of [0,1]){
    const {resources}=fixture(),common={resources,character,codePage:936,steps:playerPortraitSteps};
    const dialogue=new TouhouDialogue(common),profile=character?TOUHOU_DIALOGUE_PORTRAITS.marisa:TOUHOU_DIALOGUE_PORTRAITS.reimu;
    const source=new AnmBank(JSON.parse(fs.readFileSync(`games/touhou20/assets/anm/pl0${character}.json`))),root=source.create(profile.root);
    root.interruptNow(17,true);root.interruptNow(2,true);
    const body=root.children.find(vm=>vm.scriptId===profile.body),face=root.children.find(vm=>vm.scriptId===profile.face),view={x:0,y:0,scale:1,screenScale:1.5};
    assert.deepEqual(dialogue.playerPortrait,{x:0,y:profile.y,height:profile.height});
    assert.deepEqual(dialogue.portraitView({x:336,y:24,scale:1.5,screenScale:1}),view);
    for(let frame=1;frame<=50;frame++){
      if(frame===31){dialogue.advance();root.interruptNow(17,true);root.interruptNow(3,true);}
      dialogue.update(0);source.update();
      const actual=dialogue.portraitMotion;
      assert.deepEqual(actual.worldPosition(view),body.worldPosition(view));assert.equal(actual.color,body.color);assert.equal(actual.layer,body.layer);
      const av=anmSpriteVertices(actual,view),bv=anmSpriteVertices(body,view);
      for(let i=0;i<4;i++){near(av[i][0],bv[i][0]);near(av[i][1],bv[i][1]);assert.equal(av[i][4],bv[i][4]);}
      assert.deepEqual(anmSpriteVertices(dialogue.portrait.children.find(vm=>vm.scriptId===profile.face),view),anmSpriteVertices(face,view),'expression uses unchanged source image/UVs');
      const commands=playerCommands(dialogue);assert.equal(commands.length,2);
      assert.deepEqual(playerCommands(dialogue),commands,'drawing never advances the source clocks');
      if(frame===30){near(body.worldPosition({screenScale:1}).x,0);near(body.worldPosition({screenScale:1}).y,profile.y);}
      if(frame===50){near(body.worldPosition({screenScale:1}).x,-32);near(body.worldPosition({screenScale:1}).y,profile.y+8);}
    }
    dialogue.dispose();source.dispose();resources.dispose();
  }
});

test('custom layout scales body, independent expression and source displacement uniformly',()=>{
  const layout={x:10,y:160,height:260},view={x:336,y:24,scale:1.5,screenScale:1};
  for(const character of [0,1]){
    const {resources}=fixture(),common={resources,character,codePage:936,steps:playerPortraitSteps};
    const original=new TouhouDialogue(common),configured=new TouhouDialogue({...common,playerPortrait:layout});
    const profile=original.playerProfile,ratio=layout.height/profile.height;
    for(let frame=1;frame<=50;frame++){
      if(frame===31){original.advance();configured.advance();}
      original.update(0);configured.update(0);
      const base=playerCommands(original,view),custom=playerCommands(configured,view);assert.equal(base.length,2);assert.equal(custom.length,2);
      for(let i=0;i<2;i++){assert.deepEqual(custom[i].slice(8),base[i].slice(8));near(custom[i][5],ratio);near(custom[i][6],layout.x*1.5);near(custom[i][7],(layout.y-profile.y*ratio)*1.5);}
      assert.deepEqual(configured.snapshot(),original.snapshot(),'layout never changes source dialogue or player animation timing');
    }
    original.dispose();configured.dispose();resources.dispose();
  }
});

const rightSource='D:/AIWorkspace/Touhou20Reconstruction/scripts/recovered/roundtrip/anm/st01enm.anm';
test('common right motion and message anchors match st01enm and MSG28 source coordinates',{skip:!fs.existsSync(rightSource)},()=>{
  const {resources}=fixture(),steps=[{speaker:'right',text:'你好',portraits:{right:{present:true}}},{speaker:'left',text:'你好',portraits:{right:{present:true}}}];
  const dialogue=new TouhouDialogue({resources,steps,codePage:936}),bank=new AnmBank(decodeAnm(fs.readFileSync(rightSource),'st01enm')),root=bank.create(12),body=root.children.find(vm=>vm.scriptId===10);
  root.interruptNow(2,true);assert.equal(dialogue.box.x,720);assert.equal(dialogue.box.y,480);
  for(let frame=1;frame<=50;frame++){
    if(frame===31){dialogue.advance();root.interruptNow(3,true);assert.equal(dialogue.box.x,232);}
    dialogue.update(0);bank.update();const state=dialogue.portraitState('right'),p=body.worldPosition({screenScale:1});
    assert.deepEqual([state.x,state.y,state.color,state.alpha,state.layer],[p.x,p.y,body.color,body.alpha,body.layer]);
    if(frame===30)assert.deepEqual([state.x,state.y,state.width,state.height],[248,120,220,360]);
    if(frame===50)assert.deepEqual([state.x,state.y],[280,128]);
  }
  dialogue.dispose();bank.dispose();resources.dispose();
});
