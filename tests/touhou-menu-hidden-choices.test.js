import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AnmBank} from '../packages/thlib/src/touhou/anm-vm.js';
import {TouhouPause} from '../packages/thlib/src/touhou/pause.js';
import {TouhouGameOver} from '../packages/thlib/src/touhou/game-over.js';
import {TouhouGame} from '../packages/thlib/src/touhou/game.js';
import {TouhouRenderQueue} from '../packages/thlib/src/touhou/render-queue.js';
import {drawTouhouMenuPanel} from '../packages/thlib/src/touhou/menu-choices.js';
import {createTouhouResources} from '../packages/thlib/src/touhou/resources.js';
import {Keys} from '../packages/thlib/src/input.js';
import {DrawList} from '../packages/thlib/src/render.js';

const data=JSON.parse(fs.readFileSync(new URL('../packages/thlib/assets/touhou-common/anm/front.json',import.meta.url),'utf8'));
const callbacks={onExit(){},onRestart(){},onReplay(){},onOptions(){},onManual(){}};
const view={x:0,y:0,scale:1,screenScale:1.5};
const ticks=(menu,n)=>{for(let i=0;i<n;i++)menu.update(0);};
const tap=(menu,key)=>{menu.update(key);menu.update(0);};
function fixture(Type,options={}){
  const textures=new Map(),bank=new AnmBank(data,{loadTexture:file=>{if(!textures.has(file))textures.set(file,textures.size+1);return textures.get(file);}});
  const menu=new Type({bank,player:{score:0},...callbacks,drawBackground(){},...options});
  ticks(menu,50);
  assert.equal(menu.phase,6);
  return{menu,bank,dispose(){menu.destroy();bank.dispose();}};
}
function painted(menu){
  const entries=[],queue=menu.renderQueue,enqueue=queue.enqueueAnm;
  queue.enqueueAnm=function(vm,v){entries.push({script:vm.scriptId,vm,view:{...v},y:vm.worldPosition(v).y*(v.scale??1)+(v.y??0)});return enqueue.call(this,vm,v);};
  const before=menu.panel.snapshot(),state=menu.snapshot(),draw=new DrawList();
  try{menu.draw(draw);}finally{queue.enqueueAnm=enqueue;}
  assert.deepEqual(menu.panel.snapshot(),before,'Drawing must not mutate ANM clocks, position, lifetime or child trees');
  assert.deepEqual(menu.snapshot(),state,'Drawing must not change menu state');
  return{entries,draw};
}
const rows=entries=>entries.filter(entry=>entry.script>=119&&entry.script<=140).sort((a,b)=>a.y-b.y);
function assertOrder(menu){
  const {entries:calls,draw}=painted(menu);
  const background=calls.filter(entry=>entry.vm.drawPriority===77),labels=calls.filter(entry=>entry.vm.drawPriority===99);
  assert.ok(background.length&&labels.length);
  const texture=name=>menu.bank.texture(data.entries.findIndex(entry=>entry.name===name));
  const indices=id=>draw.commands.flatMap((command,index)=>command[0]==='statefulQuad'&&command[1]===id?[index]:[]);
  const backs=indices(texture('ascii/pause_back.png')),texts=indices(texture('ascii/pause.png'));
  assert.ok(backs.length&&texts.length);
  assert.ok(Math.max(...backs)<Math.min(...texts),'The priority 77 ornament must stay behind the priority 99 rows');
}

test('omitted and empty hiddenChoices retain the original draw commands and animation state',()=>{
  for(const [Type,options]of [[TouhouPause,{}],[TouhouPause,{restart:true}],[TouhouGameOver,{}],[TouhouGameOver,{session:{mode:1}}]]){
    const f=fixture(Type,options);
    try{
      const expected=new DrawList(),queue=new TouhouRenderQueue();f.menu.panel.draw(queue,view);queue.flush(expected);
      assert.deepEqual(painted(f.menu).draw.commands,expected.commands);
      const explicit=fixture(Type,{...options,session:{...options.session},hiddenChoices:[]});
      try{assert.deepEqual(painted(explicit.menu).draw.commands,expected.commands);assert.deepEqual(explicit.menu.snapshot(),f.menu.snapshot());}
      finally{explicit.dispose();}
    }finally{f.dispose();}
  }
});

test('normal pause hides Options, closes one 49.5px row, and keeps disabled rows visible by default',()=>{
  const f=fixture(TouhouPause,{hiddenChoices:['options']});
  try{
    const before=f.menu.child(124).worldPosition(view).y;
    const output=rows(painted(f.menu).entries);
    assert.deepEqual(output.map(row=>row.script),[119,120,121,122,124]);
    assert.deepEqual(output.map(row=>row.y),[270,319.5,369,418.5,468]);
    assert.equal(before-output.at(-1).y,49.5);
    assert.ok(f.menu.excluded.has(4));
    for(let i=0;i<15;i++){tap(f.menu,Keys.DOWN);assert.notEqual(f.menu.selection,4);}
    assertOrder(f.menu);
  }finally{f.dispose();}
  const disabled=fixture(TouhouPause,{onOptions:undefined});
  try{assert.ok(disabled.menu.excluded.has(4));assert.ok(painted(disabled.menu).entries.some(row=>row.script===123));}
  finally{disabled.dispose();}
});

test('restart pause uses its four actual rows and 60px spacing, including missing hidden choices',()=>{
  const f=fixture(TouhouPause,{restart:true,hiddenChoices:['options','replay','manual']});
  try{
    assert.deepEqual(rows(painted(f.menu).entries).map(({script,y})=>[script,y]),[[131,270],[132,330],[134,390]]);
    tap(f.menu,Keys.UP);assert.equal(f.menu.selection,5);
    tap(f.menu,Keys.DOWN);assert.equal(f.menu.selection,0);
  }finally{f.dispose();}
});

for(const [Type,options,scripts,ys]of [
  [TouhouGameOver,{},[125,126,127,128,130],[270,319.5,369,418.5,468]],
  [TouhouGameOver,{session:{mode:1}},[137,138,140],[270,330,390]],
  [TouhouGameOver,{completed:true},[137,138,140],[270,330,390]],
])test(`results hide Options and compact the actual ${options.completed?'completed':options.session?'practice':'normal'} panel`,()=>{
  const f=fixture(Type,{...options,hiddenChoices:['options']});
  try{
    const output=rows(painted(f.menu).entries);
    assert.deepEqual(output.map(row=>row.script),scripts);
    assert.deepEqual(output.map(row=>row.y),ys,'Sort actual positions, not script number, child order or six hypothetical rows');
    for(let i=0;i<15;i++){tap(f.menu,Keys.DOWN);assert.notEqual(f.menu.selection,4);}
    assertOrder(f.menu);
  }finally{f.dispose();}
});

test('multiple hidden rows and nested children compact without changing source transforms',()=>{
  const f=fixture(TouhouPause,{hiddenChoices:['exit','manual','options']});
  try{
    // Attach an actual VM beneath the hidden Options row; the whole subtree is hidden.
    const parent=f.menu.child(123),child=parent.spawn(119,false,4);
    assert.ok(parent.children.includes(child));
    assert.deepEqual(rows(painted(f.menu).entries).map(({script,y})=>[script,y]),[[119,270],[121,319.5],[124,369]]);
  }finally{f.dispose();}
});

for(const [choice,keyCount]of [[1,1],[2,2],[5,-1]])test(`hidden Options preserve choice ${choice} confirmation geometry, timing and cancelled return`,()=>{
  const f=fixture(TouhouPause,{hiddenChoices:['options']});
  try{
    if(keyCount<0)tap(f.menu,Keys.UP);else for(let i=0;i<keyCount;i++)tap(f.menu,Keys.DOWN);
    assert.equal(f.menu.selection,choice);
    f.menu.update(Keys.CONFIRM);assert.equal(f.menu.phase,choice===2?9:7);assert.equal(f.menu.age,1);
    ticks(f.menu,19);assert.equal(f.menu.count,6);
    f.menu.update(0);assert.equal(f.menu.count,2);assert.equal(f.menu.selection,1);assert.equal(f.menu.age,21);
    ticks(f.menu,10);
    const confirmation=painted(f.menu).entries.filter(entry=>entry.script>=141&&entry.script<=143);
    assert.deepEqual(confirmation.map(row=>row.script),[141,142,143]);
    assert.ok(confirmation.every(row=>row.view.y===0),'Confirmation title and Yes/No are never translated');
    tap(f.menu,Keys.UP);assert.equal(f.menu.selection,0);
    tap(f.menu,Keys.CANCEL);assert.equal(f.menu.selection,1);
    tap(f.menu,Keys.CANCEL);ticks(f.menu,40);assert.equal(f.menu.phase,6);assert.equal(f.menu.selection,choice);
    assert.deepEqual(rows(painted(f.menu).entries).map(row=>row.script),[119,120,121,122,124]);
  }finally{f.dispose();}
});

test('result external page return restores the same compact panel and hidden navigation',()=>{
  let close;const f=fixture(TouhouGameOver,{hiddenChoices:['options'],onManual:context=>{close=context.close;return{};}});
  try{
    for(let i=0;i<3;i++)tap(f.menu,Keys.DOWN);
    assert.equal(f.menu.selection,3);tap(f.menu,Keys.CONFIRM);ticks(f.menu,25);assert.equal(f.menu.panelVisible,false);
    close();ticks(f.menu,35);assert.equal(f.menu.panelVisible,true);
    assert.deepEqual(rows(painted(f.menu).entries).map(row=>row.script),[125,126,127,128,130]);
    tap(f.menu,Keys.DOWN);assert.equal(f.menu.selection,5);
  }finally{f.dispose();}
});

test('hidden first rows never receive selection or GameOver Escape activation',()=>{
  const pause=fixture(TouhouPause,{hiddenChoices:['resume']});
  try{assert.equal(pause.menu.selection,1);for(let i=0;i<10;i++){tap(pause.menu,Keys.UP);assert.notEqual(pause.menu.selection,0);}}
  finally{pause.dispose();}
  const result=fixture(TouhouGameOver,{hiddenChoices:['continue','exit']});
  try{assert.equal(result.menu.selection,2);tap(result.menu,Keys.PAUSE);ticks(result.menu,20);assert.equal(result.menu.phase,6);assert.equal(result.menu.active,true);assert.equal(result.menu.selection,2);}
  finally{result.dispose();}
});

test('GameOver Escape cannot silently close on Replay when its Exit fallback is hidden',()=>{
  for(const hiddenChoices of [['exit'],['exit','replay']]){
    const events=[],f=fixture(TouhouGameOver,{hiddenChoices,session:{credits:0},
      onExit:()=>events.push('exit'),onReplay:()=>events.push('replay'),onRestart:()=>events.push('restart')});
    try{
      const selection=f.menu.selection;assert.notEqual(selection,0);assert.notEqual(selection,1);
      tap(f.menu,Keys.PAUSE);ticks(f.menu,20);
      assert.equal(f.menu.active,true);assert.equal(f.menu.phase,6);assert.equal(f.menu.selection,selection);assert.deepEqual(events,[]);
    }finally{f.dispose();}
  }
  for(const hiddenChoices of [[],['options']]){
    let exited=0;const f=fixture(TouhouGameOver,{hiddenChoices,session:{credits:0},onExit:()=>exited++});
    try{tap(f.menu,Keys.PAUSE);ticks(f.menu,13);assert.equal(f.menu.active,false);assert.equal(exited,1,'Default and Options-only retain the original Exit fallback');}
    finally{f.dispose();}
  }
  const missing=fixture(TouhouGameOver,{hiddenChoices:['options'],session:{credits:0},onExit:undefined});
  try{tap(missing.menu,Keys.PAUSE);ticks(missing.menu,20);assert.equal(missing.menu.active,true);assert.equal(missing.menu.phase,6,'With hidden rows Escape only accepts a usable Continue/Exit');}
  finally{missing.dispose();}
  let continued=0;const f=fixture(TouhouGameOver,{hiddenChoices:['exit'],player:{score:0,power:100},onContinue:()=>continued++});
  try{tap(f.menu,Keys.PAUSE);ticks(f.menu,13);assert.equal(f.menu.active,false);assert.equal(continued,1,'Hiding Exit does not block a usable Continue');}
  finally{f.dispose();}
});

test('two-row shared panel compacts actual rows while leaving confirmation scripts independent',()=>{
  const bank=new AnmBank(data,{loadTexture:()=>1}),panel=bank.create(146,{secondary:true});
  try{
    panel.interrupt(3,true);for(let i=0;i<40;i++)panel.update();
    const calls=[],queue={enqueueAnm(vm,v){calls.push([vm.scriptId,vm.worldPosition(v).y+(v.y??0)]);}};
    drawTouhouMenuPanel(panel,queue,view,new Set([1]));
    assert.deepEqual(calls.filter(([id])=>id>=119&&id<=140),[[136,309]]);
  }finally{panel.destroy();bank.dispose();}
});

test('invalid hidden names fail early without creating an ANM panel',()=>{
  const bank=new AnmBank(data,{loadTexture:()=>1});
  try{
    for(const Type of [TouhouPause,TouhouGameOver])assert.throws(()=>new Type({bank,player:{score:0},hiddenChoices:['settings']}),/Unknown hidden menu choice/);
    assert.equal(bank.instances.length,0);
  }finally{bank.dispose();}
});

test('TouhouGame forwards pauseOptions and GameOver options while retaining its resume lifecycle',()=>{
  const resources=createTouhouResources({readText:file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),loadTexture:()=>1});
  let resumed=0;const game=new TouhouGame({banks:resources.banks,font:resources.font,sht:resources.shots[0],styles:resources.styles,...callbacks,
    pauseOptions:{hiddenChoices:['options'],onResume:()=>resumed++},gameOverOptions:{hiddenChoices:['options'],...callbacks}});
  try{
    for(let i=0;i<31;i++)game.update(0);
    game.update(Keys.PAUSE);assert.equal(game.paused,true);ticks(game,40);
    assert.ok(game.pauseVisual.excluded.has(4));assert.equal(painted(game.pauseVisual).entries.some(row=>row.script===123),false);
    game.update(Keys.PAUSE);ticks(game,13);assert.equal(game.paused,false);assert.equal(resumed,1);
    game.openGameOver(0);ticks(game,50);assert.ok(game.pauseVisual.excluded.has(4));
    assert.equal(painted(game.pauseVisual).entries.some(row=>row.script===129),false);
  }finally{game.destroy();resources.dispose();}
});
