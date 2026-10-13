import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Keys} from '../packages/thlib/dist/input.js';
import {DrawList} from '../packages/thlib/dist/render.js';
import {TouhouRenderQueue} from '../packages/thlib/dist/touhou/render-queue.js';
import {TouhouPlayer} from '../packages/thlib/dist/touhou/player.js';
import {TouhouRNG,PI,div,mul,polar} from '../packages/thlib/dist/touhou/math.js';
import {getTouhouPlayerData} from '../packages/thlib/dist/touhou/player-data.js';
import {createTouhouWeaponPreset,TOUHOU_WEAPON_IDS,TOUHOU_WEAPON_NAMES} from '../packages/thlib/dist/touhou/weapons.js';
import {TouhouReimuBomb,TouhouMarisaBomb} from '../packages/thlib/dist/touhou/bombs.js';
import {createTouhouResources} from '../packages/thlib/dist/touhou/resources.js';

const create=(character,weapon,options={})=>new TouhouPlayer({...createTouhouWeaponPreset(character,weapon),power:400,...options});
const nearly=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.01,`${actual} != ${expected}`);

test('all sixteen weapon presets fire both movement modes with their own source records',()=>{
  for(const character of [0,1])for(const weapon of Object.values(TOUHOU_WEAPON_IDS)){
    const p=create(character,weapon),events=[],context={onEvent:(name,event)=>{if(name==='shot')events.push(event.shot);}};
    p.shotGate.set(20);
    for(let frame=0;frame<100;frame++)p.update(Keys.SHOOT|(frame>=50?Keys.FOCUS:0),context);
    assert.ok(events.some(s=>s.pattern<5),`main ${character}/${weapon}`);
    assert.ok(events.some(s=>s.pattern===9),`normal ${character}/${weapon}`);
    assert.ok(events.some(s=>s.pattern===14),`focus ${character}/${weapon}`);
    assert.equal(p.sht.patterns.length,20,'explicitly authored enhanced patterns are retained too');
    assert.equal(p.character,character);assert.equal(TOUHOU_WEAPON_NAMES[character].length,8);
    assert.equal(p.triggerBomb(),true);
    assert.ok(p.bomb instanceof (character?TouhouMarisaBomb:TouhouReimuBomb));
    p.destroy();assert.equal(p.shots.length,0);
  }
});

test('standard preset retains ordinary default gameplay and RNG sequence',()=>{
  for(const character of [0,1]){
    const old=new TouhouPlayer({character,sht:getTouhouPlayerData(character),power:400}),preset=create(character,'standard');
    for(let frame=0;frame<90;frame++){
      const mask=Keys.SHOOT|(frame>30?Keys.FOCUS:0)|(frame>50?Keys.LEFT:0);
      old.update(mask);preset.update(mask);
      const snapshot=preset.snapshot();
      for(const key of ['weapon','weaponPhaseActive','weaponSuppressOptions','weaponPattern','damageRegions'])delete snapshot[key];
      for(const option of snapshot.options)delete option.angle;
      assert.deepEqual(snapshot,old.snapshot());
    }
  }
});

test('blue options orbit in opposite directions before fixed-point smoothing and keep phase on focus change',()=>{
  for(const character of [0,1]){
    const p=create(character,'frost',{x:10,y:300}),option=p.options[0];
    const first=p.weapon.optionTarget(option,{x:0,y:0},{});
    assert.deepEqual(first,{x:p.fixedX+(character?40:60)*128,y:p.fixedY});
    const expected=character?-div(PI,120):div(PI,120);
    nearly(option.angle,expected);
    p.weapon.onFocusChange(true);p.focused=true;
    const second=p.weapon.optionTarget(option,{x:0,y:0},{}),offset=polar(expected,character?28:32);
    nearly(second.x/128,p.x+offset.x);nearly(second.y/128,p.y+offset.y);
    assert.ok(character?option.angle<expected:option.angle>expected);
    const next=p.options[1];p.weapon.initializeOption(next);nearly(next.angle,div(mul(PI,2),4));
  }
});

test('beast focused options anchor where focus was pressed, not on moving player history',()=>{
  const p=create(0,'beast',{x:5,y:300}),option=p.options[0];
  p.weapon.onFocusChange(true);p.focused=true;
  const initial=p.weapon.optionTarget(option,{x:0,y:0},{});
  p.setPosition(100,200);p.history.fill({x:-999,y:-999});
  assert.deepEqual(p.weapon.optionTarget(option,{x:0,y:0},{}),initial);
  p.focused=false;p.weapon.onFocusChange(false);
  const ordinary={x:1234,y:5678};assert.equal(p.weapon.optionTarget(option,ordinary,{}),ordinary);
  p.weapon.onFocusChange(true);p.focused=true;
  const replacement=p.weapon.optionTarget(option,{x:0,y:0},{});
  assert.notDeepEqual(replacement,initial);assert.equal(replacement.y,p.fixedY+option.focusOffset.y*128);
});

test('purification drift is deterministic and retains per-slot age across focus, power and stage changes',()=>{
  for(const character of [0,1]){
    const a=create(character,'purification',{seed:128}),b=create(character,'purification',{seed:128});
    for(let frame=0;frame<20;frame++){
      a.update(frame>8?Keys.FOCUS:0);b.update(frame>8?Keys.FOCUS:0);
      assert.deepEqual(a.options.map(o=>[o.x,o.y,o.angle]),b.options.map(o=>[o.x,o.y,o.angle]));
      assert.equal(a.rng.state,b.rng.state);
    }
    const slot=a.weapon.optionStates[0],before=[slot.angle,slot.age.current,a.rng.state];
    a.setPower(200);assert.deepEqual([slot.angle,slot.age.current,a.rng.state],before);
    a.resetForStage();assert.deepEqual([slot.angle,slot.age.current,a.rng.state],before);
  }
});

test('contact options own source radius, two damage every three frames and stop with the shooting cycle',()=>{
  const p=create(0,'contact',{power:100,visualRng:new TouhouRNG(999)}),regions=[];
  const context={damageRegion:region=>{regions.push({...region});return region.damage;}};
  p.shootTimer.set(0);
  for(let frame=0;frame<10;frame++){p.weapon.shoot(frame,frame,context);p.weapon.update(context);}
  assert.equal(regions.length,4);assert.ok(regions.every(r=>r.radius===32&&r.damage===2&&r.bomb===false));
  assert.equal(p.weapon.optionStates[0].ring.rings.length,3);
  const rng=p.rng.state,draw=new DrawList();p.weapon.draw(draw);assert.equal(p.rng.state,rng);
  assert.equal(draw.commands.filter(c=>c[0]==='lineStrip').length,3);
  p.shootTimer.set(-1);p.weapon.update(context);assert.equal(p.weapon.optionStates[0].ring,null);
  assert.equal(regions.length,4,'retired contact region cannot keep damaging');
});

test('purification contact cancels bullets only with shared per-option cooldown and filled source geometry',()=>{
  const p=create(1,'purification',{visualRng:new TouhouRNG(50)}),calls=[],context={cancelCircle:(...args)=>{calls.push(args);return 4;}};
  p.shootTimer.set(0);p.weapon.shoot(0,0,context);p.weapon.update(context);
  assert.equal(calls.length,1,'one cancellation of four bullets holds the other three options this pass');
  p.weapon.shoot(1,1,context);p.weapon.update(context);assert.equal(calls.length,2);
  assert.ok(calls.every(([_x,_y,r,opts])=>r===2&&opts.lasers===false&&opts.reward===false));
  assert.ok(p.weapon.optionStates.slice(0,4).every(s=>s.ring.filled));
  const draw=new DrawList();p.weapon.draw(draw);
  const meshes=draw.commands.filter(c=>c[0]==='mesh');assert.equal(meshes.length,4);
  assert.ok(meshes.every(mesh=>mesh[1]===0&&mesh[2].length===60&&mesh[3].length===174));
  p.destroy();const after=new DrawList();p.weapon.draw(after);assert.equal(after.commands.length,0);
});

test('weapon rings use original layer eleven and visual randomness stays outside shot RNG',()=>{
  const p=create(0,'contact',{power:100,seed:17,visualRng:new TouhouRNG(42)}),before=p.rng.state;
  p.shootTimer.set(0);p.weapon.shoot(0,0,{});p.weapon.update({});
  assert.equal(p.rng.state,before);assert.notEqual(p.weaponRng.state,42);
  const queue=new TouhouRenderQueue();p.weapon.draw(queue,{x:336,y:24,scale:1.5});
  queue.enqueuePriority(23,draw=>draw.text('before',0,0,1));queue.enqueuePriority(25,draw=>draw.text('after',0,0,1));
  const draw=new DrawList();queue.flush(draw);
  const beforeIndex=draw.commands.findIndex(c=>c[0]==='text'&&c[1]==='before'),ringIndex=draw.commands.findIndex(c=>c[0]==='lineStrip'),afterIndex=draw.commands.findIndex(c=>c[0]==='text'&&c[1]==='after');
  assert.ok(beforeIndex<ringIndex&&ringIndex<afterIndex);
});

test('invalid selections fail before constructing a player or mutating public tables',()=>{
  assert.throws(()=>createTouhouWeaponPreset(0,8),/Unknown Touhou weapon/);
  assert.throws(()=>createTouhouWeaponPreset(0,'unknown'),/Unknown Touhou weapon/);
  assert.throws(()=>createTouhouWeaponPreset(2,0),/Character/);
  assert.equal(createTouhouWeaponPreset('reimu','frost').sht,createTouhouWeaponPreset(0,2).sht);
});

test('weapon snapshot records future option motion and contact-damage clocks without visual geometry',()=>{
  const drifting=create(0,'purification',{seed:20,visualRng:new TouhouRNG(99)});
  drifting.shotGate.set(20);for(let i=0;i<6;i++)drifting.update(Keys.SHOOT);
  const snapshot=drifting.snapshot(),weapon=snapshot.weapon;
  assert.equal(weapon.id,5);assert.deepEqual(weapon.anchor,{x:0,y:400*128});assert.equal(typeof weapon.cooldown,'number');
  assert.equal(weapon.options[0].angle,drifting.options[0].angle);assert.equal(weapon.options[0].age[1],6);
  assert.equal(weapon.options[0].ring.age[1],6);assert.equal(typeof weapon.options[0].ring.x,'number');
  assert.ok(!('radii' in weapon.options[0].ring));assert.ok(!('positions' in weapon.options[0].ring));
  const copy=JSON.parse(JSON.stringify(snapshot));drifting.update(Keys.SHOOT|Keys.FOCUS);
  assert.deepEqual(snapshot,copy,'snapshot must not alias mutable clocks or anchors');
  assert.notDeepEqual(drifting.snapshot().weapon,weapon);
});

test('small power pickups preserve blue orbit phase, position and option animation',()=>{
  const resources=createTouhouResources({readText:file=>readFileSync(file,'utf8'),loadTexture:()=>1});
  const p=create(0,'frost',{power:200,bank:resources.createBank('pl00')});
  try{
    for(let frame=0;frame<24;frame++)p.update(Keys.RIGHT);
    const positions=p.options.slice(0,2).map(o=>[o.fixedX,o.fixedY,o.angle,o.changed]),animations=p.options.slice(0,2).map(o=>o.animation);
    p.setPower(201);
    assert.deepEqual(p.options.slice(0,2).map(o=>[o.fixedX,o.fixedY,o.angle,o.changed]),positions);
    assert.deepEqual(p.options.slice(0,2).map(o=>o.animation),animations);
    p.setPower(300);assert.equal(p.options.filter(o=>o.active).length,3);assert.equal(p.options[0].angle,0);
    assert.notEqual(p.options[0].animation,animations[0],'crossing a real level rebuilds the source formation');
    p.setPower(400);
    const option=p.options[0],body=option.animation,full=option.fullAnimation;
    assert.equal(body.scriptId,39);assert.equal(full.scriptId,40);
    assert.equal(full.layer,13);assert.ok(full.renderOrder<0,'power refresh prepends the full-power overlay');
    p.setPower(400);assert.equal(option.animation,body);assert.equal(full.alive,false);
    assert.equal(option.fullAnimation.layer,13);assert.ok(option.fullAnimation.renderOrder<0);
    for(let frame=0;frame<6;frame++)p.update(Keys.FOCUS);
    assert.ok(option.fullAnimation.renderOrder>0,'focus replacement uses ordinary registration, not power-refresh prepend');
  }finally{p.destroy();p.bank.dispose();resources.dispose();}
});
