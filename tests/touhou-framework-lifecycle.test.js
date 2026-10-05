import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TouhouGame, createTouhouResources } from '../packages/thlib/src/touhou/index.js';
import { TouhouPhaseSequence } from '../packages/thlib/src/touhou/phase-sequence.js';

function fixture(options = {}) {
  const resources = createTouhouResources({ readText: file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), loadTexture: () => 11 });
  const game = new TouhouGame({ banks: resources.banks, font: resources.font, sht: resources.shots[0], styles: resources.styles, ...options });
  return { game, dispose() { game.destroy(); resources.dispose(); } };
}
const bossFor = (game, options = {}) => game.spawnEnemy({ x: 0, y: 128, hp: 10, damageInvulnerability: 0, directional: false, ...options });

test('game composition shares its world and keeps explicit player rules through all default factories', () => {
  const calls=[],f=fixture({bounds:{x:-240,width:480,height:560},systemOptions:{player:{rules:{initialPower:200,maxPower:600,maxLives:5}},bullets:{capacity:3000}},
    factories:{enemy:(options,game)=>{calls.push(options.world);return {...options,alive:true,animation:{destroy(){}}};}}}),g=f.game;
  try {
    assert.equal(g.player.power,200);assert.equal(g.hud.maximumLives,5);assert.equal(g.hud.maxPower,600);
    for(const system of [g.player,g.bullets,g.lasers,g.items])assert.equal(system.world,g.world);
    g.spawnEnemy({x:0,y:80,hp:100});assert.equal(calls[0],g.world);
    g.hud.update(g.player);g.hud.draw(g.drawList,g.player);
  } finally { f.dispose(); }
});

test('a custom player profile supplies the HUD identity instead of the default Reimu identifier', () => {
  const f=fixture({systemOptions:{player:{profile:{id:'guest'}}}}),g=f.game;
  try {assert.equal(g.player.character,'guest');assert.equal(g.hud.roots.some(vm=>vm.scriptId===101||vm.scriptId===102),false);}
  finally {f.dispose();}
});

test('pausing a spell clock preserves its countdown and bonus while presentation continues updating', () => {
  const f=fixture(),g=f.game,boss=bossFor(g);
  try {
    g.beginSpell({boss,duration:600});for(let i=0;i<305;i++)g.update();
    const before={frames:g.spell.frames,remaining:g.spell.remaining,bonus:g.spell.bonus};
    let visualUpdates=0;g.spell.visuals.push({alive:true,update(){visualUpdates++;},destroy(){this.alive=false;}});
    g.spell.clockPaused=true;for(let i=0;i<10;i++)g.update();
    assert.deepEqual({frames:g.spell.frames,remaining:g.spell.remaining,bonus:g.spell.bonus},before);
    assert.equal(visualUpdates,10);g.spell.clockPaused=false;g.update();assert.equal(g.spell.frames,before.frames+1);
  } finally {f.dispose();}
});

test('game destruction closes actor generators, disposes a stage owner and releases all registered bosses', () => {
  let finalized = 0, stageDisposed = 0;
  const stage = { update() {}, destroy() { stageDisposed++; } }, f = fixture({ stage }), g = f.game;
  const boss = bossFor(g); g.enterBoss(boss);
  g.runBossSequence(boss, (function* () { try { yield 100; } finally { finalized++; } })());
  g.update(); assert.equal(finalized, 0);
  g.destroy();
  assert.equal(finalized, 1); assert.equal(stageDisposed, 1); assert.equal(g.tasks.size, 0); assert.equal(g.bossRegistry.size, 0);
  g.destroy(); g.update(); assert.equal(finalized, 1); assert.equal(stageDisposed, 1);
  f.dispose();
});

test('finishing a running phase interrupts its attack generator once before leave and the next phase', () => {
  const trace = [];
  const sequence = new TouhouPhaseSequence([
    { run: function* () { try { while (true) { trace.push('attack'); yield 1; } } finally { trace.push('cleanup'); } },
      leave(_context, _owner, result) { trace.push('leave:' + result); } },
    { enter() { trace.push('next'); } },
  ]);
  sequence.update(); assert.deepEqual(trace, ['attack']);
  assert.equal(sequence.finish('defeat'), true); assert.equal(sequence.finish('timeout'), false);
  sequence.update();
  assert.deepEqual(trace, ['attack', 'cleanup', 'leave:defeat', 'next']);
  assert.equal(sequence.index, 1); assert.equal(sequence.state, 'running');
  sequence.destroy(); assert.equal(trace.filter(value => value === 'cleanup').length, 1);
});

test('a phase can destroy its sequence from inside its running generator without executing later phases', () => {
  const trace = [];
  const sequence = new TouhouPhaseSequence([
    { run: function* (_context, owner) { try { trace.push('run'); owner.destroy(); yield 1; } finally { trace.push('cleanup'); } },
      leave() { trace.push('leave'); } },
    { enter() { trace.push('next'); } },
  ]);
  assert.doesNotThrow(() => sequence.update()); sequence.update();
  assert.equal(sequence.alive, false); assert.deepEqual(trace, ['run', 'cleanup']);
});

test('registered bosses retain independent outcome callbacks after the presentation focus changes', () => {
  const outcomes = [], f = fixture(), g = f.game;
  const a = bossFor(g, { x: -80 }), b = bossFor(g, { x: 80 });
  g.enterBoss(a, { onDefeated: event => outcomes.push(event.boss.id) }); g.startBossCombat(a);
  g.enterBoss(b, { onDefeated: event => outcomes.push(event.boss.id) }); g.startBossCombat(b);
  try {
    assert.equal(g.isBossCombatReady(a), true); assert.equal(g.isBossCombatReady(b), true);
    a.damage(10, null, g.context);
    assert.deepEqual(outcomes, [a.id]); assert.equal(a.alive, true); assert.equal(g.isBossHeld(a), true);
    assert.equal(a.effects.length, 0); assert.equal(g.isBossCombatReady(b), true);
    b.damage(10, null, g.context);
    assert.deepEqual(outcomes, [a.id, b.id]); assert.equal(b.alive, true); assert.equal(g.isBossHeld(b), true);
    assert.equal(g.bossPresentation.deaths.length, 0);
  } finally { f.dispose(); }
});

test('holding an exhausted boss defers the default timeout settlement until the caller resolves the card', () => {
  const events = [], f = fixture({ onEvent: name => events.push(name) }), g = f.game, boss = bossFor(g);
  g.beginSpell({ boss, id: 20, name: 'Caller dialogue', duration: 61 });
  try {
    boss.damage(70, null, g.context);
    for (let frame = 0; frame < 70; frame++) g.update();
    assert.equal(g.isBossHeld(boss), true); assert.equal(g.spell.active, true);
    assert.equal(events.includes('spellFinish'), false); assert.equal(events.includes('spellFailed'), false);
    const result = g.spell.capture(g.context); assert.equal(result.captured, true);
    assert.equal(events.filter(name => name === 'spellFinish').length, 1);
  } finally { f.dispose(); }
});

test('caller timeout notification fires once per generation and the same spell id can be used again', () => {
  const timeouts = [], f = fixture({ onSpellTimeout: event => timeouts.push({ spell: event.spell, boss: event.boss, generation: event.spell.generation }) }), g = f.game;
  const boss = bossFor(g); g.beginSpell({ boss, id: 7, duration: 2 });
  try {
    for (let frame = 0; frame < 8; frame++) g.update();
    assert.equal(timeouts.length, 1); assert.equal(timeouts[0].boss, boss); assert.equal(g.spell.active, true);
    g.spell.capture(g.context);
    g.beginSpell({ boss, id: 7, duration: 2 });
    for (let frame = 0; frame < 8; frame++) g.update();
    assert.equal(timeouts.length, 2); assert.equal(timeouts[1].boss, boss);
    assert.ok(timeouts[1].generation > timeouts[0].generation);
  } finally { f.dispose(); }
});

test('a timeout callback can destroy the scene without updating later visual owners', () => {
  let laterUpdates = 0;
  const f = fixture({ onSpellTimeout: ({ game }) => game.destroy() }), g = f.game;
  const boss = bossFor(g); g.beginSpell({ boss, duration: 1 });
  g.grazeEffects.update = () => { laterUpdates++; };
  try { assert.doesNotThrow(() => g.update()); assert.equal(g.destroyed, true); assert.equal(laterUpdates, 0); }
  finally { f.dispose(); }
});

test('spell position follows its owning boss when HUD focus is switched to another registered boss', () => {
  const f = fixture(), g = f.game, a = bossFor(g, { x: -100 }), b = bossFor(g, { x: 100 });
  g.beginSpell({ boss: a, id: 4, duration: 600 }); g.enterBoss(b); g.startBossCombat(b);
  try {
    for (let frame = 0; frame < 5; frame++) g.update();
    assert.equal(g.context.boss, b); assert.equal(g.spell.position.x, -100);
    assert.equal(g.spell.position.y, 128); assert.equal(g.spell.active, true);
  } finally { f.dispose(); }
});

test('a defeat sequence never captures a replacement card that reused the old spell id', () => {
  const f = fixture(), g = f.game, boss = bossFor(g);
  g.beginSpell({ boss, id: 7, duration: 600 });
  const sequence = g.beginBossDefeat(boss, { delayFrames: 2, speed: 0 });
  g.spell.capture(g.context); g.beginSpell({ boss, id: 7, duration: 600 });
  const replacementGeneration = g.spell.generation;
  try {
    g.update(); g.update();
    assert.equal(sequence.burst, true); assert.equal(g.spell.generation, replacementGeneration);
    assert.equal(g.spell.active, true); assert.equal(g.spell.result, null);
  } finally { f.dispose(); }
});

test('an explicitly exploded secondary boss does not settle a card owned by another boss', () => {
  const f = fixture(), g = f.game, a = bossFor(g, { x: -60 }), b = bossFor(g, { x: 60 });
  g.beginSpell({ boss: a, id: 8, duration: 600 }); g.enterBoss(b);
  try {
    const sequence = g.beginBossDefeat(b, { delayFrames: 0, speed: 0 });
    assert.equal(sequence.burst, true); assert.equal(g.spell.active, true); assert.equal(g.spell.result, null);
  } finally { f.dispose(); }
});

test('only the defeat sequence for the current card generation may defer its timeout notification', () => {
  for (const replaceCard of [false, true]) {
    const timeouts = [], f = fixture({ onSpellTimeout: event => timeouts.push(event.spell.generation) }), g = f.game;
    const a = bossFor(g, { x: -60 }), b = bossFor(g, { x: 60 });
    g.beginSpell({ boss: a, id: 9, duration: 2 }); g.enterBoss(b);
    const sequence = g.beginBossDefeat(replaceCard ? a : b, { delayFrames: 20, speed: 0 });
    if (replaceCard) { g.spell.capture(g.context); g.beginSpell({ boss: a, id: 9, duration: 2 }); }
    try {
      for (let frame = 0; frame < 3; frame++) g.update();
      assert.equal(sequence.alive, true);
      assert.deepEqual(timeouts, [g.spell.generation], replaceCard ? 'replaced card generation' : 'different Boss');
    } finally { f.dispose(); }
  }
});

test('charge is independent of combat activation and per-encounter profile switches replace aura scripts', () => {
  const f = fixture(), g = f.game, a = bossFor(g), b = bossFor(g, { x: 40 });
  g.enterBoss(a, { profile: 'midboss' });
  try {
    const presentation = g.bossPresentation, charge = presentation.beginCharge();
    assert.equal(presentation.combatActive, false); assert.equal(g.isBossCombatReady(a), false);
    g.update(); assert.equal(charge.alive, true); assert.equal(presentation.aura.length, 0);
    g.stopBossCombat(a); assert.equal(charge.alive, true, 'a combat gate is not the owner of an independently requested charge');
    g.startBossCombat(a); g.update(); assert.deepEqual(presentation.aura.map(vm => vm.scriptId), [99]);
    g.enterBoss(b, { profile: 'boss' }); g.startBossCombat(b); g.update();
    assert.equal(presentation.profileName, 'boss'); assert.deepEqual(presentation.aura.map(vm => vm.scriptId), [99, 108]);
    assert.equal(charge.alive, false, 'switching the displayed encounter retires the old encounter visual owner');
  } finally { f.dispose(); }
});
