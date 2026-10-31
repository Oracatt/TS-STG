import {DrawList} from '@ts-stg/thlib';
const host=globalThis.tsstg;
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const pose=(scale,z)=>[scale,0,0,0,0,scale,0,0,0,0,.1,0,0,0,z,1];
const model=host.loadModel('native/tests/models/cube.glb'),info=host.modelInfo(model);
assert(info.meshes===1&&info.triangles===12&&info.minimum[0]===-1&&info.maximum[2]===1,'model bounds/topology');
for(const name of ['external','invalid-accessor','singular','transparent']){
  let rejected=false;try{host.loadModel(`native/tests/models/${name}.glb`);}catch{rejected=true;}
  assert(rejected,`must reject ${name}`);
}
let traversal=false;try{host.loadModel('../outside.glb');}catch{traversal=true;}assert(traversal,'resource path boundary');
const temporary=host.loadModel('native/tests/models/cube.glb');host.unloadModel(temporary);
let invalid=false;try{host.modelInfo(temporary);}catch{invalid=true;}assert(invalid,'unloaded handle');
const target=host.createRenderTarget(960,720);
const lighting={eye:[0,0,2],ambient:[1,1,1],sunlight:[0,0,0],fogStart:100,fogEnd:200};
let frames=0,checkPixels=false,checked=false;
export function update(input){frames++;checkPixels=!!input;
 if(checkPixels&&frames===3){const p=host.readTexturePixels(),pixel=(x,y)=>[...p.pixels.slice((y*p.width+x)*4,(y*p.width+x)*4+3)];
  assert(pixel(480,360)[0]>230&&pixel(480,360)[2]<20,'near red model must occlude far blue drawn later');
  assert(pixel(20,20)[1]>230,'2D HUD survives model scene state');
  assert(pixel(850,620)[0]<20,'scissor clips model scene');checked=true;
 }
}
export function render(){const d=new DrawList();
 d.targetBegin(target,0x000000ff).scissor(100,100,700,480).modelSceneBegin(identity,lighting);
 d.model3d(model,pose(.75,-.4),0xff0000ff).model3d(model,pose(.9,.4),0x0000ffff).modelSceneEnd().scissorEnd().targetEnd();
 d.clear(0x000000ff).sprite(target,480,360,960,720).rect(10,10,30,30,0x00ff00ff);
 return d.commands;
}
export function snapshot(){return {info,checked};}
globalThis.__tsstg_game={update,render,snapshot};
