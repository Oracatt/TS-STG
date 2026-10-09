import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {DrawList} from '../packages/thlib/dist/render.js';
import {AnmBank} from '../packages/thlib/dist/touhou/anm-vm.js';
import {drawAnm,anmSpriteVertices} from '../packages/thlib/dist/touhou/anm-render.js';
import {createTouhouResources} from '../packages/thlib/dist/touhou/resources.js';
import {RushBulletVisuals,RUSH_TOUHOU_BULLET_TYPES} from '../games/rushboss/src/bullet-visuals.js';
import {BULLET_STYLES} from '../games/rushboss/src/bullet-styles.js';
import {referenceExecuteFrame} from './fixtures/th20/anm-frame-reference.js';
import {expandDrawCommands} from './fixtures/th20/quad.js';
import {anmSpriteVertices as referenceVertices} from './fixtures/th20/sprite-geometry-reference.js';

function data(instructions){
  let offset=0;
  return{format:'touhou-anm-v8',name:'performance-parity',entries:[{width:256,height:256,texture:{width:256,height:256,path:'fixture'}}],
    sprites:[{entry:0,x:0,y:0,width:32,height:32,pivotX:0,pivotY:0,scaleX:1,scaleY:1,rotation:0}],
    scripts:[{instructions:instructions.map(([opcode,args=[],time=0])=>{const ins={opcode,args,time,mask:0,offset,size:8+args.length*4};offset+=ins.size;return ins;})}]};
}
const bytes=vm=>new Uint8Array(vm.memory.buffer);
const fields=vm=>[vm.pc,vm.time,vm.pendingInterrupt,vm.returnPc,vm.returnTime,vm.alive,vm.stopped,[...vm.interpolations]];

test('idle ANM fast path matches frozen instruction ticks through clocks, mutations, motion and interpolation',()=>{
  const fixture=data([[300,[0]],[3],[5,[1]],[403,[99]],[3]]);
  const active=new AnmBank(fixture),original=new AnmBank(fixture);
  const vm=active.create(0),reference=original.create(0);reference.executeFrame=referenceExecuteFrame;
  const times=[0,-0,.1,1,65535,16777215,16777216,16777217,Infinity];
  for(const time of times){
    vm.time=reference.time=time;
    for(let frame=0;frame<12;frame++){vm.update();reference.update();assert.deepEqual(fields(vm),fields(reference));assert.deepEqual(bytes(vm),bytes(reference));}
  }
  vm.time=reference.time=0;
  for(let frame=0;frame<120;frame++){
    for(const object of[vm,reference]){
      if(frame===10){object.flag(0x80000,0x80000);object.F(0x44,.1);object.F(0x60,.25);object.F(0x3a0,.03);}
      if(frame===30)object.flag(0x80000,0);
      if(frame===40)object.interpolate('alpha',0x493,1,[11],8,0,{bytes:true,integer:true});
      if(frame===60)object.interrupt(1);
      if(frame===80){object.pc=object.bank.scripts[0].instructions[1].offset;object.time=0;}
    }
    vm.update();reference.update();assert.deepEqual(fields(vm),fields(reference),`clock frame ${frame}`);assert.deepEqual(bytes(vm),bytes(reference),`bytes frame ${frame}`);
  }
  for(const flag of[0x800,0]){
    vm.flag(0x800,flag);reference.flag(0x800,flag);
    if(flag){assert.throws(()=>vm.update(),/corner snapshot/);assert.throws(()=>reference.update(),/corner snapshot/);}
    else{vm.update();reference.update();}
    assert.deepEqual(fields(vm),fields(reference));assert.deepEqual(bytes(vm),bytes(reference));
  }
  // Public byte writes remain visible through render views and vice versa.
  vm.memory.setFloat32(0x5bc,-0,true);assert.ok(Object.is(vm.worldPosition().x,reference.worldPosition().x));
  const first=vm.worldPosition();vm.x=7;assert.notEqual(vm.worldPosition(),first);
  const scratch={};assert.equal(vm.worldPosition({},scratch),scratch);assert.deepEqual(scratch,vm.worldPosition());
});

test('stateful quads expand exactly into the original blend, sampler and geometry stream',()=>{
  const bank=new AnmBank(data([[300,[0]],[302,[1]],[3]]),{loadTexture:()=>7}),vm=bank.create(0);
  vm.rotation=.31;vm.x=13.25;vm.y=-17.5;vm.color=0x738abced;
  let lastState;
  for(let blend=0;blend<10;blend++)for(const point of[false,true])for(let u=0;u<3;u++)for(let v=0;v<3;v++){
    vm.B(0x499,blend);vm.U(0x4a0,(point?4:0)|(u<<16)|(v<<13));
    const compact=new DrawList(),original=new DrawList();original.statefulQuad=undefined;
    drawAnm(vm,compact,{x:100,y:200,scale:1.5});drawAnm(vm,original,{x:100,y:200,scale:1.5});
    assert.equal(compact.commands.length,1);assert.equal(original.commands.length,6);
    assert.deepEqual(expandDrawCommands(compact.commands),original.commands,`${blend}/${point}/${u}/${v}`);
    const command=compact.commands[0],state=command[17];assert.equal(state.length,10);assert.ok(Object.isFrozen(state));
    if(lastState&&lastState.blend===blend)assert.equal(lastState.command[17],lastState.state);
    const again=new DrawList();drawAnm(vm,again,{x:120,y:200,scale:1.5});assert.equal(again.commands[0][17],state);
    lastState={blend,command,state};
  }
  // Untextured geometry never installs or validates an unused sampler.
  bank.textures.set(0,0);vm.U(0x4a0,(3<<16)|(3<<13));
  const compact=new DrawList(),original=new DrawList();original.statefulQuad=undefined;
  drawAnm(vm,compact);drawAnm(vm,original);assert.deepEqual(expandDrawCommands(compact.commands),original.commands);
});

test('raw sprite caches preserve signed zeros, direct byte writes and changing texture/sprite inputs',()=>{
  const fixture=data([[300,[0]],[3]]),bank=new AnmBank(fixture,{loadTexture:()=>7,paddedTextures:false}),vm=bank.create(0),sprite=fixture.sprites[0],entry=fixture.entries[0];
  const view={x:1,y:2,scale:1.5,pixelSnap:false};
  for(let type=0;type<4;type++){
    vm.B(0x498,type);
    for(const address of[0x50,0x54,0x58,0x5c,0x70,0x74,0x80,0x84,0x40,0x78,0x7c,0x68,0x6c]){
      const original=vm.U(address);
      for(const value of[0,-0,1e-40,-1e-40,1.2345,NaN]){
        vm.memory.setFloat32(address,value,true);
        for(let repeat=0;repeat<2;repeat++)assert.deepEqual(anmSpriteVertices(vm,view),referenceVertices(vm,view),`${type}/${address.toString(16)}/${value}/${repeat}`);
      }
      vm.U(address,original);
    }
    for(const property of['x','y','width','height','pivotX','pivotY','scaleX','scaleY','rotation']){
      const original=sprite[property];
      for(const value of[0,-0,3.123,NaN]){
        sprite[property]=value;
        for(let repeat=0;repeat<2;repeat++)assert.deepEqual(anmSpriteVertices(vm,view),referenceVertices(vm,view),`${type}/sprite.${property}/${value}/${repeat}`);
      }
      sprite[property]=original;
    }
    for(const property of['width','height']){
      const original=entry.texture[property];
      for(const value of[128,513,256]){entry.texture[property]=value;assert.deepEqual(anmSpriteVertices(vm,view),referenceVertices(vm,view));}
      entry.texture[property]=original;
    }
  }
});

// Frozen Rush drawing bridge before this performance change. The shared ANM
// implementation is exercised twice with independent VMs and resource banks.
function referenceDrawBullet(draw,b,view,alpha=1){
  const visual=this.visuals.get(b);if(!visual)return false;
  const{animation,child}=visual;
  animation.x=b.x;animation.y=-b.y;
  if(animation.orientation){animation.rotation=-(b.rotation??0);animation.flag(2,2);}
  animation.scale2X=animation.scale2Y=b.size/BULLET_STYLES[b.kind].size;animation.flag(4,4);
  const originalAlpha=animation.alpha,originalColor=animation.color;
  if(Array.isArray(b.tint)){const c=originalColor;animation.color=((((c>>>24)*b.tint[0])<<24)|(((c>>>16&255)*b.tint[1])<<16)|(((c>>>8&255)*b.tint[2])<<8)|(c&255))>>>0;}
  animation.alpha=Math.floor(originalAlpha*(b.alpha??1)*alpha);
  animation.draw(draw,view);child?.draw(draw,view);
  animation.alpha=originalAlpha;animation.color=originalColor;return true;
}
const optional={skip:!existsSync('packages/thlib/assets/touhou-common/manifest.json')||process.env.TS_STG_TEST_STATIC_ASSETS==='1'};
test('all shared Rush bullet palettes preserve frozen drawing and VM bytes across fog, tint, alpha and cancellation',optional,()=>{
  const host={readText:f=>readFileSync(f,'utf8'),loadTexture:()=>1},first=createTouhouResources(host),second=createTouhouResources(host);
  const actual=new RushBulletVisuals(first),reference=new RushBulletVisuals(second);reference.drawBullet=referenceDrawBullet;
  const bullets=[],originals=[];
  for(const kind of Object.keys(RUSH_TOUHOU_BULLET_TYPES))for(let color=0;color<BULLET_STYLES[kind].colors;color++){
    const b={kind,color,alive:true,group:'bullet',delay:15,x:color*3,y:11,size:BULLET_STYLES[kind].size,rotation:.125,alpha:1};
    bullets.push(b);originals.push({...b});
  }
  for(let frame=0;frame<36;frame++){
    for(const list of[bullets,originals])for(let index=0;index<list.length;index++){
      const b=list[index];b.x+=.25;b.y-=.125;b.rotation+=.01;b.delay=Math.max(0,15-frame);
      b.alpha=frame%3?1:.503;if(frame%4===0)b.tint=[.8,.5,.2];else b.tint=undefined;
      if(frame===21&&index%3===0)b.color=(b.color+1)%BULLET_STYLES[b.kind].colors;
      if(frame===28&&index%5===0)b.alive=false;
    }
    actual.update(bullets);reference.update(originals);
    const a=new DrawList(),r=new DrawList();r.statefulQuad=undefined;
    for(let index=0;index<bullets.length;index++){
      actual.drawBullet(a,bullets[index],{x:480,y:360,scale:1.5},frame%5===0?.333:1);
      reference.drawBullet(r,originals[index],{x:480,y:360,scale:1.5},frame%5===0?.333:1);
      const av=actual.visuals.get(bullets[index]),rv=reference.visuals.get(originals[index]);assert.equal(!!av,!!rv);
      if(av)assert.deepEqual(bytes(av.animation),bytes(rv.animation),`VM ${frame}/${index}`);
    }
    actual.drawEffects(a,{x:480,y:360,scale:1.5});reference.drawEffects(r,{x:480,y:360,scale:1.5});
    assert.deepEqual(expandDrawCommands(a.commands),r.commands,`full commands frame ${frame}`);
  }
  actual.dispose();reference.dispose();first.dispose();second.dispose();
});
