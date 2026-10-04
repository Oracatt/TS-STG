// Independent DirectXMath values, not a JS round-trip or a second copy of the
// portable formulas. This verifier runs unchanged in Node and native QuickJS.
import {PerspectiveCamera,presentationQuaternion,multiplyPresentationQuaternion,presentationWorldMatrix} from '../../packages/thlib/src/spell-presentation.js';

export function verifyPresentationVectors(data,{diagnostic=false}={}) {
  const camera=new PerspectiveCamera({canvasWidth:960,canvasHeight:720,viewport:{x:0,y:0,width:960,height:720}}),buffer=new ArrayBuffer(4),f=new Float32Array(buffer),u=new Uint32Array(buffer),categories={};
  function ordered(value){if(value===0)return 0x80000000;f[0]=value;return u[0]>>>31?0x80000000-(u[0]&0x7fffffff):0x80000000+u[0];}
  function compare(category,actual,expected,budget,label){let stat=categories[category];if(!stat)stat=categories[category]={components:0,maxUlps:0,maxAbsolute:0,budget,worst:null};
    if(actual.length!==expected.length)throw new Error(`Component count differs: ${category} ${label}`);
    for(let i=0;i<actual.length;i++){if(!Number.isFinite(actual[i]))throw new Error(`Non-finite result: ${category} ${label}`);const ulps=Math.abs(ordered(actual[i])-ordered(expected[i])),absolute=Math.abs(Math.fround(actual[i])-Math.fround(expected[i]));stat.components++;stat.maxAbsolute=Math.max(stat.maxAbsolute,absolute);if(ulps>stat.maxUlps){stat.maxUlps=ulps;stat.worst={label,component:i,actual:Math.fround(actual[i]),expected:Math.fround(expected[i])};}}
  }
  compare('projection',camera.projection,data.projection,0,'origin perspective camera');
  for(const [i,row]of data.screen.entries()){const v=camera.screenToWorld(...row.input);compare('screenToWorld',[v.x,v.y,v.z],row.world,0,`screen case ${i}`);const p=camera.worldToScreen({x:row.world[0],y:row.world[1],z:row.world[2]});compare('worldToScreen',[p.x,p.y],row.screen.slice(0,2),0,`screen case ${i}`);}
  for(const [i,row]of data.rotations.entries())compare('rollPitchYaw',presentationQuaternion(...row.input),row.quaternion,0,`rotation ${i}`);
  for(const [i,row]of data.products.entries())compare('quaternionProduct',multiplyPresentationQuaternion(row.a,row.b),row.value,0,`product ${i}`);
  for(const [i,row]of data.worlds.entries())compare('worldMatrix',presentationWorldMatrix({x:row.position[0],y:row.position[1],z:row.position[2]},{x:row.scale[0],y:row.scale[1],z:row.scale[2]},row.rotation),row.value,0,`world ${i}`);
  let magic=[-.002681,-.446869,.893746,-.039161].map(Math.fround);const delta=presentationQuaternion(0,-.006,.012);
  for(let tick=1;tick<=30;tick++){const turns=tick<13?5:tick<27?4:tick<40?2:1;for(let i=0;i<turns;i++)magic=multiplyPresentationQuaternion(delta,magic);const row=data.magic.find(row=>row.tick===tick);if(row)compare('magicTrajectory',magic,row.quaternion,0,`magic tick ${tick}`);}
  const passed=Object.values(categories).every(stat=>stat.maxUlps<=stat.budget);
  if(!passed&&!diagnostic)throw new Error(`Presentation binary32 values differ from independent DirectXMath oracle: ${JSON.stringify(categories)}`);
  return{passed,categories};
}
