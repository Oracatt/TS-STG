import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DrawList, Keys } from '@ts-stg/thlib';
import { AnmBank, TouhouBossPresentation, TouhouGame, createTouhouResources } from '@ts-stg/thlib/touhou';

function presentation() {
  const bank = name => new AnmBank(JSON.parse(fs.readFileSync(new URL(
    `../packages/thlib/assets/touhou-common/anm/${name}.json`, import.meta.url))), {loadTexture:()=>11});
  const banks = {effect:bank('effect'),front:bank('front'),ascii_960:bank('ascii_960')};
  const owner = new TouhouBossPresentation({banks,player:{x:0,y:400,bomb:null}});
  const boss = {x:0,y:128,hp:8000,maximumHp:8000,alive:true};owner.enter(boss);
  return {owner,boss,banks};
}

test('aura and distortion are independent partial selections, not side effects of combat or spell start', () => {
  const {owner,banks} = presentation();
  try {
    const random = banks.effect.rng.state;
    owner.startCombat();owner.beginSpell({duration:600});owner.update();
    assert.equal(owner.combatActive,true);assert.deepEqual(owner.aura,[]);assert.equal(owner.distortionReady,false);
    owner.stopCombat();owner.setEffects({aura:true});owner.update();
    assert.equal(owner.combatActive,false);assert.deepEqual(owner.aura.map(vm=>vm.scriptId),[99,108]);
    assert.equal(owner.distortionReady,false);assert.equal(owner.distortion.currentRadius,16);
    const aura = owner.aura.slice(),time = aura[0].time;
    const afterBirth = banks.effect.rng.state;
    owner.setEffects({aura:true});owner.setEffects({distortion:true});
    assert.equal(banks.effect.rng.state,afterBirth,'changing selection does not construct animations outside update');
    owner.update();assert.deepEqual(owner.aura,aura);assert.equal(aura[0].time,time+1);
    assert.equal(owner.distortionReady,true);const warp = owner.distortion;
    owner.setEffects({aura:false});owner.update();
    assert.ok(aura.every(vm=>!vm.alive));assert.deepEqual(owner.aura,[]);assert.strictEqual(owner.distortion,warp);
    assert.equal(owner.distortionReady,true);assert.equal(owner.combatActive,false);
    const draw = new DrawList();owner.drawDistortion(draw,77);assert.ok(draw.commands.some(command=>command[0]==='mesh'));
    owner.startCombat();owner.setEffects({distortion:false});owner.update();
    assert.equal(owner.combatActive,true);assert.deepEqual(owner.aura,[]);assert.equal(owner.distortionReady,false);
    const disabled = new DrawList();owner.drawAura(disabled);owner.drawDistortion(disabled,77);assert.deepEqual(disabled.commands,[]);
    assert.notEqual(banks.effect.rng.state,random,'the explicitly selected original aura consumes its original random stream');
  } finally {owner.destroy();}
});

for (const mode of ['blackFog','flyIn']) test(`pre-existing effects and combat survive a ${mode} entrance independently of body visibility`, () => {
  const {owner} = presentation();
  try {
    owner.startCombat();owner.setEffects({aura:true,distortion:true});
    for(let frame=0;frame<4;frame++)owner.update();
    const aura = owner.aura.slice(),warp = owner.distortion,time = aura[0].time,radius = warp.currentRadius;
    const entrance = owner.beginEntrance({mode,readyFrame:120});
    assert.equal(owner.combatActive,true);assert.deepEqual(owner.aura,aura);assert.strictEqual(owner.distortion,warp);
    owner.update();
    assert.equal(entrance.ready,false);assert.equal(owner.bossVisible,mode==='flyIn');
    assert.equal(aura[0].time,time+1);assert.equal(warp.currentRadius,radius+2);assert.equal(owner.distortionReady,true);
    const draw = new DrawList();owner.drawDistortion(draw,77);assert.ok(draw.commands.some(command=>command[0]==='mesh'));
    let bodies=0;owner.drawBody(draw,()=>bodies++);assert.equal(bodies,mode==='flyIn'?1:0);
    owner.stopCombat();owner.update();assert.deepEqual(owner.aura,aura);assert.strictEqual(owner.distortion,warp);
    assert.ok(aura.every(vm=>vm.alive));assert.equal(owner.combatActive,false);
    owner.clearBoss();assert.equal(entrance.alive,false);assert.ok(aura.every(vm=>!vm.alive));
    assert.equal(owner.distortion,null);assert.equal(owner.boss,null);
    const cleared = new DrawList();owner.drawAura(cleared);owner.drawDistortion(cleared,77);owner.drawEntrance(cleared);
    assert.deepEqual(cleared.commands,[],'explicit retirement leaves no attached aura, warp or entry fog');
  } finally {owner.destroy();}
});

test('held Boss, captured card, pause and visible escape keep the same effects until explicit body retirement', () => {
  const resources=createTouhouResources({readText:file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),loadTexture:()=>11});
  const game=new TouhouGame({banks:resources.banks,font:resources.font,sht:resources.shots[0],styles:resources.styles});
  let attacks=0;
  const boss=game.spawnEnemy({x:0,y:128,hp:8000,damageInvulnerability:0,directional:false,onUpdate:()=>attacks++});
  game.beginSpell({boss,duration:1800});game.setBossEffects({aura:true,distortion:true});
  game.setBossHud({name:'Held Boss',remainingSpells:2});
  try {
    for(let frame=0;frame<35;frame++)game.update();
    assert.equal(game.bossHud.name,'Held Boss');assert.equal(game.bossHud.remainingSpells,2);
    const owner=game.bossPresentation,aura=owner.aura.slice(),warp=owner.distortion,attackCount=attacks,time=aura[0].time;
    game.holdBoss(boss);game.spell.capture(game.context);game.stopBossCombat();game.update();
    assert.equal(attacks,attackCount);assert.equal(game.spell.active,false);assert.equal(game.isBossHeld(boss),true);
    assert.deepEqual(owner.aura,aura);assert.strictEqual(owner.distortion,warp);assert.equal(aura[0].time,time+1);
    assert.equal(game.bossHud.name,'Held Boss');assert.equal(game.bossHud.remainingSpells,2);
    assert.equal(game.bossHud.state.hidden,true);assert.equal(game.bossHud.timerVisible,false);
    const escape=game.beginBossEscape(boss);assert.equal(owner.boss,boss);assert.equal(owner.combatActive,false);
    game.update(Keys.PAUSE);assert.equal(game.paused,true);
    const frozen=JSON.stringify(owner.snapshot()),random=resources.banks.effect.rng.state;
    for(let frame=0;frame<15;frame++)game.update();
    assert.equal(JSON.stringify(owner.snapshot()),frozen);assert.equal(resources.banks.effect.rng.state,random);
    assert.equal(escape.age,0,'pause cannot advance the retirement path');
    game.pauseVisual.resume();for(let frame=0;game.paused&&frame<20;frame++)game.update();
    assert.equal(game.paused,false);assert.equal(escape.age,0);assert.deepEqual(owner.aura,aura);assert.strictEqual(owner.distortion,warp);
    for(let frame=0;frame<59;frame++)game.update();
    assert.equal(boss.alive,true);assert.deepEqual(owner.aura,aura);assert.ok(aura.every(vm=>vm.alive));
    assert.strictEqual(owner.distortion,warp);assert.equal(attacks,attackCount);
    game.update();assert.equal(escape.alive,false);assert.equal(boss.alive,false);assert.equal(owner.boss,null);
    assert.ok(aura.every(vm=>!vm.alive));assert.deepEqual(owner.aura,[]);assert.equal(owner.distortion,null);
    assert.equal(game.bossEscapes.length,0);
  } finally {game.destroy();resources.dispose();}
});
