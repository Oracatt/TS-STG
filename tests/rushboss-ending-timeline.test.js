import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTouhouResources, SaveStore } from '@ts-stg/thlib';
import { RushBattle } from '../games/rushboss/src/runtime.js';
import { BOSSES } from '../games/rushboss/src/catalog.js';
import { RushPortraitApplication } from '../games/rushboss/src/portrait-application.js';

const tick = (owner, count) => { for (let i = 0; i < count; i++) owner.update(); };
const hasAssets = fs.existsSync('packages/thlib/assets/touhou-common/manifest.json') && process.env.TS_STG_TEST_STATIC_ASSETS !== '1';

function defeatInDamagePass(battle) {
  // Monstone's penultimate card is survival: use its real timeout handoff.
  if (battle.phase.survival) {
    battle.phaseFrame = Math.round(battle.phase.time * 60) - 1; battle.update(); return;
  }
  const player = battle.sharedPlayer, adapter = battle.playerAdapter;
  player.state = 1; player.timer.set(100);
  battle.boss.damageInvulnerability.set(0); battle.boss.hp = 1; adapter.health.set(1, !!battle.phase.spell);
  adapter.syncBoss(); adapter.damage.add(adapter.proxy, 100000, { x: battle.boss.x, y: battle.playerYOffset - battle.boss.y });
  battle.update();
}

test('all independent last-card wrappers reset HP immediately but wait160 before the next spell, preserving source protection and movement', () => {
  for (const [key, number, protection] of [['sunny', 7, 180], ['monstone', 9, 180], ['artia', 12, 160], ['artia', 13, 160]]) {
    const spec = BOSSES.find(boss => boss.key === key), next = spec.phases.findIndex(phase => phase.number === number);
    const battle = new RushBattle(spec.phases, { profile: 'portrait', boss: key, spellIndex: next - 1, invincible: true });
    try {
      battle.boss.x = 70; battle.boss.y = 160; defeatInDamagePass(battle);
      assert.equal(battle.phaseIndex, next, key); assert.equal(battle.boss.hp, spec.phases[next].hp);
      assert.equal(battle.boss.hp, battle.boss.maxHp); assert.equal(battle.phaseEntry.clock.frame, 0);
      assert.equal(battle.boss.damageInvulnerability.current, protection - 1);
      assert.equal(battle.playerAdapter.spell.active, false); assert.equal(battle.phaseFrame, 0);
      const spawned = battle.statistics.spawned;
      tick(battle, 90); assert.deepEqual([battle.boss.x, battle.boss.y], [0, battle.playerYOffset - 128]);
      assert.equal(battle.playerAdapter.spell.active, false); assert.equal(battle.statistics.spawned, spawned);
      tick(battle, 69); assert.equal(battle.phaseEntry.clock.frame, 159); assert.equal(battle.phaseFrame, 0);
      assert.equal(battle.playerAdapter.spell.active, false); assert.equal(battle.statistics.spawned, spawned);
      battle.update(); assert.equal(battle.phaseEntry, null); assert.equal(battle.playerAdapter.spell.active, true);
      assert.equal(battle.phaseFrame, 0); assert.equal(battle.patternFrame, 0);
      assert.equal(battle.boss.damageInvulnerability.current, Math.max(0, protection - 161));
    } finally { battle.dispose(); }
  }
});

test('paired nonspell handoffs remain immediate and directly selected independent cards skip their wrapper', () => {
  const spec = BOSSES[0];
  const paired = new RushBattle(spec.phases, { profile: 'portrait', boss: 'sunny', invincible: true });
  try {
    defeatInDamagePass(paired); assert.equal(paired.phase.number, 2);
    assert.equal(paired.phaseEntry, null); assert.equal(paired.playerAdapter.spell.active, true); assert.equal(paired.transition, 0);
  } finally { paired.dispose(); }
  for (const practice of [false, true]) {
    const direct = new RushBattle(spec.phases, { profile: 'portrait', boss: 'sunny', spellIndex: 6, practice, invincible: true });
    try { assert.equal(direct.phaseEntry, null); assert.equal(direct.playerAdapter.spell.active, true); }
    finally { direct.dispose(); }
  }
});

function endingBattle(options = {}) {
  const notices = [], battle = new RushBattle([{ key: 'last', hp: 3000, time: 40, spell: true, name: 'Final', finalSpell: true }],
    { profile: 'portrait', invincible: true, onHudNotice: (...args) => notices.push(args), ...options });
  const spell = battle.playerAdapter.spell; spell.age.set(301); spell.frames = battle.phaseFrame = 301;
  return { battle, spell, notices };
}

test('last-card defeat progressively clears moving bullets through frame59 and settles only with the frame60 burst', () => {
  const { battle, spell, notices } = endingBattle();
  try {
    const origin = { x: battle.boss.x, y: battle.boss.y };
    const near = battle.spawn('XiaoYu', { x: origin.x + 10, y: origin.y }, {}, 1, { delay: 0 });
    const medium = battle.spawn('XiaoYu', { x: origin.x + 100, y: origin.y }, { x: 30, y: 0 }, 1, { delay: 0, cleanOnOutOfRange: false });
    const far = battle.spawn('XiaoYu', { x: origin.x + 800, y: origin.y }, { x: 30, y: 0 }, 1, { delay: 0, cleanOnOutOfRange: false });
    const initialBonus = spell.bonus; battle.endPhase('defeated');
    assert.equal(battle.defeatSequence.clearWave.radius, 16); assert.equal(near.alive, false);
    assert.equal(medium.alive, true); assert.equal(far.alive, true);
    assert.equal(spell.active, true); assert.equal(battle.results.length, 0); assert.equal(battle.score, 0); assert.deepEqual(notices, []);
    battle.update(); assert.equal(battle.defeatSequence.clearWave.radius, 22);
    assert.equal(medium.x, origin.x + 100.5); assert.equal(far.x, origin.x + 800.5);
    assert.ok(spell.bonus < initialBonus, 'the source spell clock and bonus continue during defeat');
    tick(battle, 58); assert.equal(battle.defeatSequence.age, 59); assert.equal(battle.defeatSequence.clearWave.radius, 370);
    assert.equal(medium.alive, false); assert.equal(far.alive, true); assert.equal(far.x, origin.x + 829.5);
    assert.equal(battle.finished, false); assert.equal(spell.active, true); assert.deepEqual(notices, []);
    battle.update(); assert.equal(battle.defeatSequence.age, 60); assert.equal(battle.defeatSequence.burst, true);
    assert.equal(battle.defeatSequence.clearWave.alive, false); assert.equal(far.alive, false);
    assert.equal(battle.finished, true); assert.equal(spell.active, false); assert.equal(battle.results.length, 1);
    assert.equal(battle.results[0].captured, true); assert.equal(battle.results[0].frames, 361);
    assert.equal(battle.score, battle.results[0].bonus); assert.deepEqual(notices.map(notice => notice[0]), [0]);
  } finally { battle.dispose(); }
});

test('a player hit during the final clear still fails the active card before its delayed settlement', () => {
  const { battle, spell, notices } = endingBattle({ invincible: false });
  try {
    battle.sharedPlayer.state = 1; battle.sharedPlayer.timer.set(100); battle.sharedPlayer.invulnerability.set(0);
    battle.endPhase('defeated'); tick(battle, 10);
    assert.equal(battle.miss(), true); assert.equal(spell.active, true); assert.equal(spell.captureEligible, false);
    tick(battle, 49); assert.equal(battle.finished, false); assert.deepEqual(notices, []);
    battle.update(); assert.equal(battle.results[0].captured, false); assert.equal(battle.results[0].bonus, 0);
    assert.equal(battle.score, 0); assert.deepEqual(notices.map(notice => notice[0]), [1]);
  } finally { battle.dispose(); }
});

function sessionFixture(mode = 'normal') {
  let handle = 0;
  const host = { readText: path => fs.readFileSync(path, 'utf8'), loadTexture: () => ++handle,
    createTexture: () => ++handle, createRenderTarget: () => ++handle, unloadTexture() {} };
  const resources = createTouhouResources(host), dialogues = [];
  const graphics = { clearBattle() {}, draw(draw) { draw.clear(); }, snapshot: () => ({ test: true }) };
  const app = new RushPortraitApplication(host, { resources, graphics, store: new SaveStore(),
    startBoss: 'sunny', phaseIndex: 6, mode, invincible: true,
    createBattle: (phases, options) => new RushBattle(phases.map(phase => ({ ...phase, init() {}, update() {} })), options),
    createDialogue: (_resources, config) => {
      dialogues.push({ phase: config.phase });
      return { complete: config.phase === 'before', update() {}, draw() {}, dispose() {}, snapshot() { return { phase: config.phase }; } };
    } });
  if (mode !== 'spell') { app.battle.revealBoss({ mode: 'flyIn' }); app.update(); }
  return { app, resources, dialogues, close() { app.destroy(); resources.dispose(); } };
}

test('normal post-Boss dialogue begins exactly60 frames after burst while original death and laser effects continue', { skip: !hasAssets }, () => {
  const f = sessionFixture(), { app } = f, battle = app.battle, game = app.application.game;
  try {
    assert.equal(game.state, 'combat'); battle.playerAdapter.spell.age.set(301);
    const beam = battle.laser({ x: -80, y: 124 }, 0, 1, { length: 180, width: 12 });
    battle.projectiles.syncLasers(); battle.projectiles.lasers.get(beam).protectedFrames = 1000;
    battle.endPhase('defeated'); tick(app, 59); assert.equal(game.state, 'combat');
    app.update(); assert.equal(game.state, 'ending'); assert.equal(game.age, 0);
    assert.ok(battle.presentation.shared.hasDeathEffects); assert.ok(battle.projectiles.debris.effects.length > 0);
    const death = battle.presentation.shared.deaths[0];
    tick(app, 59); assert.equal(game.state, 'ending'); assert.equal(f.dialogues.filter(dialogue => dialogue.phase === 'after').length, 0);
    app.update(); assert.equal(game.state, 'after'); assert.equal(f.dialogues.at(-1).phase, 'after');
    assert.equal(death.alive, true); assert.equal(game.paused, false);
    const age = death.age; app.update(); assert.equal(death.age, age + 1, 'death particles continue underneath dialogue');
  } finally { f.close(); }
});

test('spell-practice results wait for feedback tails while those owners continue updating', { skip: !hasAssets }, () => {
  const f = sessionFixture('spell'), { app } = f, battle = app.battle, game = app.application.game;
  try {
    battle.playerAdapter.spell.age.set(301); battle.endPhase('defeated'); tick(app, 60);
    assert.equal(game.state, 'ending'); assert.equal(game.paused, false);
    const death = battle.presentation.shared.deaths[0], age = death.age;
    tick(app, 60); assert.equal(game.state, 'ending'); assert.equal(death.age, age + 60);
    assert.equal(death.alive, true); assert.equal(game.paused, false);
    for (let frame = 0; frame < 500 && game.state === 'ending'; frame++) app.update();
    assert.equal(game.state, 'result'); assert.equal(game.paused, true); assert.equal(death.alive, false);
    assert.equal(game.endingFeedbackActive, false); assert.equal(f.dialogues.length, 0);
  } finally { f.close(); }
});

test('every capturable practice card uses the same60-frame final defeat, including cards without a final flag',()=>{
  let cases=0;
  for(const spec of BOSSES)for(let index=0;index<spec.phases.length;index++){
    const phase=spec.phases[index];if(!phase.spell||phase.survival)continue;
    const battle=new RushBattle(spec.phases,{boss:spec.key,profile:'portrait',practice:true,spellIndex:index,invincible:true});
    let bursts=0,clears=0;const begin=battle.presentation.beginBossDeath.bind(battle.presentation),clear=battle.projectiles.clearAll.bind(battle.projectiles);
    battle.presentation.beginBossDeath=()=>{bursts++;return begin();};battle.projectiles.clearAll=()=>{clears++;return clear();};
    try{
      defeatInDamagePass(battle);assert.equal(battle.defeatSequence.age,0);assert.equal(battle.finished,false);
      assert.equal(battle.playerAdapter.spell.active,true);assert.equal(battle.results.length,0);
      const indexBefore=battle.phaseIndex,spawned=battle.statistics.spawned;
      battle.endPhase('defeated');tick(battle,59);
      assert.equal(battle.defeatSequence.age,59);assert.equal(battle.results.length,0);assert.equal(bursts,0);
      battle.update();assert.equal(battle.finished,true);assert.equal(battle.phaseIndex,indexBefore);
      assert.equal(battle.results.length,1);assert.equal(bursts,1);assert.equal(clears,1);
      assert.equal(battle.playerAdapter.items.spawnCounter,0);assert.equal(battle.statistics.spawned,spawned);
      tick(battle,2);assert.equal(bursts,1);assert.equal(battle.results.length,1);cases++;
    }finally{battle.dispose();}
  }
  assert.equal(cases,14);
});

test('practice timeout settles once then flies away for60 frames without a death clear, drop or inversion',()=>{
  for(const [key,index] of [['sunny',1],['sunny',6],['monstone',7],['monstone',8],['artia',11],['artia',12]]){
    const spec=BOSSES.find(boss=>boss.key===key),sounds=[];
    const battle=new RushBattle(spec.phases,{boss:key,profile:'portrait',practice:true,spellIndex:index,invincible:true,
      assets:{playSound:sound=>sounds.push(sound)}});
    const phase=battle.phase,spell=battle.playerAdapter.spell;
    let bursts=0,clears=0;const clear=battle.projectiles.clearAll.bind(battle.projectiles);
    battle.presentation.beginBossDeath=()=>{bursts++;};battle.projectiles.clearAll=()=>{clears++;return clear();};
    try{
      const bullet=battle.spawn('XiaoYu',{x:800,y:100},{x:30,y:0},1,{delay:0,cleanOnOutOfRange:false});
      battle.phaseFrame=Math.round(phase.time*60)-1;spell.age.set(battle.phaseFrame);spell.frames=battle.phaseFrame;
      battle.update();assert.equal(battle.escaping.clock.frame,0);assert.equal(battle.finished,false);
      assert.equal(spell.active,false);assert.equal(battle.results.length,1);assert.equal(battle.results[0].captured,!!phase.survival);
      assert.equal(battle.phaseIndex,index);assert.equal(battle.boss.hp,100000);assert.equal(bullet.alive,true);
      assert.equal(battle.defeatSequence??null,null);assert.equal(clears,0);assert.equal(bursts,0);
      const bulletX=bullet.x,frames=battle.phaseFrame;
      battle.endPhase('timeout');tick(battle,59);
      assert.equal(battle.escaping.clock.frame,59);assert.equal(battle.finished,false);assert.equal(battle.results.length,1);
      assert.equal(battle.phaseFrame,frames);assert.equal(bullet.alive,true);assert.equal(bullet.x,bulletX+29.5);
      battle.update();assert.equal(battle.escaping,null);assert.equal(battle.finished,true);assert.equal(battle.boss.alive,false);
      assert.deepEqual([battle.boss.x,battle.boss.y],[-224,battle.playerYOffset+80]);
      assert.equal(bullet.x,bulletX+30);battle.update();assert.equal(bullet.x,bulletX+30.5);
      tick(battle,9);assert.equal(bullet.x,bulletX+35,'remaining bullets continue during the result-notice tail');
      assert.equal(battle.results.length,1);assert.equal(battle.playerAdapter.items.spawnCounter,0);
      assert.equal(clears,0);assert.equal(bursts,0);assert.equal(sounds.some(sound=>/^se_enep/.test(sound)),false);
    }finally{battle.dispose();}
  }
});

test('practice escape tail advances live bullets but never restores player contact or finished-card damage',()=>{
  const battle=new RushBattle([{key:'practice-exit',hp:10,time:10,spell:true,name:'Practice'}],
    {profile:'portrait',practice:true,invincible:false});
  try{
    battle.sharedPlayer.state=1;battle.sharedPlayer.timer.set(100);battle.sharedPlayer.invulnerability.set(0);
    battle.endPhase('timeout');tick(battle,60);assert.equal(battle.escaped,true);assert.equal(battle.finished,true);
    const player=battle.sharedPlayer,lives=player.lives,health=battle.playerAdapter.health.hp;
    const moving=battle.spawn('XiaoYu',{x:800,y:100},{x:60,y:0},1,{delay:0,cleanOnOutOfRange:false});
    battle.spawn('XiaoYu',{x:battle.player.x,y:battle.player.y},{x:0,y:0},1,{delay:0});
    battle.laser({x:battle.player.x-80,y:battle.player.y},0,1,{length:160,width:20,delay:0});
    battle.playerAdapter.damage.add(battle.playerAdapter.proxy,100000,{});
    tick(battle,20);
    assert.equal(moving.x,820);assert.equal(player.lives,lives);assert.equal(player.state,1);
    assert.equal(battle.combatActive,false);assert.equal(battle.playerAdapter.health.hp,health);
    assert.equal(battle.playerAdapter.damage.pending.size,0);assert.equal(battle.results.length,1);
    assert.equal(battle.defeatSequence??null,null);
  }finally{battle.dispose();}
});
