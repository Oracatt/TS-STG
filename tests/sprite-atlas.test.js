import test from 'node:test';
import assert from 'node:assert/strict';
import { SpriteAtlas, SpriteClip } from '../packages/thlib/src/sprite-atlas.js';
import { DrawList } from '../packages/thlib/src/render.js';

function pack() {
  return {
    format: 'ts-stg-sprite-pack-v1', provenance: { label: 'Synthetic test fixture' },
    textures: {
      first: { file: 'textures/first.png', width: 64, height: 32, sourceWidth: 63 },
      second: { file: 'second.png', width: 128, height: 64 },
    },
    sprites: {
      'shot.small': { texture: 'first', x: 2, y: 4, width: 8, height: 12 },
      'spark.wide': { texture: 'second', x: 10, y: 20, width: 30, height: 16 },
      'spark.end': { texture: 'first', x: 32, y: 0, width: 32, height: 32 },
    },
    clips: {
      spark: { frames: ['shot.small', 'spark.wide', 'spark.end'], frameDuration: 2, loop: false },
      blink: { frames: ['shot.small', 'spark.wide'], frameDuration: 3, loop: true },
    },
  };
}
function adapter() {
  return { loads: [], releases: [], next: 0,
    loadTexture(path, width, height) { this.loads.push([path, width, height]); return ++this.next; },
    unloadTexture(handle) { this.releases.push(handle); } };
}

test('atlas lazily loads texture canvases, honors the caller basePath and preserves centered sprite transforms', () => {
  const host = adapter(), atlas = new SpriteAtlas(pack(), host, { basePath: 'my-game/art/' }), draw = new DrawList();
  assert.equal(host.loads.length, 0);
  assert.equal(atlas.drawNamed('shot.small', draw, 100, 200, { width: 20, height: 30, scale: 2, scaleX: .5, scaleY: 1.5, rotation: .25, color: 0x12345678 }), draw);
  assert.deepEqual(draw.commands[0], ['spriteRegion', 1, 2, 4, 8, 12, 100, 200, 20, 90, .25, 0x12345678]);
  atlas.drawNamed('spark.end', draw, 0, 0);
  assert.deepEqual(host.loads, [['my-game/art/textures/first.png', 64, 32]]);
  assert.equal(draw.commands[1][1], 1);
});

test('basePath is explicit data, supports platform separators and preserves filesystem root', () => {
  const host = adapter(), source = pack(); source.textures.first.file = 'textures\\first.png';
  new SpriteAtlas(source, host, { basePath: 'C:\\project\\art\\' }).texture('first');
  new SpriteAtlas(pack(), host, { basePath: '/' }).texture('first');
  new SpriteAtlas(pack(), host).texture('first');
  assert.deepEqual(host.loads.map(call => call[0]), ['C:/project/art/textures/first.png', '/textures/first.png', 'textures/first.png']);
});

test('texture paths cannot escape basePath or use absolute/URI/encoded traversal syntax', () => {
  for (const file of ['../x.png', 'a/../x.png', './x.png', '/x.png', '\\x.png', '\\\\host\\x.png', 'C:x.png',
    'https://host/x.png', 'x.png?other', 'x.png#other', '%2e%2e/x.png', 'a//x.png', 'a/.. /x.png', 'a/.../x.png', 'x\0.png']) {
    const source = pack(); source.textures.first.file = file;
    assert.throws(() => new SpriteAtlas(source, adapter()), { name: 'TypeError' }, file);
  }
});

test('manifest validation rejects missing references, invalid rectangles and malformed clips before allocating resources', () => {
  const invalid = [
    p => { p.format = 'other'; }, p => { p.textures.first.width = 0; }, p => { p.sprites['shot.small'].texture = 'missing'; },
    p => { p.sprites['shot.small'].x = -1; }, p => { p.sprites['shot.small'].width = 1000; },
    p => { p.clips.spark.frames = []; }, p => { p.clips.spark.frames = ['missing']; },
    p => { p.clips.spark.frameDuration = 0; }, p => { p.clips.spark.frameDuration = 1.5; }, p => { p.clips.spark.loop = 'yes'; },
  ];
  for (const mutate of invalid) { const source = pack(), host = adapter(); mutate(source); assert.throws(() => new SpriteAtlas(source, host)); assert.equal(host.loads.length, 0); }
  assert.throws(() => new SpriteAtlas(pack(), { loadTexture: () => 1 }), TypeError);
});

test('normalized manifest records are isolated from source mutation and allow ordinary prototype-like sprite names', () => {
  const source = pack(); source.sprites.constructor = { ...source.sprites['shot.small'] };
  const atlas = new SpriteAtlas(source, adapter());
  source.textures.first.file = '../bad.png'; source.sprites['shot.small'].x = 50; source.clips.spark.frames[0] = 'bad';
  assert.equal(atlas.getSprite('shot.small').x, 2); assert.equal(atlas.getClip('spark').frames[0], 'shot.small');
  assert.equal(atlas.getSprite('constructor').width, 8); assert.throws(() => atlas.getSprite('toString'), RangeError);
  assert(Object.isFrozen(atlas.getSprite('shot.small'))); assert(Object.isFrozen(atlas.getClip('spark').frames));
  assert.equal(atlas.manifest.provenance.label, 'Synthetic test fixture');
});

test('unknown resources and invalid draw geometry produce errors without loading textures', () => {
  const host = adapter(), atlas = new SpriteAtlas(pack(), host), draw = new DrawList();
  assert.throws(() => atlas.texture('missing'), RangeError); assert.throws(() => atlas.clip('missing'), RangeError);
  assert.throws(() => atlas.drawNamed('missing', draw, 0, 0), RangeError);
  assert.throws(() => atlas.drawNamed('shot.small', draw, NaN, 0), RangeError);
  assert.throws(() => atlas.drawNamed('shot.small', draw, 0, 0, { scale: -1 }), RangeError);
  assert.throws(() => atlas.drawNamed('shot.small', draw, 0, 0, { width: Number.MAX_VALUE, scale: 2 }), RangeError);
  assert.equal(host.loads.length, 0); assert.equal(draw.commands.length, 0);
});

test('release supports reloading and disposal releases each owned texture once', () => {
  const host = adapter(), atlas = new SpriteAtlas(pack(), host);
  atlas.loadAll(); assert.equal(atlas.texture('first'), 1);
  assert.equal(atlas.releaseTexture('first'), true); assert.equal(atlas.releaseTexture('first'), false);
  assert.equal(atlas.texture('first'), 3); atlas.dispose(); atlas.dispose();
  assert.deepEqual(host.releases, [1, 2, 3]); assert.equal(atlas.disposed, true);
  assert.throws(() => atlas.loadAll(), /disposed/); assert.throws(() => atlas.texture('first'), /disposed/);
});

test('partial loading errors preserve already owned textures for cleanup and do not cache the failed load', () => {
  const host = adapter(), load = host.loadTexture; let fail = true;
  host.loadTexture = function(path, ...args) { if (path === 'second.png' && fail) throw new Error('load failed'); return load.call(this, path, ...args); };
  const atlas = new SpriteAtlas(pack(), host);
  assert.throws(() => atlas.loadAll(), /load failed/); assert.equal(atlas.handles.size, 1);
  fail = false; atlas.loadAll(); atlas.dispose(); assert.deepEqual(host.releases, [1, 2]);
});

test('failed release remains retryable while other resources are still released', () => {
  const host = adapter(); let fail = true;
  host.unloadTexture = function(id) { if (id === 1 && fail) throw new Error('release failed'); this.releases.push(id); };
  const atlas = new SpriteAtlas(pack(), host).loadAll();
  assert.throws(() => atlas.dispose(), /release failed/); assert.equal(atlas.disposed, false); assert.deepEqual(host.releases, [2]);
  fail = false; atlas.dispose(); atlas.dispose(); assert.deepEqual(host.releases, [2, 1]); assert.equal(atlas.disposed, true);
});

test('cross-texture clips advance without loading; drawing selects the current texture and rectangle', () => {
  const host = adapter(), atlas = new SpriteAtlas(pack(), host), clip = atlas.clip('spark'), draw = new DrawList();
  assert(clip instanceof SpriteClip); clip.update(2); assert.equal(clip.spriteName, 'spark.wide'); assert.equal(host.loads.length, 0);
  clip.draw(draw, 1, 2); assert.deepEqual(draw.commands[0], ['spriteRegion', 1, 10, 20, 30, 16, 1, 2, 30, 16, 0, 0xffffffff]);
  clip.update(2); clip.draw(draw, 3, 4);
  assert.deepEqual(host.loads.map(call => call[0]), ['second.png', 'textures/first.png']); assert.equal(draw.commands[1][1], 2);
});

test('nonlooping clips hold their final frame and complete exactly once; reset restarts completion', () => {
  const atlas = new SpriteAtlas(pack(), adapter()); let completions = 0;
  const clip = new SpriteClip(atlas, 'spark', { onComplete: value => { assert.equal(value, clip); completions++; } });
  clip.update(5); assert.deepEqual(clip.snapshot(), { name: 'spark', index: 2, elapsed: 1, finished: false });
  clip.update(1); clip.update(999); assert.deepEqual(clip.snapshot(), { name: 'spark', index: 2, elapsed: 0, finished: true });
  assert.equal(completions, 1); clip.reset().update(6); assert.equal(completions, 2);
});

test('loop clips wrap at exact boundaries, support duration overrides and large integer advances', () => {
  const atlas = new SpriteAtlas(pack(), adapter()), clip = atlas.clip('spark', { frameDuration: 2, loop: true });
  clip.update(14); assert.deepEqual(clip.snapshot(), { name: 'spark', index: 1, elapsed: 0, finished: false });
  clip.update(1_000_000); assert.deepEqual(clip.snapshot(), { name: 'spark', index: 0, elapsed: 0, finished: false });
  const oneAtATime = atlas.clip('blink'), bulk = atlas.clip('blink');
  for (let i = 0; i < 137; i++) oneAtATime.update(); bulk.update(137);
  assert.deepEqual(oneAtATime.snapshot(), bulk.snapshot());
});

test('clips reject invalid time advances and cannot draw from a disposed atlas', () => {
  const atlas = new SpriteAtlas(pack(), adapter()), clip = atlas.clip('spark');
  for (const frames of [-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => clip.update(frames), RangeError);
  assert.throws(() => atlas.clip('spark', { frameDuration: 0 }), RangeError);
  assert.throws(() => atlas.clip('spark', { loop: 1 }), TypeError);
  atlas.dispose(); assert.throws(() => clip.draw(new DrawList(), 0, 0), /disposed/);
});
