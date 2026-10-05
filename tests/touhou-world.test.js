import test from 'node:test';
import assert from 'node:assert/strict';
import { TouhouWorld, TOUHOU_WORLD_BOUNDS, normalizeTouhouWorldBounds, resolveTouhouWorld } from '../packages/thlib/src/touhou/world.js';
import { TouhouBulletField, touhouBulletCommand as command } from '../packages/thlib/src/touhou/bullets.js';
import { TouhouLaserField } from '../packages/thlib/src/touhou/lasers.js';
import { cancelTouhouLaser, eraseTouhouLaser } from '../packages/thlib/src/touhou/laser-cancellation.js';
import { TouhouEnemy, TouhouMotion } from '../packages/thlib/src/touhou/enemy.js';
import { bulletTestBank, bulletTestStyles } from './fixtures/th20-bullet-bank.js';

const bullets = options => new TouhouBulletField({ bank: bulletTestBank(), styles: bulletTestStyles(), ...options });
const lasers = options => new TouhouLaserField({ bank: bulletTestBank(), styles: bulletTestStyles(), ...options });
const enemyBank = { create(scriptId, options = {}) { return { scriptId, ...options, alive: true,
  width: 24, height: 24, scaleX: 1, scaleY: 1, update() {}, destroy() { this.alive = false; } }; } };
const advance = (owner, frames) => { for (let frame = 0; frame < frames; frame++) owner.update(); };

test('world normalization preserves source bounds, owns immutable float32 data and supports independent overrides', () => {
  const a = new TouhouWorld(), b = new TouhouWorld();
  assert.deepEqual(TOUHOU_WORLD_BOUNDS, { x: -192, y: 0, width: 384, height: 448 });
  assert.deepEqual(a.bounds, { ...TOUHOU_WORLD_BOUNDS, left: -192, top: 0, right: 192, bottom: 448, centerX: 0, centerY: 224 });
  assert.notEqual(a.bounds, b.bounds); assert.equal(resolveTouhouWorld({ world: a }), a);
  assert.throws(() => { a.bounds.x = 100; }, TypeError);
  const input = { x: .1, y: 10, width: 80, height: 100 }, custom = resolveTouhouWorld({ world: a, bounds: input });
  input.width = 4;
  assert.equal(custom.bounds.x, Math.fround(.1)); assert.equal(custom.bounds.width, 80); assert.equal(a.bounds.width, 384);
  assert.throws(() => normalizeTouhouWorldBounds({ width: 0 }), /positive/);
  assert.throws(() => normalizeTouhouWorldBounds({ x: Infinity }), /finite/);
  assert.throws(() => normalizeTouhouWorldBounds({ x: 1e30, width: 1 }), /precision/);
});

test('bullet retirement follows a shared translated world, retains source grace/top margin, and permits local overrides', () => {
  const world = new TouhouWorld({ bounds: { x: 100, y: 200, width: 80, height: 100 } }), field = bullets({ world });
  const [inside] = field.emit({ x: 140, y: 250, speed: 0 });
  const [outside] = field.emit({ x: 0, y: 100, speed: 0 });
  const [kept] = field.emit({ x: 0, y: 100, speed: 0, autoBounds: false });
  const [local] = field.emit({ x: 0, y: 100, speed: 0, bounds: TOUHOU_WORLD_BOUNDS });
  const [topMargin] = field.emit({ x: 140, y: 145, speed: 0 });
  const [aboveMargin] = field.emit({ x: 140, y: 130, speed: 0 });
  advance(field, 5); assert.equal(outside.state, 1); advance(field, 1);
  assert.equal(outside.state, 0); assert.equal(aboveMargin.state, 0);
  for (const bullet of [inside, kept, local, topMargin]) assert.equal(bullet.state, 1);
  assert.equal(inside.world, world); assert.equal(field.world, world); assert.notEqual(local.world, world);
  const unbounded = bullets({ world, autoBounds: false });
  const [override] = unbounded.emit({ x: 0, y: 100, speed: 0, autoBounds: true });
  advance(unbounded, 6); assert.equal(override.state, 0);
});

test('bounce, wrap and incoming-only protection use the translated world rather than source coordinates', () => {
  const world = new TouhouWorld({ bounds: { x: 100, y: 200, width: 80, height: 100 } }), field = bullets({ world });
  const [bounce] = field.emit({ x: 184, y: 250, speed: 2, angle: 0, commands: [command(6, { floats: [2], ints: [1, 8] })] });
  const [wrap] = field.emit({ x: 190, y: 250, speed: 1, angle: 0, commands: [command(12, { ints: [1, 8] })] });
  const [incoming] = field.emit({ x: 190, y: 250, speed: 1, angle: Math.PI, commands: [command(8, { ints: [50, 1] })] });
  const [outgoing] = field.emit({ x: 190, y: 250, speed: 1, angle: 0, commands: [command(8, { ints: [50, 1] })] });
  field.update();
  assert.equal(bounce.x, 174); assert.ok(bounce.vx < 0); assert.equal(bounce.activeMask, 0n);
  assert.equal(wrap.x, 103); assert.equal(wrap.activeMask, 0n);
  assert.equal(incoming.activeMask, 0x100n); assert.equal(outgoing.activeMask, 0n);
});

test('rectangular bullet cancellation and cancel rewards use each bullet world', () => {
  const world = new TouhouWorld({ bounds: { x: 400, y: 0, width: 200, height: 300 } }), field = bullets({ world }), drops = [];
  field.context = { spawnCancelItem: (...args) => drops.push(args) };
  const [inside] = field.emit({ x: 500, y: 100, speed: 0 });
  const [outside] = field.emit({ x: 0, y: 100, speed: 0 });
  assert.equal(field.cancelRectangle(500, 100, 40, 40, 0, { dropMode: 1 }), 1);
  assert.equal(inside.state, 4); assert.equal(drops.length, 1);
  assert.equal(field.cancelRectangle(0, 100, 40, 40, 0, { dropMode: 1 }), 0);
  field.cancel(outside, 1); assert.equal(drops.length, 1, 'off-world erase must not award a cancel item');
});

test('bullet pools can exceed original capacity and 16-bit slots without corrupting allocation/reuse', () => {
  const field = bullets({ capacity: 70000 });
  const [a, b] = field.emit({ count: 2, speed: 0 });
  assert.deepEqual([a.slot, b.slot], [69999, 69998]); assert.equal(field.count, 2);
  field.retire(a); field.retire(a);
  const [c] = field.emit({ speed: 0 });
  assert.equal(c.slot, 69999); assert.equal(field.count, 2); assert.equal(field.free.length, 69998);
  for (const capacity of [0, -1, 1.5, Infinity, 0x100000000]) assert.throws(() => bullets({ capacity }), /capacity/);
});

test('straight and curve retirement use the same world; local and field autoBounds options retain off-world owners', () => {
  const world = new TouhouWorld({ bounds: { x: 400, y: 0, width: 200, height: 300 } }), field = lasers({ world });
  const inside = field.spawnStraight({ x: 450, y: 100, length: 60, initialLength: 60, speed: 0 });
  const outside = field.spawnStraight({ x: 0, y: 100, length: 60, initialLength: 60, speed: 0 });
  const kept = field.spawnStraight({ x: 0, y: 100, length: 60, initialLength: 60, speed: 0, autoBounds: false });
  const local = field.spawnStraight({ x: 0, y: 100, length: 60, initialLength: 60, speed: 0, bounds: TOUHOU_WORLD_BOUNDS });
  const curve = field.spawnCurve({ x: 450, y: 100, count: 8, speed: 0 });
  const missing = field.spawnCurve({ x: 0, y: 100, count: 8, speed: 0 });
  advance(field, 31);
  assert.equal(outside.alive, false); assert.equal(missing.alive, false);
  for (const laser of [inside, kept, local, curve]) assert.equal(laser.alive, true);
  assert.equal(inside.world, world); assert.notEqual(local.world, world);
  const unbounded = lasers({ world, autoBounds: false }), longLived = unbounded.spawnCurve({ x: 0, y: 100, count: 8, speed: 0 });
  advance(unbounded, 35); assert.equal(longLived.alive, true);
});

test('laser cancellation effects respect local world clipping and split fragments inherit its world', () => {
  const world = new TouhouWorld({ bounds: { x: 400, y: 0, width: 200, height: 300 } }), field = lasers();
  const infinite = field.spawnInfinite({ x: 420, y: 100, length: 160, world });
  assert.equal(field.cancelCircle(492, 100, 9), 1); assert.equal(field.effects.length, 1);
  const debris = field.lasers.find(laser => laser !== infinite);
  assert.equal(debris.world, world);
  let effects = 0;
  const erased = field.spawnInfinite({ x: 420, y: 100, length: 80, world });
  eraseTouhouLaser(erased, { onEffect: () => effects++ }); assert.ok(effects > 0);
  const clipped = field.spawnInfinite({ x: 0, y: 100, length: 80, world });
  effects = 0; eraseTouhouLaser(clipped, { onEffect: () => effects++ }); assert.equal(effects, 0);
  const external = field.spawnInfinite({ x: 420, y: 100, length: 160, world, autoBounds: false }), fragments = [];
  cancelTouhouLaser(external, { x: 492, y: 100 }, 9, 0, 0, true, { onSpawnStraight: p => fragments.push(p) });
  assert.equal(fragments.length, 1); assert.equal(fragments[0].world, world); assert.equal(fragments[0].autoBounds, false);
});

test('ordinary enemies share world retirement and preserve entry-before-exit and opt-out behavior', () => {
  const world = new TouhouWorld({ bounds: { x: 400, y: 0, width: 200, height: 300 } });
  const create = options => new TouhouEnemy({ bank: enemyBank, world, x: 500, y: 100, directional: false, ...options });
  const enemy = create({}), kept = create({ autoBounds: false });
  enemy.update(); kept.update(); assert.equal(enemy.entered, true); assert.equal(enemy.world, world);
  enemy.motion.position.x = kept.motion.position.x = 640; enemy.update(); kept.update();
  assert.equal(enemy.alive, false); assert.equal(kept.alive, true);
  const incoming = create({ x: 0, motion: new TouhouMotion({ position: { x: 0, y: 100 }, speed: 0 }) });
  incoming.update(); assert.equal(incoming.alive, true); assert.equal(incoming.entered, false);
  const local = create({ x: 0, bounds: TOUHOU_WORLD_BOUNDS }); local.update(); assert.equal(local.entered, true);
});

test('laser field capacity is configurable without changing curve sample limits or default fragment retirement', () => {
  const field = new TouhouLaserField({ styles: bulletTestStyles(), capacity: 513 });
  for (let i = 0; i < 513; i++) assert.ok(field.spawnStraight({ y: 100, speed: 0 }));
  assert.equal(field.count, 513); assert.equal(field.spawnStraight(), null);
  field.retire(field.lasers[0]); assert.ok(field.spawnStraight());
  assert.equal(field.count, 513);
  assert.throws(() => lasers({ capacity: 0 }), /capacity/);
  const drivenField = lasers(), driven = drivenField.spawnDriven(1, { y: 100, length: 160 });
  assert.equal(driven.autoBounds, false);
  drivenField.cancelCircle(72, 100, 9);
  assert.equal(drivenField.lasers.find(laser => laser !== driven).autoBounds, true,
    'ordinary split fragments retain source bounds even if the original trajectory was caller-driven');
});
