import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DrawList} from '@ts-stg/thlib';
import {createTouhouResources,TouhouLaserField} from '@ts-stg/thlib/touhou';
import {RushBattle} from '../games/rushboss/src/runtime.js';

const resources=()=>createTouhouResources({readText:file=>readFileSync(file,'utf8'),loadTexture:()=>17});
const phase={hp:10000,time:120,init(){},update(){}};
const fixture=res=>new RushBattle([phase],{resources:res,profile:'portrait',invincible:true});
const step=(battle,frames)=>{for(let i=0;i<frames;i++)battle.update();};

test('Rush laser cancellation retains identical public debris with or without ANM assets and ignores business clean flags',()=>{
  const res=resources(),results=[];
  for(const source of [null,res]){
    const battle=fixture(source),head=battle.laser({x:-80,y:80},0,3,{length:160,width:10,cleanOnHit:false,cleanOnBomb:false});
    battle.update();const owner=battle.projectiles.debris,state=battle.projectiles.lasers.get(head);
    assert.ok(owner instanceof TouhouLaserField);assert.equal(state.driven,true);
    assert.deepEqual([state.p.x,state.p.y,state.p.angle,state.p.width,state.p.length],[-80,144,-0,20,160]);
    const n=battle.projectiles.cancel(-8,144,9,0,0,true,{bullets:false});
    assert.equal(n,1);assert.equal(head.length,64);assert.equal(state.length,64);
    const debris=owner.lasers.filter(l=>!l.driven);assert.equal(debris.length,1);
    assert.equal(debris[0].speed,8);assert.equal(debris[0].position.x,0);assert.equal(debris[0].length,64);
    battle.update();assert.equal(debris[0].position.x,8,'source public owner advances the newly split fragment');
    results.push(owner.snapshot());
    if(!source){const draw=new DrawList();battle.projectiles.draw(draw,battle.playerView);assert.deepEqual(draw.commands,[]);}
    battle.dispose();assert.equal(owner.lasers.length,0);assert.equal(owner.effects.length,0);
  }
  assert.deepEqual(results[0],results[1]);res.dispose();
});

test('curve cancellation shortens the source sample owner, retires excluded actors and does not regrow the cut tail',()=>{
  const battle=fixture(),head=battle.laser({x:-80,y:100},0,5,{curve:30,speed:480,width:20,cleanOnOutOfRange:false});
  step(battle,10);const state=battle.projectiles.lasers.get(head),nodes=state.samples.slice();
  assert.equal(state.p.count,30);assert.equal(state.time.current,10);
  assert.ok(nodes.slice(10).every(s=>!s.actor&&s.position.x===-80),'unborn history stays at the original spawn position');
  const cut=nodes[5].position;
  assert.equal(battle.projectiles.cancel(cut.x,cut.y,1,0,0,true,{bullets:false}),1);
  assert.equal(head.segments,5);assert.equal(state.p.count,5);
  assert.ok(nodes.slice(0,5).every(s=>s.actor.alive));assert.ok(nodes.slice(5).every(s=>!s.actor?.alive));
  for(let frame=0;frame<20;frame++){
    battle.update();assert.ok(state.p.count<=5);assert.ok(state.samples.every(s=>s.actor.alive));
  }
  assert.equal(state.p.count,5);assert.equal(head.alive,true);
  const latest=state.samples[0].position;
  battle.projectiles.cancel(latest.x,latest.y,500,0,0,true,{bullets:false});
  assert.equal(head.alive,false);assert.ok(state.samples.every(s=>!s.actor.alive));
  battle.update();assert.equal(battle.projectiles.lasers.size,0);assert.equal(battle.projectiles.debris.count,0);
  battle.dispose();
});

test('trimming the live curve head resumes movement from the source retained head and samples do not independently graze',()=>{
  const battle=fixture(),head=battle.laser({x:-100,y:100},0,5,{curve:30,speed:480,width:20,cleanOnOutOfRange:false});
  step(battle,10);const state=battle.projectiles.lasers.get(head),old=state.samples.slice(),first=old[0].position;
  battle.projectiles.cancel(first.x,first.y,1,0,0,true,{bullets:false});
  assert.equal(head.x,old[1].position.x);assert.equal(state.time.current,9);
  assert.equal(state.samples[0].actor,old[1].actor);
  battle.update();assert.equal(head.x,first.x,'retained live source head advances exactly one8-unit trajectory step');
  battle.invincible=false;let calls=0,grazes=0;
  battle.sharedPlayer.collisionRectangle=()=>{calls++;return 2;};battle.sharedPlayer.addGraze=()=>grazes++;
  for(let frame=0;frame<25;frame++)battle.projectiles.updateLasers();
  assert.ok(calls>25);assert.equal(grazes,4);assert.equal(state.grazeTimer.current,25);
  for(const sample of state.samples)if(sample.actor)battle.projectiles.check(sample.actor);
  assert.equal(grazes,4,'visual Parts have no independent player collision or graze owner');
  battle.dispose();
});

test('public driven laser ownership prunes expired heads and honors laser warning delay without applying Rush clean flags',()=>{
  const battle=fixture();battle.invincible=false;
  let checks=0;battle.sharedPlayer.collisionRectangle=()=>{checks++;return 0;};
  const head=battle.laser({x:-80,y:100},0,5,{length:160,width:10,delay:3,cleanOnHit:false,cleanOnBomb:false});
  battle.update();assert.equal(checks,0);assert.equal(battle.projectiles.lasers.get(head).state,3);
  step(battle,3);assert.ok(checks>0);head.kill();battle.projectiles.updateLasers();
  assert.equal(battle.projectiles.lasers.size,0);assert.equal(battle.projectiles.debris.count,0);
  for(let i=0;i<40;i++){
    const b=battle.laser({x:-80,y:100},0,2,{length:100,width:6});battle.projectiles.updateLasers();b.kill();battle.projectiles.updateLasers();
  }
  assert.equal(battle.projectiles.lasers.size,0);assert.equal(battle.projectiles.debris.lasers.length,0);
  battle.dispose();
});

test('a portrait curve retires only after its entire history leaves the view, without pulling its tail back to birth',()=>{
  const battle=fixture(),head=battle.laser({x:0,y:100},0,3,{curve:30,speed:480,width:12});
  try{
    step(battle,27);
    assert.equal(head.alive,true,'the head leaving the screen does not destroy an on-screen tail');
    const state=battle.projectiles.lasers.get(head);
    step(battle,13);
    assert.equal(head.alive,true);assert.equal(state.p.count,30);
    assert.ok(state.samples.every(sample=>sample.actor?.alive),'full running history replaces every birth sample');
    assert.ok(state.samples.every(sample=>sample.position.x>0),'expired parts never refill the history at the spawn point');
    for(let index=1;index<state.samples.length;index++)
      assert.equal(state.samples[index-1].position.x-state.samples[index].position.x,8,'trajectory remains continuous through its natural exit');
    step(battle,30);
    assert.equal(head.alive,false);assert.equal(battle.projectiles.debris.count,0);
    assert.equal(battle.projectiles.entities().filter(part=>part.alive&&part.laserHead===head).length,0);
  }finally{battle.dispose();}
});

test('explicit curve expiry retires all of its source history and cannot recreate a dead head',()=>{
  const battle=fixture(),head=battle.laser({x:0,y:100},0,3,{curve:30,speed:120,width:12});
  try{
    step(battle,10);head.kill('expired');battle.projectiles.updateLasers();
    assert.equal(battle.projectiles.debris.count,0);assert.equal(battle.projectiles.lasers.size,0);
    assert.equal(battle.projectiles.entities().filter(part=>part.alive&&part.laserHead===head).length,0);
    step(battle,30);assert.equal(battle.projectiles.debris.count,0);
  }finally{battle.dispose();}
});

test('practice completion retires driven beams and lets public laser cancellation effects finish',()=>{
  const res=resources(),battle=new RushBattle([{...phase,spell:true,name:'practice',end:b=>b.cleanAuto('spell')}],
    {resources:res,profile:'portrait',practice:true});
  try{
    const head=battle.laser({x:-80,y:80},0,3,{length:160,width:10});
    battle.update();const field=battle.projectiles.debris;
    battle.endPhase('defeated');
    assert.equal(battle.finished,false);assert.equal(battle.defeatSequence.age,0);
    step(battle,60);
    assert.equal(battle.finished,true);assert.equal(head.alive,false);
    assert.ok(field.effects.length>0,'source progressive cancellation creates real ANM effects');
    step(battle,60);
    assert.equal(battle.projectiles.lasers.size,0);
    assert.equal(field.lasers.length,0);
    assert.equal(field.effects.length,0,'finished mode must keep advancing effect owners');
  }finally{battle.dispose();res.dispose();}
});

test('dialogue keeps authored beam movement frozen while existing source fragments continue their public lifecycle',()=>{
  const battle=fixture();
  try{
    const head=battle.laser({x:-80,y:80},0,3,{length:160,width:10,speed:120});
    battle.update();
    battle.projectiles.cancel(head.x+72,144,9,0,0,true,{bullets:false});
    const fragment=battle.projectiles.debris.lasers.find(l=>!l.driven);
    assert.ok(fragment);const x=head.x,fragmentX=fragment.position.x;
    battle.setDialogue(true);battle.update();
    assert.equal(head.x,x,'dialogue does not advance the Rush trajectory');
    assert.equal(fragment.position.x,fragmentX+8,'source fragment movement belongs to the public field');
  }finally{battle.dispose();}
});
