import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DrawList, Keys, ReplayPlaybackController, ReplayPlayer, ReplayRecorder, stateHash } from '../packages/thlib/dist/index.js';
import { createTouhouResources, TouhouBulletField, TouhouRenderQueue, touhouBulletCommand } from '../packages/thlib/dist/touhou/index.js';

const createField = () => {
  const resources = createTouhouResources({ readText: file => readFileSync(file, 'utf8'), loadTexture: () => 1 });
  const bank = resources.createBank('bullet');
  const field = new TouhouBulletField({ bank, styles: resources.styles, autoBounds: false });
  return { resources, bank, field, dispose() { bank.dispose(); resources.dispose(); } };
};
const view = { x: 320, y: 0, scale: 1.5 };
const render = (fixture, queued = false) => {
  const draw = new DrawList();
  if (queued) {
    const queue = new TouhouRenderQueue();
    fixture.field.draw(queue, view);
    fixture.bank.drawDetached(queue, view);
    queue.flush(draw);
  } else {
    fixture.field.draw(draw, view);
    fixture.bank.drawDetached(draw, view);
  }
  return draw.commands;
};
const transforms = field => field.bullets.map(({ animation: vm }) => ({
  position: [vm.x, vm.y, vm.z], rotation: vm.rotation,
  scale2: [vm.scale2X, vm.scale2Y], flags: vm.U(0x49c),
}));

test('embedded bullet transforms are updated before snapshots; immediate and queued draws preserve them', () => {
  const fixture = createField();
  try {
    for (const type of [0, 3, 8, 18, 33, 43]) fixture.field.emit({
      x: -50, y: 100, type, color: 3, speed: 1.5, angle: .3, shotSound: -1,
      commands: [touhouBulletCommand(3, { floats: [0, .01], ints: [90] })],
    });
    for (let frame = 0; frame < 6; frame++) {
      for (const bullet of fixture.field.bullets) { bullet.scaleEnabled = true; bullet.scale = Math.fround(1.25); }
      fixture.field.update();
      for (const bullet of fixture.field.bullets) {
        assert.deepEqual([bullet.animation.x, bullet.animation.y, bullet.animation.z], [bullet.x, bullet.y, bullet.z]);
        assert.equal(bullet.animation.scale2X, bullet.scale);
        assert.equal(bullet.animation.scale2Y, bullet.scale);
      }
      const before = fixture.field.snapshot(), beforeTransforms = transforms(fixture.field);
      for (let draw = 0; draw < 3; draw++) assert.ok(render(fixture).length > 0);
      for (let draw = 0; draw < 2; draw++) assert.ok(render(fixture, true).length > 0);
      assert.deepEqual(fixture.field.snapshot(), before);
      assert.deepEqual(transforms(fixture.field), beforeTransforms);
    }
  } finally { fixture.dispose(); }
});

test('emit, direct style change and cancellation synchronize their owner without a render call', () => {
  const fixture = createField();
  try {
    const [bullet] = fixture.field.emit({ x: 0, y: 120, type: 3, speed: 2, angle: .4, shotSound: -1,
      commands: [touhouBulletCommand(1, { ints: [1] })] });
    assert.deepEqual([bullet.animation.x, bullet.animation.y, bullet.animation.z], [bullet.x, bullet.y, bullet.z]);
    fixture.field.changeStyle(bullet, 18, 4);
    assert.deepEqual([bullet.animation.x, bullet.animation.y, bullet.animation.z], [bullet.x, bullet.y, bullet.z]);
    fixture.field.cancel(bullet);
    assert.equal(bullet.state, 4);
    assert.deepEqual([bullet.animation.x, bullet.animation.y, bullet.animation.z], [bullet.x, bullet.y, bullet.z]);
    const before = fixture.field.snapshot(); render(fixture, true);
    assert.deepEqual(fixture.field.snapshot(), before);
  } finally { fixture.dispose(); }
});

test('recording with one render per frame matches accelerated playback with zero, sparse and repeated rendering', () => {
  const update = (fixture, frame, mask) => {
    if (frame % 37 === 0) fixture.field.emit({
      x: mask & Keys.LEFT ? -20 : 20, y: 100,
      type: [0, 3, 8, 18, 33, 43][Math.floor(frame / 37) % 6], color: Math.floor(frame / 37) % 8,
      count: mask & Keys.FOCUS ? 2 : 3, angle: frame * .02, angleStep: .3,
      speed: 1.3, shotSound: -1,
      commands: [touhouBulletCommand(1, { ints: [1] }),
        touhouBulletCommand(3, { floats: [0, .01], ints: [200] }),
        touhouBulletCommand(22, { floats: [.8, 1.2], ints: [90, 1], concurrent: true })],
    });
    if (frame === 123 || frame === 430) fixture.field.cancelCircle(0, 150, 160);
    fixture.field.update(null, { freezeBullets: frame >= 200 && frame < 204 });
    fixture.bank.updateDetached();
  };
  const snapshot = fixture => ({ field: fixture.field.snapshot(), rng: fixture.field.random.state, visualRng: fixture.field.visualRandom.state });
  const original = createField(), recorder = new ReplayRecorder();
  let expected;
  try {
    for (let frame = 0; frame < 640; frame++) {
      const mask = (frame % 120 < 60 ? Keys.LEFT : Keys.RIGHT) | (frame % 200 < 100 ? Keys.FOCUS : 0);
      recorder.record(mask); update(original, frame, mask);
      if (recorder.frames % 80 === 0) recorder.checkpoint(snapshot(original));
      render(original, true);
    }
    expected = snapshot(original);
  } finally { original.dispose(); }
  assert.equal(recorder.checkpoints.length, 8);
  const recorded = recorder.toJSON();
  for (const cadence of [0, 1, 'batch', 8, 3]) {
    const fixture = createField(), player = new ReplayPlayer(recorded), controller = new ReplayPlaybackController();
    let done = false, batch = 0, notifications = 0;
    try {
      while (!done) {
        controller.update(Keys.FAST_FORWARD | Keys.BOMB | Keys.UP, () => {
          const frame = player.frame, mask = player.next();
          if (mask === null) { done = true; notifications++; return; }
          update(fixture, frame, mask); player.verify(snapshot(fixture));
          if (cadence === 1) render(fixture, true);
        }, { shouldContinue: () => !done });
        if (cadence === 'batch') render(fixture, true);
        if (cadence === 8 && ++batch % 8 === 0) render(fixture, true);
        if (cadence === 3) for (let draw = 0; draw < 3; draw++) render(fixture, draw % 2 === 0);
      }
      assert.equal(notifications, 1);
      assert.deepEqual(snapshot(fixture), expected, `Render cadence ${cadence} changed simulation`);
      assert.equal(stateHash(snapshot(fixture)), stateHash(expected));
      assert.equal(player.desync, null);
    } finally { fixture.dispose(); }
  }
});

test('freeze and pause retain their clocks while draw never mutates a frozen owner', () => {
  const fixture = createField();
  try {
    const [bullet] = fixture.field.emit({ x: 0, y: 120, type: 3, speed: 2, angle: .4, shotSound: -1 });
    fixture.field.update(); bullet.frozen = true;
    const before = fixture.field.snapshot(), beforeTransforms = transforms(fixture.field);
    fixture.field.update(null, { paused: true }); render(fixture, true);
    assert.deepEqual(fixture.field.snapshot(), before);
    assert.deepEqual(transforms(fixture.field), beforeTransforms);
    bullet.frozen = false;
    fixture.field.update(null, { freezeBullets: true });
    const frozenPosition = [bullet.x, bullet.y, bullet.z];
    assert.deepEqual([bullet.animation.x, bullet.animation.y, bullet.animation.z], frozenPosition);
  } finally { fixture.dispose(); }
});
