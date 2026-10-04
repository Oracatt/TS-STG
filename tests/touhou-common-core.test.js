import test from 'node:test';
import assert from 'node:assert/strict';
import * as shared from '@ts-stg/thlib/touhou';
import * as legacy from '../games/touhou20/src/index.js';
import { Keys } from '@ts-stg/thlib';

test('original game compatibility names refer to the public restored class objects', () => {
  for (const name of ['Player', 'Shot', 'ReimuBomb', 'MarisaBomb', 'Items', 'Enemy', 'Motion', 'BulletField', 'LaserField',
    'ShortLine', 'GrazeEffects', 'RenderMesh', 'StageDistortion', 'EnemyDistortion', 'BitmapFont', 'Health',
    'DamageAccumulator', 'RenderQueue', 'PauseCapture', 'Spell', 'Audio', 'Timer', 'RNG']) {
    assert.equal(legacy[`Th20${name}`], shared[`Touhou${name}`], name);
    assert.equal(typeof shared[`Touhou${name}`], 'function', name);
  }
  assert.equal(legacy.AnmBank, shared.AnmBank);
  assert.equal(legacy.AnmInstance, shared.AnmInstance);
});

const player = (character = 0, options = {}) => new shared.TouhouPlayer({ character,
  sht: shared.getTouhouPlayerData(character), bounds: { x: -320, y: -240, width: 640, height: 480 },
  movementInsets: { left: 8, top: 8, right: 8, bottom: 8 }, respawnY: 200, respawnStartY: 280,
  x: 0, y: 200, power: 400, ...options });

test('public restored playfield configuration governs movement, respawn, shots and items', () => {
  const p = player();
  for (let i = 0; i < 200; i++) p.update(Keys.RIGHT | Keys.UP);
  assert.equal(p.x, 312); assert.equal(p.y, -232);
  p.state = 0; p.timer.set(60); p.update(0);
  assert.equal(p.y, 200); assert.equal(p.state, 1);
  const shot = new shared.TouhouShot(p, p.sht.patterns[4][0], 4, 0, {});
  shot.x = 250; shot.y = -100; assert.equal(shot.outside(), false);
  shot.y = -400; assert.equal(shot.outside(), true);
  const items = new shared.TouhouItems({ player: p });
  p.setPosition(0, 200);
  const item = items.spawn({ type: 'power', x: 300, y: 0, speed: 0 });
  assert.equal(item.x, 300); items.update(); assert.equal(item.state, 1);
  item.y = 300; items.update(); assert.equal(items.items.length, 0);
});

test('both common character records drive the restored weapon and Bomb owners', () => {
  for (const character of [0, 1]) {
    const p = player(character);
    for (let frame = 0; frame < 40; frame++) p.update(Keys.SHOOT);
    assert.ok(p.shots.length); assert.ok(p.shots.every(shot => shot instanceof shared.TouhouShot));
    p.update(Keys.BOMB);
    assert.ok(p.bomb instanceof (character ? shared.TouhouMarisaBomb : shared.TouhouReimuBomb));
    assert.equal(p.sht.patterns.length, 15);
  }
});

test('public animation data rejects excluded scripts and sprite remapping', () => {
  const instructions = [{ opcode: 0, args: [], time: 0, mask: 0, offset: 0, size: 8 },
    { opcode: -1, args: [], time: 0, mask: 0, offset: 8, size: 0 }];
  const data = { format: 'touhou-anm-v8', name: 'common-test', entries: [], sprites: [{ excluded: true }],
    scripts: [{ excluded: true, instructions }, { instructions }] };
  const bank = new shared.AnmBank(data);
  assert.throws(() => bank.create(0), /Excluded ANM/);
  assert.equal(bank.instances.length, 0); assert.equal(bank.nextId, 1);
  const vm = bank.create(1, { spriteRemap: () => 0 });
  assert.throws(() => vm.setSprite(0), /Excluded ANM sprite/);
  assert.throws(() => vm.setSprite(12, true), /Excluded ANM sprite/);
});

test('restored sound queue can pan over a consumer playfield without changing volume arithmetic', () => {
  const calls = [];
  const audio = new shared.TouhouAudio({ definitions: [{ id: 1, fileIndex: 0, volume: -1000, playFlags: 0 }],
    files: [{ path: 'sound.wav' }] }, { load: () => 7, play: (id, settings) => calls.push({ id, ...settings }) }, { panRange: 320 });
  audio.request(1, 160); audio.flush();
  assert.deepEqual(calls, [{ id: 7, attenuation: -1000, pan: 500, loop: false }]);
});
