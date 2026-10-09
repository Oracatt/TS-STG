import test from 'node:test';
import assert from 'node:assert/strict';
import { TouhouBossEscape, TOUHOU_BOSS_ESCAPE_PRESET } from '../packages/thlib/dist/touhou/boss-escape.js';
import { f32, add, sub, mul, div } from '../packages/thlib/dist/touhou/math.js';

test('source Boss escape uses float32 quadratic ease-out and leaves at frame60', () => {
  const moves = [], events = [];
  const escape = new TouhouBossEscape({ x: 40, y: 128, z: 3,
    onMove(position, owner) { moves.push({ ...position }); events.push(`move:${owner.age}`); },
    onEscape(owner) { assert.equal(owner.alive, false); assert.equal(owner.escaped, true); events.push('escape'); } });
  assert.deepEqual(events, []);
  assert.deepEqual(escape.position, { x: 40, y: 128, z: 3 });
  for (let frame = 1; frame < 60; frame++) {
    escape.update();
    const remaining = sub(1, div(frame, 60)), factor = sub(1, mul(remaining, remaining));
    assert.deepEqual(escape.position, {
      x: add(40, mul(sub(-224, 40), factor)), y: add(128, mul(sub(-80, 128), factor)), z: 3,
    });
    assert.equal(escape.alive, true); assert.equal(escape.escaped, false);
  }
  assert.deepEqual(moves[29], { x: -158, y: -28, z: 3 });
  assert.notDeepEqual(escape.position, escape.target);
  escape.update();
  assert.equal(escape.age, 60); assert.equal(moves.length, 60);
  assert.deepEqual(escape.position, { x: -224, y: -80, z: 3 });
  assert.deepEqual(events.slice(-2), ['move:60', 'escape']);
  const snapshot = escape.snapshot(); escape.update(); escape.finish();
  assert.deepEqual(escape.snapshot(), snapshot); assert.equal(events.length, 61);
  assert.deepEqual(TOUHOU_BOSS_ESCAPE_PRESET, { duration: 60, easing: 4, target: { x: -224, y: -80 } });
});

test('custom movement supports all target easing modes and independent float32 coordinates', () => {
  const target = { x: 40.123456789, y: -60.123456789, z: 8.123456789 };
  const escape = new TouhouBossEscape({ x: 1.123456789, y: 2, z: 3, target, duration: 2, easing: 0 });
  target.x = 999;
  assert.equal(escape.position.x, f32(1.123456789)); assert.equal(escape.target.x, f32(40.123456789));
  escape.update();
  assert.deepEqual(escape.position, { x: add(f32(1.123456789), mul(sub(f32(40.123456789), f32(1.123456789)), .5)),
    y: add(2, mul(sub(f32(-60.123456789), 2), .5)), z: add(3, mul(sub(f32(8.123456789), 3), .5)) });
  escape.update(); assert.deepEqual(escape.position, escape.target);
  for (let easing = 0; easing <= 31; easing++) if (![7, 8, 17].includes(easing)) {
    const owner = new TouhouBossEscape({ duration: 1, easing }); owner.update();
    assert.equal(owner.escaped, true); assert.deepEqual(owner.position, owner.target);
  }
});

test('escaping is silent and does not consume randomness or perform encounter settlement', () => {
  const forbidden = () => { throw new Error('escape movement must not own battle effects'); };
  const owner = new TouhouBossEscape({ get rng() { forbidden(); }, sound: forbidden,
    clearAll: forbidden, cancelCircle: forbidden, onBurst: forbidden, onDefeat: forbidden });
  for (let frame = 0; frame < 60; frame++) owner.update();
  assert.equal(owner.escaped, true);
});

test('manual finish moves once while cancellation neither moves nor reports escape', () => {
  const events = [];
  const owner = new TouhouBossEscape({ onMove(position) { events.push({ ...position }); }, onEscape() { events.push('escaped'); } });
  owner.update(); owner.finish(); owner.finish(); owner.update();
  assert.equal(owner.age, 1); assert.deepEqual(events.slice(1), [{ x: -224, y: -80, z: 0 }, 'escaped']);
  const cancelled = new TouhouBossEscape({ onMove() { events.push('unexpected move'); }, onEscape() { events.push('unexpected escape'); } });
  cancelled.destroy(); const snapshot = cancelled.snapshot(); cancelled.finish(); cancelled.update(); cancelled.destroy();
  assert.deepEqual(cancelled.snapshot(), snapshot); assert.equal(cancelled.escaped, false); assert.equal(events.length, 3);
});

test('movement callbacks can destroy or reenter safely, including the terminal frame', () => {
  for (const manual of [false, true]) {
    const events = [];
    const owner = new TouhouBossEscape({ duration: 1,
      onMove(position, escape) { events.push('move'); escape.update(); escape.finish(); escape.destroy(); },
      onEscape() { events.push('escaped'); } });
    manual ? owner.finish() : owner.update();
    owner.update(); owner.finish();
    assert.deepEqual(events, ['move']); assert.equal(owner.alive, false); assert.equal(owner.escaped, false);
  }
  const events = [];
  const owner = new TouhouBossEscape({ duration: 1,
    onMove(position, escape) { events.push('move'); escape.finish(); escape.update(); },
    onEscape(escape) { events.push('escaped'); escape.finish(); escape.update(); escape.destroy(); } });
  owner.update(); assert.deepEqual(events, ['move', 'escaped']); assert.equal(owner.escaped, true);
});

test('snapshots do not expose mutable state and all invalid inputs fail before callbacks', () => {
  const owner = new TouhouBossEscape(), snapshot = owner.snapshot();
  snapshot.position.x = 99; snapshot.target.y = 99;
  assert.equal(owner.position.x, 0); assert.equal(owner.target.y, -80);
  const sideEffect = () => assert.fail('constructor must not call callbacks');
  for (const invalid of [{ x: Infinity }, { y: NaN }, { z: '0' }, { x: 1e40 }, { target: null }, { target: [] },
    { target: {} }, { target: { x: 0, y: Infinity } }, { target: { x: 0, y: 0, z: 1e40 } }, { target: { x: 0, y: 0, z: null } },
    { duration: 0 }, { duration: -1 }, { duration: .5 }, { duration: 16777217 }, { duration: Infinity },
    { easing: -1 }, { easing: 7 }, { easing: 8 }, { easing: 17 }, { easing: 32 }, { easing: .5 }, { easing: '4' },
    { onMove: false }, { onEscape: 1 }])
    assert.throws(() => new TouhouBossEscape({ onMove: sideEffect, onEscape: sideEffect, ...invalid }));
  assert.equal(new TouhouBossEscape({ duration: 16777216 }).duration, 16777216);
});
