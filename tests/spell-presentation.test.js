import test from 'node:test';
import assert from 'node:assert/strict';
import {DrawList} from '../packages/thlib/src/render.js';
import {PerspectiveCamera,PerspectiveSprite,TexturedRing,presentationQuaternion,multiplyPresentationQuaternion,presentationWorldMatrix} from '../packages/thlib/src/spell-presentation.js';

test('perspective screen positions round-trip at original charge/magic depth planes',()=>{
  const camera=new PerspectiveCamera({canvasWidth:960,canvasHeight:720,viewport:{x:0,y:0,width:960,height:720}});
  for(const depth of [.9,.95,.99])for(const [x,y]of [[0,0],[-320,-240],[125,111],[320,240]]){
    const world=camera.screenToWorld(x,y,depth),pixel=camera.worldToScreen(world);
    assert.ok(Math.abs(pixel.x-x)<.00004);assert.ok(Math.abs(pixel.y-y)<.00004);
    const m=camera.matrix(world,{x:1,y:1,z:1});
    assert.ok(m[15]>0,'Clip W must retain depth, enabling perspective texture interpolation');
    assert.ok(Math.abs(m[12]/m[15]-x/320)<.000002);assert.ok(Math.abs(m[13]/m[15]-y/240)<.000002);
  }
});

test('3D sprites submit the four original corners and homogeneous transform',()=>{
  const camera=new PerspectiveCamera(),sprite=new PerspectiveSprite(camera,{uv:[.5,0,.5,.5]}),draw=new DrawList();
  sprite.draw(draw,2,{position:camera.screenToWorld(12,33,.95),scale:{x:.25,y:.25,z:1},rotation:presentationQuaternion(.3,.2,.1),color:0x12345678});
  const [kind,texture,vertices,indices,mvp]=draw.commands[0];
  assert.equal(kind,'mesh3d');assert.equal(texture,2);assert.equal(vertices.length,4);assert.equal(mvp.length,16);
  assert.deepEqual(vertices.map(v=>v.slice(0,5)),[[-.5,.5,0,.5,0],[.5,.5,0,1,0],[-.5,-.5,0,.5,.5],[.5,-.5,0,1,.5]]);
  assert.deepEqual(indices,[0,1,2,1,3,2]);assert.ok(vertices.every(v=>v[5]===0x12345678));
  assert.notEqual(mvp[3],0,'Inclined sprite must vary clip W across its X axis');
  assert.notEqual(mvp[7],0,'Inclined sprite must vary clip W across its Y axis');
});

test('row-vector quaternion composition rotates in local coordinates',()=>{
  const a=presentationQuaternion(0,0,Math.PI/2),b=presentationQuaternion(Math.PI/2,0,0),q=multiplyPresentationQuaternion(b,a);
  const m=presentationWorldMatrix({x:1,y:2,z:3},{x:2,y:3,z:4},q);
  assert.deepEqual(m.slice(12),[1,2,3,1]);assert.ok(Math.abs(m[0])<.000001);assert.ok(Math.abs(m[1]-2)<.000001);
  assert.ok(Math.abs(m[6]-3)<.000001);
});

test('textured rings preserve all 512 source segments and repeat count while retaining buffers',()=>{
  const ring=new TexturedRing({rounds:4,uv:[3/8,0,1/8,1]}),draw=new DrawList(),vertices=ring.vertices,indices=ring.indices;
  ring.draw(draw,7,{x:2,y:3,inner:175,outer:195,rotation:0,screenX:x=>x*1.5,screenY:y=>-y*1.5});
  assert.equal(vertices.length,1026);assert.equal(indices.length,3072);assert.deepEqual(vertices[0],[197*1.5,-4.5,.5,0,0xffffffff]);
  assert.equal(vertices.at(-1)[3],4);assert.ok(Math.abs(vertices.at(-1)[0]-(2+175)*1.5)<1e-10);
  draw.reset();ring.draw(draw,7,{inner:20,outer:40,rotation:1});
  assert.equal(ring.vertices,vertices);assert.equal(ring.indices,indices);assert.equal(draw.commands[0][2],vertices);
});

test('configured rings preserve the original closing triangles and accept the accumulated world basis',()=>{
  const ring=new TexturedRing({closedSeam:true}),draw=new DrawList();
  assert.equal(ring.indices.length,3078);assert.deepEqual(ring.indices.slice(-6),[1024,0,1025,0,1,1025]);
  ring.draw(draw,4,{inner:20,outer:40,rotationMatrix:[0,1,-1,0]});
  assert.deepEqual(ring.vertices[0].slice(0,2),[0,40]);assert.deepEqual(ring.vertices[1].slice(0,2),[0,20]);
});
