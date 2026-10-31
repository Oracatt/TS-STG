const m=tsstg.loadModel('native/tests/models/cube.glb');
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const light=[0,0,2,0,1,0,1,1,1,0,0,0,0,0,0,10,100,1];
let mode=0;
export function update(n){mode=n;}
export function render(){
 const begin=['modelSceneBegin',identity,light],end=['modelSceneEnd'];
 return [
  [['model3d',m,identity,0xffffffff]],
  [end],
  [begin],
  [begin,begin,end,end],
  [begin,['rect',0,0,3,3,0xffffffff],end],
  [begin,['model3d',m,[...identity.slice(0,15),0],0xffffffff],end],
  [['modelSceneBegin',identity,light.map((v,i)=>i===4?0:v)],end],
  [begin,['model3d',999999,identity,0xffffffff],end],
  [['blend','add'],begin,end,['blendEnd']],
  [['alphaTest',.1],begin,end],
  [['modelSceneBegin',[1],light],end]
 ][mode];
}
globalThis.__tsstg_game={update,render};
