import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DrawList} from '../packages/thlib/dist/index.js';
import {createTouhouResources,TouhouItems,TouhouPlayer,getTouhouPlayerData} from '../packages/thlib/dist/touhou/index.js';

function run(cadence,offscreen=false,delay=0){
  const resources=createTouhouResources({readText:file=>readFileSync(file,'utf8'),loadTexture:()=>1});
  const bank=resources.createBank('bullet'),player=new TouhouPlayer({sht:getTouhouPlayerData(0),y:400});player.state=2;
  const field=new TouhouItems({player,bank}),item=field.spawn({x:80,y:120,speed:2,delay}),spawned=[],mutations=[];
  try{
    if(offscreen)item.animation.F(0x30,-20);
    for(const [name,vm]of [['body',item.animation],['arrow',item.secondaryAnimation]]){
      const update=vm.update.bind(vm);let ticks=0;
      vm.update=()=>{update();if(++ticks===3||ticks===7)spawned.push([name,vm.spawn(0,true).worldPosition()]);};
    }
    for(let frame=0;frame<10;frame++){
      field.update();
      const before=[item.animation.snapshot(),item.secondaryAnimation.snapshot(),item.drawState];
      for(let draw=0;draw<cadence;draw++)field.draw(new DrawList(),{x:320,y:0,scale:1.5});
      if(cadence&&JSON.stringify([item.animation.snapshot(),item.secondaryAnimation.snapshot(),item.drawState])!==JSON.stringify(before))mutations.push(frame);
    }
    return {spawned,mutations};
  }finally{bank.dispose();resources.dispose();}
}

for(const [offscreen,delay]of [[false,0],[true,0],[false,2]])test(`item ANM detached children retain positions without rendering (arrow${offscreen}/delay${delay})`,()=>{
  const expected=run(0,offscreen,delay);assert.ok(expected.spawned.length>0);
  for(const cadence of [1,3]){
    const result=run(cadence,offscreen,delay);
    assert.deepEqual(result.spawned,expected.spawned,'render cadence changed future detached children');
    assert.deepEqual(result.mutations,[],'draw changed item ANM position or arrow alpha');
  }
});
