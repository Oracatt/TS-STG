import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, Stage, Enemy, Boss, Bullet, Laser, PlayerShot, Item, Keys, ReplayPlayer,
  ReplayRecorder, SaveStore, stateHash, wait, Menu, Input } from '../packages/thlib/src/index.js';

const game = (options = {}) => new Game({ seed: 444, stageFactory: () => new Stage({ autoFinish: false }),
  player: { invulnerableFrames: 0 }, ...options }).start();
const frames = (g, count, mask = 0) => { for (let i = 0; i < count; i++) g.update(mask); };

test('focused and diagonal movement preserve configured speed and playfield bounds', () => {
  const g = game(), p = g.player, { x, y } = p;
  g.update(Keys.RIGHT | Keys.UP);
  assert.ok(Math.abs(Math.hypot(p.x - x, p.y - y) - p.speed) < 1e-8);
  const focusedStart = p.x;
  g.update(Keys.RIGHT | Keys.FOCUS);
  assert.equal(p.focused, true); assert.ok(Math.abs(p.x - focusedStart - p.focusSpeed) < 1e-8);
  frames(g, 200, Keys.RIGHT); assert.equal(p.x, g.bounds.x + g.bounds.width - 10);
});

test('ordinary bullets graze once while delayed bullets cannot hit or graze', () => {
  const g = game(), p = g.player;
  const bullet = g.world.spawn(new Bullet({ x: p.x + 18, y: p.y, speed: 0, radius: 3 }));
  g.world.spawn(new Bullet({ x: p.x, y: p.y, speed: 0, delay: 100 }));
  frames(g, 5);
  assert.equal(p.state, 'normal'); assert.equal(p.graze, 1); assert.equal(bullet.grazed.size, 1);
});

test('deathbomb saves the player only within the configured input window', () => {
  const g = game(), p = g.player;
  g.world.spawn(new Bullet({ x: p.x, y: p.y, speed: 0 }));
  g.update(0); assert.equal(p.state, 'dying');
  frames(g, p.deathbombFrames - 1);
  g.update(Keys.BOMB);
  assert.equal(p.state, 'normal'); assert.equal(p.lives, 2); assert.equal(p.bombs, 2);
  assert.equal(g.stats.bombsUsed, 1); assert.ok(p.activeBomb.alive);
});

test('miss consumes a life, restores bombs, drops power and respawns with invulnerability', () => {
  const g = game(), p = g.player;
  p.bombs = 1; p.power = 3;
  p.receiveHit(g); frames(g, p.deathbombFrames);
  assert.equal(p.lives, 1); assert.equal(p.bombs, 3); assert.equal(p.power, 2);
  assert.equal(p.state, 'respawning'); assert.equal(g.stats.misses, 1);
  frames(g, p.respawnDuration);
  assert.equal(p.state, 'normal'); assert.equal(p.invulnerableFrames, p.respawnInvulnerability);
  assert.equal(p.receiveHit(g), false);
});

test('bomb cancels active and pending bullets and stops laser damage', () => {
  const g = game(), p = g.player;
  const bullet = g.world.spawn(new Bullet({ x: p.x, y: p.y - 12, speed: 0 }));
  const laser = g.world.spawn(new Laser({ x: p.x - 10, y: p.y, angle: 0, length: 50, warningFrames: 0, growFrames: 0 }));
  p.useBomb(g); g.update(0);
  assert.equal(bullet.alive, false); assert.equal(laser.isActive, false);
  assert.equal(p.state, 'normal'); assert.ok(g.score >= 100 || g.world.query('item').length >= 1);
});

test('piercing projectiles hit several targets once each and defeated enemies drop items', () => {
  const g = game();
  const a = g.world.spawn(new Enemy({ x: 200, y: 250, hp: 3, drops: { power: 2 } }));
  const b = g.world.spawn(new Enemy({ x: 200, y: 200, hp: 20, drops: {} }));
  g.world.spawn(new PlayerShot({ x: 200, y: 300, speed: 0, length: 150, damage: 5, piercing: true }));
  frames(g, 2);
  assert.equal(a.alive, false); assert.equal(b.hp, 15); assert.equal(g.stats.enemiesDefeated, 1);
  assert.equal(g.world.query('item').filter(item => item.type === 'power').length, 2);
});

test('homing weapon shots steer toward the nearest target', () => {
  const g = game();
  g.world.spawn(new Enemy({ x: 350, y: 350, hp: 100 }));
  const shot = g.world.spawn(new PlayerShot({ x: 200, y: 500, angle: -Math.PI / 2, homing: true, speed: 2 }));
  frames(g, 10);
  assert.ok(shot.angle > -Math.PI / 2); assert.ok(shot.x > 200);
});

test('power clamps, fragments award multiple extends, score thresholds award only once', () => {
  const g = game(), p = g.player;
  p.power = 3.95;
  for (const options of [{ type: 'power', value: 1 }, { type: 'lifePiece', value: 12 }, { type: 'bombPiece', value: 7 }]) {
    const item = g.world.spawn(new Item(options)); item.collect(g);
  }
  assert.equal(p.power, 4); assert.equal(p.lives, 4); assert.equal(p.lifePieces, 2);
  assert.equal(p.bombs, 4); assert.equal(p.bombPieces, 2);
  g.addScore(350000); assert.equal(p.lives, 6); assert.equal(g.extendIndex, 2);
  g.addScore(1); assert.equal(p.lives, 6);
});

test('crossing point-of-collection line attracts all items at full value', () => {
  const g = game(), p = g.player;
  p.y = g.bounds.y + 50;
  const item = g.world.spawn(new Item({ x: 500, y: 400, type: 'point' }));
  frames(g, 60);
  assert.equal(item.alive, false); assert.equal(g.score, g.rules.pointValue);
});

test('spell capture awards bonus, timeout fails normal spell and survival timeout succeeds', () => {
  const g = game();
  const boss = g.world.spawn(new Boss({ x: 320, y: 100, introFrames: 0, transitionFrames: 1, phases: [
    { name: 'Capture', hp: 10, timeLimit: 60, spell: true, bonus: 10000, drops: {} },
    { name: 'Timeout', hp: 10, timeLimit: 2, spell: true, drops: {} },
    { name: 'Survival', hp: 10, timeLimit: 2, spell: true, survival: true, bonus: 20000, drops: {} },
  ] }));
  g.stage.boss = boss;
  g.update(0); boss.damage(10); assert.equal(boss.results[0].captured, true);
  g.update(0); frames(g, 2); assert.equal(boss.results[1].captured, false);
  g.update(0); frames(g, 2); assert.equal(boss.results[2].captured, true);
  assert.equal(g.stats.spellsCaptured, 2); assert.equal(boss.alive, false);
});

test('phase completion cancels previous phase generators and pending projectiles', () => {
  const g = game(); let shots = 0;
  const boss = g.world.spawn(new Boss({ x: 300, y: 100, introFrames: 0, transitionFrames: 1, phases: [
    { hp: 1, script: function* (self, world) { while (self.alive) {
      world.spawn(new Bullet({ x: self.x, y: self.y, speed: 0 })); shots++; yield* wait(1);
    } } }, { hp: 100, timeLimit: 300 },
  ] })); g.stage.boss = boss;
  frames(g, 2); assert.equal(shots, 1);
  boss.damage(1); frames(g, 5);
  assert.equal(shots, 1); assert.equal(g.world.query('enemyBullet').length, 0);
});

test('pause freezes world, stage, timers and input-controlled movement', () => {
  const g = game(); frames(g, 10, Keys.RIGHT);
  g.update(Keys.PAUSE); const before = g.snapshot();
  frames(g, 50, Keys.RIGHT);
  assert.equal(g.world.frame, before.frame); assert.equal(g.stage.frame, before.stage.frame);
  assert.equal(g.player.x, before.player.x);
  g.update(Keys.PAUSE); assert.equal(g.state, 'playing');
  g.update(Keys.RIGHT); assert.equal(g.world.frame, before.frame + 1);
});

test('dialogue pauses simulation and resumes its stage generator', () => {
  let resumed = false;
  const g = game({ stageFactory: () => new Stage({ autoFinish: false, script: function* (stage) {
    yield* stage.talk([{ speaker: 'Guide', text: 'Hello' }], { minimumFrames: 1 }); resumed = true;
  } }) });
  g.update(0); const frame = g.world.frame;
  frames(g, 3); assert.equal(g.world.frame, frame); assert.equal(resumed, false);
  g.update(Keys.CONFIRM); g.update(0);
  assert.equal(resumed, true); assert.ok(g.world.frame > frame);
});

test('practice isolates the selected phase and disables continue', () => {
  const create = () => new Stage({ bossFactory: () => new Boss({ phases: [{ name: 'A' }, { name: 'B' }] }) });
  const g = new Game({ stageFactory: create }); g.startPractice(1);
  assert.equal(g.boss.phases.length, 1); assert.equal(g.boss.phases[0].name, 'B');
  g.gameOver(); assert.equal(g.continueGame(), false);
});

test('same seed and input replay reproduce every state checkpoint including pause', () => {
  const options = { stageFactory: () => new Stage({ autoFinish: false, script: function* (stage, g) {
    while (true) {
      stage.spawn(new Enemy({ x: g.world.rng.float(50, 550), y: 60, vy: 1, hp: 8 }));
      yield* wait(45);
    }
  } }) };
  const original = game(options);
  for (let frame = 0; frame < 900; frame++) {
    const mask = frame === 200 || frame === 240 ? Keys.PAUSE :
      Keys.SHOOT | (frame % 120 < 60 ? Keys.LEFT : Keys.RIGHT);
    original.update(mask);
  }
  const tape = original.exportReplay();
  assert.equal(tape.frames, 900); assert.equal(tape.checkpoints.length, 3);
  const replay = new Game({ seed: 444, player: { invulnerableFrames: 0 }, ...options });
  replay.playReplay(tape); frames(replay, tape.frames);
  assert.deepEqual(replay.snapshot(), original.snapshot());
  assert.equal(replay.playback.desync, null);
});

test('malformed replays are rejected and changed checkpoints detect desynchronization', () => {
  const recorder = new ReplayRecorder({ seed: 1 }); recorder.record(0); recorder.checkpoint({ score: 1 });
  const data = recorder.toJSON();
  assert.throws(() => new ReplayPlayer({ ...data, frames: 2 }), /frame count/);
  assert.throws(() => new ReplayPlayer({ ...data, runs: [[0, -1]] }), /input run/);
  const playback = new ReplayPlayer(data); playback.next();
  assert.throws(() => playback.verify({ score: 2 }), /desync/);
  assert.equal(stateHash({ b: 2, a: 1 }), stateHash({ a: 1, b: 2 }));
});

test('storage adapters round-trip settings and menu actions are customizable', () => {
  const data = new Map();
  const store = new SaveStore({ readText: name => data.get(name), writeText: (name, value) => data.set(name, value) });
  store.set('settings', { difficulty: 'hard', volume: 0.2 });
  assert.equal(new Game({ store }).settings.difficulty, 'hard');
  let selected = '';
  const menu = new Menu({ entries: [{ label: 'Disabled', enabled: false }, { label: 'Custom', action: () => { selected = 'yes'; } }] });
  const input = new Input(); input.update(Keys.DOWN); menu.update(input);
  input.update(Keys.CONFIRM); menu.update(input); assert.equal(selected, 'yes');
});

test('render output is valid across title, gameplay, pause and results', () => {
  const g = new Game();
  for (const action of [() => {}, () => g.start(), () => g.pause(), () => { g.resume(); g.completeStage(); }]) {
    action(); const commands = g.render();
    assert.equal(commands[0][0], 'clear'); assert.ok(commands.length > 20);
    assert.ok(commands.every(command => Array.isArray(command) && typeof command[0] === 'string'));
    assert.ok(commands.flat().every(value => typeof value !== 'number' || Number.isFinite(value)));
  }
});

test('campaign carries score, player resources and RNG into the next stage and replays identically', () => {
  const makeStages = () => [
    () => new Stage({ id: 'one', finishDelay: 1, script: function* (stage, g) {
      g.player.power = 3; g.player.bombs = 1;
      g.addScore(1234); g.world.rng.next();
      yield* wait(3);
    } }),
    () => new Stage({ id: 'two', finishDelay: 1, script: function* (stage, g) {
      assert.equal(g.player.power, 3); assert.equal(g.player.bombs, 1);
      assert.ok(g.score >= 1234);
      stage.spawn(new Bullet({ x: 200, y: 100, speed: g.world.rng.float(1, 2) }));
      yield* wait(10);
    } }),
  ];
  const original = new Game({ seed: 99, stages: makeStages() });
  const starts = [], clears = [];
  original.on('stageStart', event => starts.push(event.stageIndex));
  original.on('stageClear', event => clears.push(event.final)); original.start();
  while (original.state === 'playing') original.update(0);
  assert.equal(original.state, 'results'); assert.equal(original.stageIndex, 1);
  assert.deepEqual(starts, [0, 1]); assert.deepEqual(clears, [false, true]);
  assert.equal(original.player.power, 3); assert.equal(original.player.bombs, 1);
  const tape = original.exportReplay();
  const replay = new Game({ stages: makeStages() }); replay.playReplay(tape); frames(replay, tape.frames);
  assert.deepEqual(replay.snapshot(), original.snapshot());
});

test('replay restores effective player rules and rejects incompatible game revisions', () => {
  const original = game({ replayVersion: 'test-v2', rules: { grazeScore: 37 }, player: { speed: 7, lives: 5, invulnerableFrames: 0 } });
  frames(original, 40, Keys.RIGHT);
  const tape = original.exportReplay();
  const replay = new Game({ replayVersion: 'test-v2', stageFactory: () => new Stage({ autoFinish: false }) });
  replay.playReplay(tape); frames(replay, 40);
  assert.deepEqual(replay.snapshot(), original.snapshot());
  assert.equal(replay.rules.grazeScore, 37);
  assert.throws(() => new Game({ replayVersion: 'test-v3' }).playReplay(tape), /game version/);
});

test('phase clear removes bomb-resistant bullets and lasers without duplicate cancel rewards', () => {
  const g = game();
  const boss = g.world.spawn(new Boss({ x: 320, y: 100, introFrames: 0, phases: [{ hp: 10, spell: true }] }));
  g.stage.boss = boss; g.update(0);
  const bullet = g.world.spawn(new Bullet({ x: 200, y: 100, cancelable: false }));
  const laser = g.world.spawn(new Laser({ x: 100, y: 100, cancelable: false }));
  assert.equal(g.cancelBullets(200, 100, Infinity), 0);
  boss.damage(10);
  assert.equal(bullet.alive, false); assert.equal(laser.alive, false);
  const cancelItems = g.world.pending.filter(item => item.group === 'item' && item.type === 'cancel');
  assert.equal(cancelItems.length, 2);
});

test('campaign practice menu includes later stages and retry preserves that selection', () => {
  const stages = ['First', 'Second'].map(name => () => new Stage({ bossFactory: () => new Boss({ phases: [{ name }] }) }));
  const g = new Game({ stages }); g.showPractice();
  assert.equal(g.menu.entries.length, 3); g.menu.entries[1].action();
  assert.equal(g.stageIndex, 1); assert.equal(g.boss.phases[0].name, 'Second');
  g.pause(); g.menu.entries[1].action();
  assert.equal(g.stageIndex, 1); assert.equal(g.boss.phases[0].name, 'Second');
});
