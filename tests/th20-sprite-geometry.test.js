import test from 'node:test';
import assert from 'node:assert/strict';
import {AnmBank} from '../games/touhou20/src/anm-vm.js';
import {anmSpriteVertices,drawAnm} from '../games/touhou20/src/anm-render.js';
import {anmSpriteVertices as reference,referenceWorldPosition} from './fixtures/th20/sprite-geometry-reference.js';
import {Th20RenderQueue} from '../games/touhou20/src/render-queue.js';
import {DrawList} from '../packages/thlib/src/render.js';
import {expandDrawCommands} from './fixtures/th20/quad.js';

test('partial render flush retains sorted entries and reorders newly enqueued priorities',()=>{
  const queue=new Th20RenderQueue(),draw=new DrawList();
  queue.enqueuePriority(80,d=>d.rect(80,0,1,1,0));
  queue.enqueuePriority(20,d=>d.rect(20,0,1,1,0));
  queue.flush(draw,{maximumPriority:40});
  queue.enqueuePriority(60,d=>d.rect(60,0,1,1,0));
  queue.flush(draw);
  assert.deepEqual(draw.commands.map(c=>c[1]),[20,60,80]);
});

test('optimized sprite geometry retains every float32 endpoint across transforms, colors, UVs and views',()=>{
  const data={format:'th20-anm-v8',name:'geometry',entries:[{width:1024,height:512,texture:{width:936,height:480,path:'test'}}],sprites:[{entry:0,x:13,y:29,width:62,height:14,pivotX:0,pivotY:0,scaleX:1,scaleY:1,rotation:0}],scripts:[{instructions:[{opcode:300,args:[0],time:0,mask:0,offset:0,size:12},{opcode:3,args:[],time:0,mask:0,offset:12,size:8}]}]};
  const bank=new AnmBank(data,{loadTexture:()=>1}),parent=bank.create(0),vm=bank.create(0,{parent});
  let seed=1931;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const real=(max=20)=>(next()/0x100000000-.5)*max;
  let previous;
  for(let i=0;i<2000;i++){
    for(const object of[parent,vm]){
      for(const address of[0x2c,0x30,0x34,0x40,0x50,0x54,0x58,0x5c,0x68,0x6c,0x70,0x74,0x78,0x7c,0x80,0x84,0x484,0x488,0x48c,0x5bc,0x5c0,0x5c4])object.F(address,real());
      object.B(0x4a4,next()%7);object.U(0x4a8,next()%3);object.U(0x4ac,next()%3);object.U(0x490,next());object.U(0x494,next());object.U(0x5cc,next());
    }
    const flags=(i%2?0x1000000:0)|(i%3?0:0x1000)|(i%5?0:0x400000)|(i%7?0:0x20);
    vm.U(0x49c,flags);vm.B(0x498,i%4);vm.U(0x4a0,(i%5)<<10);vm.B(0x4a3,i%3);
    vm.parent=i%6?parent:null;vm.transformParent=vm.parent;
    const sprite=data.sprites[0];sprite.scaleX=real(3);sprite.scaleY=real(3);sprite.pivotX=real();sprite.pivotY=real();sprite.rotation=real(8);
    bank.environment.paddedTextures=!!(i%2);
    const view={x:real(1000),y:real(1000),scale:real(4),pixelSnap:i%3!==0,screenOffsets:[{x:real(),y:real()},{x:real(),y:real()}]};if(i%4)view.screenScale=real(3);
    assert.deepEqual(vm.worldPosition(view),referenceWorldPosition.call(vm,view),`position ${i}`);
    const expected=reference(vm,view),actual=anmSpriteVertices(vm,view);
    assert.deepEqual(actual,expected,`state ${i}`);
    // A moving owner can reuse local corners, while changing color and UV
    // must still affect this frame. The comparison visits the cache hit path.
    vm.x+=1;vm.y-=2;vm.F(0x78,real());vm.U(0x490,next());
    assert.deepEqual(anmSpriteVertices(vm,view),reference(vm,view),`cached moving state ${i}`);
    const native=new DrawList(),fallback=new DrawList();fallback.quad=undefined;
    drawAnm(vm,native,view);drawAnm(vm,fallback,view);
    assert.deepEqual(expandDrawCommands(native.commands,{mesh:true}),fallback.commands,`native quad versus portable renderer ${i}`);
    const corners=native.commands.find(c=>c[0]==='quad'||c[0]==='statefulQuad')[2];assert.ok(Object.isFrozen(corners));
    if(previous)assert.deepEqual(previous.array,previous.copy,'prior draw command must retain its own vertex data');
    previous={array:actual,copy:actual.map(point=>point.slice())};
  }
});
