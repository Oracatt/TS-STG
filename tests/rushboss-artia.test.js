import test from 'node:test';
import assert from 'node:assert/strict';
import { artiaPhases } from '../games/rushboss/src/artia.js';
import { RushBattle } from '../games/rushboss/src/runtime.js';

const advance = (battle, frames) => { for (let i = 0; i < frames; i++) battle.update(0); };
const battleFor = (number, difficulty = 0) => new RushBattle(artiaPhases, {
  boss: 'artia', difficulty, spellIndex: number - 1, practice: true, invincible: true,
});
const near = (actual, expected, tolerance = 0.0001) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} should equal ${expected} within ${tolerance}`);

// Attack timing/rewards/card IDs retain Rush constructors; HP references the
// TH20 ordinary stage-six ECL route documented in rushboss-source-health.md.
test('Artia phase metadata uses original-game HP and retains Rush timing and card sequence', () => {
  const constructors = [
    [18000,40,0,-1], [3900,48,4000000,10], [18000,40,0,-1], [3900,36,3400000,11],
    [16000,45,0,-1], [4000,39,4300000,12], [16000,53,0,-1], [4000,44,4500000,13],
    [13000,48,0,-1], [4000,46,4800000,14], [13000,39,0,-1], [4500,40,5200000,15],
    [12000,60,5000000,16],
  ];
  assert.equal(artiaPhases.length, 13);
  assert.deepEqual(artiaPhases.map(p => [p.hp,p.time,p.bonus,p.cardId]), constructors);
  assert.deepEqual(artiaPhases.filter(p => p.spell).map(p => p.name), [
    '冰符「冰魔法封印」','冻符「冰土下的千年枯骨」','流光「流影寒星」',
    '异光「异世界棱镜」','刺骨「舞动的冰锥」','极寒「亘古寒霜」','必杀「阿媂娅之怒」',
  ]);
  assert.equal(artiaPhases[12].survival, true);
});

test('SC1 completes 8 three-shooter bursts without restarting actors on frame reset', () => {
  for (const difficulty of [0,3]) {
    const battle = battleFor(1, difficulty);
    advance(battle, 850);
    // Source: f=100/180 in each of four 200-frame blocks; three emitters;
    // shooter frames 3..48 by 3 => 16 rings of (3+difficulty) talismans.
    assert.equal(battle.statistics.spawned, 8 * 3 * 16 * (3 + difficulty));
    assert.equal(battle.state.clock, 50);
    assert.equal(battle.world.entities.filter(e => e.kind === 'actor').length, 0);
  }
});

test('SC2 ice sealing needles stop before age 90 and then accelerate outward', () => {
  const battle = battleFor(2, 0);
  advance(battle, 100);
  const needle = battle.world.pending.find(e => e.kind === 'ZhenDan');
  assert.ok(needle);
  near(needle.vx, Math.sqrt(4000));
  near(needle.vy, 0);
  near(needle.fx, -150);
  assert.equal(needle.autoRotateMode, 0);
  advance(battle, 104);
  assert.equal(needle.frame, 89);
  assert.equal(needle.vx, 0);
  assert.equal(needle.fx, 0);
  advance(battle, 1);
  assert.equal(needle.frame, 90);
  near(needle.fx, 75);
  near(needle.fy, 0);
  advance(battle, 1);
  assert.ok(needle.vx > 0);
});

test('SC8 grows all three prisms to equilateral 60-radius triangles and 20-width beams', () => {
  const battle = battleFor(8);
  advance(battle, 135);
  const mirrors = battle.world.pending.filter(e => e.kind === 'actor');
  const beams = battle.world.pending.filter(e => e.kind === 'laser');
  assert.equal(mirrors.length, 3);
  assert.equal(beams.length, 18);
  advance(battle, 120);
  for (const beam of beams) {
    assert.ok(beam.alive);
    near(beam.length, 60 * Math.sqrt(3), 0.0001);
    near(beam.width, 20);
  }
  for (const mirror of mirrors) near(Math.hypot(mirror.x-battle.boss.x, mirror.y-battle.boss.y), 120, 0.0001);
  assert.ok(battle.world.entities.some(e => e.kind === 'XingDanS'), 'moving prism vertices emit source star trails');
});

test('SC12 overlapping freeze fields apply and restore both movement speeds', () => {
  const battle = battleFor(12);
  advance(battle, 80);
  const fogs = battle.world.pending.filter(e => e.visualKind === 'freezingFog');
  assert.equal(fogs.length, 12);
  const fog = fogs[0];
  battle.player.x = fog.x; battle.player.y = fog.y;
  // Directly run one source effect callback to isolate this field from the
  // overlapping eleven fields; this checks entry, exit and destruction hooks.
  fog.frame = 1;
  fog.onUpdate(battle, fog);
  near(battle.player.moveSpeed, 150);
  near(battle.player.slowMoveSpeed, 120 / 1.8);
  battle.player.x = 10000;
  fog.onUpdate(battle, fog);
  near(battle.player.moveSpeed, 270);
  battle.player.x = fog.x;
  fog.onUpdate(battle, fog);
  fog.kill();
  near(battle.player.moveSpeed, 270);
  near(battle.player.slowMoveSpeed, 120);
  battle.player.moveSpeed = 1; battle.player.slowMoveSpeed = 2;
  artiaPhases[11].end(battle);
  near(battle.player.moveSpeed, 270);
  near(battle.player.slowMoveSpeed, 120);
});

test('SC13 survival retains curve/laser counts and source warning-width timeline', () => {
  const battle = battleFor(13, 3);
  assert.equal(battle.boss.invulnerable, true);
  advance(battle, 75);
  assert.equal(battle.statistics.lasers, 36);
  advance(battle, 75);
  assert.equal(battle.statistics.lasers, 36 + 36 + 24);
  const beam = battle.world.pending.find(e => e.kind === 'laser' && !e.curve);
  assert.ok(beam);
  advance(battle, 60);
  near(beam.width, 2);
  assert.equal(beam.checking, false);
  advance(battle, 10);
  near(beam.width, 14, 0.001);
  assert.equal(beam.checking, true);
  advance(battle, 10);
  near(beam.width, 26, 0.001);
  advance(battle, 40);
  assert.equal(beam.checking, false);
  advance(battle, 20);
  assert.equal(beam.alive, false);
});
