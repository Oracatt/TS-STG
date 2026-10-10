import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DrawList } from '../packages/thlib/dist/index.js';
import { Keys } from '../packages/thlib/dist/input.js';
import { AnmBank } from '../packages/thlib/dist/touhou/anm.js';
import { TouhouRenderQueue } from '../packages/thlib/dist/touhou/render-queue.js';
import { TouhouStageClear, TOUHOU_STAGE_CLEAR_PRESET } from '../packages/thlib/dist/touhou/stage-clear.js';
import { TouhouStageTransition, TOUHOU_STAGE_TRANSITION_PRESET } from '../packages/thlib/dist/touhou/stage-transition.js';

test('stage clear awards once, rejects held confirmation and observes source120 minimum plus10-frame exit', () => {
  const events = [], clear = new TouhouStageClear({ bonus: 100000, initialMask: Keys.SHOOT,
    onAward(value, owner) { events.push(['award', value, owner.age]); },
    onDismiss(owner) { events.push(['dismiss', owner.age]); },
    onComplete(owner) { events.push(['complete', owner.exitAge, owner.completed]); } });
  for (let i = 0; i < 120; i++) clear.update(Keys.SHOOT);
  assert.deepEqual(events, [['award', 100000, 0]]); assert.equal(clear.phase, 'display');
  clear.update(0); clear.update(Keys.SHOOT);
  assert.deepEqual(events.at(-1), ['dismiss', 122]); assert.equal(clear.exitAge, 0);
  for (let i = 0; i < 9; i++) clear.update();
  assert.equal(clear.alive, true); clear.update();
  assert.deepEqual(events.at(-1), ['complete', 10, true]);
  const snapshot = clear.snapshot(); clear.update(Keys.CONFIRM); clear.finish(); clear.dismiss();
  assert.deepEqual(clear.snapshot(), snapshot); assert.equal(events.length, 3);
});

test('source stage-clear confirmation first succeeds at120 and automatic dismissal occurs at300', () => {
  const early = new TouhouStageClear();
  for (let i = 0; i < 118; i++) early.update();
  early.update(Keys.CONFIRM); assert.equal(early.phase, 'display');
  early.update(); early.update(Keys.CONFIRM); assert.equal(early.phase, 'exit');
  const exact = new TouhouStageClear(); for (let i = 0; i < 119; i++) exact.update();
  exact.update(Keys.CONFIRM); assert.equal(exact.age, 120); assert.equal(exact.phase, 'exit');
  const auto = new TouhouStageClear(); for (let i = 0; i < 299; i++) auto.update();
  assert.equal(auto.phase, 'display'); auto.update(); assert.equal(auto.phase, 'exit');
  for (let i = 0; i < 10; i++) auto.update(); assert.equal(auto.completed, true);
  assert.equal(TOUHOU_STAGE_CLEAR_PRESET.musicFadeSeconds, 2);
});

test('common STAGE CLEAR preset retains source ANM111 delayed fade and is a reusable resource', { skip: !fs.existsSync('games/demo/assets/anm/front.json') }, () => {
  const load = path => new AnmBank(JSON.parse(fs.readFileSync(new URL(path, import.meta.url))), { loadTexture: () => 1 });
  const source = load('../games/demo/assets/anm/front.json');
  const common = load('../packages/thlib/assets/touhou-common/anm/front.json');
  assert.equal(common.data.scripts[111].excluded, undefined);
  const owner = new TouhouStageClear({ bank: common }), expected = source.create(111);
  for (let frame = 0; frame <= 119; frame++) {
    assert.equal(owner.panel.alpha, expected.alpha, `heading alpha at${frame}`);
    assert.equal(owner.panel.alive, expected.alive, `heading lifetime at${frame}`);
    owner.update(); expected.update();
  }
  owner.dismiss(); assert.equal(owner.panel.alive, false);
});

test('stage-clear score rows are game-supplied and destruction never advances the stage', () => {
  const text = [], events = [], rows = [{ label: 'Graze', value: 30 }];
  const clear = new TouhouStageClear({ bonus: 123456, rows,
    font: { draw(_draw, value, style) { text.push([value, style.drawPriority]); } },
    onComplete() { events.push('complete'); } });
  rows[0].label = 'changed'; clear.draw(new DrawList());
  assert.deepEqual(text, [['Graze  30', 86], ['Clear Bonus  123,456', 86]]);
  clear.destroy(); for (let i = 0; i < 400; i++) clear.update(); assert.deepEqual(events, []);
  assert.equal(clear.completed, false);
});

test('normal stage transition covers its background30 frames, swaps once at black and reveals30 frames', () => {
  const events = [], transition = new TouhouStageTransition({
    onCovered(owner) { events.push(['covered', owner.frame, owner.alpha, owner.phase]); },
    onComplete(owner) { events.push(['complete', owner.frame, owner.alpha]); },
  });
  assert.equal(transition.alpha, 0);
  for (let i = 0; i < 15; i++) transition.update(); assert.equal(transition.alpha, 127);
  for (let i = 0; i < 15; i++) transition.update();
  assert.deepEqual(events, [['covered', 30, 255, 'reveal']]);
  for (let i = 0; i < 15; i++) transition.update(); assert.equal(transition.alpha, 127);
  for (let i = 0; i < 15; i++) transition.update();
  assert.deepEqual(events.at(-1), ['complete', 60, 0]);
  const snapshot = transition.snapshot(); transition.update(); assert.deepEqual(transition.snapshot(), snapshot);
  assert.deepEqual(TOUHOU_STAGE_TRANSITION_PRESET, { coverFrames: 30, revealFrames: 30, drawPriority: 10 });
});

test('transition overlay is queued behind the player and HUD instead of covering the entire composed application', () => {
  const transition = new TouhouStageTransition(), queue = new TouhouRenderQueue(), draw = new DrawList();
  for (let i = 0; i < 15; i++) transition.update();
  queue.enqueuePriority(3, target => target.rect(1, 0, 1, 1, 0));
  queue.enqueuePriority(30, target => target.rect(3, 0, 1, 1, 0));
  queue.enqueuePriority(84, target => target.rect(4, 0, 1, 1, 0));
  transition.draw(queue, { x: 2, y: 24, width: 576, height: 672 }); queue.flush(draw);
  assert.deepEqual(draw.commands.filter(c => c[0] === 'rect').map(c => c[1]), [1, 2, 3, 4]);
  assert.deepEqual(draw.commands.find(c => c[0] === 'rect' && c[1] === 2), ['rect', 2, 24, 576, 672, 127]);
});

test('stage flow supports a headless custom duration and validates invalid inputs before use', () => {
  let covered = 0, complete = 0;
  const transition = new TouhouStageTransition({ coverFrames: 2, revealFrames: 3,
    onCovered() { covered++; }, onComplete() { complete++; } });
  transition.update(); transition.destroy(); transition.update(); assert.equal(covered, 0); assert.equal(complete, 0);
  const clear = new TouhouStageClear({ minFrames: 0, autoFrames: 1, exitFrames: 0 });
  clear.update(); assert.equal(clear.completed, true);
  for (const options of [{ coverFrames: 0 }, { revealFrames: .5 }, { onCovered: 3 }]) assert.throws(() => new TouhouStageTransition(options));
  for (const options of [{ minFrames: -1 }, { autoFrames: 119 }, { bonus: NaN }, { bonus: -1 },
    { rows: [{ label: 'invalid', value: Infinity }] }, { onAward: 1 }]) assert.throws(() => new TouhouStageClear(options));
});
