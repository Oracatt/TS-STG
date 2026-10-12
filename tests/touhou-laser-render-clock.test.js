import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DrawList} from '../packages/thlib/dist/index.js';
import {createTouhouResources,TouhouLaserField} from '../packages/thlib/dist/touhou/index.js';

function run(kind,count,cadence){
  const resources=createTouhouResources({readText:file=>readFileSync(file,'utf8'),loadTexture:()=>1});
  const bank=resources.createBank('bullet'),field=new TouhouLaserField({bank,styles:resources.styles,autoBounds:false});
  try{
    const laser=field.spawnDriven(kind,{x:40,y:120,z:2,count:Math.max(4,count),type:0,color:3,length:80,width:16,speed:2,autoBounds:false});
    if(kind===2&&count===1)laser.p.count=1; // Cancellation can shorten a legal curve to one sample.
    const spawned=[],mutations=[];
    // Exercise the real detached-child path used by ANM504/506. It samples
    // its parent during update, so a preceding draw must not supply its position.
    for(const [name,vm]of [['body',laser.animation],['origin',laser.origin],['tip',laser.tip]])if(vm){
      const update=vm.update.bind(vm);let ticks=0;
      vm.update=()=>{update();if(++ticks===3||ticks===7)spawned.push([name,vm.spawn(0,true).worldPosition()]);};
    }
    for(let frame=0;frame<10;frame++){
      laser.position={x:40+frame*3,y:120+frame*2,z:2};laser.angle=Math.fround(frame*.05);
      if(kind===2)field.updateDrivenCurve(laser,Array.from({length:count},(_,i)=>({position:{x:40+frame*3-i,y:120+frame*2,z:2},angle:0,speed:2})));
      field.update();
      const before=[laser.animation,laser.origin,laser.tip].filter(Boolean).map(vm=>vm.snapshot());
      for(let draw=0;draw<cadence;draw++)field.draw(new DrawList(),{x:320,y:0,scale:1.5});
      if(cadence&&JSON.stringify([laser.animation,laser.origin,laser.tip].filter(Boolean).map(vm=>vm.snapshot()))!==JSON.stringify(before))mutations.push(frame);
    }
    return {spawned,mutations};
  }finally{bank.dispose();resources.dispose();}
}

for(const [kind,count]of [[0,4],[1,4],[2,1],[2,4]])test(`laser kind${kind}/count${count} detached ANM children are independent of rendering`,()=>{
  const expected=run(kind,count,0);assert.ok(expected.spawned.length>0);
  for(const cadence of [1,3]){
    const result=run(kind,count,cadence);
    assert.deepEqual(result.spawned,expected.spawned,'render cadence changed future detached children');
    assert.deepEqual(result.mutations,[],'draw changed an embedded laser ANM');
  }
});
