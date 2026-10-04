import test from 'node:test';
import assert from 'node:assert/strict';
import { TouhouBulletClearWave, TOUHOU_BULLET_CLEAR_WAVE_PRESET } from '../packages/thlib/src/touhou/bullet-clear-wave.js';
import { TouhouBulletField } from '../packages/thlib/src/touhou/bullets.js';
import { TouhouLaserField } from '../packages/thlib/src/touhou/lasers.js';
import { bulletTestBank, bulletTestStyles } from './fixtures/th20-bullet-bank.js';

const bullets = () => new TouhouBulletField({ bank: bulletTestBank(), styles: bulletTestStyles() });
const lasers = () => new TouhouLaserField({ bank: bulletTestBank(), styles: bulletTestStyles() });

test('source clear helper runs at birth and applies radii 16..634 at its fixed origin', () => {
  const calls = [], position = { x: 32, y: 112 };
  const wave = new TouhouBulletClearWave({ ...position, cancelCircle: (...args) => { calls.push(args); return 2; } });
  assert.equal(wave.frame, 0); assert.deepEqual(calls.map(call => call.slice(0, 3)), [[32, 112, 16]]);
  position.x = 80; position.y = 140;
  for (let frame = 1; frame <= 104; frame++) wave.update();
  assert.deepEqual(calls.map(call => call[2]), Array.from({ length: 104 }, (_, index) => 16 + index * 6));
  assert.ok(calls.every(([x, y]) => x === 32 && y === 112));
  assert.ok(calls.every(call => Object.isFrozen(call[3])));
  assert.deepEqual(calls[0][3], { bullets: true, lasers: true, nearby: true, dropMode: 0, check: true, reason: 'bonus' });
  assert.equal(wave.alive, false); assert.equal(wave.radius, 640); assert.equal(wave.cancelled, 208);
  const last = wave.snapshot(); wave.update(); assert.deepEqual(wave.snapshot(), last);
  assert.deepEqual(TOUHOU_BULLET_CLEAR_WAVE_PRESET, { initialRadius: 16, radiusStep: 6, maxRadius: 640 });
});

test('ECL616 cancels protected bullets with their prior kind and source animations, without rewards', () => {
  const field = bullets(), sounds = [], drops = [];
  field.context = { sound: (...args) => sounds.push(args), spawnCancelItem: (...args) => drops.push(args) };
  const [protectedBullet] = field.emit({ x: 10, y: 100, speed: 0 });
  const [tangent] = field.emit({ x: 17, y: 100, speed: 0 });
  const [outside] = field.emit({ x: 17.01, y: 100, speed: 0 });
  const [alreadyHit] = field.emit({ x: 0, y: 100, speed: 0 });
  sounds.length = 0;
  protectedBullet.protectedFrames = 120; protectedBullet.cancelKind = 1; alreadyHit.state = 3;
  assert.equal(field.cancelCircle(0, 100, 1), 0);
  const count = field.cancelNearbyCircle(0, 100, 16);
  assert.equal(count, 2); assert.equal(field.cancelCounter, 2);
  assert.equal(protectedBullet.state, 4); assert.equal(protectedBullet.cancelKind, 1);
  assert.equal(protectedBullet.protectedFrames, 120);
  assert.equal(tangent.state, 4); assert.equal(outside.state, 1); assert.equal(alreadyHit.state, 3);
  assert.equal(field.effects.length, 2); assert.deepEqual(field.effects.find(effect => effect.x === 10).interrupts, [3]);
  assert.deepEqual(sounds.map(sound => sound[0]), [71, 71]); assert.deepEqual(drops, []);
  assert.equal(field.cancelNearbyCircle(0, 100, 16), 0, 'cancelled tails are not cancelled again');
});

test('the wave cancels only reached bullets while untouched bullets keep advancing', () => {
  const field = bullets();
  const [near] = field.emit({ x: 10, y: 100, speed: 0 });
  const [far] = field.emit({ x: 100, y: 100, speed: 1, angle: 0 });
  near.state = far.state = 1;
  const wave = new TouhouBulletClearWave({ x: 0, y: 100,
    cancelCircle: (x, y, radius, options) => field.cancelNearbyCircle(x, y, radius, options) });
  assert.equal(near.state, 4); assert.equal(far.state, 1);
  for (let frame = 1; frame <= 16; frame++) { field.update(); wave.update(); }
  assert.equal(far.x, 116); assert.equal(far.state, 1);
  field.update(); wave.update(); assert.equal(far.state, 4);
  assert.equal(wave.frame, 17); assert.equal(wave.cancelled, 2);
});

test('the same wave delegates laser splitting and retains original laser protection checks', () => {
  const field = lasers();
  const open = field.spawnStraight({ x: 0, y: 100, length: 96, initialLength: 96, speed: 0, width: 16 });
  const protectedLaser = field.spawnStraight({ x: 0, y: 100, length: 96, initialLength: 96, speed: 0, width: 16 });
  protectedLaser.protectedFrames = 30;
  const wave = new TouhouBulletClearWave({ x: 0, y: 100,
    cancelCircle: (x, y, radius, options) => field.cancelCircle(x, y, radius, options) });
  assert.ok(wave.cancelled > 0); assert.ok(open.state === 1 || open.killPending || open.position.x > 0 || open.length < 96);
  assert.equal(protectedLaser.state, 2); assert.equal(protectedLaser.position.x, 0); assert.equal(protectedLaser.length, 96);
  protectedLaser.protectedFrames = 0; wave.update();
  assert.ok(protectedLaser.state === 1 || protectedLaser.killPending || protectedLaser.position.x > 0 || protectedLaser.length < 96);
});

test('a terminal encounter clear can stop the wave independently of visual death tails', () => {
  const radii = [], wave = new TouhouBulletClearWave({ cancelCircle: (_x, _y, radius) => { radii.push(radius); } });
  for (let frame = 1; frame <= 59; frame++) wave.update();
  assert.equal(wave.radius, 370); assert.equal(radii.length, 60);
  wave.destroy(); wave.update(); assert.equal(radii.length, 60); assert.equal(wave.alive, false);
});

test('clear wave rejects missing cancellation owners and non-progressing radius configurations', () => {
  const cancelCircle = () => 0;
  assert.throws(() => new TouhouBulletClearWave(), /cancelCircle/);
  assert.throws(() => new TouhouBulletClearWave({ cancelCircle, x: Infinity }), /finite/);
  for (const options of [{ radiusStep: 0 }, { radiusStep: -1 }, { initialRadius: -1 },
    { initialRadius: 640 }, { maxRadius: 16 }, { radiusStep: Number.MIN_VALUE }])
    assert.throws(() => new TouhouBulletClearWave({ cancelCircle, ...options }), /increasing/);
});
