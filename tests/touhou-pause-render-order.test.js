import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AnmBank} from '../packages/thlib/dist/touhou/anm-vm.js';
import {TouhouPause} from '../packages/thlib/dist/touhou/pause.js';
import {TouhouGameOver} from '../packages/thlib/dist/touhou/game-over.js';
import {Keys} from '../packages/thlib/dist/input.js';
import {DrawList} from '../packages/thlib/dist/render.js';

const data=JSON.parse(fs.readFileSync(new URL('../packages/thlib/assets/touhou-common/anm/front.json',import.meta.url),'utf8'));
const ticks=(menu,count)=>{for(let i=0;i<count;i++)menu.update(0);};
const tap=(menu,key)=>{menu.update(key);menu.update(0);};
const callbacks={onExit(){},onRestart(){},onReplay(){},onOptions(){},onManual(){}};
function fixture(){
  const textures=new Map(),bank=new AnmBank(data,{loadTexture:file=>{if(!textures.has(file))textures.set(file,textures.size+1);return textures.get(file);}});
  // A real, independently registered VM must not leak into this owner's queue.
  const unrelated=bank.create(0x73);unrelated.drawSelf=draw=>draw.push(['unrelated-bank-vm']);
  return{bank,textures,unrelated};
}
function drawAndCheck(menu,f,{panel=true,external=false}={}){
  const times=f.bank.instances.map(vm=>[vm.id,vm.time,vm.pc,vm.alive]),before=menu.snapshot(),draw=new DrawList();menu.draw(draw);
  assert.deepEqual(f.bank.instances.map(vm=>[vm.id,vm.time,vm.pc,vm.alive]),times,'Painting must not advance or retire any ANM VM');
  assert.deepEqual(menu.snapshot(),before,'Painting must not advance menu input/transition state');
  assert.equal(draw.commands.some(command=>command[0]==='unrelated-bank-vm'),false,'Only this panel tree belongs to its render queue');
  assert.equal(draw.commands[0][0],'owner-background','Capture/background precedes every panel command');
  if(panel){
    const vms=[];const visit=vm=>{if(vm.alive&&vm.visible&&((vm.U(0x490)|vm.U(0x494))&0xff000000))vms.push(vm);for(const child of vm.children)visit(child);};visit(menu.panel);
    const background=vms.find(vm=>data.entries[data.sprites[vm.spriteIndex]?.entry]?.name==='ascii/pause_back.png');
    const labels=vms.filter(vm=>data.entries[data.sprites[vm.spriteIndex]?.entry]?.name==='ascii/pause.png');
    assert.ok(background&&labels.length,'Actual common ANM contains the ornament and menu labels');
    assert.equal(background.drawPriority,77);assert.ok(labels.every(vm=>vm.drawPriority===99));
    const texture=name=>f.textures.get(data.entries.find(entry=>entry.name===name).texture.path);
    const indices=id=>draw.commands.flatMap((command,index)=>command[0]==='statefulQuad'&&command[1]===id?[index]:[]);
    const backs=indices(texture('ascii/pause_back.png')),texts=indices(texture('ascii/pause.png'));
    assert.ok(backs.length&&texts.length,'Actual textured ornament and labels must both be painted');
    assert.ok(Math.max(...backs)<Math.min(...texts),'Priority 77 ornament must be painted before priority 99 labels');
    const lastQuad=draw.commands.findLastIndex(command=>command[0]==='statefulQuad');
    assert.ok(draw.commands.every((command,index)=>command[0]!=='owner-font'||index>lastQuad),'Owner font stays above the queued panel');
  }else assert.equal(draw.commands.some(command=>command[0]==='statefulQuad'),false,'Hidden panels must not leave queued sprites');
  if(external)assert.equal(draw.commands.at(-1)[0],'owner-external','External page paints after the owner background/panel/font');
  return draw;
}
function pauseFixture({restart=false,capture=false,...extra}={}){
  const f=fixture(),background=draw=>draw.push(['owner-background']);
  const menu=new TouhouPause({bank:f.bank,...callbacks,restart,...(capture?{capture:{capture(){},update(){},draw:background,hide(){},destroy(){}}}:{drawBackground:background}),...extra});
  ticks(menu,40);assert.equal(menu.phase,6);return{...f,menu};
}
function openConfirmation(f,choice){
  if(choice===5)tap(f.menu,Keys.UP);else for(let i=0;i<choice;i++)tap(f.menu,Keys.DOWN);
  assert.equal(f.menu.selection,choice);tap(f.menu,Keys.CONFIRM);ticks(f.menu,38);
  assert.equal(f.menu.phase,choice===2?9:7);assert.equal(f.menu.count,2);assert.equal(f.menu.selection,1);
}

test('common ordinary/restart pause panels keep their ornament behind every label',()=>{
  for(const restart of [false,true]){
    const f=pauseFixture({restart,capture:!restart});assert.equal(f.menu.panel.scriptId,restart?0x91:0x90);
    drawAndCheck(f.menu,f);drawAndCheck(f.menu,f);f.menu.destroy();f.bank.dispose();
  }
});

for(const [choice,name]of [[1,'exit'],[5,'restart'],[2,'save replay']]){
  test(`common ${name} confirmation and cancelled return preserve priority ordering`,()=>{
    const f=pauseFixture();openConfirmation(f,choice);drawAndCheck(f.menu,f);
    const yes=f.menu.child(0x8e),no=f.menu.child(0x8f);assert.ok(yes?.alive&&no?.alive,'Actual yes/no ANM children are present');
    tap(f.menu,Keys.UP);assert.equal(f.menu.selection,0);drawAndCheck(f.menu,f);
    // Cancel Yes first selects No; cancelling No returns to the original menu.
    tap(f.menu,Keys.CANCEL);assert.equal(f.menu.selection,1);tap(f.menu,Keys.CANCEL);ticks(f.menu,40);
    assert.equal(f.menu.phase,6);assert.equal(f.menu.selection,choice);drawAndCheck(f.menu,f);f.menu.destroy();f.bank.dispose();
  });
}

test('common pause external page remains last and closes back to a clean panel queue',()=>{
  let close;const f=pauseFixture({onOptions:context=>{close=context.close;return{draw:draw=>draw.push(['owner-external'])};}});
  for(let i=0;i<4;i++)tap(f.menu,Keys.DOWN);tap(f.menu,Keys.CONFIRM);ticks(f.menu,25);
  assert.equal(f.menu.panelVisible,false);drawAndCheck(f.menu,f,{panel:false,external:true});
  close();ticks(f.menu,40);assert.equal(f.menu.panelVisible,true);drawAndCheck(f.menu,f);f.menu.destroy();f.bank.dispose();
});

test('common normal/practice/completed result panels order decorations before text and credits',()=>{
  for(const options of [{session:{mode:0}},{session:{mode:1}},{completed:true}]){
    const f=fixture(),menu=new TouhouGameOver({bank:f.bank,player:{score:0},...callbacks,...options,
      drawBackground:draw=>draw.push(['owner-background']),font:{draw:(draw,text)=>draw.push(['owner-font',text])}});
    ticks(menu,50);assert.equal(menu.panel.scriptId,options.completed||options.session?.mode===1?0x94:0x93);
    drawAndCheck(menu,f);drawAndCheck(menu,f);menu.destroy();f.bank.dispose();
  }
});

test('common result external page stays last and returning restores only its own panel',()=>{
  let close;const f=fixture(),menu=new TouhouGameOver({bank:f.bank,player:{score:0},...callbacks,
    onOptions:context=>{close=context.close;return{draw:draw=>draw.push(['owner-external'])};},
    drawBackground:draw=>draw.push(['owner-background']),font:{draw:(draw,text)=>draw.push(['owner-font',text])}});
  ticks(menu,50);for(let i=0;i<4;i++)tap(menu,Keys.DOWN);assert.equal(menu.selection,4);
  tap(menu,Keys.CONFIRM);ticks(menu,25);assert.equal(menu.panelVisible,false);drawAndCheck(menu,f,{panel:false,external:true});
  close();ticks(menu,40);assert.equal(menu.panelVisible,true);drawAndCheck(menu,f);menu.destroy();f.bank.dispose();
});
