import test from 'node:test';
import assert from 'node:assert/strict';
import {Keys} from '../packages/thlib/src/input.js';
import {TouhouPlayer} from '../packages/thlib/src/touhou/player.js';
import {getTouhouPlayerData} from '../packages/thlib/src/touhou/player-data.js';
import {validateTouhouShots} from '../packages/thlib/src/touhou/shot-data.js';

function customData(levels){
  const data=structuredClone(getTouhouPlayerData(0)),row={...data.patterns[0][0],period:1,phase:0,source:0};
  data.maxPower=levels;
  data.offsets=[{normal:Array.from({length:levels+1},(_,level)=>Array.from({length:level},(_,index)=>({x:index*12,y:-20}))),
    focus:Array.from({length:levels+1},(_,level)=>Array.from({length:level},(_,index)=>({x:index*4,y:-30})))}];
  data.patterns=Array.from({length:3*(levels+1)},(_,index)=>index<=levels?[{...row}]:
    Array.from({length:index%(levels+1)},(_,option)=>({...row,source:option+1})));
  return data;
}

for(const levels of [0,2,6])test(`custom SHT with ${levels} power levels drives the matching weapon groups and option positions`,()=>{
  const data=customData(levels);assert.equal(validateTouhouShots(data),data);
  for(const focused of [false,true])for(let level=0;level<=levels;level++){
    const player=new TouhouPlayer({profile:{id:'custom'},sht:data,rules:{maxPower:Math.max(1,levels*100)},power:level*100});
    player.focusTimer.set(4);player.shotGate.set(20);player.update(Keys.SHOOT|(focused?Keys.FOCUS:0));
    assert.equal(player.weaponLevels,levels);assert.equal(player.powerLevel,level);
    const options=player.options.filter(option=>option.active);
    assert.equal(options.length,level);assert.deepEqual(options.map(option=>({x:option.x-player.x,y:option.y-player.y})),data.offsets[0][focused?'focus':'normal'][level]);
    assert.equal(player.shots.length,level+1);
    assert.deepEqual([...new Set(player.shots.map(shot=>shot.pattern))].sort((a,b)=>a-b),level?[level,(focused?2:1)*(levels+1)+level]:[0]);
    player.destroy();
  }
});

test('original frozen Reimu and Marisa SHT data are accepted without mutation',()=>{
  for(const character of [0,1]){
    const data=getTouhouPlayerData(character),before=JSON.stringify(data);
    assert.equal(validateTouhouShots(data),data);assert.equal(JSON.stringify(data),before);
  }
});

test('incomplete or invalid custom power tables fail before player animation allocation',()=>{
  const invalid=[
    [data=>data.maxPower=-1,/maxPower/],
    [data=>data.maxPower=2.5,/maxPower/],
    [data=>data.maxPower=Infinity,/maxPower/],
    [data=>data.patterns.pop(),/patterns 0 through 20/],
    [data=>delete data.patterns[18],/pattern 18/],
    [data=>data.offsets[0].normal.pop(),/normal offsets/],
    [data=>data.offsets[0].focus[6].pop(),/focus level 6/],
    [data=>delete data.offsets[0].normal[5][2],/normal level 5 option 2/],
    [data=>data.offsets[0].focus[4][0].x=NaN,/focus level 4 option 0/],
    [data=>data.offsets[0].normal[1][0].y=Infinity,/normal level 1 option 0/],
  ];
  for(const [mutate,message]of invalid){
    const data=customData(6);mutate(data);let created=0;
    assert.throws(()=>new TouhouPlayer({sht:data,bank:{create(){created++;}}}),message);
    assert.equal(created,0,'invalid weapon data must not leave partially allocated player animations');
  }
});
