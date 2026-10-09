import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AnmBank} from '../games/touhou20/src/anm.js';
import {Th20BossHud} from '../games/touhou20/src/boss-hud.js';
import {DrawList} from '../packages/thlib/dist/render.js';
const load=name=>new AnmBank(JSON.parse(fs.readFileSync(new URL(`../games/touhou20/assets/anm/${name}.json`,import.meta.url))),{loadTexture:()=>1});
const create=()=>new Th20BossHud({bank:load('front'),textBank:load('ascii_960')});
test('original timer preserves seconds-based clamp, truncation and warning sound boundaries',()=>{
 const h=create();h.setTime(100,-5);assert.deepEqual([h.seconds,h.hundredths],[99,99]);h.setTime(-1,-20);assert.deepEqual([h.seconds,h.hundredths],[-1,-20]);
 h.setRemainingFrames(-61);assert.deepEqual([h.seconds,h.hundredths],[-1,-1]);
 const boss={x:0,y:90,hp:100,health:{maximum:100}},sounds=[];
 for(const remainingFrames of [300,299,239,179,119,59,0])h.update({bosses:[boss],remainingFrames,sound:id=>sounds.push(id)});
 assert.deepEqual(sounds,[11,11,11,12,12]);h.update({bosses:[]});assert.equal(h.timerVisible,false);assert.equal(h.pointer.visible,false);h.destroy();
});
test('original boss rings fill by float32 .025, keep markers and use 80/96 proximity thresholds',()=>{
 const h=create(),boss={x:0,y:100,hp:400,health:{maximum:1000}},state={bosses:[boss],player:{x:0,y:179},remainingFrames:600};
 h.setMarkers(0,[.25,.5]);h.update(state);assert.equal(h.panels[0].fraction,Math.fround(.025));assert.equal(h.panels[0].near,true);
 for(let i=0;i<20;i++)h.update(state);assert.equal(h.panels[0].fraction,Math.fround(.4));assert.equal(h.panels[0].animations[3].visible,true);assert.equal(h.panels[0].animations[4].visible,false);
 state.player.y=195;h.update(state);assert.equal(h.panels[0].near,true);state.player.y=196;h.update(state);assert.equal(h.panels[0].near,false);
 boss.hp=200;h.update(state);assert.equal(h.panels[0].fraction,Math.fround(.2));boss.primaryFlags=0x10;h.update(state);assert.equal(h.panels[0].animations.length,0);
 h.destroy();
});
test('source front health geometry and original timer sprites draw through real ANM',()=>{
 const h=create(),draw=new DrawList(),boss={x:0,y:100,hp:300,health:{maximum:800}};
 for(let f=0;f<80;f++){h.update({bosses:[boss],player:{x:100,y:400},remainingFrames:600-f});h.draw(draw);}
 assert.ok(draw.commands.some(c=>c[0]==='mesh'||c[0]==='quad'||c[0]==='statefulQuad'));assert.equal(h.numbers[0].spriteIndex,239);assert.equal(h.numbers[1].spriteIndex,247);h.destroy();
});
