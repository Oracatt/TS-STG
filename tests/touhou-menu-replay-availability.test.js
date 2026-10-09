import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AnmBank} from '../packages/thlib/dist/touhou/anm-vm.js';
import {TouhouPause} from '../packages/thlib/dist/touhou/pause.js';
import {TouhouGameOver} from '../packages/thlib/dist/touhou/game-over.js';
import {TouhouPlayer} from '../packages/thlib/dist/touhou/player.js';
import {TouhouItems} from '../packages/thlib/dist/touhou/items.js';
import {TOUHOU_PLAYER_DATA} from '../packages/thlib/dist/touhou/player-data.js';
import {DrawList} from '../packages/thlib/dist/render.js';
import {Keys} from '../packages/thlib/dist/input.js';

const base=new URL('../packages/thlib/assets/touhou-common/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',base),'utf8'));
const callbacks={onExit(){},onRestart(){},onReplay(){},onOptions(){},onManual(){}};
const ticks=(owner,count)=>{for(let frame=0;frame<count;frame++)owner.update(0);};
const tap=(owner,key)=>{owner.update(key);owner.update(0);};
function bankFor(locale){
  const file=locale==='ja'?manifest.archives.front.file:manifest.locales[locale].archives.front.file;
  return new AnmBank(JSON.parse(fs.readFileSync(new URL(file,base),'utf8')),{loadTexture:()=>1});
}
function fixture(Type,{locale='zh-CN',continues=1,hiddenChoices=['options'],...options}={}){
  const bank=bankFor(locale),menu=new Type({bank,player:{score:0},session:{mode:0,continues},continues,hiddenChoices,...callbacks,drawBackground(){},...options});
  return{menu,bank,dispose(){menu.destroy();bank.dispose();}};
}
function painted(menu,script){
  const vm=menu.child(script);assert.ok(vm?.alive&&vm.visible);
  const original=vm.drawSelf,quads=[],views=[];
  vm.drawSelf=function(draw,view){
    const start=draw.commands?.length??0,result=original.call(this,draw,view);
    if(!draw.enqueueAnm){quads.push(...draw.commands.slice(start).filter(command=>command[0]==='statefulQuad'));views.push(view);}
    return result;
  };
  const before=menu.snapshot();try{menu.draw(new DrawList());}finally{vm.drawSelf=original;}
  assert.deepEqual(menu.snapshot(),before);
  return{vm,quads,views};
}
function assertGrey(menu,script,alpha=255){
  const {vm,quads,views}=painted(menu,script);
  assert.equal(quads.length,1,'Replay submits its actual texture once');
  const rgba=quads[0][12],rgb=rgba>>>8;
  assert.equal(rgba&255,alpha,'Policy-excluded Replay keeps the normal opening fade, then stays opaque');
  assert.equal(rgb>>>16&255,rgb>>>8&255);assert.equal(rgb>>>8&255,rgb&255,'Replay keeps the unselected grey ANM tint');
  assert.equal(vm.flashColor,null,'No near-transparent disabled-color override');
  assert.equal(vm.worldPosition(views[0]).y+(views[0].y??0),369,'Replay remains in its original row');
}

test('continued Pause stays opaque grey through every frame0..60 with either locale and Options layout',()=>{
  for(const locale of ['ja','zh-CN'])for(const hiddenChoices of [[],['options']]){
    const f=fixture(TouhouPause,{locale,hiddenChoices});
    try{
      for(let frame=0;frame<=60;frame++){
        if(frame)f.menu.update(0);
        const vm=f.menu.child(121);assert.ok(vm.alive&&vm.visible);
        const {quads}=painted(f.menu,121);
        if(frame===0)assert.equal(quads.length,0,'Initial ANM alpha starts at zero');
        else{
          assert.equal(quads.length,1);
          assert.equal(quads[0][12]&255,frame<5?[0,91,163,214,244][frame]:255,'Opening fade never becomes a second fade to alpha5');
        }
        if(frame>=10){assertGrey(f.menu,121);assert.ok(f.menu.excluded.has(2));}
      }
      for(let i=0;i<15;i++){tap(f.menu,Keys.DOWN);assert.notEqual(f.menu.selection,2);assertGrey(f.menu,121);}
    }finally{f.dispose();}
  }
});

test('continued Pause Replay survives Manual return and cancelled Exit/Restart confirmations',()=>{
  let close;const f=fixture(TouhouPause,{onManual:context=>{close=context.close;return{};}});
  try{
    ticks(f.menu,40);tap(f.menu,Keys.DOWN);tap(f.menu,Keys.DOWN);assert.equal(f.menu.selection,3);
    tap(f.menu,Keys.CONFIRM);ticks(f.menu,25);assert.equal(f.menu.panelVisible,false);
    close();ticks(f.menu,40);assert.equal(f.menu.phase,6);assertGrey(f.menu,121);
    for(const choice of [1,5]){
      for(let i=0;f.menu.selection!==choice&&i<6;i++)tap(f.menu,Keys.DOWN);
      assert.equal(f.menu.selection,choice);tap(f.menu,Keys.CONFIRM);ticks(f.menu,35);
      assert.equal(f.menu.count,2);assert.equal(f.menu.selection,1);
      tap(f.menu,Keys.CANCEL);ticks(f.menu,40);assert.equal(f.menu.phase,6);assert.equal(f.menu.selection,choice);
      assertGrey(f.menu,121);assert.ok(f.menu.excluded.has(2));
    }
  }finally{f.dispose();}
});

test('continued GameOver Replay stays opaque grey every frame11..60 and after external-page restoration',()=>{
  for(const locale of ['ja','zh-CN'])for(const hiddenChoices of [[],['options']]){
    let close;const f=fixture(TouhouGameOver,{locale,hiddenChoices,onManual:context=>{close=context.close;return{};}});
    try{
      for(let frame=0;frame<=60;frame++){
        if(frame)f.menu.update(0);
        if(frame<11)assert.equal(f.menu.panel,null);
        else{assertGrey(f.menu,127,frame<15?[150,195,228,248][frame-11]:255);assert.ok(f.menu.excluded.has(2));}
      }
      for(let i=0;i<12;i++){tap(f.menu,Keys.DOWN);assert.notEqual(f.menu.selection,2);assertGrey(f.menu,127);}
      for(let i=0;f.menu.selection!==3&&i<6;i++)tap(f.menu,Keys.DOWN);
      assert.equal(f.menu.selection,3);tap(f.menu,Keys.CONFIRM);ticks(f.menu,25);
      assert.equal(f.menu.panelVisible,false);close();ticks(f.menu,40);
      assertGrey(f.menu,127);assert.ok(f.menu.excluded.has(2));
    }finally{f.dispose();}
  }
});

test('missing Replay and other callbacks retain their original unavailable style',()=>{
  for(const Type of [TouhouPause,TouhouGameOver]){
    const f=fixture(Type,{onReplay:undefined,onManual:undefined});
    try{
      ticks(f.menu,40);
      for(const script of Type===TouhouPause?[121,122]:[127,128]){
        const output=painted(f.menu,script);assert.equal(output.vm.flashColor,0x05050920);assert.equal(output.quads[0][12]&255,5);
      }
      assert.ok(f.menu.excluded.has(2));assert.ok(f.menu.excluded.has(3));
    }finally{f.dispose();}
  }
});

test('ordinary life and life-fragment pickups do not count as Continue or disable Replay',()=>{
  const player=new TouhouPlayer({sht:TOUHOU_PLAYER_DATA[0]}),items=new TouhouItems({player});
  try{
    const before=player.lives;items.collect({type:5,x:0,y:100,state:3});
    for(let i=0;i<player.rules.lifeFragmentThreshold;i++)items.collect({type:4,x:0,y:100,state:3});
    assert.equal(player.lives,before+2);assert.equal(player.continues??0,0);
    const f=fixture(TouhouPause,{continues:player.continues??0});
    try{
      ticks(f.menu,40);assertGrey(f.menu,121);assert.equal(f.menu.excluded.has(2),false);
      tap(f.menu,Keys.DOWN);tap(f.menu,Keys.DOWN);assert.equal(f.menu.selection,2);
      tap(f.menu,Keys.CONFIRM);assert.equal(f.menu.phase,9,'Replay still opens its original confirmation');
    }finally{f.dispose();}
  }finally{player.destroy();}
});
