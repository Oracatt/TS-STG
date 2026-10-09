import test from 'node:test';
import assert from 'node:assert/strict';
import { clearTouhouBossPhase } from '@ts-stg/thlib/touhou';
import { TouhouBulletField } from '../packages/thlib/dist/touhou/bullets.js';
import { TouhouLaserField } from '../packages/thlib/dist/touhou/lasers.js';
import { bulletTestBank, bulletTestStyles } from './fixtures/th20-bullet-bank.js';

test('ordinary Boss handoff stops old tasks before the two source-radius cancellation passes', () => {
  const calls = [], options = [];
  const boss = { x: 0.1, y: 112.2 };
  clearTouhouBossPhase({ ...boss,
    stopAttack() { calls.push('stop'); boss.x = 50; },
    cancelCircle(x, y, radius, policy) {
      calls.push(['cancel', x, y, radius]); options.push(policy);
    },
    clearEnemies() { calls.push('children'); },
  });
  const circle = ['cancel', Math.fround(0.1), Math.fround(112.2), 640];
  assert.deepEqual(calls, ['stop', circle, 'children', circle]);
  assert.ok(options.every(Object.isFrozen));
  assert.deepEqual(options[0], { bullets: true, lasers: true, nearby: true, dropMode: 0, check: true, reason: 'bonus' });
});

test('second phase pass catches child-death births while shared owners preserve distinct bullet and laser protection', () => {
  const field = new TouhouBulletField({ bank: bulletTestBank(), styles: bulletTestStyles() });
  const lasers = new TouhouLaserField({ bank: bulletTestBank(), styles: bulletTestStyles() });
  const [protectedBullet] = field.emit({ x: 20, y: 128, speed: 0 });
  const [offscreen] = field.emit({ x: 300, y: 128, speed: 0 });
  const [distant] = field.emit({ x: 900, y: 128, speed: 0 });
  protectedBullet.protectedFrames = 120; protectedBullet.cancelKind = 1;
  const protectedLaser = lasers.spawnStraight({ x: 0, y: 128, length: 96, initialLength: 96, speed: 0, width: 16 });
  protectedLaser.protectedFrames = 120;
  const ordinaryLaser = lasers.spawnStraight({ x: 0, y: 128, length: 96, initialLength: 96, speed: 0, width: 16 });
  let childBirth;
  const passCounts = [];
  clearTouhouBossPhase({
    cancelCircle(x, y, radius, options) {
      assert.equal(options.nearby, true);
      passCounts.push(field.cancelNearbyCircle(x, y, radius, options));
      lasers.cancelCircle(x, y, radius, options);
    },
    clearEnemies() {
      assert.equal(protectedBullet.state, 4);
      [childBirth] = field.emit({ x: -50, y: 128, speed: 0, commands: [{ type: 1, ints: [1] }] });
      assert.equal(childBirth.state, 2, 'birth fog exists before the second clear');
      childBirth.protectedFrames = 60;
    },
  });
  assert.deepEqual(passCounts, [2, 1]);
  assert.equal(protectedBullet.state, 4); assert.equal(protectedBullet.cancelKind, 1);
  assert.equal(offscreen.state, 4, 'nearby clear has no viewport restriction');
  assert.equal(distant.state, 1, 'ordinary phase clear is a 640-radius policy, not global erase');
  assert.equal(childBirth.state, 4, 'death-script birth does not survive phase handoff');
  assert.equal(protectedLaser.state, 2); assert.equal(protectedLaser.killPending, false);
  assert.equal(protectedLaser.length, 96); assert.equal(ordinaryLaser.killPending, true);
});

test('phase clear validates every input before stopping tasks or mutating the projectile field', () => {
  let calls = 0;
  const valid = { stopAttack() { calls++; }, clearEnemies() { calls++; }, cancelCircle() { calls++; } };
  for (const invalid of [{ x: NaN }, { y: Infinity }, { x: 1e100 }, { x: '1' },
    { cancelCircle: null }, { clearEnemies: undefined }, { stopAttack: false }]) {
    assert.throws(() => clearTouhouBossPhase({ ...valid, ...invalid }), TypeError);
    assert.equal(calls, 0);
  }
  assert.throws(() => clearTouhouBossPhase(), /cancelCircle/);
  const order = [];
  clearTouhouBossPhase({ cancelCircle() { order.push('cancel'); }, clearEnemies() { order.push('children'); } });
  assert.deepEqual(order, ['cancel', 'children', 'cancel']);
});
