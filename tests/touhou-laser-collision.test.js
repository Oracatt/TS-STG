import test from 'node:test';
import assert from 'node:assert/strict';
import {createTouhouLaserCollisionState,getTouhouLaserCollisionSegments,
  updateTouhouLaserCollision,touhouLaserIntersectsCircle} from '../packages/thlib/src/touhou/laser-collision.js';
import {TouhouLaserField} from '../packages/thlib/src/touhou/lasers.js';
import {cancelTouhouLaser,eraseTouhouLaser} from '../packages/thlib/src/touhou/laser-cancellation.js';
import {bulletTestBank,bulletTestStyles} from './fixtures/th20-bullet-bank.js';

const field=()=>new TouhouLaserField({bank:bulletTestBank(),styles:bulletTestStyles()});
const curve=()=>createTouhouLaserCollisionState({kind:2,position:{x:100,y:100},width:32,angle:0,
  samples:Array.from({length:8},(_,i)=>({position:{x:100-i*8,y:100},angle:0,speed:8}))});

test('owner-free straight/infinite collision uses the same source state gates and width profiles as the full field',()=>{
  const source=field();
  for(const kind of [0,1])for(const width of [2,3,4,16,31,32,40,64])for(const type of [0,38]){
    const l=source[kind?'spawnInfinite':'spawnStraight']({x:-80,y:110,initialLength:100,length:100,width,type});
    const external=createTouhouLaserCollisionState({kind,position:{x:-80,y:110},length:100,width,type});
    for(const state of [1,2,3,4,5]){
      l.state=external.state=state;l.width=width;
      assert.deepEqual(getTouhouLaserCollisionSegments(external),source.segments(l));
      if(state!==2&&state!==4)assert.deepEqual(getTouhouLaserCollisionSegments(external),[]);
    }
    source.retire(l);
  }
  const infinite=createTouhouLaserCollisionState({kind:1,width:40,length:100});
  assert.deepEqual(getTouhouLaserCollisionSegments(infinite),[{position:{x:50,y:0,z:0},angle:0,length:95,width:Math.fround(40-Math.fround(56/3))}]);
  const straight=createTouhouLaserCollisionState({kind:0,width:40,length:100});
  assert.equal(getTouhouLaserCollisionSegments(straight)[0].width,12);
  assert.equal(getTouhouLaserCollisionSegments(straight)[0].length,80);
  straight.p.flags=2;assert.equal(getTouhouLaserCollisionSegments(straight)[0].length,100);
});

test('curve collision retains source head exclusion, center quirk and full-visible-width convention',()=>{
  const l=curve();l.scale1=.2;
  const segments=getTouhouLaserCollisionSegments(l);
  assert.equal(segments.length,6);assert.equal(l.scale1,1);
  assert.deepEqual(segments.map(s=>s.position.x),[100,92,84,76,68,60]);
  assert.ok(segments.every(s=>s.width===Math.fround(16*Math.fround(1.1))&&s.length===Math.fround(8*Math.fround(1.1))));
  l.p.count=2;assert.deepEqual(getTouhouLaserCollisionSegments(l),[]);
  l.samples[0].speed=16;assert.equal(getTouhouLaserCollisionSegments(l).length,1);
});

test('one curve owner aggregates segment contact into one source graze every eight ticks',()=>{
  const l=curve(),calls=[],grazes=[],hooks=[];
  const player={x:88,y:124,collisionRectangle:(...args)=>{calls.push(args);return 2;},addGraze:(_context,p,color)=>grazes.push({p,color})};
  for(let frame=0;frame<25;frame++){
    const result=updateTouhouLaserCollision(l,player,{onLaserGraze:state=>hooks.push(state)});
    assert.equal(result.grazed,true);assert.equal(result.grazeAwarded,frame%8===0);assert.equal(result.flashColor,null);
  }
  assert.equal(calls.length,25*6);assert.equal(grazes.length,4);assert.equal(hooks.length,4);
  assert.ok(hooks.every(state=>state===l));assert.equal(l.grazeTimer.current,25);
  assert.equal(grazes[0].color,0xffd08080);
  const before=l.grazeTimer.current;player.collisionRectangle=()=>0;updateTouhouLaserCollision(l,player);
  assert.equal(l.grazeTimer.current,before+1,'curves advance their graze clock on a non-contact tick too');
});

test('infinite laser keeps contact-only time, type-specific graze projection and source flash suppression',()=>{
  const l=createTouhouLaserCollisionState({position:{x:0,y:100},width:16,length:100,
    color:1,style:{cancelType:6,colors:[[],[0,0,0,0,0xff123456]]}}),grazes=[],events=[];
  const player={x:50,y:120,collisionRectangle:()=>2,addGraze:(_context,p,color)=>grazes.push({p,color})};
  const first=updateTouhouLaserCollision(l,player,{}, {onGraze:(state,p,color)=>events.push({state,p,color})});
  assert.equal(first.grazeAwarded,true);assert.equal(first.flashColor,0xffffce80);
  assert.deepEqual(grazes,[{p:{x:50,y:110,z:0},color:0xff123456}]);assert.equal(events[0].state,l);
  player.collisionRectangle=()=>0;updateTouhouLaserCollision(l,player);
  assert.equal(l.grazeTimer.current,1);assert.equal(l.touching,0);assert.equal(l.flashColor,null);
  player.collisionRectangle=()=>2;l.activeMask=0x200000000n;updateTouhouLaserCollision(l,player);
  assert.equal(l.flashColor,null);assert.equal(l.grazeTimer.current,2);
  l.state=3;const timer=l.grazeTimer.current;updateTouhouLaserCollision(l,player);
  assert.equal(l.grazeTimer.current,timer);assert.equal(grazes.length,1,'warning lines do not collide or graze');
});

test('external hit callbacks and full-field cancellation follow the same per-segment hit route',()=>{
  const l=curve(),hits=[],previews=[];let n=0;
  const player={x:90,y:100,collisionRectangle:(...args)=>{previews.push(args[6]);return ++n<=2?1:0;},addGraze:()=>assert.fail('hit must not award graze')};
  const result=updateTouhouLaserCollision(l,player,{}, {preview:true,onHit:(state,s)=>hits.push({state,s})});
  assert.equal(result.hitCount,2);assert.equal(result.grazed,false);assert.equal(hits.length,2);
  assert.ok(hits.every(hit=>hit.state===l));assert.ok(previews.every(value=>value===true));
  const source=field(),beam=source.spawnStraight({y:100,initialLength:160,length:160,speed:0});
  source.player={x:72,y:100,collisionRectangle:()=>1,addGraze:()=>assert.fail()};source.context={};source.collision(beam);
  assert.ok(source.cancelCounter>0);assert.ok(source.effects.length>0);assert.ok(beam.length<160);
});

test('pure source hit-geometry query cannot advance timers, scale, player state or cancellation',()=>{
  const straight=createTouhouLaserCollisionState({position:{x:0,y:100},width:16,length:100});
  assert.equal(touhouLaserIntersectsCircle(straight,50,100,2),true);
  assert.equal(touhouLaserIntersectsCircle(straight,0,100,2),false,'type1 keeps its source 2.5-unit head trim');
  assert.equal(touhouLaserIntersectsCircle(straight,0,100,3),true);
  assert.equal(touhouLaserIntersectsCircle(straight,50,110,2),false,'full displayed width is reduced before collision');
  straight.state=3;assert.equal(touhouLaserIntersectsCircle(straight,50,100,2),false);
  const l=curve();l.scale1=.25;const before={...l,grazeTimer:l.grazeTimer.snapshot?.()??{...l.grazeTimer}};
  assert.equal(touhouLaserIntersectsCircle(l,80,100,2),true);
  assert.equal(l.scale1,before.scale1);assert.deepEqual(l.grazeTimer.snapshot?.()??{...l.grazeTimer},before.grazeTimer);
  assert.equal(l.touching,0);assert.equal(l.flashColor,null);
});

test('external cancellation preserves source straight/infinite16-unit trimming and speed8 debris',()=>{
  for(const kind of [0,1]){
    const l=createTouhouLaserCollisionState({kind,position:{x:0,y:100},length:160,lengthLimit:200,width:20}),
      debris=field(),effects=[],events=[];
    const count=cancelTouhouLaser(l,{x:72,y:100},9,0,0,true,{onEffect:(laser,p,circle)=>effects.push({laser,p,circle}),
      onCancel:n=>events.push(n),onSpawnStraight:p=>debris.spawnStraight(p)});
    assert.equal(count,1);assert.deepEqual(events,[1]);assert.equal(l.length,64);
    assert.equal(debris.count,1);assert.equal(debris.lasers[0].position.x,80);assert.equal(debris.lasers[0].length,kind===1?64:80);
    assert.equal(debris.lasers[0].speed,kind===1?8:0);
    assert.equal(debris.lasers[0].p.lengthLimit,kind===1?120:200);
    assert.equal(effects.length,1);assert.equal(effects[0].laser,l);assert.equal(effects[0].circle,true);
    debris.update();assert.equal(debris.lasers[0].position.x,kind===1?88:80,'new fragments use the public source field movement');
  }
  const protectedLaser=createTouhouLaserCollisionState({position:{x:0,y:100},length:160,protectedFrames:20});
  assert.equal(cancelTouhouLaser(protectedLaser,{x:72,y:100},9,0,0,true),0);
  assert.equal(protectedLaser.length,160);
  assert.equal(cancelTouhouLaser(protectedLaser,{x:72,y:100},9,0,0,true,{check:false}),1);
  assert.equal(protectedLaser.length,64);
});

test('curve cancellation retains sample identity, original minimum lengths, time shifts and live/path split rules',()=>{
  const make=(live=true)=>createTouhouLaserCollisionState({kind:2,time:100,live,
    samples:Array.from({length:12},(_,i)=>({actor:{id:i},position:{x:i*8,y:100},angle:0,speed:8}))});
  const live=make(),nodes=live.samples.slice(),splits=[];
  assert.equal(cancelTouhouLaser(live,{x:40,y:100},1,0,0,true,{onSpawnCurve:p=>splits.push(p)}),1);
  assert.equal(live.p.count,5);assert.equal(live.samples.length,5);assert.equal(splits.length,0);
  assert.ok(live.samples.every((s,i)=>s===nodes[i]&&s.actor===nodes[i].actor));
  const path=make(false),pathNodes=path.samples.slice();
  cancelTouhouLaser(path,{x:40,y:100},1,0,0,true,{onSpawnCurve:p=>splits.push(p)});
  assert.equal(path.p.count,5);assert.equal(splits.length,1);assert.equal(splits[0].count,6);assert.equal(splits[0].time,94);
  assert.ok(path.samples.every((s,i)=>s===pathNodes[i]));
  const head=make(),headNodes=head.samples.slice();
  assert.equal(cancelTouhouLaser(head,{x:0,y:100},8,0,0,true),2);
  assert.equal(head.time.value,98);assert.equal(head.p.count,10);assert.strictEqual(head.samples[0],headNodes[2]);
  const short=make();cancelTouhouLaser(short,{x:24,y:100},1,0,0,true);assert.equal(short.killPending,true);
  const erased=make();assert.equal(cancelTouhouLaser(erased,{x:40,y:100},200,0,0,true),12);assert.equal(erased.killPending,true);
});

test('owner-free circle/rotated-rectangle cancellation agrees with the original field for all three source kinds',()=>{
  for(const kind of [0,1,2])for(const circle of [false,true])for(const angle of [0,.7,Math.PI/2]){
    const source=field(),l=source[kind===0?'spawnStraight':kind===1?'spawnInfinite':'spawnCurve']({x:-40,y:100,
      initialLength:160,length:160,count:16,time:15,speed:8,width:20,angle,live:kind===2});
    const external=createTouhouLaserCollisionState({kind,position:l.position,angle,width:l.width,length:l.length,
      samples:l.samples?.map(s=>({...s,position:{...s.position}}))??null,time:l.time.value,live:l.live,
      path:l.path,parameters:l.p,speed:l.speed,lengthLimit:l.p.lengthLimit});
    const ownEffects=[],sourceEffects=[],splits=[];source.effect=(_laser,p)=>sourceEffects.push({...p});
    const before=source.lasers.length,center={x:0,y:120};
    const expected=source.cancelOne(l,center,35,circle?0:24,angle,circle,true);
    const actual=cancelTouhouLaser(external,center,35,circle?0:24,angle,circle,{onEffect:(_laser,p)=>ownEffects.push({...p}),
      onSpawnStraight:p=>splits.push({kind:0,p}),onSpawnCurve:p=>splits.push({kind:2,p})});
    assert.equal(actual,expected);assert.deepEqual(ownEffects,sourceEffects);
    assert.deepEqual([external.position,external.length,external.travel,external.p.count,external.killPending,external.time.value],
      [l.position,l.length,l.travel,l.p.count,l.killPending,l.time.value]);
    assert.equal(splits.length,source.lasers.length-before);
  }
});

test('explicit source laser erase retains effect spacing and protection rather than business clear flags',()=>{
  const beam=createTouhouLaserCollisionState({kind:0,position:{x:0,y:100},length:160}),effects=[];
  assert.equal(eraseTouhouLaser(beam,{onEffect:(_laser,p)=>effects.push(p.x)}),9);
  assert.equal(beam.state,1);assert.deepEqual(effects,[8,24,40,56,72,88,104,120,136]);
  const bent=curve(),curveEffects=[];bent.protectedFrames=10;
  assert.equal(eraseTouhouLaser(bent),0);assert.equal(bent.state,2);
  assert.equal(eraseTouhouLaser(bent,{check:false,onEffect:(_laser,p)=>curveEffects.push(p.x)}),0,'source curve erase returns0 even when successful');
  assert.equal(bent.state,1);assert.deepEqual(curveEffects,[100,76,52]);
});
