import test from 'node:test';
import assert from 'node:assert/strict';
import { SpriteAnimation, tween, Easing, Camera3D } from '../packages/thlib/src/animation.js';
import { Resources } from '../packages/thlib/src/resources.js';

test('resource cache releases each owned native handle once and reloads after release', () => {
  let next = 0; const released = [];
  const resources = new Resources({ loadTexture: () => ++next, unloadTexture: id => released.push(id) });
  assert.equal(resources.texture('a.png'), 1); assert.equal(resources.texture('a.png'), 1);
  assert.equal(resources.release('texture', 'a.png'), true); assert.equal(resources.release('texture', 'a.png'), false);
  assert.equal(resources.texture('a.png'), 2); resources.texture('b.png'); resources.dispose(); resources.dispose();
  assert.deepEqual(released, [1, 2, 3]);
});

test('nonloop animation holds final frame and completes once across large advances', () => {
  let completions = 0;
  const animation = SpriteAnimation.grid(4, { width: 16, height: 32, columns: 2, count: 3,
    frameDuration: 2, loop: false, onComplete: () => completions++ });
  animation.update(5);
  assert.equal(animation.index, 2); assert.equal(animation.finished, false);
  animation.update(100); animation.update(100);
  assert.equal(animation.index, 2); assert.equal(completions, 1);
  animation.reset(); assert.equal(animation.finished, false);
});
test('loop animation wraps at exact duration and preserves remainder', () => {
  const animation = SpriteAnimation.grid(1, { width: 8, height: 8, columns: 2, count: 4, frameDuration: 3 });
  animation.update(14); assert.equal(animation.index, 0); assert.equal(animation.elapsed, 2);
  assert.throws(() => animation.update(-1));
});
test('tween reaches endpoint, supports zero frames, rejects invalid numeric input', () => {
  const point = { x: 0 };
  const task = tween(point, { x: 10 }, 4, Easing.outQuad);
  task.next(); assert.equal(point.x, 4.375);
  for (const _ of task) { /* Finish all frames. */ }
  assert.equal(point.x, 10);
  [...tween(point, { x: 20 }, 0)]; assert.equal(point.x, 20);
  assert.throws(() => [...tween(point, { x: NaN }, 4)]);
});
test('camera clips behind near plane', () => {
  const camera = new Camera3D(); assert.equal(camera.project(0, 0, -401), null);
  assert.deepEqual(camera.project(0, 0, 0), { x: 320, y: 200, scale: 1, depth: 400 });
});
test('resource cache loads once and malformed persisted JSON stays visible', () => {
  let loads = 0;
  const resources = new Resources({ loadTexture: () => ++loads, readText: () => '{bad' });
  assert.equal(resources.texture('a.png'), resources.texture('a.png')); assert.equal(loads, 1);
  assert.throws(() => resources.readJSON('save.json', {}), SyntaxError);
});
