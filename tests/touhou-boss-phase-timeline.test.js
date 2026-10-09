import test from 'node:test';
import assert from 'node:assert/strict';
import { TouhouBossPhaseTimeline } from '../packages/thlib/dist/touhou/boss-phase-timeline.js';

test('phase preparation and pattern lead-in share one fixed frame clock', () => {
  const events = [];
  const timeline = new TouhouBossPhaseTimeline({ attackStartFrame: 180, patternLeadIn: 75,
    cues: [{ frame: 120, kind: 'attack-charge' }, { frame: 0, kind: 'prepare' }, { frame: 90, kind: 'release' }],
    onCue: (cue, owner) => events.push([cue.kind, owner.frame]) });
  assert.deepEqual(events, [['prepare', 0]]);
  assert.equal(timeline.patternStartFrame, 105);
  for (let i = 0; i < 104; i++) timeline.update();
  assert.equal(timeline.patternReady, false);
  timeline.update(); assert.equal(timeline.patternReady, true); assert.equal(timeline.attackStarted, false);
  for (let i = 105; i < 179; i++) timeline.update();
  assert.equal(timeline.attackStarted, false);
  timeline.update(); assert.equal(timeline.attackStarted, true);
  assert.deepEqual(events, [['prepare', 0], ['release', 90], ['attack-charge', 120]]);
  timeline.dispatchCues(); timeline.update();
  assert.equal(events.length, 3, 'rendering or explicit dispatch cannot replay a cue');
  assert.deepEqual(timeline.snapshot(), { frame: 181, attackStartFrame: 180, patternLeadIn: 75,
    patternStartFrame: 105, patternReady: true, attackStarted: true, cuesDispatched: 3 });
});

test('zero-duration phases, same-frame cue order and reset are deterministic', () => {
  const events = [], cues = [{ frame: 0, name: 'a' }, { frame: 0, name: 'b' }, { frame: 1, name: 'c' }];
  const timeline = new TouhouBossPhaseTimeline({ cues, onCue: cue => events.push(cue.name) });
  cues[0].name = 'changed'; cues.push({ frame: 0, name: 'late' });
  assert.equal(timeline.patternReady, true); assert.equal(timeline.attackStarted, true);
  timeline.update(); timeline.reset();
  assert.deepEqual(events, ['a', 'b', 'c', 'a', 'b']);
  assert.equal(timeline.frame, 0);
  timeline.reset({ attackStartFrame: 10, patternLeadIn: 20, cues: [], onCue: null });
  assert.equal(timeline.patternStartFrame, 0); assert.equal(timeline.patternReady, true);
  assert.equal(timeline.attackStarted, false);
});

test('a cue may replace its timeline without leaking pending cues from the previous phase', () => {
  const events = [];
  new TouhouBossPhaseTimeline({ cues: [{ frame: 0, name: 'replace' }, { frame: 0, name: 'obsolete' }],
    onCue: (cue, owner) => {
      events.push(cue.name);
      if (cue.name === 'replace') owner.reset({ cues: [{ frame: 0, name: 'replacement' }] });
    } });
  assert.deepEqual(events, ['replace', 'replacement']);
});

test('phase frame configuration rejects invalid deterministic clocks without mutating an existing owner', () => {
  const timeline = new TouhouBossPhaseTimeline({ attackStartFrame: 120 }); timeline.update();
  const before = timeline.snapshot();
  for (const field of ['attackStartFrame', 'patternLeadIn']) for (const value of [-1, .5, NaN, Infinity, '120', Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => timeline.reset({ [field]: value }), RangeError);
  assert.throws(() => timeline.reset({ cues: [{ frame: -1 }] }), RangeError);
  assert.throws(() => timeline.reset({ cues: [null] }), TypeError);
  assert.throws(() => timeline.reset({ onCue: 1 }), TypeError);
  assert.deepEqual(timeline.snapshot(), before);
});
