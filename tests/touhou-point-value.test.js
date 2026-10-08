import test from 'node:test';
import assert from 'node:assert/strict';
import {TouhouPlayer} from '../packages/thlib/src/touhou/player.js';
import {TOUHOU_PLAYER_DATA} from '../packages/thlib/src/touhou/player-data.js';
import {TouhouItems} from '../packages/thlib/src/touhou/items.js';
import {TOUHOU_POINT_VALUE_PROFILES,clampTouhouPointValue,addTouhouPointValueForGraze,touhouPointItemValue} from '../packages/thlib/src/touhou/point-value.js';
import {TOUHOU_PLAYER_RULES,resolveTouhouPlayerRules} from '../packages/thlib/src/touhou/player-rules.js';
import {continueTouhouGame} from '../packages/thlib/src/touhou/game-over.js';
import {TouhouGame,createTouhouResources,TOUHOU_POINT_VALUE_PROFILES as PUBLIC_PROFILES} from '../packages/thlib/src/touhou/index.js';
import {Keys} from '../packages/thlib/src/input.js';
import fs from 'node:fs';

const create=(rules=TOUHOU_POINT_VALUE_PROFILES.classic)=>new TouhouPlayer({sht:TOUHOU_PLAYER_DATA[0],rules,seed:1234});
const graze=(player,count,context)=>{for(let i=0;i<count;i++)player.addGraze(context);};
const point=(items,y,state=1)=>items.collect({type:2,x:0,y,state});

test('classic scoring reaches10010 after11 real public grazes and awards the displayed full point value',()=>{
  const player=new TouhouPlayer({sht:TOUHOU_PLAYER_DATA[0],rules:TOUHOU_POINT_VALUE_PROFILES.classic});
  for(let i=0;i<11;i++)player.addGraze();
  assert.equal(player.graze,11);assert.equal(player.pointValue,10010);
  const items=new TouhouItems({player});
  assert.equal(items.collect({type:2,x:0,y:100,state:3}),10010);
  assert.equal(player.score,1001,'stored score is displayed score /10');
  assert.equal(player.pointItems,1);player.destroy();
});

test('classic grows only at ten-graze boundaries and leaves blue-item collection out of that growth',()=>{
  const player=create(),events=[];const context={onEvent:(name,{player})=>events.push([name,player.graze,player.pointValue])};
  graze(player,9,context);assert.equal(player.pointValue,10000);
  graze(player,1,context);assert.equal(player.pointValue,10010);
  graze(player,9,context);assert.equal(player.pointValue,10010);
  graze(player,1,context);assert.equal(player.pointValue,10020);
  assert.deepEqual(events[9],['graze',10,10010],'existing event observes the updated public state');
  const items=new TouhouItems({player});for(let i=0;i<20;i++)point(items,100,3);
  assert.equal(player.pointValue,10020);assert.equal(player.graze,20);assert.equal(player.pointItems,20);
  player.destroy();
});

test('ordinary classic points give full displayed PIV above the line or when attracted and monotonically fall below it',()=>{
  const player=create(),items=new TouhouItems({player});
  const amounts=[128,129,200,400,1000].map(y=>point(items,y));
  assert.deepEqual(amounts,[10000,8980,7560,3560,10]);
  assert.equal(point(items,400,3),10000,'automatic attraction is full value regardless of collection height');
  assert.equal(player.pointValue,10000);assert.equal(player.pointItems,6);
  assert.equal(player.score,Math.trunc(amounts.reduce((sum,n)=>sum+n,0)/10)+1000);
  player.destroy();
});

test('PIV clamps before collection, saturates before growth overflow and never grows beyond the graze counter cap',()=>{
  const player=create({...TOUHOU_POINT_VALUE_PROFILES.classic,pointValueMaximum:10020}),items=new TouhouItems({player});
  player.pointValue=-1;assert.equal(point(items,100,3),10000);assert.equal(player.pointValue,10000);
  player.pointValue=999999;assert.equal(point(items,100,3),10020);assert.equal(player.pointValue,10020);
  graze(player,1000);assert.equal(player.pointValue,10020);
  player.pointValue=10000;player.graze=99999999;graze(player,3);
  assert.equal(player.graze,99999999);assert.equal(player.pointValue,10000,'a capped counter crosses no new bucket');
  assert.equal(clampTouhouPointValue(undefined,player.rules),10000);
  assert.equal(clampTouhouPointValue(0xffffffff,player.rules),10000,'reference signed32 normalization remains explicit');
  player.destroy();
});

test('injected integer scoring rules share the public calculators and profiles are immutable',()=>{
  const rules={...TOUHOU_POINT_VALUE_PROFILES.classic,pointValueMinimum:20000,pointValueMaximum:20060,pointValueGrazeStep:3,pointValueGrazeGain:20,pointItemDivisor:4};
  const player=create(rules);graze(player,2);assert.equal(player.pointValue,20000);
  graze(player,1);assert.equal(player.pointValue,20020);assert.equal(touhouPointItemValue(player),5005);
  assert.equal(addTouhouPointValueForGraze({rules:player.rules,pointValue:20000,graze:9},0),20060,'multiple crossed buckets use no private remainder');
  graze(player,20);assert.equal(player.pointValue,20060);
  for(const overrides of [{pointValueGrazeStep:0},{pointValueGrazeGain:0}]){
    const disabled=create({...rules,...overrides});graze(disabled,20);assert.equal(disabled.pointValue,20000);disabled.destroy();
  }
  for(const values of [{pointValueGrazeStep:-1},{pointValueGrazeStep:.5},{pointValueGrazeGain:NaN},{pointValueGrazeGain:-10},{pointItemDivisor:0},{pointItemDivisor:1.5}])assert.throws(()=>resolveTouhouPlayerRules(values),/point/);
  assert.ok(Object.isFrozen(TOUHOU_POINT_VALUE_PROFILES));assert.ok(Object.isFrozen(TOUHOU_POINT_VALUE_PROFILES.classic));
  assert.equal(PUBLIC_PROFILES,TOUHOU_POINT_VALUE_PROFILES,'the same presets are available at the public Touhou entry');
  assert.deepEqual([TOUHOU_PLAYER_RULES.pointValueGrazeStep,TOUHOU_PLAYER_RULES.pointValueGrazeGain,TOUHOU_PLAYER_RULES.pointItemDivisor],[0,0,2]);
  player.destroy();
});

test('reference compatibility keeps old half-point rewards, no PIV growth and the identical graze RNG/sound/event sequence',()=>{
  const reference=create(TOUHOU_POINT_VALUE_PROFILES.reference),classic=create();
  const legacy=new TouhouPlayer({sht:TOUHOU_PLAYER_DATA[0],seed:1234});
  const reports=[];
  for(const player of [legacy,reference,classic]){
    const events=[];graze(player,31,{enqueueGraze:({delay})=>events.push(['visual',delay]),sound:(...args)=>events.push(['sound',...args]),onEvent:(name,{delay})=>events.push([name,delay])});reports.push(events);
  }
  assert.deepEqual(reports[0],reports[1]);assert.deepEqual(reports[0],reports[2]);
  assert.equal(legacy.rng.state,classic.rng.state);assert.equal(reference.rng.state,classic.rng.state);
  assert.equal(legacy.pointValue,10000);assert.equal(reference.pointValue,10000);assert.equal(classic.pointValue,10030);
  assert.equal(point(new TouhouItems({player:legacy}),100,3),5000);
  assert.equal(point(new TouhouItems({player:reference}),100,3),5000);
  assert.equal(point(new TouhouItems({player:classic}),100,3),10030);
  for(const p of [legacy,reference,classic])p.destroy();
});

test('real Miss, Continue and stage resume preserve PIV and the partially completed graze bucket; a new run resets both',()=>{
  const player=create(),miss=[];graze(player,19);const items=new TouhouItems({player});point(items,100,3);
  assert.equal(player.hit(),true);for(let frame=0;frame<105;frame++)player.update(0,{onEvent:name=>miss.push(name)});
  assert.ok(miss.includes('miss'));assert.equal(player.deaths,1);assert.equal(player.state,1);
  assert.deepEqual([player.graze,player.pointValue,player.pointItems],[19,10010,1]);
  const session={credits:5,continues:0};assert.equal(continueTouhouGame(player,session),1);assert.equal(player.score,0);
  assert.deepEqual([player.graze,player.pointValue,player.pointItems],[19,10010,1]);
  player.finishStageVisibility();player.resetForStage();graze(player,1);
  assert.deepEqual([player.graze,player.pointValue,player.pointItems],[20,10020,1]);
  const next=create();assert.deepEqual([next.graze,next.pointValue,next.pointItems,next.score],[0,10000,0,0]);
  player.destroy();next.destroy();
});

test('classic score, PIV, point count and graze are deterministic public snapshots with no extra RNG consumption',()=>{
  const run=()=>{const player=create(),items=new TouhouItems({player}),states=[];
    for(let frame=0;frame<37;frame++){
      player.update(frame%2?Keys.LEFT:Keys.RIGHT);player.addGraze();if(frame%7===0)point(items,100,3);
      states.push(player.snapshot());
    }player.destroy();return states;
  };
  const a=run(),b=run();assert.deepEqual(a,b);
  assert.deepEqual([a.at(-1).pointValue,a.at(-1).graze,a.at(-1).pointItems],[10030,37,6]);
  assert.ok(a.at(-1).score>0);assert.notEqual(a[8].pointValue,a[9].pointValue);
});

test('one public Game configuration shares classic scoring with true bullet grazes, real pickup, bitmap HUD and pause freeze',()=>{
  const resources=createTouhouResources({readText:file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),loadTexture:()=>11});
  const game=new TouhouGame({banks:resources.banks,font:resources.font,sht:resources.shots[0],styles:resources.styles,systemOptions:{player:{rules:TOUHOU_POINT_VALUE_PROFILES.classic}}});
  try{
    game.bullets.emit({count:11,x:30,y:400,speed:0});game.update();
    assert.deepEqual([game.player.graze,game.player.pointValue,game.player.deaths],[11,10010,0]);
    game.bullets.cancelCircle(0,400,640,{dropMode:0});assert.equal(game.player.pointValue,10010,'plain cancellation invents no PIV reward');
    const item=game.items.spawn({type:2,x:game.player.x,y:game.player.y,state:3,speed:0});game.update();
    assert.equal(item.state,0);assert.equal(game.player.score,1001);assert.equal(game.player.pointItems,1);
    const values=[],draw=game.hud.font.draw;game.hud.font.draw=function(target,text,options){if(target.enqueuePriority)values.push([text,options.y]);return draw.call(this,target,text,options);};
    game.render();assert.ok(values.some(([text,y])=>text==='10,010'&&y===204),'the default HUD reads the same public PIV awarded by items');
    while(game.frame<30)game.update();game.update(Keys.PAUSE);assert.equal(game.paused,true);
    const snapshot=game.player.snapshot();for(let frame=0;frame<20;frame++)game.update(0);
    assert.deepEqual(game.player.snapshot(),snapshot,'pause advances neither counters nor a separate scoring owner');
  }finally{game.destroy();resources.dispose();}
});
