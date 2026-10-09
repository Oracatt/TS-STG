import test from 'node:test';
import assert from 'node:assert/strict';
import { TouhouBossDefeat, TOUHOU_BOSS_DEFEAT_PRESET } from '../packages/thlib/dist/touhou/boss-defeat.js';
import { TouhouRNG, PI, f32, add, mul } from '../packages/thlib/dist/touhou/math.js';

test('Boss defeat preserves moving bullets outside the fixed-origin wave until its frame60 whole-field clear', () => {
  const bullets = [{ x: 10, y: 128 }, { x: 100, y: 128 }, { x: 450, y: 128 }];
  const events = [], radii = [], positions = [];
  let cleared = 0;
  const defeat = new TouhouBossDefeat({ x: 0, y: 128, z: 2, angle: 0,
    cancelCircle(x, y, radius, options) {
      radii.push(radius); assert.equal(x, 0); assert.equal(y, 128);
      assert.equal(options.nearby, true); assert.equal(options.dropMode, 0);
      for (const bullet of bullets) if (!bullet.cleared && Math.hypot(bullet.x - x, bullet.y - y) < radius) {
        bullet.cleared = true; cleared++;
      }
      events.push(`wave:${radius}`);
    },
    clearAll(owner) { assert.equal(owner.age, 60); for (const bullet of bullets) bullet.cleared = true; events.push('clearAll'); },
    onMove(position, owner) { positions.push({ ...position }); assert.equal(owner.age, positions.length); },
    onBurst(owner) { assert.equal(owner.alive, false); assert.equal(owner.clearWave.alive, false); assert.equal(owner.burst, true); events.push('burst'); },
    sound(id, x) { events.push(`sound:${id}:${x}`); },
  });
  assert.deepEqual(events, ['sound:5:0', 'wave:16']); assert.equal(cleared, 1);
  for (let frame = 1; frame < 60; frame++) {
    for (const bullet of bullets) if (!bullet.cleared) bullet.x += 0.1;
    defeat.update();
  }
  assert.equal(defeat.alive, true); assert.equal(defeat.burst, false); assert.equal(cleared, 2);
  assert.equal(bullets[2].cleared, undefined); assert.ok(bullets[2].x > 450);
  assert.equal(radii.at(-1), 370); assert.equal(defeat.position.z, 2);
  defeat.update();
  assert.deepEqual(events.slice(-3), ['wave:376', 'clearAll', 'burst']);
  assert.equal(radii.length, 61); assert.ok(bullets.every(b => b.cleared));
  let expectedX = 0; for (let i = 0; i < 60; i++) expectedX = add(expectedX, f32(.4));
  assert.deepEqual(defeat.position, { x: expectedX, y: 128, z: 2 });
  const snapshot = defeat.snapshot(), count = events.length;
  defeat.update(); defeat.update(); assert.deepEqual(defeat.snapshot(), snapshot); assert.equal(events.length, count);
  assert.deepEqual(TOUHOU_BOSS_DEFEAT_PRESET, { delayFrames: 60, speed: .4, sound: 5 });
});

test('death drift consumes exactly one source signed RNG sample and explicit angles do not consume one', () => {
  const source = new TouhouRNG(0x12345), expected = new TouhouRNG(0x12345), silent = { cancelCircle() {}, clearAll() {} };
  const defeat = new TouhouBossDefeat({ ...silent, rng: source });
  assert.equal(defeat.angle, mul(expected.signed(), PI)); assert.equal(source.state, expected.state);
  for (let i = 0; i < 60; i++) defeat.update();
  assert.equal(source.state, expected.state);
  new TouhouBossDefeat({ ...silent, rng: source, angle: 0 }); assert.equal(source.state, expected.state);
  const a = new TouhouBossDefeat(silent), b = new TouhouBossDefeat(silent);
  assert.deepEqual(a.snapshot(), b.snapshot());
});

test('settlement remains the caller responsibility and may observe a failed spell during the death wait', () => {
  const spell = { active: true, captured: true, frames: 0 }, events = [];
  const defeat = new TouhouBossDefeat({ angle: 0, cancelCircle() {}, clearAll() { events.push('clear'); },
    onBurst() { events.push(spell.captured ? 'capture' : 'failed'); spell.active = false; } });
  for (let i = 0; i < 59; i++) { if (spell.active) spell.frames++; defeat.update(); }
  assert.equal(spell.active, true); assert.deepEqual(events, []);
  spell.captured = false; spell.frames++; defeat.update();
  assert.deepEqual(events, ['clear', 'failed']); assert.equal(spell.frames, 60);
});

test('custom immediate finish and cancellation have separate lifecycle semantics', () => {
  const immediateEvents = [];
  const instant = new TouhouBossDefeat({ angle: 0, delayFrames: 0,
    cancelCircle() { immediateEvents.push('wave'); }, clearAll() { immediateEvents.push('clear'); },
    sound() { immediateEvents.push('sound'); }, onBurst(owner) { immediateEvents.push(`burst:${owner.age}`); } });
  assert.deepEqual(immediateEvents, ['sound', 'wave', 'clear', 'burst:0']); assert.equal(instant.alive, false);
  const abandonedEvents = [];
  const abandoned = new TouhouBossDefeat({ angle: 0, delayFrames: 2, cancelCircle() {},
    clearAll() { abandonedEvents.push('clear'); }, onBurst() { abandonedEvents.push('burst'); } });
  abandoned.update(); abandoned.destroy(); const snapshot = abandoned.snapshot();
  for (let i = 0; i < 5; i++) abandoned.update();
  assert.deepEqual(abandoned.snapshot(), snapshot); assert.deepEqual(abandonedEvents, []); assert.equal(abandoned.burst, false);
});

test('snapshot copies mutable positions and validates configuration before cancellation', () => {
  const options = { angle: 0, cancelCircle() {}, clearAll() {} }, defeat = new TouhouBossDefeat(options);
  const snapshot = defeat.snapshot(); snapshot.position.x = 100; snapshot.clearWave.position.x = 100;
  assert.equal(defeat.position.x, 0); assert.equal(defeat.clearWave.position.x, 0);
  for (const invalid of [{ delayFrames: -1 }, { delayFrames: .5 }, { speed: -1 }, { x: Infinity },
    { angle: NaN }, { cancelCircle: null }, { clearAll: undefined }, { onMove: true }, { sound: 1 },
    { angle: undefined, rng: null }, { angle: undefined, rng: { next() { return 0; }, modulus: 0 } }])
    assert.throws(() => new TouhouBossDefeat({ ...options, ...invalid }));
});
