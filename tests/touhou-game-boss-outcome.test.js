import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TouhouGame, TouhouMotion, createTouhouResources } from '@ts-stg/thlib/touhou';

function fixture(options = {}) {
  const resources = createTouhouResources({
    readText: file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
    loadTexture: () => 11,
  });
  const game = new TouhouGame({ banks: resources.banks, font: resources.font,
    sht: resources.shots[0], styles: resources.styles, ...options });
  return { game, dispose() { game.destroy(); resources.dispose(); } };
}

function bossFor(game, options = {}) {
  return game.spawnEnemy({ x: 0, y: 128, hp: 10, damageInvulnerability: 0,
    directional: false, ...options });
}

test('registered Boss damage reports an outcome once and may keep its visible body for dialogue without exploding', () => {
  const events = [], sounds = [];
  const f = fixture({ onEvent: (name, data) => events.push({ name, data }), onSound: id => sounds.push(id) });
  const g = f.game;
  let attacks = 0, ordinaryDefeats = 0;
  const boss = bossFor(g, { onUpdate: () => attacks++, onDefeat: () => ordinaryDefeats++, drop: [{ type: 5 }],
    motion: new TouhouMotion({ position: { x: 0, y: 128 }, speed: 2, angle: 0 }) });
  const source = { type: 'test' };
  g.beginSpell({ boss, id: 12, name: 'Caller-owned outcome', duration: 600 });
  const bullet = g.bullets.emit({ x: 100, y: 100, speed: 0, shotSound: -1 })[0];
  const animation = boss.animation;
  let animationUpdates = 0;
  const updateAnimation = animation.update.bind(animation);
  animation.update = (...args) => { animationUpdates++; return updateAnimation(...args); };
  try {
    boss.damage(70, source, g.context);
    assert.equal(g.isBossHeld(boss), true);
    assert.equal(boss.alive, true);
    assert.equal(animation.alive, true);
    assert.equal(g.bossDefeats.length, 0, 'HP zero is not a request for the explosion preset');
    const outcome = events.filter(event => event.name === 'bossdefeated');
    assert.equal(outcome.length, 1);
    assert.equal(outcome[0].data.game, g);
    assert.equal(outcome[0].data.boss, boss);
    assert.equal(outcome[0].data.source, source);
    boss.damage(70, source, g.context);
    boss.defeat(source, g.context);
    assert.equal(events.filter(event => event.name === 'bossdefeated').length, 1);
    assert.equal(boss.collidePlayer(g.player, g.context), 0);
    for (let frame = 0; frame < 60; frame++) g.update();
    assert.equal(attacks, 0, 'the old attack callback must stop before the dialogue');
    assert.equal(boss.x, 0);
    assert.equal(boss.y, 128);
    assert.equal(animationUpdates, 60, 'holding a Boss does not freeze its body animation');
    assert.equal(animation.alive, true);
    assert.equal(boss.alive, true);
    assert.equal(g.spell.active, true, 'the caller chooses when the current card settles');
    assert.ok([1, 2].includes(bullet.state), 'holding alone does not cancel projectiles');
    assert.equal(ordinaryDefeats, 0);
    assert.equal(g.items.items.length, 0);
    assert.equal(g.bossPresentation.deaths.length, 0);
    assert.equal(events.some(event => event.name === 'bossburst'), false);
    assert.equal(sounds.includes(5), false);
  } finally { f.dispose(); }
});

test('a custom Boss outcome can synchronously set the next phase HP and resume the same body', () => {
  let outcomes = 0, attacks = 0;
  const f = fixture({ onBossDefeated: ({ game, boss }) => {
    outcomes++;
    assert.equal(game.isBossHeld(boss), true);
    boss.prepareNormalHealth(20);
    game.resumeBoss(boss);
  } });
  const g = f.game, boss = bossFor(g, { onUpdate: () => attacks++ });
  g.enterBoss(boss); g.startBossCombat();
  try {
    boss.damage(10, null, g.context);
    assert.equal(outcomes, 1);
    assert.equal(g.isBossHeld(boss), false);
    assert.equal(boss.hp, 20);
    assert.equal(boss.alive, true);
    g.update();
    assert.equal(attacks, 1);
    boss.damage(20, null, g.context);
    assert.equal(outcomes, 2, 'the next phase receives its own HP-zero outcome');
    assert.equal(g.bossPresentation.deaths.length, 0);
    assert.equal(g.bossDefeats.length, 0);
  } finally { f.dispose(); }
});

test('hold and resume restore only the original invulnerability and hold-owned flag bits', () => {
  const f = fixture(), g = f.game;
  try {
    for (const invulnerable of [undefined, false, true]) {
      const boss = bossFor(g, { primaryFlags: 0x1002 });
      boss.invulnerable = invulnerable;
      g.enterBoss(boss);
      g.holdBoss(boss);
      g.holdBoss(boss);
      assert.equal(g.isBossHeld(boss), true);
      assert.equal(boss.invulnerable, true);
      assert.equal(boss.primaryFlags & 0x13, 0x13);
      boss.primaryFlags = (boss.primaryFlags & ~0x1000) | 0x4000;
      boss.hp = 100;
      g.resumeBoss(boss);
      assert.equal(g.isBossHeld(boss), false);
      assert.equal(boss.invulnerable, invulnerable);
      assert.equal(boss.primaryFlags, 0x4002, 'resume preserves unrelated edits made during the hold');
      assert.equal(boss.hp, 100, 'resume does not invent a new phase HP value');
      g.removeBoss(boss);
    }
  } finally { f.dispose(); }
});

test('Boss-local outcomes override the global handler, survive re-entry and beginSpell, and null disables inheritance', () => {
  let globalCalls = 0, localCalls = 0;
  const events = [];
  const f = fixture({ onBossDefeated: () => globalCalls++, onEvent: name => events.push(name) });
  const g = f.game;
  try {
    const boss = bossFor(g);
    g.enterBoss(boss, { onDefeated: ({ game, boss: defeated }) => {
      assert.equal(game, g); assert.equal(defeated, boss); localCalls++;
    } });
    g.enterBoss(boss);
    g.beginSpell({ boss, duration: 600 });
    boss.damage(70, null, g.context);
    assert.equal(localCalls, 1); assert.equal(globalCalls, 0);
    g.spell.capture(g.context);
    g.removeBoss(boss);
    const inherited = bossFor(g); g.enterBoss(inherited);
    inherited.damage(10, null, g.context);
    assert.equal(globalCalls, 1);
    g.removeBoss(inherited);
    const disabled = bossFor(g); g.enterBoss(disabled, { onDefeated: null });
    g.enterBoss(disabled); g.beginSpell({ boss: disabled, duration: 600 });
    disabled.damage(70, null, g.context);
    assert.equal(globalCalls, 1); assert.equal(localCalls, 1);
    assert.equal(events.filter(name => name === 'bossdefeated').length, 1);
  } finally { f.dispose(); }
});

test('Boss defeat callbacks are reentrancy-safe and can remove their scene synchronously', () => {
  for (const boundary of ['handler', 'event']) {
    let calls = 0;
    const outcome = ({ game, boss, source }) => {
      calls++;
      assert.equal(game.isBossHeld(boss), true);
      boss.defeat(source, game.context);
      game.destroy();
    };
    const f = fixture(boundary === 'handler' ? { onBossDefeated: outcome } : {
      onEvent: (name, data) => { if (name === 'bossdefeated') outcome(data); },
    });
    const g = f.game, boss = bossFor(g);
    g.enterBoss(boss);
    assert.doesNotThrow(() => boss.damage(10, null, g.context));
    assert.equal(calls, 1); assert.equal(g.destroyed, true);
    assert.doesNotThrow(() => g.update()); assert.equal(calls, 1);
    f.dispose();
  }
});

test('ordinary enemies still execute their ordinary death path even when a Boss outcome handler is configured', () => {
  let outcomes = 0, defeats = 0;
  const f = fixture({ onBossDefeated: () => outcomes++ }), g = f.game;
  const boss = bossFor(g); g.enterBoss(boss);
  const minor = bossFor(g, { x: 80, deathSound: 3, drop: [{ type: 5 }], onDefeat: () => defeats++ });
  try {
    minor.damage(10, null, g.context);
    assert.equal(outcomes, 0); assert.equal(defeats, 1);
    assert.equal(minor.alive, false); assert.equal(minor.animation.alive, false);
    assert.equal(minor.effects.length, 1); assert.equal(g.items.items.length, 1);
    assert.equal(g.isBossHeld(minor), false);
    assert.equal(g.bossPresentation.deaths.length, 0);
  } finally { f.dispose(); }
});

test('a stage may wait after HP zero and then explicitly choose visible retreat without settling or clearing', () => {
  const events = [];
  let calls = 0, attacks = 0, defeats = 0, sequence;
  const f = fixture({ onBossDefeated: () => calls++, onEvent: (name, data) => events.push({ name, data }) });
  const g = f.game, boss = bossFor(g, { onUpdate: () => attacks++, onDefeat: () => defeats++, drop: [{ type: 5 }] });
  g.beginSpell({ boss, duration: 600 });
  const bullet = g.bullets.emit({ x: 100, y: 100, speed: 0, shotSound: -1 })[0];
  try {
    g.update();
    assert.ok(g.bossPresentation.aura.length > 0);
    boss.damage(70, null, g.context);
    const attacksBefore = attacks;
    for (let frame = 0; frame < 20; frame++) g.update();
    assert.equal(calls, 1); assert.equal(attacks, attacksBefore);
    assert.equal(boss.x, 0); assert.equal(boss.y, 128);
    const source = { type: 'stage-choice' };
    sequence = g.beginBossEscape(boss, { source });
    assert.ok(sequence?.alive);
    assert.equal(g.context.boss, null);
    assert.equal(g.bossPresentation.boss, null);
    assert.equal(g.bossPresentation.aura.length, 0);
    assert.equal(g.bossPresentation.distortion, null);
    assert.equal(boss.alive, true); assert.equal(boss.animation.alive, true);
    for (let frame = 0; frame < 30; frame++) g.update();
    assert.equal(boss.x, -168, 'the source 60-frame easing4 reaches 75% at its midpoint');
    assert.equal(boss.y, -28);
    assert.equal(boss.alive, true);
    assert.equal(events.filter(event => event.name === 'bossescape').length, 0);
    for (let frame = 0; frame < 30; frame++) g.update();
    assert.equal(boss.alive, false); assert.equal(boss.animation.alive, false);
    assert.equal(sequence.alive, false);
    assert.equal(boss.x, -224); assert.equal(boss.y, -80);
    const escaped = events.filter(event => event.name === 'bossescape');
    assert.equal(escaped.length, 1);
    assert.equal(escaped[0].data.enemy, boss); assert.equal(escaped[0].data.source, source);
    assert.equal(escaped[0].data.sequence, sequence);
    assert.equal(g.isBossHeld(boss), false);
    assert.equal(g.spell.active, true);
    assert.ok([1, 2].includes(bullet.state));
    assert.equal(defeats, 0); assert.equal(g.items.items.length, 0);
    assert.equal(g.bossPresentation.deaths.length, 0);
    g.update(); assert.equal(events.filter(event => event.name === 'bossescape').length, 1);
  } finally { f.dispose(); }
});

test('removeBoss cancels a pending escape or explosion without drops, completion events or effects', () => {
  for (const mode of ['escape', 'defeat']) {
    const events = [];
    const f = fixture({ onEvent: name => events.push(name) }), g = f.game;
    const boss = bossFor(g, { drop: [{ type: 5 }] }); g.enterBoss(boss);
    try {
      const sequence = mode === 'escape' ? g.beginBossEscape(boss) : g.beginBossDefeat(boss);
      g.update(); g.removeBoss(boss);
      assert.equal(sequence.alive, false);
      assert.equal(boss.alive, false); assert.equal(boss.animation.alive, false);
      assert.equal(g.context.boss, null); assert.equal(g.isBossHeld(boss), false);
      for (let frame = 0; frame < 65; frame++) g.update();
      assert.equal(events.includes('bossescape'), false);
      assert.equal(events.includes('bossburst'), false);
      assert.equal(g.items.items.length, 0);
      assert.equal(g.bossPresentation.deaths.length, 0);
      assert.equal(g.bossDefeats.length, 0);
    } finally { f.dispose(); }
  }
});

test('scene destruction cancels an in-flight escape without reporting successful retreat', () => {
  const events = [];
  const f = fixture({ onEvent: name => events.push(name) }), g = f.game;
  const boss = bossFor(g); g.enterBoss(boss);
  const sequence = g.beginBossEscape(boss);
  g.update(); f.dispose();
  assert.equal(sequence.alive, false);
  assert.equal(events.includes('bossescape'), false);
  assert.equal(events.includes('bossburst'), false);
  assert.doesNotThrow(() => g.update());
});

test('escape completion can destroy the scene or install the next Boss without clearing the replacement', () => {
  for (const action of ['destroy', 'replace']) {
    let g, nextBoss, completions = 0;
    const f = fixture({ onEvent: (name, data) => {
      if (name !== 'bossescape') return;
      completions++;
      assert.equal(data.enemy.alive, false);
      if (action === 'destroy') g.destroy();
      else { nextBoss = bossFor(g, { x: 50 }); g.enterBoss(nextBoss); }
    } });
    g = f.game;
    const boss = bossFor(g); g.enterBoss(boss);
    try {
      g.beginBossEscape(boss, { duration: 1 });
      assert.doesNotThrow(() => g.update());
      assert.equal(completions, 1);
      if (action === 'destroy') assert.equal(g.destroyed, true);
      else { assert.equal(g.context.boss, nextBoss); assert.equal(nextBoss.alive, true); }
      g.update(); assert.equal(completions, 1);
    } finally { f.dispose(); }
  }
});

test('invalid escape parameters have no effects on Boss identity, flags, projectiles, other enemies or RNG', () => {
  const events = [];
  const f = fixture({ onEvent: name => events.push(name) }), g = f.game;
  const boss = bossFor(g), minor = bossFor(g, { x: 80 });
  g.enterBoss(boss); g.startBossCombat();
  const bullet = g.bullets.emit({ x: 100, y: 100, speed: 0, shotSound: -1 })[0];
  const before = JSON.stringify(g.snapshot()), flags = boss.primaryFlags;
  try {
    for (const options of [{ duration: -1 }, { duration: 1.5 }, { duration: Infinity },
      { target: { x: NaN, y: -80 } }, { target: { x: -224, y: Infinity } }, { easing: 'unknown' }]) {
      assert.throws(() => g.beginBossEscape(boss, options), /Boss escape/i);
      assert.equal(g.context.boss, boss); assert.equal(g.bossPresentation.boss, boss);
      assert.equal(g.isBossHeld(boss), false);
      assert.equal(boss.invulnerable, undefined); assert.equal(boss.primaryFlags, flags);
      assert.equal(boss.alive, true); assert.equal(minor.alive, true);
      assert.ok([1, 2].includes(bullet.state));
      assert.equal(events.length, 0);
      assert.equal(JSON.stringify(g.snapshot()), before);
    }
  } finally { f.dispose(); }
});

test('an HP-zero outcome reached from the Boss update stops its remaining movement in the same frame', () => {
  let outcomes = 0, attacks = 0;
  const f = fixture({ onBossDefeated: () => outcomes++ }), g = f.game;
  const boss = bossFor(g, {
    motion: new TouhouMotion({ position: { x: 0, y: 128 }, speed: 4, angle: 0 }),
    onUpdate: (enemy, context) => { attacks++; enemy.damage(10, null, context); },
  });
  g.enterBoss(boss); g.startBossCombat();
  try {
    g.update();
    assert.equal(outcomes, 1); assert.equal(g.isBossHeld(boss), true);
    assert.equal(boss.x, 0); assert.equal(boss.y, 128);
    assert.equal(boss.motion.position.x, 0, 'the old movement must not run after the outcome callback');
    g.update();
    assert.equal(attacks, 1); assert.equal(boss.x, 0);
    assert.equal(boss.animation.alive, true);
  } finally { f.dispose(); }
});

test('a Boss outcome may destroy the scene from an enemy update without advancing later owners', () => {
  let playerUpdates = 0, laterEnemyUpdates = 0;
  const f = fixture({ onBossDefeated: ({ game }) => game.destroy() }), g = f.game;
  const boss = bossFor(g, { onUpdate: (enemy, context) => enemy.damage(10, null, context) });
  bossFor(g, { x: 80, onUpdate: () => laterEnemyUpdates++ });
  g.enterBoss(boss); g.startBossCombat();
  const updatePlayer = g.player.update.bind(g.player);
  g.player.update = (...args) => { playerUpdates++; return updatePlayer(...args); };
  try {
    assert.doesNotThrow(() => g.update());
    assert.equal(g.destroyed, true);
    assert.equal(playerUpdates, 0);
    assert.equal(laterEnemyUpdates, 0);
    assert.equal(boss.age, 0, 'disposal ends the current actor update too');
  } finally { f.dispose(); }
});

test('an active escape has one owner and cannot be resumed or concurrently replaced by an explosion', () => {
  const f = fixture(), g = f.game;
  const boss = bossFor(g); g.enterBoss(boss);
  try {
    const sequence = g.beginBossEscape(boss);
    assert.equal(g.beginBossEscape(boss, { target: { x: 224, y: -80 } }), sequence);
    assert.equal(g.resumeBoss(boss), false);
    assert.equal(g.beginBossDefeat(boss), null);
    assert.equal(g.bossDefeats.length, 0);
    g.update();
    assert.equal(sequence.age, 1);
    assert.equal(g.isBossHeld(boss), true);
  } finally { f.dispose(); }
});

test('cancelling a public exit owner leaves a held body that can resume or choose another sequence', () => {
  const f=fixture(),g=f.game;
  const boss=bossFor(g);g.enterBoss(boss);
  try {
    const escape=g.beginBossEscape(boss,{target:{x:-100,y:32,z:4}});
    g.update();assert.equal(boss.animation.z,boss.z);
    escape.destroy();assert.equal(g.isBossHeld(boss),true);
    assert.equal(g.resumeBoss(boss),true);assert.equal(g.bossEscapes.length,0);
    g.enterBoss(boss);
    const defeat=g.beginBossDefeat(boss);defeat.destroy();
    const replacement=g.beginBossEscape(boss);
    assert.notEqual(replacement,escape);assert.equal(replacement.alive,true);
    assert.equal(g.bossDefeats.length,0);
    g.destroy();assert.equal(g.removeBoss(boss),false);
  } finally {f.dispose();}
});
