import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DrawList } from '@ts-stg/thlib';
import { AnmBank, TouhouBossEntrance, TouhouBossPresentation, TouhouRenderQueue,
  TOUHOU_BOSS_ENTRANCE_PRESETS } from '@ts-stg/thlib/touhou';

const bank = (name, source = false) => new AnmBank(JSON.parse(fs.readFileSync(new URL(
  `../${source ? 'games/touhou20/assets' : 'packages/thlib/assets/touhou-common'}/anm/${name}.json`, import.meta.url))), { loadTexture: () => 11 });
const hasReference = fs.existsSync(new URL('../games/touhou20/assets/anm/effect.json', import.meta.url)); // private local reference assets, absent in a clean checkout
const render = owner => { const draw = new DrawList(), queue = new TouhouRenderQueue(); owner.draw(queue, { x: 336, y: 24, scale: 1.5, screenScale: 1 }); queue.flush(draw); return draw.commands; };

test('source Boss entrance has four 200-particle streams, waits101 for its body, then lets the fog finish', () => {
  const sounds = [], revealed = [], completed = [], effect = bank('effect');
  const owner = new TouhouBossEntrance(effect, { x: 30, y: 128,
    sound: (...args) => sounds.push(args), onReveal: entrance => revealed.push(entrance.age), onComplete: entrance => completed.push(entrance.age) });
  assert.equal(owner.isHidden, true); assert.equal(owner.ready, false);
  assert.deepEqual(sounds, [[54, 30]]);
  assert.deepEqual(owner.roots.map(vm => [vm.scriptId, vm.rotation]), [[153, Math.fround(Math.PI / 2)], [157, 0], [158, Math.fround(Math.PI / 2)], [154, Math.fround(Math.PI)]]);
  owner.update(); assert.equal(owner.particles.length, 16);
  for (let frame = 1; frame < 50; frame++) owner.update();
  assert.deepEqual(owner.roots.map(vm => vm.attachedEffect.spawned), [200, 200, 200, 200]);
  assert.equal(owner.particles.length, 800);
  const commands = render(owner);
  assert.ok(commands.some(command => command[0] === 'statefulQuad' && command[17][3] === 'reverseSubtract'), 'black mist uses original subtractive ANM149');
  assert.ok(commands.some(command => command[0] === 'statefulQuad' && command[17][3] === 'add'), 'original complement glow uses additive ANM150');
  for (let frame = 50; frame < 100; frame++) owner.update();
  assert.equal(owner.ready, false); assert.deepEqual(revealed, []);
  owner.update(); assert.equal(owner.isHidden, false); assert.equal(owner.ready, true); assert.equal(owner.alive, true); assert.deepEqual(revealed, [101]);
  for (let frame = 101; frame < 240; frame++) owner.update();
  assert.equal(owner.alive, false); assert.equal(owner.particles.length, 0); assert.equal(completed.length, 1);
  assert.ok(completed[0] > 101); assert.ok(owner.roots.every(vm => !vm.alive));
});

test('entrance source149/150 positions, blend modes, colors and Hermite phases match the unfiltered bank through the full timeline', { skip: !hasReference }, () => {
  const source = bank('effect', true), shared = bank('effect'), follow = { x: -20, y: 128 };
  const roots = TOUHOU_BOSS_ENTRANCE_PRESETS.blackFog.streams.map(stream => source.create(stream.script, { ...follow, rotation: stream.rotation, front: true }));
  const owner = new TouhouBossEntrance(shared, { ...follow, follow });
  for (let frame = 0; frame <= 240; frame++) {
    if ([0, 1, 2, 10, 40, 50, 60, 61, 80, 100, 101, 120, 140, 170, 190, 210, 240].includes(frame))
      assert.deepEqual(render(owner), render(source), `source EffChargePoint2 pair frame${frame}`);
    // Also prove the public owner preserves moving-entry geometry. The
    // source's incoming particles sample their next endpoint from the Boss.
    follow.x = Math.fround(follow.x + .125);
    for (const root of roots) { root.x = follow.x; root.y = follow.y; }
    source.update(); owner.update();
  }
});

test('presentation owns detached fog once, keeps aura/warp inactive until explicitly enabled, and phase attachment never replays entry', () => {
  const banks = { effect: bank('effect'), front: bank('front'), ascii_960: bank('ascii_960') };
  const presentation = new TouhouBossPresentation({ banks, player: { x: 0, y: 400, bomb: null } });
  const boss = { x: 0, y: 128, hp: 2000, alive: true };
  presentation.enter(boss); const entrance = presentation.beginEntrance();
  const unrelated = banks.effect.create(14), detached = banks.effect.create(149, { detached: true });
  for (let frame = 0; frame < 60; frame++) presentation.update();
  assert.equal(unrelated.time, 1); assert.equal(entrance.age, 60); assert.equal(presentation.distortionReady, false);
  const auraDraw = new DrawList(); presentation.drawAura(auraDraw); assert.deepEqual(auraDraw.commands, []);
  const before = entrance.particles.map(vm => vm.snapshot()); banks.effect.updateDetached();
  assert.deepEqual(entrance.particles.map(vm => vm.snapshot()), before, 'consumer detached updater must not advance these owned particles twice');
  assert.equal(detached.time, 2);
  presentation.update({ paused: true }); assert.equal(entrance.age, 60);
  for (let frame = 60; frame < 101; frame++) presentation.update();
  assert.equal(presentation.bossVisible, true); assert.equal(presentation.entranceReady, true); assert.equal(presentation.distortionReady, false);
  presentation.startCombat(); presentation.setEffects({aura:true,distortion:true}); presentation.update(); assert.equal(presentation.distortionReady, true); assert.equal(presentation.bossEffectsVisible, true);
  presentation.enter(boss); assert.equal(presentation.entrance, entrance); assert.equal(entrance.age, 102);
  presentation.clearBoss(); assert.equal(entrance.alive, false); assert.equal(presentation.entrance, null);
  assert.equal(unrelated.alive, true); assert.equal(detached.alive, true);
  assert.ok(entrance.roots.length === 0);
});

test('fly-in stays visible without fog and lets a stage own movement and readiness; custom source stream recipes are injectable', () => {
  const effect = bank('effect'), boss = { x: -224, y: 64 }, sounds = [];
  const entry = new TouhouBossEntrance(effect, { mode: 'flyIn', follow: boss, readyFrame: 100, sound: id => sounds.push(id) });
  assert.equal(entry.isHidden, false); assert.equal(entry.ready, false); assert.deepEqual(entry.roots, []);
  for (let frame = 0; frame < 99; frame++) { boss.x++; entry.update(); }
  assert.equal(entry.ready, false); assert.equal(boss.x, -125, 'entry does not replace caller movement');
  entry.update(); assert.equal(entry.ready, true); assert.equal(entry.alive, false); assert.deepEqual(sounds, []);
  const immediate = new TouhouBossEntrance(effect, { mode: 'flyIn' }); assert.equal(immediate.ready, true); assert.equal(immediate.isHidden, false);
  const custom = new TouhouBossEntrance(effect, { streams: [{ script: 181, rotation: -1 }], revealFrame: 30, readyFrame: 40 });
  assert.equal(custom.roots[0].scriptId, 181); for (let i = 0; i < 30; i++) custom.update();
  assert.equal(custom.revealed, true); assert.equal(custom.ready, false); custom.destroy();
  assert.throws(() => new TouhouBossEntrance(effect, { revealFrame: 40, readyFrame: 30 }), /integer frames/);
});

for (const combatFrame of [102, 320]) test(`presentation defers aura108 RNG until the explicit effect signal at frame${combatFrame}`, { skip: !hasReference }, () => {
  const source = bank('effect', true), banks = { effect: bank('effect'), front: bank('front'), ascii_960: bank('ascii_960') };
  const boss = { x: 18, y: 128, hp: 1000 }, presentation = new TouhouBossPresentation({ banks });
  presentation.enter(boss); const entrance = presentation.beginEntrance();
  const roots = TOUHOU_BOSS_ENTRANCE_PRESETS.blackFog.streams.map(stream => source.create(stream.script,
    { x: boss.x, y: boss.y, rotation: stream.rotation, front: true }));
  let aura = [];
  assert.equal(banks.effect.rng.state, source.rng.state, 'binding the Boss must not consume the three aura105 random reads');
  assert.equal(banks.effect.rng.state, 1); assert.deepEqual(presentation.aura, []);
  const initialRandom = banks.effect.rng.state; presentation.drawAura(new DrawList());
  assert.equal(banks.effect.rng.state, initialRandom, 'rendering cannot create animations or alter RNG');
  for (let frame = 1; frame <= combatFrame + 140; frame++) {
    source.update();
    if (frame === combatFrame) {
      aura = [99, 108].map(script => source.create(script, { x: boss.x, y: boss.y, front: true }));
      presentation.startCombat(); presentation.setEffects({aura:true,distortion:true});
    }
    presentation.update();
    assert.equal(banks.effect.rng.state, source.rng.state, `entire effect bank RNG source frame${frame}`);
    assert.deepEqual(entrance.particles.map(vm => vm.snapshot()),
      roots.flatMap(root => root.attachedEffect.particles.map(particle => particle.vm)).filter(vm => vm.alive).map(vm => vm.snapshot()),
      `all fog geometry source frame${frame}`);
    assert.deepEqual(presentation.aura.map(vm => vm.snapshot()), aura.map(vm => vm.snapshot()), `source aura birth/update frame${frame}`);
    if (frame < combatFrame) {
      assert.deepEqual(presentation.aura, []); assert.equal(presentation.distortionReady, false);
      assert.equal(presentation.distortion.currentRadius, 16, 'an arbitrarily long dialogue does not tick the combat warp');
    }
    if (frame === combatFrame) assert.equal(presentation.aura[0].time, 1, 'new root already ran frame0 and must not be updated twice');
    if (frame === combatFrame + 1) assert.equal(presentation.aura[0].time, 2);
    if ([1, 50, 101, 102, 150, 240].includes(frame)) {
      const random = banks.effect.rng.state, queue = new TouhouRenderQueue(); presentation.draw(queue); queue.flush(new DrawList());
      assert.equal(banks.effect.rng.state, random, `draw has no RNG or spawn side effects frame${frame}`);
    }
  }
  assert.equal(entrance.age, 192); presentation.destroy();
});

test('zero-frame entrance callbacks observe assigned ownership and cannot resurrect a cancelled or replaced entrance', () => {
  const effect = bank('effect'), callbacks = []; let standalone;
  standalone = new TouhouBossEntrance(effect, { mode: 'flyIn', onReveal: entry => callbacks.push(['reveal', entry === standalone, entry.age, entry.ready]),
    onComplete: entry => callbacks.push(['complete', entry === standalone, entry.age, entry.ready]) });
  assert.equal(standalone.ready, true); assert.deepEqual(callbacks, []);
  standalone.update(); standalone.update(); assert.deepEqual(callbacks, [['reveal', true, 0, true], ['complete', true, 0, true]]);
  const banks = { effect, front: bank('front'), ascii_960: bank('ascii_960') };
  const presentation = new TouhouBossPresentation({ banks }), boss = { x: 0, y: 128, hp: 100 };
  presentation.enter(boss); const events = [];
  const immediate = presentation.beginEntrance({ mode: 'flyIn', onReveal: entry => events.push(['reveal', presentation.entrance === entry]),
    onComplete: entry => events.push(['complete', presentation.entrance === entry]) });
  assert.equal(presentation.entrance, immediate); assert.deepEqual(events, [['reveal', true], ['complete', true]]);
  let cancelledCompletion = 0;
  const cancelled = presentation.beginEntrance({ mode: 'flyIn', onReveal: () => presentation.clearBoss(), onComplete: () => cancelledCompletion++ });
  assert.equal(cancelled.cancelled, true); assert.equal(presentation.entrance, null); assert.equal(presentation.boss, null);
  assert.equal(cancelledCompletion, 0);
  presentation.enter(boss); let replacement;
  const replaced = presentation.beginEntrance({ mode: 'flyIn', onReveal: () => { replacement = presentation.beginEntrance({ mode: 'flyIn', readyFrame: 30 }); },
    onComplete: () => cancelledCompletion++ });
  assert.equal(replaced.cancelled, true); assert.equal(presentation.entrance, replacement); assert.equal(cancelledCompletion, 0);
  assert.equal(replacement.ready, false); presentation.update(); assert.equal(replacement.age, 1);
  const replacedOnComplete = presentation.beginEntrance({ mode: 'flyIn', onComplete: () => { replacement = presentation.beginEntrance({ mode: 'flyIn', readyFrame: 20 }); } });
  assert.equal(replacedOnComplete.cancelled, true); assert.equal(presentation.entrance, replacement);
  assert.equal(replacement.readyFrame, 20); presentation.destroy();
});

test('a delayed reveal callback may cancel or destroy presentation without later updates or completion notifications', () => {
  const make = () => new TouhouBossPresentation({ banks: { effect: bank('effect'), front: bank('front'), ascii_960: bank('ascii_960') } });
  for (const action of ['clearBoss', 'destroy']) {
    const presentation = make(); presentation.enter({ x: 0, y: 128, hp: 100 }); let completions = 0;
    const timing = action === 'destroy' ? { mode: 'blackFog', revealFrame: 101, readyFrame: 101 } : { mode: 'flyIn', revealFrame: 2, readyFrame: 2 };
    const entry = presentation.beginEntrance({ ...timing,
      onReveal: () => presentation[action](), onComplete: () => completions++ });
    for (let frame = 0; frame < timing.revealFrame; frame++) presentation.update();
    assert.equal(entry.cancelled, true); assert.equal(presentation.entrance, null); assert.equal(completions, 0);
    assert.deepEqual(presentation.aura, []); presentation.destroy();
  }
});
