import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, Stage, Keys, ReplayPlaybackController, ReplayPlayer, ReplayRecorder } from '../packages/thlib/dist/index.js';

test('Ctrl is held playback control: eight exact steps, immediate release, no default Shift acceleration', () => {
  const controller = new ReplayPlaybackController();
  let frames = 0;
  const step = () => frames++;
  assert.equal(controller.update(0, step), 1);
  assert.equal(controller.update(Keys.FAST_FORWARD, step), 8);
  assert.equal(controller.update(Keys.FAST_FORWARD, step), 8);
  assert.equal(controller.update(0, step), 1);
  assert.equal(controller.update(Keys.FOCUS, step), 1);
  assert.equal(frames, 19);
});

test('consumers can configure a control and integer rate without changing the shared default', () => {
  const controller = new ReplayPlaybackController({ fastForwardMask: Keys.FOCUS, fastForwardSteps: 3 });
  let frames = 0;
  assert.equal(controller.update(Keys.FAST_FORWARD, () => frames++), 1);
  assert.equal(controller.update(Keys.FOCUS, () => frames++), 3);
  assert.equal(frames, 4);
  assert.equal(new ReplayPlaybackController().fastForwardSteps, 8);
  assert.equal(new ReplayPlaybackController({ fastForwardMask: 0 }).update(Keys.FAST_FORWARD, () => {}), 1);
});

test('a paused replay neither steps nor queries consumer lifecycle callbacks', () => {
  const unexpected = () => assert.fail('Paused replay must not advance');
  assert.equal(new ReplayPlaybackController().update(Keys.FAST_FORWARD, unexpected,
    { paused: true, shouldContinue: unexpected }), 0);
});

test('every accelerated step checks the active scene, page and pause state', () => {
  const controller = new ReplayPlaybackController();
  const scene = {}, page = {};
  let activeScene = scene, activePage = page, paused = false, frames = 0;
  const shouldContinue = () => activeScene === scene && activePage === page && !paused;
  assert.equal(controller.update(Keys.FAST_FORWARD, () => {
    if (++frames === 3) activePage = {};
  }, { shouldContinue }), 3);
  assert.equal(controller.update(Keys.FAST_FORWARD, () => assert.fail('Old page consumed an input'), { shouldContinue }), 0);
  activePage = page; frames = 0;
  assert.equal(controller.update(Keys.FAST_FORWARD, () => {
    if (++frames === 2) activeScene = {};
  }, { shouldContinue }), 2);
  activeScene = scene; frames = 0;
  assert.equal(controller.update(Keys.FAST_FORWARD, () => {
    if (++frames === 4) paused = true;
  }, { shouldContinue }), 4);
});

test('EOF executes the completion notification once, with no leftover steps on its result page', () => {
  const recorder = new ReplayRecorder();
  for (let i = 0; i < 5; i++) recorder.record(Keys.RIGHT);
  const player = new ReplayPlayer(recorder.toJSON()), controller = new ReplayPlaybackController();
  let done = false, notifications = 0;
  const masks = [];
  const step = () => {
    const mask = player.next();
    if (mask === null) { done = true; notifications++; return; }
    masks.push(mask);
  };
  assert.equal(controller.update(Keys.FAST_FORWARD, step, { shouldContinue: () => !done }), 6);
  assert.deepEqual(masks, Array(5).fill(Keys.RIGHT));
  assert.equal(notifications, 1);
  assert.equal(controller.update(Keys.FAST_FORWARD, step, { shouldContinue: () => !done }), 0);
  assert.equal(notifications, 1);
});

test('step and lifecycle exceptions propagate immediately without consuming additional frames', () => {
  const controller = new ReplayPlaybackController(), error = new Error('Replay desync');
  let frames = 0;
  assert.throws(() => controller.update(Keys.FAST_FORWARD, () => {
    if (++frames === 3) throw error;
  }), value => value === error);
  assert.equal(frames, 3);
  let checks = 0;
  assert.throws(() => controller.update(Keys.FAST_FORWARD, () => frames++, { shouldContinue: () => {
    if (++checks === 2) throw error;
    return true;
  } }), value => value === error);
  assert.equal(frames, 4);
});

test('playback configuration rejects non-integer, zero and out-of-range values', () => {
  for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => new ReplayPlaybackController({ fastForwardSteps: value }), RangeError);
  for (const value of [-1, 1.5, NaN, Infinity, 0x100000000])
    assert.throws(() => new ReplayPlaybackController({ fastForwardMask: value }), RangeError);
});

test('Ctrl is excluded from version 1 recordings while legacy inputs and unknown-bit rejection are preserved', () => {
  const recorder = new ReplayRecorder();
  recorder.record(Keys.RIGHT | Keys.FAST_FORWARD);
  recorder.record(Keys.RIGHT);
  recorder.record(Keys.FAST_FORWARD);
  recorder.record(2047 | Keys.FAST_FORWARD);
  const data = recorder.toJSON();
  assert.equal(data.version, 1);
  assert.deepEqual(data.runs, [[Keys.RIGHT, 2], [0, 1], [2047, 1]]);
  const player = new ReplayPlayer(data);
  assert.deepEqual(Array.from({ length: 5 }, () => player.next()), [Keys.RIGHT, Keys.RIGHT, 0, 2047, null]);
  for (const invalid of [Keys.FAST_FORWARD, 4096, 0x80000000])
    assert.throws(() => new ReplayPlayer({ ...data, frames: 1, runs: [[invalid, 1]] }), /Invalid replay input run/);
  recorder.record(4096 | Keys.FAST_FORWARD);
  assert.equal(recorder.toJSON().runs.at(-1)[0], 4096, 'Recorder must not silently discard other unknown bits');
});

test('long accelerated playback preserves recorded focus, inputs and every deterministic checkpoint', () => {
  const makeGame = () => new Game({ seed: 42,
    stageFactory: () => new Stage({ autoFinish: false }) }).start();
  const original = makeGame();
  for (let frame = 0; frame < 2400; frame++) {
    const movement = frame % 120 < 60 ? Keys.RIGHT : Keys.LEFT;
    original.update(movement | Keys.SHOOT | (frame % 200 < 100 ? Keys.FOCUS : 0));
  }
  const recording = original.exportReplay(), expected = original.snapshot();
  assert.equal(recording.checkpoints.length, 8);
  const replay = makeGame(); replay.playReplay(recording);
  const controller = new ReplayPlaybackController();
  let updates = 0, verified = 0;
  while (replay.playback) {
    const oldPlayback = replay.playback;
    controller.update(Keys.FAST_FORWARD | Keys.UP | Keys.BOMB | Keys.PAUSE, () => {
      replay.update(0); // The simulation reads only ReplayPlayer.next(), never live control input.
      updates++;
      if (replay.playback && replay.playback.frame % 300 === 0) verified++;
    }, { shouldContinue: () => replay.playback === oldPlayback });
    if (replay.playback?.finished) assert.deepEqual(replay.snapshot(), expected);
  }
  assert.equal(updates, recording.frames + 1, 'Exactly one EOF notification follows the recorded frames');
  assert.equal(verified, 8);
  assert.equal(replay.state, 'replayComplete');
  assert.equal(replay.replayCompleted.desync, null);
});
