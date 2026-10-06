import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DrawList} from '@ts-stg/thlib';
import {TouhouGameplayCompositor,TouhouRenderQueue,TouhouBulletField,TouhouSpell,TouhouPlayer,TouhouGame,TouhouGrazeEffects,AnmBank,getTouhouPlayerData,createTouhouResources,TOUHOU_OWNER_PRIORITIES} from '@ts-stg/thlib/touhou';
import {assertRenderScopes} from './fixtures/render-scopes.js';

function drawState(commands){
  let target=null,clip=null,blend=null,pass=0;const result=[];
  for(const command of commands){
    if(command[0]==='targetBegin'){target=command[1];pass++;}
    else if(command[0]==='targetEnd')target=null;
    else if(command[0]==='scissor')clip=command.slice(1);
    else if(command[0]==='scissorEnd')clip=null;
    else if(command[0]==='blendFactors')blend=command.slice(1);
    else if(command[0]==='blendEnd')blend=null;
    else if(command[0]==='rect'||command[0]==='sprite'||command[0]==='spriteRegion')result.push({command,target,clip,blend,pass});
  }
  return result;
}

test('original composition captures p13 rings, warps before p16 aura, then separates gameplay and screen HUD',()=>{
  const queue=new TouhouRenderQueue(),draw=new DrawList(),compositor=new TouhouGameplayCompositor({renderTarget:71,compositeTarget:72});
  const priorities=[5,11,13,16,24,30,39,40,41,42,49,60,62,63,64,65,68,75,76,78,80,81,82,83,84,98];
  for(const priority of priorities)queue.enqueuePriority(priority,target=>target.rect(priority,0,1,1,0xffffffff));
  compositor.draw(draw,queue,{drawBackground:target=>target.rect(3,0,1,1,0x010203ff),
    drawDistortion:(target,texture)=>{assert.equal(texture,71);target.rect(15,0,1,1,0xffffffff);}});
  assertRenderScopes(draw.commands);
  const state=drawState(draw.commands),markers=state.filter(item=>item.command[0]==='rect'&&item.command[3]===1);
  assert.deepEqual(markers.map(item=>item.command[1]),[3,5,11,13,15,...priorities.filter(priority=>priority>13)]);
  for(const item of markers){
    const priority=item.command[1];
    assert.equal(item.target,priority<=13?71:priority<=24?72:priority<=46?71:priority<=65?72:null,`source callback ${priority} surface`);
    const clipped=(priority>=10&&priority<=46)||priority===3;
    const playfield=(priority>=49&&priority<=62)||(priority>=80&&priority<=83);
    assert.deepEqual(item.clip,clipped?[24,0,624,720]:playfield?[48,24,576,672]:null,`source callback ${priority} camera`);
  }
  assert.deepEqual(state.filter(item=>item.command[0]==='sprite').map(item=>[item.target,item.command[1]]),[[72,71],[71,72],[72,71],[null,72]]);
  for(const item of state.filter(item=>item.command[0]==='sprite'))
    assert.deepEqual(item.blend,['one','zero','add','one','zero','add'],'surface composition must preserve source alpha rather than fade it repeatedly');
  assert.equal(queue.entries.length,0);
});

test('third surface copy inherits gameplay shake with a 12-unit sampling margin while later frame and HUD remain fixed',()=>{
  for(const {scale,viewport,width,height} of [
    {scale:1.5,viewport:{x:48,y:24,width:576,height:672},width:960,height:720},
    {scale:2,viewport:{x:100,y:60,width:768,height:896},width:1400,height:1000},
  ]){
    const queue=new TouhouRenderQueue(),draw=new DrawList(),offset={x:4,y:-2};
    const compositor=new TouhouGameplayCompositor({renderTarget:71,compositeTarget:72,scale,viewport,width,height});
    for(const [priority,texture] of [[30,101],[50,102],[68,103],[84,104],[81,105]])
      queue.enqueuePriority(priority,target=>target.sprite(texture,120,230,32,32));
    compositor.draw(draw,queue,{cameraOffset:offset});
    assertRenderScopes(draw.commands);
    const states=drawState(draw.commands),regions=states.filter(item=>item.command[0]==='spriteRegion');
    assert.equal(regions.length,1,'only the third copy inherits the gameplay camera');
    const copy=regions[0],margin=12*scale;
    assert.equal(copy.pass,4);assert.equal(copy.target,72);
    assert.deepEqual(copy.clip,[viewport.x,viewport.y,viewport.width,viewport.height]);
    assert.deepEqual(copy.command,['spriteRegion',71,viewport.x-margin,viewport.y-margin,
      viewport.width+2*margin,viewport.height+2*margin,
      viewport.x+viewport.width/2+offset.x*scale,viewport.y+viewport.height/2+offset.y*scale,
      viewport.width+2*margin,viewport.height+2*margin,0,0xffffffff],
    'copy existing output pixels 1:1; do not apply the source ANM resolution scale again');
    assert.deepEqual(copy.blend,['one','zero','add','one','zero','add']);
    const fullCopies=states.filter(item=>item.command[0]==='sprite'&&[71,72].includes(item.command[1]));
    assert.deepEqual(fullCopies.map(item=>[item.pass,item.target,item.command[1]]),[[2,72,71],[3,71,72],[4,72,71],[4,null,72]]);
    for(const item of fullCopies){
      assert.deepEqual(item.command.slice(2,6),[width/2,height/2,width,height]);
      assert.equal(item.clip,null,'base and final copies retain their fixed placement');
    }
    const marker=texture=>states.find(item=>item.command[0]==='sprite'&&item.command[1]===texture);
    assert.deepEqual(marker(101).command.slice(2,4),[120+offset.x*scale,230+offset.y*scale]);
    assert.ok(states.indexOf(marker(101))<states.indexOf(copy),'earlier quads already contain their individual camera displacement');
    assert.deepEqual(marker(102).command.slice(2,4),[120+offset.x*scale,230+offset.y*scale]);
    assert.ok(states.indexOf(marker(102))>states.indexOf(copy),'post-copy effects receive only their own drawing offset');
    for(const texture of [103,104]){
      assert.deepEqual(marker(texture).command.slice(2,4),[120,230]);
      assert.equal(marker(texture).target,null);assert.equal(marker(texture).clip,null);
    }
    assert.deepEqual(marker(105).command.slice(2,4),[120,230],'camera5 resets the spell-name drawing offset');
    assert.deepEqual(marker(105).clip,[viewport.x,viewport.y,viewport.width,viewport.height]);
  }
});

test('zero shake preserves the original full command stream without a regional surface copy',()=>{
  const compose=cameraOffset=>{
    const queue=new TouhouRenderQueue(),draw=new DrawList();
    for(const priority of [13,30,50,68,84])queue.enqueuePriority(priority,target=>target.rect(priority,0,1,1,0xffffffff));
    new TouhouGameplayCompositor({renderTarget:71,compositeTarget:72}).draw(draw,queue,{cameraOffset,
      drawBackground:target=>target.rect(3,0,1,1,0xffffffff),
      drawDistortion:target=>target.sprite(99,100,120,40,50)});
    assertRenderScopes(draw.commands);return draw.commands;
  };
  const unshifted=compose();assert.deepEqual(compose({x:0,y:0}),unshifted);
  assert.equal(unshifted.some(command=>command[0]==='spriteRegion'),false);
});

test('embedded bullet bodies use the BulletInf owner, while registered children and cancellation keep their callbacks',()=>{
  const field=new TouhouBulletField({bank:{create(){}},styles:Array(50).fill({})}),queue=new TouhouRenderQueue(),draw=new DrawList();
  const global=(priority,label)=>({draw(target){if(target.enqueuePriority)target.enqueuePriority(priority,d=>d.rect(label,0,1,1,0));else target.rect(label,0,1,1,0);}});
  const main={children:[global(13,13)],drawSelf(target){target.rect(41,0,1,1,0);}};
  field.bullets=[{state:1,frozen:false,group:0,x:0,y:0,z:.1,animation:main,child:global(37,37)}];
  field.effects=[global(40,40)];field.draw(queue);queue.flush(draw);
  assert.equal(TOUHOU_OWNER_PRIORITIES.bullet,41);
  assert.deepEqual(draw.commands.map(command=>command[1]),[13,37,40,41]);
  assert.deepEqual([main.x,main.y,main.z],[0,0,.1]);
});

test('spell bonus and record numerals use source text callback 84 alongside the later ANM spell-name callback',()=>{
  const writes=[],font={screenScale:1.5,draw(draw,text,options){writes.push({text,options});
    draw.enqueuePriority(options.drawPriority,target=>target.rect(84,0,1,1,0));}},spell=new TouhouSpell({font});
  spell.flags=3;spell.bonus=1500000;spell.info=[null,null,{alive:true,alpha:255,draw(draw){draw.enqueuePriority(81,target=>target.rect(81,0,1,1,0));}}];
  spell.records={0:{captures:[2,0],attempts:[3,0]}};
  const queue=new TouhouRenderQueue(),draw=new DrawList();spell.draw(queue);queue.flush(draw);
  assert.deepEqual(writes.map(write=>write.options.drawPriority),[84,84]);
  assert.deepEqual(draw.commands.map(command=>command[1]),[81,84,84]);
  assert.equal(writes[1].text,'02/03');
});

test('one-target and direct compositions keep callback order and never draw a texture into itself',()=>{
  for(const options of [{},{renderTarget:71}]){
    const queue=new TouhouRenderQueue(),draw=new DrawList();
    for(const priority of [41,81,13,16])queue.enqueuePriority(priority,target=>target.rect(priority,0,1,1,0));
    new TouhouGameplayCompositor(options).draw(draw,queue,{drawBackground:target=>target.rect(3,0,1,1,0)});
    assertRenderScopes(draw.commands);
    assert.deepEqual(draw.commands.filter(command=>command[0]==='rect'&&command[3]===1).map(command=>command[1]),[3,13,16,41,81]);
    for(const state of drawState(draw.commands))if(state.command[0]==='sprite')assert.notEqual(state.target,state.command[1]);
  }
  assert.throws(()=>new TouhouGameplayCompositor({renderTarget:71,compositeTarget:71}),RangeError);
  assert.throws(()=>new TouhouGameplayCompositor({compositeTarget:71}),TypeError);
});

test('the public graze owner queues its actual line strips at EffectInf draw priority 42',()=>{
  const effects=new TouhouGrazeEffects(),queue=new TouhouRenderQueue(),draw=new DrawList();
  effects.enqueue({x:0,y:200,delay:0,color:0xffd08080});effects.update();effects.update();
  effects.draw(queue);assert.equal(queue.entries.length,1);assert.equal(queue.entries[0].priority,42);
  queue.flush(draw);assert.ok(draw.commands.some(command=>command[0]==='lineStrip'));
  assertRenderScopes(draw.commands);
});

test('full-power option registration retains original power flags 2 and focus replacement flags 0',()=>{
  for(const character of [0,1]){
    const name=character?'pl01':'pl00',data=JSON.parse(fs.readFileSync(new URL(`../packages/thlib/assets/touhou-common/anm/${name}.json`,import.meta.url)));
    const bank=new AnmBank(data,{loadTexture:()=>11}),player=new TouhouPlayer({character,sht:getTouhouPlayerData(character),bank,power:400});
    for(const option of player.options.filter(option=>option.active)){
      assert.equal(option.fullAnimation.renderFront,true);assert.ok(option.fullAnimation.renderOrder<0);
      assert.equal(option.animation.renderFront,false);assert.ok(option.animation.renderOrder>0);
      const layerInstruction=data.scripts[player.sht.optionScripts[0]].instructions.find(instruction=>instruction.opcode===304);
      assert.equal(layerInstruction.time,character?0:-1,'Reimu sets the layer in the template; Marisa sets it at frame zero');
      assert.equal(bank.templates[player.sht.optionScripts[0]].layer,character?0:13);
      assert.equal(option.animation.layer,character?13:14,'named spawn runs before the original frame-zero layer instruction');
    }
    player.focused=true;player.updateOptions();
    for(const option of player.options.filter(option=>option.active)){
      assert.equal(option.fullAnimation.renderFront,false);assert.ok(option.fullAnimation.renderOrder>0);
      assert.equal(option.animation.layer,character?13:14);
    }
    bank.dispose();
  }
});

test('public custom distortion restores source bilinear sampling after replacement surface copies',()=>{
  const resources=createTouhouResources({readText:file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),loadTexture:()=>11});
  const game=new TouhouGame({banks:resources.banks,font:resources.font,sht:resources.shots[0],styles:resources.styles,renderTarget:71,compositeTarget:72});
  game.setDistortion({x:0,y:120});game.update();const commands=game.render();assertRenderScopes(commands);
  let sampler=null,blend=null,sawMesh=false;
  for(const command of commands){
    if(command[0]==='sampler'&&command[1]===71)sampler=command.slice(2);
    else if(command[0]==='blendFactors')blend=command.slice(1);
    else if(command[0]==='blendEnd')blend=null;
    else if(command[0]==='mesh'&&command[1]===71){
      sawMesh=true;assert.deepEqual(sampler,['bilinear','clamp','clamp']);
      assert.deepEqual(blend,['srcAlpha','oneMinusSrcAlpha','add','one','zero','add']);
    }
  }
  assert.equal(sawMesh,true);game.destroy();resources.dispose();
});
