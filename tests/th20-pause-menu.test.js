import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AnmBank} from '../games/touhou20/src/anm.js';
import {Th20Pause} from '../games/touhou20/src/pause.js';
import {Th20TitleMenu} from '../games/touhou20/src/menu.js';
import {Keys} from '../packages/thlib/dist/input.js';
import {DrawList} from '../packages/thlib/dist/render.js';
const path=name=>new URL(`../games/touhou20/assets/anm/${name}.json`,import.meta.url),available=fs.existsSync(path('front'));
const bank=name=>new AnmBank(JSON.parse(fs.readFileSync(path(name))),{loadTexture:()=>1});
const ticks=(object,count,mask=0)=>{for(let i=0;i<count;i++)object.update(mask);};
const tap=(object,key)=>{object.update(key);object.update(0);};

test('pause uses original panel and ten-frame opening input gate',{skip:!available},()=>{
 const b=bank('front'),unrelated=b.create(2),time=unrelated.time,p=new Th20Pause({bank:b});
 assert.equal(p.panel.scriptId,0x90);assert.equal(p.phase,0);assert.equal(p.age,1);
 ticks(p,9);assert.equal(p.phase,0);p.update(Keys.DOWN);assert.equal(p.phase,6);assert.equal(p.selection,0);assert.equal(p.age,1);
 assert.deepEqual([...p.excluded],[1,2,3,4,5]);assert.equal(unrelated.time,time);
 p.draw(new DrawList());assert.equal(unrelated.time,time);
 for(const id of[120,121,122,123,124])assert.equal(p.child(id).flashColor,0x05050920);
});

test('pause choice exit defaults to No and observes original 20/30/20/12-frame delays',{skip:!available},()=>{
 let exited=0;const p=new Th20Pause({bank:bank('front'),onExit:()=>exited++});ticks(p,10);
 tap(p,Keys.DOWN);assert.equal(p.selection,1);p.update(Keys.CONFIRM);assert.equal(p.phase,7);assert.equal(p.age,1);
 ticks(p,19);assert.equal(p.count,6);p.update(0);assert.equal(p.count,2);assert.equal(p.selection,1);assert.equal(p.age,21);
 ticks(p,9);assert.equal(p.age,30);p.update(Keys.UP);assert.equal(p.selection,0);assert.equal(p.phase,7);
 p.update(Keys.CONFIRM);assert.equal(p.phase,8);assert.equal(p.age,1);ticks(p,19);assert.equal(p.phase,8);p.update(0);assert.equal(p.phase,18);assert.equal(exited,0);
 ticks(p,11);assert.equal(exited,0);p.update(0);assert.equal(exited,1);assert.equal(p.active,false);
});

test('confirmation cancel returns to menu and Escape resumes after twelve frames',{skip:!available},()=>{
 let resumed=0;const p=new Th20Pause({bank:bank('front'),onResume:()=>resumed++,onRestart:()=>{}});ticks(p,10);
 tap(p,Keys.UP);assert.equal(p.selection,5);p.update(Keys.CONFIRM);ticks(p,30);assert.equal(p.selection,1);
 p.update(Keys.CANCEL);assert.equal(p.phase,8);ticks(p,20);assert.equal(p.phase,6);assert.equal(p.selection,5);
 p.update(Keys.PAUSE);assert.equal(p.phase,18);assert.equal(p.selection,0);ticks(p,12);assert.equal(resumed,1);
});

test('provided options page receives close and leaves source panel lifecycle independent',{skip:!available},()=>{
 let close,updated=0;const p=new Th20Pause({bank:bank('front'),onOptions:context=>{close=context.close;return{update:()=>updated++};}});ticks(p,10);
 tap(p,Keys.DOWN);assert.equal(p.selection,4);p.update(Keys.CONFIRM);assert.equal(p.phase,16);ticks(p,20);assert.equal(p.panelVisible,false);assert.equal(typeof close,'function');p.update(0);assert.equal(updated,1);close();assert.equal(p.phase,6);assert.equal(p.panelVisible,true);
});

test('title main to difficulty to character preserves source state delays',{skip:!available},()=>{
 const starts=[];const m=new Th20TitleMenu({bank:bank('title'),font:{draw(){}},onStart:s=>starts.push(s)});
 ticks(m,131);assert.equal(m.phase,1);m.update(0);assert.equal(m.phase,2);
 m.update(Keys.CONFIRM);assert.equal(m.phase,4);ticks(m,19);assert.equal(m.state,'main');m.update(0);assert.equal(m.state,'difficulty');assert.equal(m.phase,1);
 ticks(m,7);assert.equal(m.phase,2);m.update(Keys.CONFIRM);assert.equal(m.phase,3);ticks(m,14);assert.equal(m.state,'character');assert.equal(m.phase,1);
 ticks(m,7);assert.equal(m.phase,2);tap(m,Keys.RIGHT);assert.equal(m.selection,1);m.update(Keys.CONFIRM);ticks(m,14);assert.deepEqual(starts,[{character:1,difficulty:1,mode:'normal'}]);
 m.draw(new DrawList());
});
