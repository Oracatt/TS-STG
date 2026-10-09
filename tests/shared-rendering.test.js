import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as shared from '../packages/thlib/dist/index.js';
import * as originalMath from '../games/touhou20/src/math.js';
import { Th20RenderMesh, Th20StageDistortion, Th20EnemyDistortion } from '../games/touhou20/src/distortion.js';
import { Th20RenderQueue } from '../games/touhou20/src/render-queue.js';

const { f32, f32Add, f32Sub, f32Mul, f32Div, GridMesh, RadialDistortion, LayeredDrawQueue, DrawList } = shared;
const snapshot = mesh => [mesh.positions, mesh.vertices, mesh.strips, mesh.geometry(), mesh.geometry({ strips: false, scale: 1.5, offsetX: -7, offsetY: 12 })];

test('binary32 arithmetic rounds inputs and each result; version rules remain outside the shared API', () => {
  const buffer = new DataView(new ArrayBuffer(4));
  const round = value => { buffer.setFloat32(0, value, true); return buffer.getFloat32(0, true); };
  const values = [0, -0, Number.MIN_VALUE, 1e-40, -1e-40, 16777217, -16777219, Math.PI, Infinity, -Infinity, NaN];
  for (const a of values) for (const b of values) {
    assert.equal(f32Add(a, b), round(round(a) + round(b)));
    assert.equal(f32Sub(a, b), round(round(a) - round(b)));
    assert.equal(f32Mul(a, b), round(round(a) * round(b)));
    assert.equal(f32Div(a, b), round(round(a) / round(b)));
  }
  assert.equal(originalMath.add, f32Add); assert.equal(originalMath.sub, f32Sub);
  assert.equal(originalMath.mul, f32Mul); assert.equal(originalMath.div, f32Div);
  assert.equal(shared.Th20Timer, undefined); assert.equal(shared.Th20RNG, undefined);
  assert.equal(shared.wrapAngle, undefined); assert.equal(shared.snap, undefined);
});

test('shared grid defaults to unit UVs, origin coordinates and RGBA, with configurable fractional offsets', () => {
  const mesh = new GridMesh().initialize(0, 0, 1, 1);
  assert.deepEqual(mesh.positions.map(p => [p.x, p.y]), [[0, 0], [0, 1], [1, 0], [1, 1]]);
  assert.deepEqual(mesh.geometry({ strips: false }).indices, [0, 2, 1, 1, 2, 3]);
  mesh.vertices[0].color = 0x12345678;
  assert.equal(mesh.geometry({ strips: false }).vertices[0][4], 0x12345678);
  const shifted = new GridMesh(2, 2, { offsetX: .25, offsetY: -.5, textureWidth: 2, textureHeight: 4 }).initialize(-1, 0, 6, 8);
  assert.deepEqual(shifted.geometry({ strips: false }).vertices[0].slice(0, 4), [-.75, -.5, -.375, -.125]);
  assert.equal(shifted.vertices[3].u, 2.625); // No implicit viewport/UV clamping.
  assert.throws(() => new GridMesh(1, 2), RangeError);
  assert.throws(() => new GridMesh(2, 2, { textureWidth: 0 }), RangeError);
});

test('grid strip snapshots and returned command buffers have independent lifetimes', () => {
  const mesh = new GridMesh(3, 3).initialize(0, 0, 2, 2);
  const before = mesh.geometry(), current = mesh.geometry({ strips: false });
  mesh.vertices[0].x = 123;
  assert.equal(mesh.geometry().vertices[0][0], 0); // Explicit old snapshot remains observable.
  mesh.invalidateStrips(); assert.equal(mesh.geometry().vertices[0][0], 123);
  assert.equal(before.vertices[0][0], 0); assert.equal(current.vertices[0][0], 0);
  current.indices[0] = 999; assert.equal(mesh.geometry({ strips: false }).indices[0], 0);
});

test('radial distortion is usable without original coordinates, timers or phase rules', () => {
  const mesh = new GridMesh(5, 5);
  const effect = new RadialDistortion({ mesh, radius: 1, displacement: .5, color: 0x804020ff });
  effect.update({ x: 0, y: 0 });
  const center = mesh.vertices[12], right = mesh.vertices[17], outside = mesh.vertices[0];
  assert.deepEqual([center.x, center.y, center.color], [0, 0, 0x804020ff]);
  assert.deepEqual([right.x, right.y], [.875, 0]);
  assert.equal(outside.color, 0xffffff00);
  assert.equal(effect.currentRadius, 1); assert.equal(effect.phaseX, 0);
  const wrapped = new RadialDistortion({ radius: 2, currentRadius: 1, growth: .25, phaseX: 7,
    phaseVelocityX: 2, wrapPhase: value => value % 8, colorAt: () => 0x11223300, forceOpaque: true });
  wrapped.update({ x: 10, y: 20 }, .5);
  assert.equal(wrapped.currentRadius, 1.125); assert.equal(wrapped.phaseX, 0);
});

test('layered queue applies configured priorities and stable secondary/order/registration ordering', () => {
  const queue = new LayeredDrawQueue({ priorityForLayer: layer => ({ 2: 40, 7: 10 })[layer], defaultLayer: 2 });
  const draw = new DrawList(), marker = n => d => d.rect(n, 0, 1, 1, 0);
  queue.enqueueDrawable(marker(4), { layer: 2, order: 8 });
  queue.enqueueDrawable(marker(3), { layer: 2, order: 7 });
  queue.enqueueDrawable(marker(5), { layer: 2, order: 0, secondary: 1 });
  queue.enqueueDrawable(marker(6), { layer: 2, order: 0, secondary: 1 });
  queue.enqueue(7, marker(1)); queue.rect(7, 0, 1, 1, 0);
  queue.flush(draw, { maximumPriority: 10 });
  assert.deepEqual(draw.commands.map(c => c[1]), [1]);
  queue.enqueuePriority(20, marker(2)); queue.flush(draw);
  assert.deepEqual(draw.commands.map(c => c[1]), [1, 2, 3, 4, 7, 5, 6]);
  assert.throws(() => queue.enqueue(99, marker(0)), RangeError);
  assert.throws(() => queue.flush(queue), TypeError);
  queue.reset(); assert.equal(queue.entries.length, 0); assert.equal(queue.sequence, 0);
});

test('captured batches freeze command creation while drawable callbacks run at flush', () => {
  const queue = new LayeredDrawQueue(), draw = new DrawList(); let value = 1;
  queue.enqueue(0, d => d.rect(value, 0, 1, 1, 0));
  queue.enqueueDrawable(d => d.rect(value, 0, 1, 1, 0)); value = 2;
  queue.flush(draw); assert.deepEqual(draw.commands.map(c => c[1]), [1, 2]);
});

test('business ANM bridge retains original layer map, deduplication and view capture', () => {
  const queue = new Th20RenderQueue(), draw = new DrawList(), view = { x: 1 };
  const vm = (priority, layer, order) => ({ drawPriority: priority, effectiveLayer: layer, renderOrder: order,
    renderSecondary: false, drawSelf(d, v) { d.rect(order, v.x, 1, 1, 0); } });
  const late = vm(72, 26, 2), early = vm(63, 45, 1), unregistered = vm(undefined, 999, 3);
  queue.enqueueAnm(late, view); queue.enqueueAnm(late, { x: 99 }); queue.enqueueAnm(early, view);
  queue.enqueueAnm(unregistered, view); view.x = 50;
  queue.flush(draw); assert.deepEqual(draw.commands.map(c => c.slice(1, 3)), [[1, 1], [2, 1]]);
  queue.reset(); queue.enqueueAnm(late, view); queue.flush(draw);
  assert.deepEqual(draw.commands.at(-1).slice(1, 3), [2, 50]);
  assert(queue instanceof LayeredDrawQueue);
  assert(new Th20RenderMesh() instanceof GridMesh);
  assert(new Th20EnemyDistortion() instanceof RadialDistortion);
});

// These digests were captured from the pre-extraction implementation. They
// include positions, vertex attributes, saved strips and both draw topologies;
// the migration also compares every field directly in build/compare-shared-rendering.mjs.
test('original mesh and stage configuration preserves pre-extraction numeric snapshots', () => {
  const meshHash = crypto.createHash('sha256');
  for (let i = 0; i < 128; i++) {
    const options = { viewOffsetX: i % 3 ? 224 : -11, viewOffsetY: i % 2 ? 16 : 27, screenWidth: i % 2 ? 640 : 960, screenHeight: i % 3 ? 480 : 720 };
    const mesh = new Th20RenderMesh(2 + i % 17, 2 + (i * 7) % 17, options);
    mesh.initialize(f32(-233.123 + i * .1), f32(31.33 - i * .1), 384 + i * .01, 448 + i * .02, i % 2 === 0);
    meshHash.update(JSON.stringify(snapshot(mesh)));
  }
  assert.equal(meshHash.digest('hex'), '26d8958e3c621cdbebec2fc8b8ae27420c20a3672cbc2fe56a69d8e3235d3049');
  const stageHash = crypto.createHash('sha256');
  for (let mode = 1; mode <= 2; mode++) {
    const effect = new Th20StageDistortion({ mode });
    for (let frame = 0; frame < 32; frame++) { effect.update(.5); stageHash.update(JSON.stringify(snapshot(effect.mesh))); }
  }
  assert.equal(stageHash.digest('hex'), '6fbd1c7a5b2e4cc832023428e38b6f55eeb2a7996d9d34c69bc452cf9b2ead2a');
});

test('original radial parameters preserve pre-extraction edge, color, growth and fractional-clock snapshots', () => {
  const hash = crypto.createHash('sha256');
  for (let scenario = 0; scenario < 6; scenario++) {
    const effect = new Th20EnemyDistortion({ radius: scenario % 2 ? 73.25 : 112, currentRadius: scenario === 5 ? 0 : 16,
      color: [0xffffffff, 0x446699aa, 0xff773399, 0x00010203, 0x00ffffff, 0xffff00ff][scenario],
      phaseX: f32(-3.1 + scenario), phaseY: f32(3.1 - scenario), columns: scenario % 2 ? 9 : 17, rows: scenario % 2 ? 11 : 17,
      viewOffsetX: scenario === 4 ? 0 : 224, viewOffsetY: scenario === 4 ? 0 : 16,
      screenWidth: scenario === 4 ? 320 : 640, screenHeight: scenario === 4 ? 240 : 480 });
    for (let frame = 0; frame < 120; frame++) {
      effect.update({ x: f32((frame % 19 - 9) * 31.25), y: f32((frame % 23 - 3) * 27.75), z: frame % 7 === 0 ? 1.5 : 0 }, [1, .5, 1.25, 0][frame % 4]);
      hash.update(JSON.stringify([effect.phaseX, effect.phaseY, effect.currentRadius, snapshot(effect.mesh)]));
    }
  }
  assert.equal(hash.digest('hex'), 'b79b0656c38c7409b97c2346c720ee3b5b58deb1ccb0ff8ce496f3aea1f06762');
});
