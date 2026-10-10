import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DrawList } from '@ts-stg/thlib';
import { AnmBank, TouhouBossEntrance, TouhouBossPresentation, TouhouRenderQueue,
  TOUHOU_BOSS_ENTRANCE_PRESETS } from '@ts-stg/thlib/touhou';

const bank = (name, source = false) => new AnmBank(JSON.parse(fs.readFileSync(new URL(
  `../${source ? 'games/demo/assets' : 'packages/thlib/assets/touhou-common'}/anm/${name}.json`, import.meta.url))), { loadTexture: () => 11 });
const hasReference = fs.existsSync(new URL('../games/demo/assets/anm/effect.json', import.meta.url)); // private local reference assets, absent in a clean checkout
const render = owner => {
  const draw = new DrawList(), queue = new TouhouRenderQueue();
  owner.draw(queue, { x: 336, y: 24, scale: 1.5, screenScale: 1 }); queue.flush(draw);
  return draw.commands;
};

// Independent ECL arguments: EffChargePoint3(1.5707964f, -0.5235988f, 8, 2, 8, 10).
const sourceStreams = [
  { script: 153, rotation: 1.0471975803375244 },
  { script: 159, rotation: 1.5707963705062866 },
  { script: 161, rotation: 2.094395160675049 },
];

test('halfFog uses the three original streams, keeps the body visible and requests sound54 once', () => {
  const banks = { effect: bank('effect'), front: bank('front'), ascii_960: bank('ascii_960') };
  const boss = { x: -224, y: 64, hp: 2000, alive: true }, sounds = [];
  const presentation = new TouhouBossPresentation({ banks });
  presentation.enter(boss);
  const entrance = presentation.beginEntrance({ mode: 'halfFog', x: boss.x, y: boss.y,
    follow: boss, sound: (...args) => sounds.push(args) });
  assert.deepEqual(TOUHOU_BOSS_ENTRANCE_PRESETS.halfFog.streams, sourceStreams);
  assert.deepEqual(entrance.roots.map(vm => ({ script: vm.scriptId, rotation: vm.rotation })), sourceStreams);
  assert.deepEqual(sounds, [[54, -224]]);
  assert.equal(entrance.revealFrame, 0); assert.equal(entrance.readyFrame, 0);
  assert.equal(entrance.isHidden, false); assert.equal(entrance.ready, true);
  let drawn = 0;
  for (let frame = 0; frame < 200; frame++) {
    assert.equal(presentation.bossVisible, true);
    presentation.drawBody(new DrawList(), () => drawn++);
    presentation.update();
  }
  assert.equal(drawn, 200); assert.deepEqual(sounds, [[54, -224]]);
});

test('halfFog readiness does not truncate its 600-particle source tail or move the actor', () => {
  const boss = { x: -224, y: 64 }, completed = [];
  const entrance = new TouhouBossEntrance(bank('effect'), { mode: 'halfFog', follow: boss,
    readyFrame: 60, onComplete: value => completed.push(value.age) });
  for (let frame = 0; frame < 50; frame++) entrance.update();
  assert.deepEqual(entrance.roots.map(vm => vm.attachedEffect.spawned), [200, 200, 200]);
  assert.equal(entrance.particles.length, 600); assert.equal(entrance.ready, false);
  for (let frame = 50; frame < 60; frame++) entrance.update();
  assert.equal(entrance.ready, true); assert.equal(entrance.alive, true);
  assert.equal(entrance.particles.length, 600); assert.deepEqual(completed, []);
  const commands = render(entrance);
  assert.ok(commands.some(command => command[0] === 'statefulQuad' && command[17][3] === 'reverseSubtract'));
  assert.ok(commands.some(command => command[0] === 'statefulQuad' && command[17][3] === 'add'));
  while (entrance.alive && entrance.age < 240) entrance.update();
  assert.deepEqual(completed, [192]); assert.equal(entrance.particles.length, 0);
  assert.deepEqual(boss, { x: -224, y: 64 });
  entrance.update(); assert.deepEqual(completed, [192]);
});

test('halfFog matches the unfiltered original ANM while following a moving actor through its full tail', { skip: !hasReference }, () => {
  const source = bank('effect', true), common = bank('effect'), boss = { x: -224, y: 64 };
  const sourceRoots = sourceStreams.map(stream => source.create(stream.script,
    { ...boss, rotation: stream.rotation, front: true }));
  const entrance = new TouhouBossEntrance(common, { mode: 'halfFog', ...boss, follow: boss, readyFrame: 60 });
  for (let frame = 0; frame <= 200; frame++) {
    assert.deepEqual(render(entrance), render(source), `EffChargePoint3 geometry at frame ${frame}`);
    assert.equal(common.rng.state, source.rng.state, `EffChargePoint3 RNG at frame ${frame}`);
    if (frame < 60) { boss.x = Math.fround(boss.x + 3.5); boss.y = Math.fround(boss.y + .75); }
    for (const root of sourceRoots) { root.x = boss.x; root.y = boss.y; }
    source.update(); entrance.update();
  }
  assert.equal(entrance.completed, true);
});
