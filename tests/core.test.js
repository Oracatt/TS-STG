import test from 'node:test';
import assert from 'node:assert/strict';
import { RNG, TAU, distanceToSegmentSq, approachAngle } from '../packages/thlib/dist/math.js';
import { Input, Keys } from '../packages/thlib/dist/input.js';
import { TaskRunner, wait } from '../packages/thlib/dist/task.js';
import { World, Entity } from '../packages/thlib/dist/world.js';
import { Bullet } from '../packages/thlib/dist/bullets.js';
import { Laser } from '../packages/thlib/dist/lasers.js';
import { Patterns } from '../packages/thlib/dist/patterns.js';
import { DrawList, rgba, withAlpha } from '../packages/thlib/dist/render.js';

const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
const world = (seed = 1) => new World({ bounds: { x: 0, y: 0, width: 100, height: 100 }, seed, cellSize: 10 });

test('seeded RNG has stable vectors, bounded integers, save/restore and no zero-seed trap', () => {
  const random = new RNG(1);
  assert.deepEqual(Array.from({ length: 5 }, () => random.nextUint()), [2693262067, 11749833, 2265367787, 4213581821, 4159151403]);
  const saved = random.save(), expected = random.nextUint();
  assert.equal(random.restore(saved).nextUint(), expected);
  assert.equal(random.clone().nextUint(), random.nextUint());
  const zero = new RNG(0); assert.notEqual(zero.nextUint(), 0);
  for (let i = 0; i < 1000; i++) { const value = random.int(-3, 7); assert.ok(value >= -3 && value < 7); }
  assert.throws(() => random.int(0), RangeError);
  assert.throws(() => random.pick([]), RangeError);
});

test('input distinguishes press, hold, release, and opposed directions', () => {
  const input = new Input();
  input.update(Keys.LEFT | Keys.SHOOT); assert.ok(input.pressed(Keys.SHOOT)); assert.equal(input.axis(Keys.LEFT, Keys.RIGHT), -1);
  input.update(Keys.LEFT | Keys.RIGHT | Keys.SHOOT); assert.equal(input.axis(Keys.LEFT, Keys.RIGHT), 0); assert.equal(input.pressed(Keys.SHOOT), false);
  input.update(0); assert.ok(input.released(Keys.SHOOT)); assert.equal(input.down(Keys.SHOOT), false);
});

test('task scheduler resumes on exact fixed frames and supports nested tasks and predicates', () => {
  const runner = new TaskRunner(), events = [];
  runner.add(function* () {
    events.push(runner.frame); yield* wait(3);
    events.push(runner.frame); yield wait(2);
    events.push(runner.frame); yield context => context.ready;
    events.push(runner.frame);
  });
  for (let i = 0; i < 9; i++) runner.update({ ready: i >= 8 });
  assert.deepEqual(events, [0, 3, 5, 8]); assert.equal(runner.size, 0);
});

test('task scheduling during update is deferred and self-cancel runs finally once', () => {
  const runner = new TaskRunner(), events = [];
  runner.add(function* () {
    try { events.push('first'); runner.add(function* () { events.push('new'); }); yield 1; runner.clear(); yield 1; }
    finally { events.push('finally'); }
  });
  runner.update(); assert.deepEqual(events, ['first']);
  runner.update(); assert.deepEqual(events, ['first', 'finally']); assert.equal(runner.size, 0);
  const owner = new Entity(); let cleanup = 0;
  owner.tasks.add(function* () { try { owner.destroy(); yield 10; } finally { cleanup++; } });
  owner.tasks.update(); assert.equal(cleanup, 1); assert.equal(owner.tasks.size, 0);
});

test('world lifecycle defers mid-frame spawns, skips destroyed entities and preserves IDs', () => {
  const w = world(), calls = []; let child;
  const killer = new Entity(); const victim = new Entity();
  killer.update = () => { calls.push('parent'); child = w.spawn(new Entity({ vx: 1 })); victim.destroy(); killer.destroy(); };
  victim.update = () => calls.push('victim');
  w.spawn(killer); w.spawn(victim); w.update();
  assert.deepEqual(calls, ['parent']); assert.equal(child.age, 0); assert.equal(child.x, 0);
  assert.deepEqual(w.entities.map(entity => entity.id), [3]);
  w.update(); assert.equal(child.age, 1); assert.equal(child.x, 1);
  assert.throws(() => w.spawn(child), /once/);
  w.spawn(new Bullet()); assert.equal(w.clear('enemyBullet'), 1); w.flush(); assert.equal(w.query('enemyBullet').length, 0);
});

test('destroy clears owner generators and dispatches onDestroy exactly once', () => {
  const w = world(), e = w.spawn(new Entity()); let closed = 0, destroyed = 0;
  e.onDestroy = () => destroyed++;
  e.tasks.add(function* () { try { while (true) yield 1; } finally { closed++; } });
  w.update(); assert.equal(e.destroy('test'), true); assert.equal(e.destroy('test'), false);
  w.update(); assert.equal(closed, 1); assert.equal(destroyed, 1); assert.equal(w.entities.length, 0);
});

test('grid collision candidates match brute-force exact geometry without duplicate IDs', () => {
  const w = world(3);
  for (let i = 0; i < 1200; i++) w.spawn(new Bullet({ x: w.rng.float(-30, 130), y: w.rng.float(-30, 130), radius: w.rng.float(1, 10), shape: i % 2 ? 'rice' : 'circle', angle: w.rng.float(0, TAU), speed: 0, autoCull: false }));
  const laser = w.spawn(new Laser({ x: -1000, y: 0, angle: 0.01, length: 100000, width: 12, warning: 0, grow: 0 }));
  w.update();
  for (let i = 0; i < 40; i++) {
    const x = w.rng.float(0, 100), y = w.rng.float(0, 100), radius = w.rng.float(1, 20);
    const expected = w.entities.filter(entity => entity.collidesCircle(x, y, radius)).map(entity => entity.id);
    assert.deepEqual(w.queryCircle(x, y, radius).map(entity => entity.id), expected);
  }
  laser.cancel(); assert.equal(w.queryCircle(50, 10, 30, 'enemyLaser').length, 0);
  assert.throws(() => w.queryCircle(0, 0, Infinity), RangeError);
});

test('numeric spatial keys preserve negative-cell and large-coordinate separation', () => {
  const w = world();
  const a = w.spawn(new Entity({ x: -10, y: 327670, radius: 1 }));
  const b = w.spawn(new Entity({ x: 0, y: -327690, radius: 1 }));
  const c = w.spawn(new Entity({ x: 10000000, y: -10000000, radius: 2 }));
  w.flush();
  assert.deepEqual(w.queryCircle(a.x, a.y, 0), [a]);
  assert.deepEqual(w.queryCircle(b.x, b.y, 0), [b]);
  assert.deepEqual(w.queryCircle(c.x, c.y, 0), [c]);
});

test('bullet delay, acceleration, command timing and angular movement are deterministic', () => {
  const w = world(), b = w.spawn(new Bullet({ x: 20, y: 20, angle: 0, speed: 1, delay: 2, acceleration: 1, maxSpeed: 3, commands: [{ at: 4, type: 'turn', angle: Math.PI / 2 }] }));
  w.update(); w.update(); assert.equal(b.x, 20); assert.equal(b.isActive, false);
  w.update(); assert.equal(b.x, 22); assert.equal(b.isActive, true);
  w.update(); assert.equal(b.x, 25); w.update(); near(b.x, 25); near(b.y, 23);
  assert.equal(b.graze(1), true); assert.equal(b.graze(1), false); assert.equal(b.graze(2), true);
  assert.equal(b.cancel(), true); assert.equal(b.collidesCircle(25, 23, 100), false);
});

test('reflection preserves overshoot and wrapping works for negative and multi-width travel', () => {
  const w = world();
  const bounce = w.spawn(new Bullet({ x: 98, y: 50, angle: 0, speed: 10, bounce: 1 }));
  const wrap = w.spawn(new Bullet({ x: 2, y: 40, angle: Math.PI, speed: 205, wrap: 1 }));
  w.update(); near(bounce.x, 92); near(bounce.vx, -10); assert.equal(bounce.bounce, 0);
  near(wrap.x, 97); assert.equal(wrap.wrap, 0);
});

test('rotated capsule and box bullet hitboxes follow their visible orientation', () => {
  const capsule = new Bullet({ x: 50, y: 50, shape: 'rice', radius: 2, halfLength: 10, angle: Math.PI / 2 });
  assert.ok(capsule.collidesCircle(50, 62, 0)); assert.equal(capsule.collidesCircle(54, 50, 0), false);
  const box = new Bullet({ x: 0, y: 0, hitbox: 'box', halfLength: 10, halfWidth: 2, angle: Math.PI / 2 });
  assert.ok(box.collidesCircle(1, 9, 0)); assert.equal(box.collidesCircle(3, 9, 0), false);
});

test('laser warning, growth, sustain and fade have exact frame counts including one-frame active', () => {
  const w = world(), laser = w.spawn(new Laser({ x: 0, y: 50, angle: 0, length: 90, width: 10, warning: 2, grow: 2, duration: 1, fade: 2 }));
  const phases = [], widths = [], harmful = [];
  for (let i = 0; i < 8; i++) { w.update(); phases.push(laser.phase); widths.push(laser.currentWidth); harmful.push(laser.collidesCircle(40, 50, 1)); }
  assert.deepEqual(phases, ['warning', 'warning', 'grow', 'grow', 'active', 'fade', 'fade', 'dead']);
  assert.deepEqual(harmful, [false, false, true, true, true, false, false, false]);
  assert.deepEqual(widths.slice(2, 7), [5, 10, 10, 10, 5]);
  const single = w.spawn(new Laser({ warning: 0, grow: 0, duration: 1, fade: 0 }));
  w.update(); assert.equal(single.isActive, true); w.update(); assert.equal(single.alive, false);
});

test('laser curved segments, moving head, per-player graze cooldown and cancellation', () => {
  const w = world();
  const curved = w.spawn(new Laser({ kind: 'curved', points: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }], x: 50, y: 50, width: 8, warning: 0, grow: 0, grazeCooldown: 3 }));
  const moving = w.spawn(new Laser({ kind: 'moving', x: 40, y: 60, angle: 0, speed: 2, length: 20, warning: 0, grow: 0, width: 4 }));
  w.update(); assert.ok(curved.collidesCircle(50, 30, 1)); assert.equal(curved.collidesCircle(30, 30, 1), false);
  assert.ok(moving.collidesCircle(23, 60, 0)); assert.equal(moving.collidesCircle(65, 60, 0), false);
  assert.equal(curved.canGraze(1), true); assert.equal(curved.canGraze(1), false); assert.equal(curved.canGraze(2), true);
  w.update(); w.update(); assert.equal(curved.canGraze(1), false); w.update(); assert.equal(curved.canGraze(1), true);
  assert.equal(curved.cancel(), true); assert.equal(curved.collidesCircle(50, 30, 100), false); assert.equal(curved.cancel(), false);
});

test('cancelling a laser during warning does not flash a full-width beam', () => {
  const w = world(), laser = w.spawn(new Laser({ width: 40, warning: 60, fade: 5 }));
  w.update(); const warningWidth = laser.currentWidth;
  laser.cancel(); assert.equal(laser.currentWidth, warningWidth); assert.equal(laser.isActive, false);
  w.update(); w.update(); assert.ok(laser.currentWidth < warningWidth);
});

test('patterns emit symmetric fans/rings, aim, elliptic velocity and reproducible random rows', () => {
  const a = world(99), b = world(99);
  const ring = Patterns.ring(a, { count: 4, rows: 2, speed: 2, speedStep: 1 });
  assert.equal(ring.length, 8); near(ring[1].angle, Math.PI / 2); assert.equal(ring[4].speed, 3);
  const fan = Patterns.fan(a, { count: 3, angle: 0, spread: Math.PI / 2 });
  near(fan[0].angle, -Math.PI / 4); near(fan[1].angle, 0); near(fan[2].angle, Math.PI / 4);
  near(Patterns.aimed(a, { x: 2, y: 2, target: { x: 2, y: 30 } })[0].angle, Math.PI / 2);
  assert.deepEqual(Patterns.random(a, { count: 12 }).map(item => [item.angle, item.speed]), Patterns.random(b, { count: 12 }).map(item => [item.angle, item.speed]));
  const ellipse = Patterns.ellipse(a, { count: 4, speedX: 4, speedY: 2 }); near(ellipse[1].speed, 2); near(ellipse[0].speed, 4);
  assert.equal(Patterns.spiral(a, { arms: 3, count: 7 }).length, 21);
  assert.equal(Patterns.ring(a, { count: 0 }).length, 0);
  assert.throws(() => Patterns.ring(a, { count: Infinity }), RangeError);
});

test('identical seed and pattern task produce the same entire simulation snapshot', () => {
  const run = seed => {
    const w = world(seed);
    w.tasks.add(function* () { for (let i = 0; i < 20; i++) { Patterns.random(w, { x: 50, y: 30, count: 30, minSpeed: 0.5, maxSpeed: 2, bounce: 2 }); yield* wait(3); } });
    for (let frame = 0; frame < 120; frame++) w.update();
    return JSON.stringify(w.snapshot());
  };
  assert.equal(run(17), run(17)); assert.notEqual(run(17), run(18));
});

test('portable draw commands preserve ABI color packing, ordering and valid finite numbers', () => {
  const draw = new DrawList();
  draw.clear(0x000000ff).blend().spriteRegion(1, 0, 0, 16, 16, 30, 40, 32, 32).blendEnd();
  new Bullet({ x: 30, y: 40, shape: 'rice' }).draw(draw);
  new Laser({ warning: 0, grow: 0 }).draw(draw);
  assert.equal(rgba(255, 128, 0, 255), 0xff8000ff); assert.equal(withAlpha(0xffffffff, 0.5), 0xffffff80);
  assert.deepEqual(draw.commands.slice(0, 4).map(command => command[0]), ['clear', 'blend', 'spriteRegion', 'blendEnd']);
  draw.text('中文', 0, 0, 20, 0xffffffff, 9); assert.deepEqual(draw.commands.at(-1), ['text', '中文', 0, 0, 20, 0xffffffff, 9]);
  draw.text('Default font', 0, 0, 20); assert.equal(draw.commands.at(-1).length, 6);
  for (const command of draw.commands) for (const value of command) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  assert.equal(distanceToSegmentSq(2, 2, 1, 1, 1, 1), 2);
  near(approachAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.05), Math.PI - 0.05);
});
