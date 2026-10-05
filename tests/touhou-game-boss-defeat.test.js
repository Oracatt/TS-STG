import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TouhouGame, TouhouEnemy, createTouhouResources } from '@ts-stg/thlib/touhou';

function fixture(options={}) {
  const resources=createTouhouResources({readText:file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),loadTexture:()=>11});
  const game=new TouhouGame({banks:resources.banks,font:resources.font,sht:resources.shots[0],styles:resources.styles,
    onBossDefeated:({game,boss,source})=>game.beginBossDefeat(boss,{source}),...options});
  return {game,resources,dispose(){game.destroy();resources.dispose();}};
}

test('registered Boss final damage keeps the spell and body through clearing, then settles and bursts before dialogue event',()=>{
  const sounds=[],events=[];
  const f=fixture({onSound:id=>sounds.push(id),onEvent:(name,data)=>events.push({name,data})}),g=f.game;
  let attacks=0,defeats=0,ordinaryDeaths=0;
  const boss=g.spawnEnemy({x:0,y:128,hp:10,damageInvulnerability:0,deathSound:3,
    onUpdate:()=>attacks++,onDefeat:()=>defeats++,drop:[{type:5}]});
  const ordinary=g.spawnEnemy({x:80,y:128,hp:10,onDefeat:()=>ordinaryDeaths++,drop:[{type:5}]});
  g.beginSpell({boss,id:12,name:'Final Card',duration:600});
  const near=g.bullets.emit({x:0,y:128,speed:0,shotSound:-1})[0];near.protectedFrames=500;
  const distant=g.bullets.emit({x:150,y:128,speed:0,shotSound:-1})[0];distant.protectedFrames=500;
  const laser=g.lasers.spawnStraight({x:0,y:160,speed:0,length:96,initialLength:96,width:10});laser.protectedFrames=500;
  const finishOrder=[];
  const finish=g.spell.capture.bind(g.spell);g.spell.capture=context=>{finishOrder.push('capture');return finish(context);};
  boss.onDefeat=()=>{defeats++;finishOrder.push('drop-and-defeat');assert.equal(g.items.items.length,1);};
  const death=g.bossPresentation.beginDeath.bind(g.bossPresentation);
  g.bossPresentation.beginDeath=options=>{finishOrder.push('explosion');return death(options);};
  const onEvent=g.context.onEvent;
  g.context.onEvent=(name,data)=>{if(name==='bossburst'){
    finishOrder.push('dialogue-event');assert.equal(boss.alive,false);assert.equal(g.spell.active,false);
    assert.equal(g.bossPresentation.deaths.length,1);assert.equal(laser.state,1);
  }onEvent(name,data);};
  try{
    boss.damage(70,{type:'test'},g.context);
    assert.equal(g.bossDefeats.length,1);const sequence=g.bossDefeats[0].sequence;
    assert.equal(sequence.age,0);assert.equal(boss.alive,true);assert.equal(boss.hp,0);
    assert.equal(g.spell.active,true);assert.equal(defeats,0);assert.equal(near.state,4);
    assert.equal(distant.state,1,'the initial clear radius is not the whole field');
    assert.equal(ordinary.alive,false);assert.equal(ordinaryDeaths,0);assert.equal(ordinary.effects.length,0);
    assert.equal(g.items.items.length,0,'ordinary retirement adds no extra drops');
    const rng=g.rng.state;boss.defeat(null,g.context);assert.equal(g.rng.state,rng);assert.equal(g.bossDefeats.length,1);
    assert.equal(boss.collidePlayer(g.player,g.context),0);assert.equal(boss.damage(100,null,g.context),0);
    for(let i=0;i<59;i++)g.update();
    assert.equal(sequence.age,59);assert.equal(attacks,0);assert.equal(g.spell.active,true);
    assert.equal(boss.alive,true);assert.equal(defeats,0);assert.equal(g.bossPresentation.deaths.length,0);
    assert.ok(![1,2].includes(distant.state));assert.ok(laser.alive&&laser.state!==1,'wave respects laser protection');
    assert.equal(g.items.items.length,0);assert.equal(finishOrder.length,0);
    g.update();
    assert.equal(sequence.age,60);assert.equal(sequence.burst,true);assert.equal(g.bossDefeats.length,0);
    assert.deepEqual(finishOrder,['capture','drop-and-defeat','explosion','dialogue-event']);
    assert.equal(defeats,1);assert.equal(g.spell.result.captured,true);assert.equal(g.spell.result.timeout,false);
    assert.equal(events.filter(event=>event.name==='bossburst').length,1);
    assert.equal(sounds.filter(id=>id===5).length,2);assert.ok(!sounds.includes(3));
    assert.ok(Math.hypot(boss.x,boss.y-128)>23.9);assert.equal(g.bossPresentation.deaths[0].alive,true);
    g.update();assert.equal(events.filter(event=>event.name==='bossburst').length,1,'visual tails never postpone or repeat the event');
  }finally{f.dispose();}
});

test('a damage-pass defeat starts at frame zero and scene disposal does not award victory',()=>{
  const events=[],f=fixture({onEvent:name=>events.push(name)}),g=f.game;
  const boss=g.spawnEnemy({x:0,y:128,hp:1,damageInvulnerability:0});g.beginSpell({boss,duration:600});
  // Inject at the existing accumulator pass, after the enemy and projectile
  // owners have advanced. This tests the common Game's simulation boundary.
  g.damage.flush=context=>{boss.damage(7,{type:'batch'},context);g.damage.flush=()=>[];return[];};
  g.update();const sequence=g.bossDefeats[0].sequence;
  assert.equal(sequence.age,0);g.update();assert.equal(sequence.age,1);
  g.paused=true;g.pauseVisual={active:true,update(){},destroy(){}};
  g.update();assert.equal(sequence.age,1);
  f.dispose();assert.equal(sequence.alive,false);assert.equal(sequence.burst,false);assert.equal(events.includes('bossburst'),false);
});

test('enemy deferral hook precedes drops, animation removal and callbacks; omitted hook keeps minor deaths immediate',()=>{
  const bank={create:()=>({alive:true,destroy(){this.alive=false;}})},events=[];
  const enemy=new TouhouEnemy({bank,deathSound:4,onDefeat:()=>events.push('defeat'),drop:[{type:5}]});
  const context={deferEnemyDefeat:()=>true,sound:()=>events.push('sound'),spawnItem:()=>events.push('drop')};
  enemy.defeat(null,context);assert.equal(enemy.alive,true);assert.equal(enemy.animation.alive,true);assert.deepEqual(events,[]);
  enemy.defeat(null,{...context,deferEnemyDefeat:undefined});
  assert.equal(enemy.alive,false);assert.equal(enemy.animation.alive,false);assert.deepEqual(events,['sound','drop','defeat']);
});

test('invalid public Boss defeat options leave the scene, enemies and RNG untouched',()=>{
  const f=fixture(),g=f.game;
  const boss=g.spawnEnemy({x:0,y:128,hp:1}),minor=g.spawnEnemy({x:80,y:128});g.enterBoss(boss);
  const before=JSON.stringify(g.snapshot()),flags=boss.primaryFlags;
  try{
    for(const options of [{delayFrames:-1},{delayFrames:1.5},{speed:-.4},{speed:Infinity},{angle:NaN}]){
      assert.throws(()=>g.beginBossDefeat(boss,options),/Boss defeat/);
      assert.equal(boss.invulnerable,undefined);assert.equal(boss.primaryFlags,flags);
      assert.equal(minor.alive,true);assert.equal(g.bossDefeats.length,0);
      assert.equal(JSON.stringify(g.snapshot()),before,'rejected parameters must not leave an incomplete sequence');
    }
  }finally{f.dispose();}
});

test('Boss burst, card settlement and enemy defeat callbacks may dispose their scene synchronously',()=>{
  for(const boundary of ['bossburst','spellFinish','enemyDefeat']){
    let game,disposed=0;
    const f=fixture({onEvent:name=>{if(name===boundary){disposed++;game.destroy();}}});game=f.game;
    const boss=game.spawnEnemy({x:0,y:128,hp:1,onDefeat:()=>{
      if(boundary==='enemyDefeat'){disposed++;game.destroy();}
    }});
    game.beginSpell({boss,id:30,duration:600});game.beginBossDefeat(boss,{delayFrames:1});
    assert.doesNotThrow(()=>game.update(),boundary);
    assert.equal(disposed,1);assert.equal(game.destroyed,true);assert.equal(game.bossDefeats.length,0);
    assert.doesNotThrow(()=>game.update());assert.equal(disposed,1);f.dispose();
  }
});

test('immediate Boss burst exposes a complete owner to callbacks and supports disposal before construction returns',()=>{
  let game,bursts=0;
  const f=fixture({onEvent:(name,data)=>{if(name==='bossburst'){
    bursts++;assert.equal(game.bossDefeats[0].sequence,data.sequence);
    assert.equal(game.snapshot().bossDefeats[0].burst,true);game.destroy();
  }}});game=f.game;
  const boss=game.spawnEnemy({x:0,y:128,hp:1});game.enterBoss(boss);
  let sequence;assert.doesNotThrow(()=>{sequence=game.beginBossDefeat(boss,{delayFrames:0});});
  assert.equal(bursts,1);assert.equal(sequence.burst,true);assert.equal(sequence.alive,false);
  assert.equal(game.destroyed,true);assert.doesNotThrow(()=>game.update());f.dispose();
});

test('a stage callback can destroy its Game before any old owners advance',()=>{
  let updates=0;const f=fixture({stage:game=>game.destroy()}),g=f.game;
  g.spawnEnemy({x:0,y:128,onUpdate:()=>updates++});
  assert.doesNotThrow(()=>g.update());assert.equal(g.destroyed,true);assert.equal(updates,0);
  assert.doesNotThrow(()=>g.update());assert.equal(updates,0);f.dispose();
});
