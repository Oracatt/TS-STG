import test from 'node:test';
import assert from 'node:assert/strict';
import {TouhouPlayer} from '../packages/thlib/dist/touhou/player.js';
import {TouhouShot,fireTouhouPattern} from '../packages/thlib/dist/touhou/shots.js';
import {getTouhouPlayerData} from '../packages/thlib/dist/touhou/player-data.js';
import {getTouhouWeaponData} from '../packages/thlib/dist/touhou/weapon-data.js';
import {PI,TouhouRNG} from '../packages/thlib/dist/touhou/math.js';

function player(options={}){return new TouhouPlayer({sht:getTouhouPlayerData(0),power:400,...options});}
function row(changes={}){return {...getTouhouPlayerData(0).patterns[0][0],origin:{x:0,y:0},speed:8,sound:-1,callbacks:[0,0,0,0],...changes};}
function visualBank(){
  const instances=[];
  return {instances,create(script,position={}){
    const vm={script,alive:true,x:position.x??0,y:position.y??0,orientation:1,scaleX:1,scaleY:1,interrupts:[],
      interrupt(label){this.interrupts.push(label);},update(){},draw(){},destroy(){this.alive=false;}};
    position.beforeStart?.(vm);instances.push(vm);return vm;
  }};
}

test('blue homing weapons steer toward the nearest eligible target, then stop steering after frame 60',()=>{
  const p=player(),near={x:80,y:360,alive:true},far={x:-100,y:240,alive:true},ignored={x:0,y:390,excluded:true};
  const shot=new TouhouShot(p,row({callbacks:[1,1,0,0]}),0,0,{});
  shot.update({enemies:[far,ignored,near]});
  assert.equal(shot.target,near);assert.ok(shot.angle>-PI/2&&shot.x>0,'homing turns right toward the nearest target');
  assert.ok(shot.speed<8,'a turn beyond 45 degrees slows the shot');
  shot.timer.set(60);const angle=shot.angle,speed=shot.speed;
  near.x=-150;near.y=200;shot.update({enemies:[near]});
  assert.equal(shot.angle,angle,'source 501820 stops homing at frame 60');assert.ok(shot.speed>speed);
  near.alive=false;shot.update({enemies:[near,far]});assert.equal(shot.target,null,'a stale target is released before reacquisition');
  far.x=shot.x;far.y=shot.y-30;shot.update({enemies:[far]});assert.equal(shot.target,far);
});

test('homing search radius and no-target acceleration retain the original limits',()=>{
  const p=player(),shot=new TouhouShot(p,row({callbacks:[1,1,0,0],speed:15.95}),0,0,{});
  shot.update({enemies:[{x:0,y:shot.y-257,alive:true}]});assert.equal(shot.target,null);assert.equal(shot.speed,16);
  const angle=shot.angle;shot.update({enemyReady:false,enemies:[{x:100,y:shot.y,alive:true}]});assert.equal(shot.angle,angle);assert.equal(shot.speed,16);
});

test('original enemy exclusion flags block both homing acquisition and direct projectile contact',()=>{
  for(const flags of [{primaryFlags:1},{primaryFlags:0x20},{flags:0x400},{flags:0x800}]){
    const p=player(),shot=new TouhouShot(p,row({callbacks:[1,1,0,0]}),0,0,{}),enemy={x:shot.x,y:shot.y,radius:50,...flags};
    const context={enemies:[enemy],damageEnemy(){assert.fail('Excluded enemy cannot receive contact');}};
    shot.update(context);shot.collisions(context);assert.equal(shot.target,null);assert.equal(shot.state,1);
  }
});

test('ordinary damage immunity does not discard a valid homing target',()=>{
  const p=player(),shot=new TouhouShot(p,row({callbacks:[1,1,0,0]}),0,0,{}),enemy={x:40,y:shot.y-20,radius:100,invulnerable:true};
  const context={enemies:[enemy],damageEnemy(){assert.fail('Invulnerable target cannot take damage');}};
  shot.update(context);shot.collisions(context);assert.equal(shot.target,enemy);assert.equal(shot.state,1);
});

test('source nearest-target and ahead-of-shot initializers use their distinct selection rules',()=>{
  const p=player(),front={x:100,y:120,alive:true},side={x:100,y:410,alive:true};
  const aimed=new TouhouShot(p,row({callbacks:[3,0,0,0]}),0,0,{enemies:[front]});
  assert.ok(aimed.angle>-PI/2&&aimed.angle<0);assert.equal(aimed.target,front);
  const lateral=new TouhouShot(p,row({callbacks:[4,0,0,0]}),0,0,{enemies:[front,side]});
  assert.ok(lateral.angle>0,'source 500380 selects targets at or below the shot minus 24 units');
  const distant=new TouhouShot(p,row({callbacks:[3,0,0,0]}),0,0,{enemies:[{x:0,y:-1000}]});assert.equal(distant.angle,-PI/2);
});

test('oscillating spread uses the shared 120-frame shot clock and reverses each side',()=>{
  const p=player();p.shotAge.set(30);
  const left=new TouhouShot(p,row({angle:-2,oscillation:.2,callbacks:[2,0,0,0]}),0,0,{});
  const right=new TouhouShot(p,row({angle:-1,oscillation:.2,callbacks:[2,0,0,0]}),0,0,{});
  const center=new TouhouShot(p,row({oscillation:.2,callbacks:[2,0,0,0]}),0,0,{});
  assert.ok(Math.abs(left.angle+2.2)<.000001);assert.ok(Math.abs(right.angle+.8)<.000001);assert.equal(center.angle,-PI/2);
  p.shotAge.set(90);const reversed=new TouhouShot(p,row({angle:-2,oscillation:.2,callbacks:[2,0,0,0]}),0,0,{});assert.ok(Math.abs(reversed.angle+1.8)<.000001);
});

test('right-angle projectile pauses four frames, then keeps the locked horizontal direction even if the enemy dies',()=>{
  const p=player({bank:visualBank()}),shot=new TouhouShot(p,row({callbacks:[7,3,0,0]}),0,0,{});
  const enemy={x:100,y:shot.y,alive:true},y=shot.y;
  for(let frame=0;frame<4;frame++){shot.update({enemies:frame===0?[enemy]:[]});assert.equal(shot.y,y);assert.equal(shot.x,0);assert.equal(shot.speed,0);enemy.alive=false;}
  shot.update({enemies:[]});assert.equal(shot.angle,0);assert.equal(shot.speed,14);assert.equal(shot.x,14);assert.equal(shot.y,y);
  assert.deepEqual(shot.animation.interrupts,[2]);
});

test('option angle sentinels and explicit emission positions work without changing the player or unrelated option coordinates',()=>{
  const p=player({seed:9}),option=p.options[0];option.x=80;option.y=200;option.angle=0;
  const attached=new TouhouShot(p,row({source:1,angle:999}),0,0,{}, {x:-100,y:100});
  assert.equal(attached.angle,0);assert.equal(attached.x,72);assert.equal(attached.y,200);
  const detached=new TouhouShot(p,row({source:0,angle:0}),0,0,{}, {x:-100,y:100});assert.equal(detached.x,-108);assert.equal(detached.y,100);
  const absolute=new TouhouShot(p,row({source:6,angle:0}),0,0,{}, {x:-100,y:100});assert.equal(absolute.x,-8);assert.equal(absolute.y,0);
  const randomized=new TouhouShot(p,row({source:1,angle:1000}),0,0,{});assert.ok(Math.abs(randomized.angle)<=PI/12);assert.ok(randomized.speed>=6&&randomized.speed<=10);
  assert.equal(option.x,80);assert.equal(option.y,200);assert.equal(p.x,0);assert.equal(p.y,400);
});

test('enhanced lasers retain contact without shortening and retire as their enhanced phase ends',()=>{
  const bank=visualBank(),p=player({bank});p.weaponPhaseActive=true;p.shootTimer.set(0);
  const sounds=[],context={sound:id=>sounds.push(id),stopSound:id=>sounds.push(-id)},laser=new TouhouShot(p,row({type:2,speed:0,lifetime:-1,size:{x:0,y:16},callbacks:[9,5,0,3]}),15,0,context);
  p.laserGroups.set(0,laser);laser.update(context);assert.equal(laser.width,18);
  const damage=laser.hit({x:0,y:380,radius:8},context);assert.equal(damage,laser.damage);assert.equal(laser.width,18);assert.equal(laser.state,1);
  p.weaponPhaseActive=false;laser.update(context);assert.equal(laser.state,2);assert.equal(p.laserGroups.size,0);assert.deepEqual(sounds,[20,-20]);
  assert.deepEqual(laser.animation.interrupts,[2,1]);
});

test('ordinary lasers yield to enhanced weapons and retain the original contact pulse period',()=>{
  const p=player({character:1,sht:getTouhouPlayerData(1),bank:visualBank()}),source=p.sht.patterns[9][0];
  p.shootTimer.set(0);p.powerChanged=false;
  const laser=new TouhouShot(p,source,9,0,{});p.laserGroups.set(source.group,laser);
  laser.update({});assert.equal(laser.state,1);laser.timer.set(3);assert.equal(laser.hit({x:laser.x,y:laser.y-50,radius:8},{}),0);
  laser.timer.set(4);assert.equal(laser.hit({x:laser.x,y:laser.y-50,radius:8},{}),laser.damage);
  p.weaponSuppressOptions=true;laser.update({});assert.equal(laser.state,2);assert.equal(p.laserGroups.size,0);
});

test('explosive projectiles retire direct contact and own the source timed expanding damage region',()=>{
  for(const callback of [4,6]){
    const p=player({bank:visualBank()}),sounds=[],shot=new TouhouShot(p,row({callbacks:[0,0,0,callback],parameters:[0,0,0,0,1.5,0,0,0]}),0,0,{});
    const expected=shot.damage;assert.equal(shot.hit({x:shot.x,y:shot.y,radius:8},{sound:id=>sounds.push(id)}),expected);
    assert.equal(shot.state,2);assert.deepEqual(shot.animation.interrupts,[1]);assert.deepEqual(sounds,[65]);
    assert.equal(p.damageRegions.length,1);const region=p.damageRegions[0];
    assert.deepEqual([region.radius,region.growth,region.remaining,region.period,region.age,region.damage],callback===6?[24,1.5,20,4,0,expected]:[24,1,16,2,0,expected]);
    let directDamage=0;shot.collisions({enemies:[{x:shot.x,y:shot.y,radius:8}],damageEnemy(){directDamage++;}});assert.equal(directDamage,0);
  }
});

test('scatter impact uses the source contact sound and shared retirement animation',()=>{
  const p=player(),shot=new TouhouShot(p,row({callbacks:[0,0,0,5]}),0,0,{}),sounds=[];
  shot.hit({x:40,y:shot.y},{sound:(id,x)=>sounds.push([id,x])});assert.deepEqual(sounds,[[40,40]]);assert.equal(shot.speed,1);assert.equal(shot.state,2);
});

test('impact regions pulse for their entire source lifetime and survive destruction of the projectile visual',()=>{
  for(const callback of [4,6]){
    const p=player(),shot=new TouhouShot(p,row({callbacks:[0,0,0,callback],parameters:[0,0,0,0,1.5,0,0,0]}),0,0,{});
    const enemy={x:shot.x,y:shot.y,radius:100,alive:true},hits=[];
    shot.hit(enemy,{});shot.destroy();
    for(let frame=0;frame<24;frame++)p.update(0,{enemies:[enemy],damageEnemy:(_enemy,amount)=>hits.push([frame,amount])});
    assert.deepEqual(hits.map(hit=>hit[0]),callback===6?[0,4,8,12,16]:[0,2,4,6,8,10,12,14]);
    assert.ok(hits.every(hit=>hit[1]===shot.row.damage));assert.equal(p.damageRegions.length,0);
  }
});

test('pattern emission accepts enhanced tables and forwards explicit origins through custom factories',()=>{
  const data=structuredClone(getTouhouPlayerData(0));while(data.patterns.length<20)data.patterns.push([]);data.patterns[19]=[row({period:1})];
  const locations=[],p=player({sht:data,shotFactory(...args){locations.push(args[5]);return new TouhouShot(...args);}}),origin={x:70,y:120};
  fireTouhouPattern(p,19,0,0,{},origin);assert.equal(p.shots.length,1);assert.equal(p.shots[0].x,70);assert.equal(locations[0],origin);
  assert.throws(()=>fireTouhouPattern(p,20,0,0,{}),/Invalid/);assert.throws(()=>fireTouhouPattern(p,-1,0,0,{}),/Invalid/);
});

test('source random aiming consumes the shared seeded stream reproducibly',()=>{
  const make=()=>{
    const p=player({rng:new TouhouRNG(246)}),angles=[];
    for(const callback of [5,6,10,11,12])for(let n=0;n<20;n++)angles.push(new TouhouShot(p,row({callbacks:[callback,0,0,0],parameters:[0,0,0,0,.25,0,0,0]}),0,n,{enemies:[{x:10,y:200}]}).angle);
    return {angles,random:p.rng.state};
  };
  assert.deepEqual(make(),make());assert.ok(new Set(make().angles).size>90);
});

test('all 856 original ordinary and enhanced shooter records initialize, move and hit with finite portable state',()=>{
  let checked=0;
  const callbacks=[new Set(),new Set(),new Set(),new Set()];
  for(const character of [0,1])for(let weapon=0;weapon<8;weapon++){
    const sht=getTouhouWeaponData(character,weapon);
    for(let pattern=0;pattern<20;pattern++)for(let index=0;index<sht.patterns[pattern].length;index++){
      const p=player({character,sht}),record=sht.patterns[pattern][index],context={enemies:[{x:25,y:100,alive:true,radius:12}]};
      p.weaponPhaseActive=pattern>=15;p.weaponPattern=pattern;p.shootTimer.set(0);p.powerChanged=false;
      const shot=new TouhouShot(p,record,pattern,index,context);
      for(let frame=0;frame<120&&shot.alive;frame++)shot.update(context);
      assert.ok([shot.x,shot.y,shot.angle,shot.speed].every(Number.isFinite),`${character}/${weapon}/${pattern}/${index} movement`);
      const hit=new TouhouShot(p,record,pattern,index,context);assert.ok(Number.isFinite(hit.hit(context.enemies[0],context)));
      record.callbacks.forEach((callback,kind)=>callbacks[kind].add(callback));checked++;shot.destroy();hit.destroy();p.destroy();
    }
  }
  assert.equal(checked,856);
  assert.deepEqual(callbacks.map(set=>[...set].sort((a,b)=>a-b)),[
    [0,1,2,3,4,5,6,7,8,9,10,11,12],[0,1,3,4,5,6],[0],[0,1,2,3,4,5,6],
  ]);
});
