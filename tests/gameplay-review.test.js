import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../packages/thlib/dist/game.js';
import { Stage } from '../packages/thlib/dist/stage.js';
import { Enemy } from '../packages/thlib/dist/enemy.js';
import { Boss } from '../packages/thlib/dist/boss.js';
import { Bullet } from '../packages/thlib/dist/bullets.js';
import { Laser } from '../packages/thlib/dist/lasers.js';
import { Keys } from '../packages/thlib/dist/input.js';

const makeGame = (options = {}) => new Game({ seed: 42, stageFactory: () => new Stage({ autoFinish: false }), ...options }).start();

test('stage cannot finish while its last script tick has just queued an enemy', () => {
  const game = makeGame({ stageFactory: () => new Stage({ finishDelay: 1,
    *script(stage) { stage.spawn(new Enemy({ x: 100, y: 100, hp: 100 })); },
  }) });
  game.update(0);
  assert.equal(game.state, 'playing');
  assert.equal(game.world.query('enemy').length, 1);
});

test('a bomb from the boss introduction invalidates the phase it subsequently damages', () => {
  const game = makeGame({
    player: { bomb: { damage: 5, duration: 30, maxRadius: 1000, expansion: 1000 } },
    stageFactory: () => new Stage({ autoFinish: false, bossFactory: () => new Boss({ x: 300, y: 100, introFrames: 4,
      phases: [{ name: 'Lingering bomb regression', spell: true, hp: 1, timeLimit: 300 }] }) }),
  });
  const boss = game.stage.boss;
  game.update(Keys.BOMB);
  for (let i = 0; i < 5; i++) game.update(0);
  assert.equal(boss.alive, false);
  assert.equal(boss.results.length, 1);
  assert.equal(boss.results[0].captured, false);
  assert.equal(game.stats.spellsCaptured, 0);
});

test('full replay including pause/resume matches exact final state and remains escapable', () => {
  const original = makeGame();
  const masks = [Keys.RIGHT | Keys.SHOOT, Keys.RIGHT, Keys.PAUSE, 0, Keys.PAUSE, 0, Keys.LEFT, Keys.LEFT, 0, Keys.BOMB, 0, 0];
  for (const mask of masks) original.update(mask);
  const recording = original.exportReplay(), expected = original.snapshot();
  const replay = makeGame(); replay.playReplay(recording);
  for (let i = 0; i < masks.length; i++) replay.update(0);
  assert.deepEqual(replay.snapshot(), expected);
  replay.update(0);
  assert.ok(replay.menu, 'Replay must expose an exit after consuming its recorded inputs');
  replay.menu.index = replay.menu.entries.findIndex(entry => entry.label === 'Return to Title');
  assert.ok(replay.menu.index >= 0);
  replay.update(Keys.CONFIRM);
  assert.equal(replay.state, 'title');
});

test('delayed long bullets use their oriented hitboxes and graze only once through Game', () => {
  const game = makeGame({ player: { invulnerableFrames: 0 } });
  const player = game.player;
  const nearBullet = game.world.spawn(new Bullet({ x: player.x + 18, y: player.y, radius: 2, speed: 0, delay: 2 }));
  game.update(0); game.update(0);
  assert.equal(game.stats.grazes, 0); assert.equal(player.state, 'normal');
  game.update(0); assert.equal(game.stats.grazes, 1); game.update(0); assert.equal(game.stats.grazes, 1);
  nearBullet.destroy();
  game.world.spawn(new Bullet({ x: player.x, y: player.y - 10, radius: 2, halfLength: 10, shape: 'rice', angle: Math.PI / 2, speed: 0 }));
  game.update(0); assert.equal(player.state, 'dying');
});

test('warning beams never hit and the first active curved beam tick can hit in Game', () => {
  const game = makeGame({ player: { invulnerableFrames: 0 } });
  const p = game.player;
  game.world.spawn(new Laser({ kind: 'curved', x: p.x + 20, y: p.y,
    points: [{ x: p.x - 20, y: p.y }, { x: p.x + 20, y: p.y }], warning: 2, grow: 0, duration: 1, fade: 3 }));
  game.update(0); game.update(0); assert.equal(p.state, 'normal');
  game.update(0); assert.equal(p.state, 'dying');
});
