import test from 'node:test';
import assert from 'node:assert/strict';
import {Keys} from '../packages/thlib/dist/input.js';
import {TouhouPlayer} from '../packages/thlib/dist/touhou/player.js';
import {TouhouItems} from '../packages/thlib/dist/touhou/items.js';
import {TouhouShot,fireTouhouPlayerWeapons} from '../packages/thlib/dist/touhou/shots.js';
import {TouhouReimuBomb,TouhouMarisaBomb} from '../packages/thlib/dist/touhou/bombs.js';
import {TOUHOU_PLAYER_PROFILES} from '../packages/thlib/dist/touhou/player-profile.js';
import {TOUHOU_PLAYER_RULES} from '../packages/thlib/dist/touhou/player-rules.js';
import {getTouhouPlayerData} from '../packages/thlib/dist/touhou/player-data.js';
import {TouhouWorld} from '../packages/thlib/dist/touhou/world.js';

const sht=getTouhouPlayerData(0);
const create=options=>new TouhouPlayer({sht,...options});
function stock(player){return [player.power,player.lives,player.bombs,player.maxPower,player.maxLives,player.maxBombs];}

test('named original player profiles retain source simulation and exact Bomb classes',()=>{
  for(const [character,profile,Bomb]of [[0,TOUHOU_PLAYER_PROFILES.reimu,TouhouReimuBomb],[1,TOUHOU_PLAYER_PROFILES.marisa,TouhouMarisaBomb]]){
    const data=getTouhouPlayerData(character),legacy=new TouhouPlayer({character,sht:data}),explicit=new TouhouPlayer({profile,sht:data});
    for(let frame=0;frame<90;frame++){
      const input=Keys.SHOOT|(frame>30?Keys.FOCUS:0)|(frame>50?Keys.LEFT:0);
      legacy.update(input);explicit.update(input);
      assert.deepEqual(explicit.snapshot(),legacy.snapshot());
    }
    assert.deepEqual(stock(explicit),[100,2,2,400,7,7]);
    assert.equal(explicit.triggerBomb(),true);assert.equal(explicit.bomb.constructor,Bomb);
    explicit.bomb.destroy();
  }
});

test('a third profile replaces local shooting and Bomb behavior without replacing player movement or collision',()=>{
  const emitted=[],events=[],context={onEvent:(name,data)=>events.push(name),spell:{notifyPlayerHit(){},notifyBombStart(){events.push('spellBomb');}}};
  const bomb={alive:true,updates:0,update(){this.updates++;},draw(){},destroy(){this.alive=false;}};
  const p=create({profile:{id:'sakuya',shoot:(player,frame,secondary,ctx)=>emitted.push({player,frame,secondary,ctx}),bombFactory:(player,ctx)=>{
    assert.equal(player.bombs,1,'common owner deducts stock once before activating the chosen Bomb');assert.equal(ctx,context);return bomb;
  }}});
  for(let i=0;i<30;i++)p.update(Keys.SHOOT|Keys.RIGHT,context);
  assert.equal(p.character,'sakuya');assert.ok(p.x>0);assert.ok(emitted.length>0);assert.equal(p.shots.length,0,'custom shooting never also invokes the original weapon');
  assert.ok(emitted.every(event=>event.player===p&&event.ctx===context));
  assert.equal(p.hit(context),true);assert.equal(p.state,4);
  assert.equal(p.triggerBomb(context),true);assert.equal(p.bomb,bomb);assert.equal(p.state,1,'custom Bomb uses the same deathbomb recovery');
  assert.equal(p.bombs,1);assert.deepEqual(events.slice(-2),['spellBomb','bomb']);
  p.update(0,context);assert.equal(bomb.updates,1);p.finishStageVisibility();assert.equal(bomb.alive,false);
});

test('a custom character with no Bomb strategy does not silently become Marisa',()=>{
  const p=create({profile:{id:2}});
  assert.equal(p.canBomb({}),false);assert.equal(p.triggerBomb(),false);assert.equal(p.bombs,2);assert.equal(p.bomb,null);
  assert.throws(()=>create({character:2}),/explicit profile/);
  const disabled=create({character:1,bombFactory:null});assert.equal(disabled.triggerBomb(),false);
  const invalid=create({bombFactory:()=>null});assert.throws(()=>invalid.triggerBomb(),/Bomb factory/);assert.equal(invalid.bombs,2);
});

test('the source emitter accepts a custom shot factory and can be composed by a shooting strategy',()=>{
  class PiercingShot extends TouhouShot{hit(){return this.damage;}}
  let calls=0;
  const p=create({profile:{id:'custom-shooter',shoot(player,frame,secondary,context){calls++;fireTouhouPlayerWeapons(player,frame,secondary,context);},
    shotFactory:(...args)=>new PiercingShot(...args)}});
  p.shotGate.set(20);p.update(Keys.SHOOT);
  assert.equal(calls,1);assert.ok(p.shots.length>0);assert.ok(p.shots.every(shot=>shot instanceof PiercingShot));
  const shot=p.shots[0],target={x:shot.x,y:shot.y,radius:1,alive:true};let damage=0;
  shot.collisions({enemies:[target],damageEnemy:(_enemy,amount)=>{damage+=amount;}});
  assert.ok(damage>0);assert.equal(shot.state,1,'consumer collision behavior replaces the default stop-on-hit behavior');
});

test('resource, collection and collision rules survive pickups and stage reset',()=>{
  const rules={maxPower:800,powerPerLevel:200,startingPower:200,initialPower:200,maxLives:12,maxBombs:9,initialLives:8,initialBombs:8,
    normalRadius:5,focusRadius:2,normalExtent:{x:2,y:3},focusExtent:{x:1,y:2},deathbombFrames:12,
    collectSpeed:7,collectRadius:22,attractRadius:88,collectLine:96};
  const p=create({rules}),items=new TouhouItems({player:p});
  assert.deepEqual(stock(p),[200,8,8,800,12,9]);
  p.setPower(799);items.collect({type:1,x:p.x,y:p.y,state:1});
  assert.equal(p.power,800);assert.equal(p.powerLevel,4);assert.equal(p.options.filter(option=>option.active).length,4);
  items.collect({type:5,x:p.x,y:p.y,state:1});items.collect({type:7,x:p.x,y:p.y,state:1});
  assert.deepEqual(stock(p),[800,9,9,800,12,9]);
  p.hit();assert.equal(p.deathbombFrames,12,'hit does not reset the selected deathbomb window');
  p.resetForStage();
  assert.deepEqual(stock(p),[800,9,9,800,12,9]);
  assert.deepEqual([p.normalRadius,p.focusRadius,p.deathbombFrames,p.collectSpeed,p.collectRadius,p.attractRadius,p.collectLine],[5,2,12,7,22,88,96]);
  assert.deepEqual([p.normalExtent,p.focusExtent],[{x:2,y:3},{x:1,y:2}]);
  assert.equal(TOUHOU_PLAYER_RULES.maxPower,400,'one consumer cannot mutate original defaults');
});

test('configured deathbomb and miss rules retain the default state machine boundaries',()=>{
  const p=create({rules:{deathbombFrames:12,deathPowerLoss:[10],deathDropCount:2,minimumPower:50,respawnBombs:4},power:200,bombs:0});
  const drops=[],context={spawnItem:item=>drops.push(item)};
  p.hit(context);for(let i=0;i<12;i++)p.update(0,context);
  assert.equal(p.state,4);p.update(0,context);assert.equal(p.state,2);
  while(p.state===2)p.update(0,context);
  assert.equal(p.power,190);assert.equal(drops.length,2);assert.equal(p.bombs,4);assert.equal(p.state,0);
});

test('item rewards honor selected fragment thresholds without changing original overflow behavior',()=>{
  const p=create({rules:{maxLives:12,maxBombs:12,lifeFragmentThreshold:5,bombFragmentThreshold:4}}),items=new TouhouItems({player:p});
  items.addLifeFragments(4);assert.equal(p.lives,2);items.addLifeFragments(1);assert.equal(p.lives,3);
  items.addBombFragments(3);assert.equal(p.bombs,2);items.addBombFragments(2);assert.equal(p.bombs,3);assert.equal(p.bombFragments,0);
  items.addBombs(20);assert.equal(p.bombs,12);assert.equal(p.maxBombs,12);p.lives=11;items.extendLife();assert.equal(p.lives,12);
});

test('player and item owners share the selected world while local bounds remain an explicit override',()=>{
  const world=new TouhouWorld({bounds:{x:-300,y:50,width:600,height:600}}),p=create({world,x:0,y:500}),items=new TouhouItems({player:p});
  assert.equal(p.world,world);assert.equal(items.world,world);
  const item=items.spawn({x:400,y:300});assert.equal(item.x,300);
  const local=new TouhouItems({player:p,bounds:{x:-10,y:0,width:20,height:100}});
  assert.notEqual(local.world,world);assert.equal(local.spawn({x:400}).x,10);assert.equal(p.world,world);
});

test('invalid public rule and strategy inputs fail during construction',()=>{
  assert.throws(()=>create({rules:{deathbombFrames:-1}}),/deathbombFrames/);
  assert.throws(()=>create({rules:{powerPerLevel:0}}),/powerPerLevel/);
  assert.throws(()=>create({rules:{normalRadius:NaN}}),/normalRadius/);
  assert.throws(()=>create({rules:{misspelled:3}}),/Unknown/);
  assert.throws(()=>create({profile:{id:'custom',shoot:1}}),/strategies/);
});

test('destroy retires player owners once and leaves shared banks and unrelated animations usable',()=>{
  const visuals=[];let disposed=0,bombDestroyed=0;
  const bank={
    create(script,options={}){
      const vm={script,alive:true,destroys:0,x:options.x??0,y:options.y??0,interrupt(){},update(){},draw(){},
        destroy(){this.alive=false;this.destroys++;}};
      options.beforeStart?.(vm);visuals.push(vm);return vm;
    },
    dispose(){disposed++;},
  };
  const unrelated=bank.create(999),bomb={alive:true,update(){},draw(){},destroy(){this.alive=false;bombDestroyed++;}};
  const p=create({character:1,sht:getTouhouPlayerData(1),bank,effectBank:bank,power:400,bombFactory:()=>bomb});
  p.focusTimer.set(4);p.shotGate.set(20);for(let frame=0;frame<5;frame++)p.update(Keys.SHOOT|Keys.FOCUS);
  assert.ok(p.shots.length>0);assert.ok(p.laserGroups.size>0);assert.ok(p.focusEffect);
  assert.equal(p.triggerBomb(),true);p.hit();p.beginDeath({});
  assert.ok(p.effects.length>=2,'hit and death visuals are owned along with the focus point');
  p.damageRegions.push({shape:'circle',x:0,y:400,radius:10,damage:1});
  const shots=[...p.shots],owned=visuals.filter(vm=>vm.alive&&vm!==unrelated),created=visuals.length;
  p.destroy();p.destroy();
  assert.equal(p.destroyed,true);assert.equal(bombDestroyed,1);assert.equal(p.bomb,null);assert.equal(p.bombBlocksShots,false);
  assert.ok(shots.every(shot=>!shot.alive));assert.equal(p.shots.length,0);assert.equal(p.laserGroups.size,0);
  assert.ok(owned.every(vm=>!vm.alive&&vm.destroys===1));assert.equal(p.effects.length,0);assert.equal(p.damageRegions.length,0);
  assert.equal(p.animation,null);assert.equal(p.focusEffect,null);assert.ok(p.options.every(option=>!option.active&&!option.animation&&!option.fullAnimation));
  p.update(Keys.SHOOT|Keys.BOMB);p.draw({});p.resetForStage();
  assert.equal(p.triggerBomb(),false);assert.equal(p.hit(),false);assert.equal(visuals.length,created,'destroyed owners cannot resume through frame or stage callbacks');
  assert.equal(unrelated.alive,true);assert.equal(unrelated.destroys,0);assert.equal(disposed,0);assert.equal(bank.create(1000).alive,true);
});
