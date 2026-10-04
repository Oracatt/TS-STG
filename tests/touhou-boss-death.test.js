import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DrawList } from '@ts-stg/thlib';
import { AnmBank, TouhouBossDeath, TouhouBossPresentation, TouhouScreenShake,
  TouhouRenderQueue, TouhouGameplayCompositor, TouhouPlayer, TouhouEnemy, getTouhouPlayerData,
  TOUHOU_BOSS_DEATH_PRESET } from '@ts-stg/thlib/touhou';

const bank = (name, source = false) => new AnmBank(JSON.parse(fs.readFileSync(new URL(
  `../${source ? 'games/touhou20/assets' : 'packages/thlib/assets/touhou-common'}/anm/${name}.json`, import.meta.url))), { loadTexture: () => 11 });
const all = roots => roots.flatMap(vm => [vm, ...all(vm.children)]);
const render = roots => { const draw = new DrawList(), queue = new TouhouRenderQueue(); for (const root of roots) root.draw(queue, { x: 336, y: 24, scale: 1.5 }); queue.flush(draw); return draw.commands; };

test('Boss death waits 60 source frames, samples final position, emits source25/57 and retires the complete ANM tail', () => {
  const sounds = [], shakes = [], follow = { x: -40, y: 110 }, effect = bank('effect'); let callbacks = 0;
  const death = new TouhouBossDeath(effect, { x: follow.x, y: follow.y, follow,
    sound: (...args) => sounds.push(args), shake: (...args) => shakes.push(args), onBurst: () => callbacks++ });
  assert.deepEqual(sounds, [[5, -40]]); assert.equal(death.roots.length, 0);
  for (let i = 0; i < 59; i++) death.update();
  assert.equal(death.burst, false); follow.x = 12; follow.y = 134; death.update();
  assert.equal(death.burst, true); assert.equal(callbacks, 1);
  assert.deepEqual(death.roots.map(vm => vm.scriptId), [25, 57]);
  assert.deepEqual(death.position, { x: 12, y: 134, z: 0 });
  assert.deepEqual(sounds, [[5, -40], [5, 12]]); assert.deepEqual(shakes, [[30, 12, 0]]);
  follow.x = 100; follow.y = 200;
  for (let i = 0; i < 191; i++) death.update();
  assert.equal(death.alive, true); assert.deepEqual(death.position, { x: 12, y: 134, z: 0 });
  death.update(); assert.equal(death.alive, false); assert.equal(callbacks, 1);
  assert.deepEqual(death.roots, []); assert.deepEqual(TOUHOU_BOSS_DEATH_PRESET.shake, [30, 12, 0]);
});

test('Boss inversion uses the identical child preset as player death while ordinary enemies retain their own bursts', () => {
  const effect = bank('effect'), death = new TouhouBossDeath(effect, { delayFrames: 0 });
  const player = new TouhouPlayer({ sht: getTouhouPlayerData(0), effectBank: effect }); player.beginDeath({});
  const playerInversion = player.effects[0].animation.children.find(vm => vm.scriptId === 25);
  assert.ok(playerInversion); assert.deepEqual(death.roots[0].children.map(vm => vm.scriptId), playerInversion.children.map(vm => vm.scriptId));
  const minors = [0, 5, 10, 15, 25, 30, 35, 40, 53, 56, 94, 99, 109].map(script => new TouhouEnemy({ bank: bank('enemy'), script, deathBank: effect }));
  for (const enemy of minors) {
    enemy.defeat(null, {});
    assert.ok(!all(enemy.effects).some(vm => vm.scriptId === 25 || vm.B(0x499) === 4), `minor enemy base script ${enemy.script}`);
  }
  const at = new Map();
  for (let frame = 0; frame <= 75; frame++) {
    if ([0, 4, 5, 24, 25, 74, 75].includes(frame)) at.set(frame, death.roots.find(vm => vm.scriptId === 25)?.children.map(vm => vm.scriptId) ?? []);
    for (const vm of all(death.roots).filter(vm => vm.B(0x499) === 4)) { assert.equal(vm.layer, 21); assert.equal(vm.drawPriority, 50); assert.equal(vm.renderType, 17); }
    death.update();
  }
  assert.deepEqual(at.get(0), [26]); assert.deepEqual(at.get(4), [26]);
  assert.deepEqual(at.get(5), [26, 30, 28, 29, 27]); assert.deepEqual(at.get(24), at.get(5));
  assert.deepEqual(at.get(25), [26, 30, 28, 29, 27, 26]); assert.equal(at.get(74).length, 6); assert.deepEqual(at.get(75), []);
});

test('shared death draws the exact unfiltered effect25/57 command stream at every key ANM birth and finish', () => {
  const source = bank('effect', true), shared = bank('effect'), roots = [25, 57].map(script => source.create(script, { x: -40, y: 120, front: true }));
  const death = new TouhouBossDeath(shared, { x: -40, y: 120, delayFrames: 0 });
  for (let frame = 0; frame <= 193; frame++) {
    if ([0, 1, 2, 5, 8, 25, 30, 50, 74, 75, 90, 92, 192, 193].includes(frame)) {
      assert.deepEqual(render(death.roots), render(roots), `source BossDead ECL307 roots frame ${frame}`);
      if (frame === 8) assert.ok(render(death.roots).some(command => command[0] === 'blendFactors' && command[1] === 'oneMinusDstColor' && command[2] === 'oneMinusSrcColor'));
    }
    death.update(); for (const root of roots) if (root.alive) root.update();
  }
});

test('Boss presentation preserves death roots after clearBoss, pauses them, and never starts inversion for card completion', () => {
  const banks = { effect: bank('effect'), front: bank('front'), ascii_960: bank('ascii_960') };
  const owner = new TouhouBossPresentation({ banks, player: { x: 0, y: 400, bomb: null }, spellOptions: { playback: true } });
  const boss = { x: 40, y: 120, hp: 1 }; owner.enter(boss); owner.beginSpell({ duration: 600 }); owner.finishSpell({ captured: false });
  assert.equal(owner.hasDeathEffects, false);
  const unrelated = banks.effect.create(14), death = owner.beginDeath({ delayFrames: 0 }); owner.clearBoss();
  const state = JSON.stringify(death.snapshot()); owner.update({ paused: true }); assert.equal(JSON.stringify(death.snapshot()), state);
  owner.update({ boss: null }); assert.equal(death.age, 1); assert.equal(owner.hasDeathEffects, true); assert.equal(unrelated.time, 1);
  const draw = new DrawList(); owner.drawDeath(draw); assert.ok(draw.commands.length > 0);
  owner.destroy(); assert.equal(death.alive, false); assert.equal(unrelated.alive, true);
});

test('source mode1 shake advances before choosing independent signed axes and resets at frame30', () => {
  const values = [0, 1, 2, 0], rng = { next: () => values.shift() ?? 1 };
  const shake = new TouhouScreenShake({ rng }); shake.update();
  assert.equal(shake.amplitude, Math.fround(11.6)); assert.equal(shake.x, 0); assert.equal(shake.y, shake.amplitude);
  shake.update(); assert.equal(shake.amplitude, Math.fround(11.2)); assert.equal(shake.x, -shake.amplitude); assert.equal(shake.y, 0);
  for (let i = 2; i < 30; i++) shake.update();
  assert.equal(shake.alive, false); assert.deepEqual([shake.x, shake.y], [0, 0]);
});

test('shake offsets source quad paths once; projected type8, colored fans, screen HUD, scissors and target copies remain fixed', () => {
  const compositor = new TouhouGameplayCompositor({ renderTarget: 71, compositeTarget: 72 }), queue = new TouhouRenderQueue(), draw = new DrawList();
  const vertices = [[20, 30, 0, 0, 0xffffffff]], matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const frozen = JSON.stringify({ vertices, matrix });
  for (const priority of [5, 13, 30, 50, 63, 65, 68, 81, 84, 98]) queue.enqueuePriority(priority, target => target.rect(priority, 100, 1, 1, 0xffffffff));
  queue.enqueuePriority(30, target => { target.mesh(11, vertices, [0]); target.mesh3d(12, vertices, [0], matrix);
    target.mesh(14, [vertices[0], vertices[0], vertices[0], vertices[0]], [0, 1, 2, 1, 3, 2]);
    target.mesh(0, [vertices[0], vertices[0], vertices[0], vertices[0]], [0, 1, 2, 1, 3, 2]);
    target.statefulQuad(13, [], 1, 2, 1.5, 336, 24, 0, 0, 1, 1, 0, 0, 0, 0, false, []); });
  compositor.draw(draw, queue, { cameraOffset: { x: 4, y: -2 }, drawBackground: target => target.rect(3, 100, 1, 1, 0xffffffff),
    drawDistortion: target => target.sprite(15, 100, 120, 40, 50) });
  assert.equal(JSON.stringify({ vertices, matrix }), frozen);
  assert.deepEqual(draw.commands.filter(command => command[0] === 'rect' && command[3] === 1).map(command => command.slice(1, 3)),
    [[9, 97], [5, 100], [19, 97], [36, 97], [56, 97], [63, 100], [65, 100], [68, 100], [87, 97], [84, 100], [98, 100]]);
  assert.deepEqual(draw.commands.find(command => command[0] === 'mesh' && command[1] === 11)[2], vertices);
  assert.deepEqual(draw.commands.find(command => command[0] === 'mesh' && command[1] === 14)[2][0], [26, 27, 0, 0, 0xffffffff]);
  assert.deepEqual(draw.commands.find(command => command[0] === 'mesh' && command[1] === 0)[2][0], vertices[0]);
  const projected = draw.commands.find(command => command[0] === 'mesh3d')[4];
  assert.deepEqual(projected, matrix);
  assert.deepEqual(draw.commands.find(command => command[0] === 'statefulQuad').slice(6, 8), [342, 21]);
  for (const command of draw.commands.filter(command => command[0] === 'sprite')) assert.deepEqual(command.slice(2, 4), command[1] === 15 ? [100, 120] : [480, 360]);
  for (const command of draw.commands.filter(command => command[0] === 'scissor')) assert.ok(command[1] === 24 || command[1] === 48);
});
