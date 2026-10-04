import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {AnmBank,AnmInstance} from '../games/touhou20/src/anm.js';import {createTh20Camera,projectedAnmWorld,projectedAnmGeometry} from '../games/touhou20/src/anm-projection.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/th20/projection.json',import.meta.url))),bits=v=>new Uint32Array(new Float32Array([v]).buffer)[0];
test('type8 world matrices match 14400 independently compiled source/D3DX words',()=>{
 assert.equal(fixture.evidence.failures,0);
 for(const c of fixture.cases){const nodes=c.words.map(words=>{const memory=new DataView(new Uint32Array(words).buffer),vm=Object.create(AnmInstance.prototype);vm.memory=memory;vm.scriptId=c.script;vm.bank={data:{name:'oracle',sprites:[]}};vm.bank.data.sprites[vm.spriteIndex]={width:memory.getFloat32(0x3b8,true)*256,height:memory.getFloat32(0x3cc,true)*256};return vm;});nodes.forEach((vm,i)=>{vm.parent=nodes[c.parents[i][0]]??null;vm.transformParent=nodes[c.parents[i][1]]??null;});
  assert.deepEqual(projectedAnmWorld(nodes.at(-1),c.scale,c.offsets).map(bits),c.expected,`effect${c.script}/frame${c.frame}`);
 }
});
test('all source window-mode cameras preserve actual D3DX normalization rounding',()=>{
 for(const c of fixture.cameras){const camera=createTh20Camera(c);assert.deepEqual([...camera.view,...camera.projection].map(bits),c.expected);}
 assert.throws(()=>createTh20Camera({x:0,y:0,width:900,height:600}),/Unverified/);
});
const dataFile=new URL('../games/touhou20/assets/anm/effect.json',import.meta.url);
test('original death debris submits perspective geometry with unequal clip W',{skip:!fs.existsSync(dataFile)},()=>{
 const bank=new AnmBank(JSON.parse(fs.readFileSync(dataFile)),{loadTexture:()=>1}),root=bank.create(37,{y:160});
 for(let i=0;i<8;i++)root.update();const debris=bank.instances.find(vm=>vm.alive&&vm.renderType===8),geometry=projectedAnmGeometry(debris,{x:336,y:24,scale:1.5,screenScale:1});
 const w=geometry.vertices.map(([x,y,z])=>x*geometry.mvp[3]+y*geometry.mvp[7]+z*geometry.mvp[11]+geometry.mvp[15]);assert.ok(w.every(Number.isFinite));assert.ok(Math.max(...w)-Math.min(...w)>1);assert.equal(geometry.vertices.length,4);
});
