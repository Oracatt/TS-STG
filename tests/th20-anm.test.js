import {expandDrawCommands} from './fixtures/th20/quad.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {decodeAnm,AnmBank,UnsupportedAnmError} from '../games/touhou20/src/anm.js';
import {anmSpriteVertices} from '../games/touhou20/src/anm-render.js';
import {DrawList} from '../packages/thlib/dist/render.js';
import {AnmInterpolation} from '../games/touhou20/src/anm-interpolation.js';
import {Th20RenderQueue} from '../games/touhou20/src/render-queue.js';

const root=new URL('../',import.meta.url),asset=name=>new URL(`games/touhou20/assets/anm/${name}.json`,root);
const available=fs.existsSync(asset('pl00')),data=name=>JSON.parse(fs.readFileSync(asset(name)));
const bank=name=>new AnmBank(data(name),{loadTexture:()=>1});
const bits=n=>new Uint32Array(new Float32Array([n]).buffer)[0];
function synthetic(programs){return{format:'th20-anm-v8',name:'synthetic',entries:[{width:64,height:64,texture:{width:64,height:64,path:'test.png'}}],sprites:[{entry:0,x:0,y:0,width:16,height:8,pivotX:0,pivotY:0,scaleX:1,scaleY:1,rotation:0}],scripts:programs.map(program=>{let offset=0;return{instructions:[...program.map(([opcode,args=[],time=0,mask=0])=>{const i={opcode,args,time,mask,offset,size:8+args.length*4};offset+=i.size;return i;}),{opcode:-1,args:[],time:0,mask:0,offset,size:0}]};})};}

test('ANM decoder rejects truncated headers and unsupported versions',()=>{
 assert.throws(()=>decodeAnm(new Uint8Array(63)),/truncated/);
 const b=new Uint8Array(100);new DataView(b.buffer).setUint32(0,7,true);assert.throws(()=>decodeAnm(b),/unsupported ANM version 7/);
});

test('scalar integer Hermite preserves the original multiply ordering at truncation boundary',()=>{
 const alpha=new AnmInterpolation([9],[63],3,8,{integer:true});assert.deepEqual(alpha.sample(),[22]);
});

test('ANM imports preserve texture payload hashes and sequential sprite indices',{skip:!available},()=>{
 for(const name of['pl00','pl01','front','enemy','bullet','effect','aura']){const archive=data(name);
  archive.sprites.forEach((s,i)=>assert.equal(s.index,i));archive.scripts.forEach((s,i)=>assert.equal(s.index,i));
  for(const entry of archive.entries){if(!entry.texture.path)continue;const bytes=fs.readFileSync(new URL(entry.texture.path,root));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.texture.sha256);if(entry.texture.referenceExtractedSha256)assert.equal(entry.texture.referenceExtractedSha256,entry.texture.sha256);}
 }
 assert.equal(data('pl00').sprites[29].width,62);assert.equal(data('pl00').sprites[29].height,14);
});

test('70 original script traces match independently compiled source ANM oracle bit for bit',{skip:!available},()=>{
 const trace=JSON.parse(fs.readFileSync(new URL('./fixtures/th20/anm.json',import.meta.url)));
 assert.equal(trace.evidence.failures,0);
 for(const fixture of trace.fixtures){const b=bank(fixture.archive),vm=b.create(fixture.script);
  fixture.frames.forEach((expected,frame)=>{for(const event of fixture.events)if(event[0]===frame)vm.interrupt(event[1]);if(frame)vm.update();
   assert.deepEqual([+vm.alive,vm.time,vm.pc,b.rng.state,...trace.addresses.map(a=>vm.U(a))],expected,`${fixture.archive}:${fixture.script},frame${frame}`);
  });
 }
});

test('mixed HUD coordinate modes put original underline at HUD, not playfield',{skip:!available},()=>{
 const b=bank('front'),frame=b.create(2),underline=b.create(20);for(let i=0;i<100;i++){frame.update();underline.update();}
 const view={scale:1,screenScale:1.5};assert.equal(anmSpriteVertices(frame,view)[1][0],47.5);
 const d=new DrawList();underline.draw(d,view);const vertices=d.commands.find(c=>c[0]==='mesh')[2];
 assert.equal(Math.min(...vertices.map(v=>v[0])),786);assert.equal(Math.max(...vertices.map(v=>v[0])),930);
 assert.equal(Math.min(...vertices.map(v=>v[1])),85.5);
});

test('needle sprite rotation and original UV dimensions remain independent',{skip:!available},()=>{
 const vm=bank('pl00').create(7);for(let i=0;i<10;i++)vm.update();vm.rotation=Math.fround(-Math.PI/2);
 const p=anmSpriteVertices(vm,{scale:1.5}),w=Math.max(...p.map(v=>v[0]))-Math.min(...p.map(v=>v[0])),h=Math.max(...p.map(v=>v[1]))-Math.min(...p.map(v=>v[1]));
 assert.ok(h>w*4);assert.equal(p[1][2]-p[0][2],62/256);assert.equal(p[2][3]-p[0][3],14/256);
});

test('sprite remapping runs before lookup and direct setSprite bypasses it',{skip:!available},()=>{
 let calls=0;const vm=bank('pl00').create(0,{spriteRemap:id=>{calls++;return id+1;}});assert.equal(calls,1);assert.equal(vm.spriteIndex,1);vm.setSprite(3);assert.equal(calls,1);assert.equal(vm.spriteIndex,3);
});

test('file templates consume initialization randomness once before sprite callback installation',()=>{
 const b=new AnmBank(synthetic([[[122,[10000,100],-1,1],[300,[0],-1],[3]]]));const seed=b.rng.state;
 let remaps=0;const first=b.create(0,{spriteRemap:()=>{remaps++;return 999;}}),second=b.create(0);
 assert.notEqual(seed,1);assert.equal(b.rng.state,seed);assert.equal(first.U(0x444),second.U(0x444));assert.equal(first.spriteIndex,0);assert.equal(remaps,0);
 first.U(0x444,999);assert.notEqual(second.U(0x444),999);
});

test('detached children survive owner deletion and collect does not advance',()=>{
 const b=new AnmBank(synthetic([[[504,[1]],[3]],[[300,[0]],[1,[],4]]]));const owner=b.create(0),child=b.instances.find(v=>v.detachedRoot);
 assert.ok(child);assert.equal(child.time,1);owner.destroy();assert.equal(child.alive,true);b.collect();assert.deepEqual(b.instances,[child]);assert.equal(child.time,1);
 b.updateDetached();assert.equal(child.time,2);b.updateDetached();b.updateDetached();b.updateDetached();assert.equal(child.alive,false);assert.equal(b.collect(),0);
});

test('child position inherits original root ancestor while sprite scale uses immediate parent',()=>{
 const b=new AnmBank(synthetic([[[400,[bits(10),0,0]],[500,[1]],[3]],[[400,[bits(20),0,0]],[500,[2]],[3]],[[400,[bits(30),0,0]],[300,[0]],[3]]]));
 const rootVm=b.create(0),child=rootVm.children[0],grandchild=child.children[0];assert.equal(child.worldPosition().x,30);assert.equal(grandchild.worldPosition().x,40);assert.equal(grandchild.transformParent,rootVm);assert.equal(grandchild.parent,child);
});

test('unknown opcodes fail with archive, script, offset and time',()=>{
 const b=new AnmBank(synthetic([[[9876]]]));assert.throws(()=>b.create(0),e=>e instanceof UnsupportedAnmError&&/synthetic:0 pc=0 time=0: opcode 9876/.test(e.message));
});

test('render queue sorts across actor and bank boundaries without drawing children twice',()=>{
 const d=synthetic([[[300,[0]],[3]]]),b1=new AnmBank(d,{loadTexture:()=>1}),b2=new AnmBank(d,{loadTexture:()=>2});
 const older=b1.create(0,{x:100}),newer=b2.create(0,{x:200}),front=b1.create(0,{x:300});older.layer=newer.layer=10;front.layer=20;
 const queue=new Th20RenderQueue(),out=new DrawList();front.draw(queue);newer.draw(queue);older.draw(queue);older.draw(queue);
 queue.enqueue(15,draw=>draw.rect(9,9,9,9,0xffffffff));queue.flush(out);
 assert.deepEqual(expandDrawCommands(out.commands,{mesh:true}).filter(c=>c[0]==='mesh'||c[0]==='rect').map(c=>c[0]==='mesh'?c[2][0][0]:c[1]),[91.5,191.5,9,291.5]);
 assert.equal(queue.entries.length,0);
});

test('bank dispose releases owned loaded textures once and preserves resolved external textures',()=>{
 const d=synthetic([[[300,[0]],[3]]]);d.entries.push({...d.entries[0],texture:{kind:'dynamic'}});d.sprites.push({...d.sprites[0],entry:1});
 const freed=[],b=new AnmBank(d,{loadTexture:()=>7,resolveTexture:()=>9,unloadTexture:id=>freed.push(id)}),vm=b.create(0);b.texture(0);b.texture(1);b.dispose();b.dispose();
 assert.deepEqual(freed,[7]);assert.equal(vm.alive,false);assert.throws(()=>b.create(0),/disposed/);
});

test('505/510 read secondary selection from base flags1, independently of rotation order in flags2',()=>{
 const data=synthetic([[[505,[2,bits(3),bits(4)]],[510,[2,bits(5),bits(6)]],[3]],[[505,[2,0,0]],[510,[2,0,0]],[3]],[[300,[0]],[3]]]);
 const bank=new AnmBank(data),secondary=bank.create(0,{secondary:true}),primary=bank.create(1,{beforeStart:vm=>vm.U(0x4a0,vm.U(0x4a0)|0x40000)});
 assert.deepEqual(secondary.children.map(vm=>[vm.renderSecondary,vm.renderFront,vm.F(0x484),vm.F(0x488)]),[[true,false,3,4],[true,true,5,6]]);
 assert.deepEqual(primary.children.map(vm=>[vm.renderSecondary,vm.renderFront]),[[false,false],[false,true]]);
 assert.equal(secondary.children[0].U(0x49c)&0x40000,0,'attached bind overwrites the flag with template state');
});

test('original draw callback order remaps primary/secondary groups and honors prepended children',()=>{
 const b=new AnmBank(synthetic([[[300,[0]],[3]],[[502,[0]],[503,[0]],[500,[0]],[501,[0]],[3]]]),{loadTexture:()=>1});
 const root=b.create(1,{secondary:true});assert.deepEqual(root.children.map(vm=>[vm.renderSecondary,vm.renderFront]),[[false,true],[true,true],[false,false],[true,false]]);
 const primary=b.create(0,{x:100}),secondary=b.create(0,{x:200,secondary:true}),early=b.create(0,{x:300,secondary:true}),front=b.create(0,{x:400,front:true});
 primary.layer=47;secondary.layer=30;early.layer=26;front.layer=47;
 assert.equal(primary.effectiveLayer,30);assert.equal(secondary.effectiveLayer,47);assert.equal(early.effectiveLayer,45);
 const queue=new Th20RenderQueue(),draw=new DrawList();for(const vm of[secondary,primary,early,front])vm.draw(queue);
 queue.enqueuePriority(70,d=>d.rect(9,0,1,1,0xffffffff));queue.flush(draw,{maximumPriority:70});
 assert.deepEqual(expandDrawCommands(draw.commands,{mesh:true}).filter(c=>c[0]==='mesh'||c[0]==='rect').map(c=>c[0]==='mesh'?c[2][0][0]:c[1]),[291.5,9]);
 draw.reset();queue.flush(draw);assert.deepEqual(expandDrawCommands(draw.commands,{mesh:true}).filter(c=>c[0]==='mesh').map(c=>c[2][0][0]),[391.5,91.5,191.5]);
});

test('actual body, enemy, bullet, HUD and aura scripts execute and draw supported paths',{skip:!available},()=>{
 for(const name of['pl00','pl01','enemy','bullet','front','aura']){const b=bank(name);
  for(let id=0;id<b.data.scripts.length;id++){const vm=b.create(id),d=new DrawList();for(let i=0;i<24&&vm.alive;i++){vm.update();vm.draw(d.reset(),{scale:1,screenScale:1.5});for(const c of expandDrawCommands(d.commands,{mesh:true}))if(c[0]==='mesh')for(const v of c[2])assert.ok(v.every(Number.isFinite),`${name}:${id}`);}vm.destroy();b.collect();}
 }
 const focus=bank('effect').create(19);for(let i=0;i<180;i++){focus.update();focus.draw(new DrawList());}
});
