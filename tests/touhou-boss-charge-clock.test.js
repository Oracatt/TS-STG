import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AnmBank } from '../packages/thlib/src/touhou/anm.js';
import { TouhouBossCharge } from '../packages/thlib/src/touhou/boss-presentation.js';
import { TouhouBossPhaseTimeline } from '../packages/thlib/src/touhou/boss-phase-timeline.js';

const common = JSON.parse(fs.readFileSync(new URL('../packages/thlib/assets/touhou-common/anm/effect.json', import.meta.url), 'utf8'));

for (const sameFrameUpdate of [false, true]) test(`external phase clock aligns initial and later charges with release cues (${sameFrameUpdate ? 'damage-pass birth' : 'direct start'})`, () => {
  const bank = new AnmBank(common, { loadTexture: () => 17 }), charges = [], roots = [], sounds = [];
  let frame = 0;
  const create = bank.create.bind(bank);
  bank.create = (script, options) => {
    if ([68, 79, 72, 89].includes(script)) roots.push([frame, script]);
    return create(script, options);
  };
  const timeline = new TouhouBossPhaseTimeline({ attackStartFrame: 180,
    cues: [{ frame: 0, type: 'charge', color: 'blue', releaseColor: 'magenta', releaseFrame: 90 },
      { frame: 90, type: 'sound' },
      { frame: 120, type: 'charge', color: 'green', releaseColor: 'yellow', releaseFrame: 60 },
      { frame: 180, type: 'sound' }],
    onCue: (cue, owner) => {
      if (cue.type === 'charge') charges.push(new TouhouBossCharge(bank, { ...cue, clock: () => owner.frame - cue.frame }));
      else sounds.push(owner.frame);
    } });
  try {
    assert.equal(charges[0].age, 0);
    if (sameFrameUpdate) { charges[0].update(); assert.equal(charges[0].age, 0); }
    for (frame = 1; frame <= 200; frame++) {
      timeline.update();
      for (const charge of charges) charge.update();
      if (frame === 89) assert.equal(charges[0].released, false);
      if (frame === 90) assert.equal(charges[0].released, true);
      if (frame === 120) assert.equal(charges[1].age, 0, 'a later cue may be presented in its birth frame');
      if (frame === 179) assert.equal(charges[1].released, false);
      if (frame === 180) assert.equal(charges[1].released, true);
    }
    assert.deepEqual(roots, [[0, 68], [90, 79], [120, 72], [180, 89]]);
    assert.deepEqual(sounds, roots.filter(([, script]) => script === 79 || script === 89).map(([at]) => at));
  } finally { for (const charge of charges) charge.destroy(); bank.dispose(); }
});

test('external charge age does not freeze its ANM or duplicate logical repeat/release events', () => {
  const bank = new AnmBank(common, { loadTexture: () => 17 });
  let age = 0;
  const charge = new TouhouBossCharge(bank, { repeatCount: 2, repeatInterval: 2, releaseFrame: 4, clock: () => age });
  try {
    const root = charge.roots[0], before = root.snapshot();
    charge.update(); charge.update();
    assert.equal(charge.age, 0);
    assert.notDeepEqual(root.snapshot(), before, 'the source ANM cohort advances even while its external logical age stays zero');
    assert.equal(charge.emitted, 1); assert.equal(charge.released, false);
    age = 2; charge.update(); charge.update(); assert.equal(charge.emitted, 2);
    age = 4; charge.update();
    const release = charge.roots.find(vm => vm.scriptId === 89);
    assert.ok(release); charge.update();
    assert.equal(charge.roots.filter(vm => vm.scriptId === 89).length, 1);
  } finally { charge.destroy(); bank.dispose(); }
});

test('omitting a charge clock keeps the original self-advancing release behavior', () => {
  const bank = new AnmBank(common, { loadTexture: () => 17 });
  const charge = new TouhouBossCharge(bank, { releaseFrame: 3 });
  try {
    assert.equal(charge.age, 0);
    charge.update(); charge.update(); assert.equal(charge.released, false);
    charge.update(); assert.equal(charge.age, 3); assert.equal(charge.released, true);
  } finally { charge.destroy(); bank.dispose(); }
});

test('stopping a finished phase cancels future clock-bound births while existing ANM particles finish', () => {
  const bank = new AnmBank(common, { loadTexture: () => 17 });
  let age = 0;
  const charge = new TouhouBossCharge(bank, { releaseFrame: 90, clock: () => age });
  try {
    for (; age < 10; age++) charge.update();
    const stoppedAge = charge.age; charge.stop();
    for (let frame = 0; frame < 200; frame++) charge.update();
    assert.equal(charge.age, stoppedAge, 'the finished phase no longer advances its clock');
    assert.equal(charge.released, false);
    assert.equal(charge.alive, false); assert.equal(charge.roots.length, 0);
  } finally { charge.destroy(); bank.dispose(); }
});

for (const invalidClock of ['negative', 'throw']) test(`a stopped charge never queries a reused phase clock (${invalidClock})`, () => {
  const bank = new AnmBank(common, { loadTexture: () => 17 });
  let retired = false, reads = 0;
  const charge = new TouhouBossCharge(bank, { clock: () => {
    reads++;
    if (retired) {
      if (invalidClock === 'throw') throw new Error('The previous phase no longer exists');
      return -120;
    }
    return 0;
  } });
  try {
    charge.update(); charge.stop();
    const readsBeforeRetirement = reads; retired = true;
    for (let frame = 0; frame < 200; frame++) charge.update();
    assert.equal(reads, readsBeforeRetirement, 'stopped particles no longer depend on the previous phase owner');
    assert.equal(charge.age, 0); assert.equal(charge.released, false);
    assert.equal(charge.alive, false); assert.equal(charge.roots.length, 0);
  } finally { charge.destroy(); bank.dispose(); }
});

test('invalid external charge clocks fail before advancing the animation', () => {
  const bank = new AnmBank(common, { loadTexture: () => 17 });
  try {
    assert.throws(() => new TouhouBossCharge(bank, { clock: 0 }), TypeError);
    for (const age of [-1, .1, NaN, Infinity, '0', Number.MAX_SAFE_INTEGER + 1])
      assert.throws(() => new TouhouBossCharge(bank, { clock: () => age }), RangeError);
    let age = 0;
    const charge = new TouhouBossCharge(bank, { clock: () => age }), root = charge.roots[0];
    const time = root.time;
    age = -1; assert.throws(() => charge.update(), RangeError);
    assert.equal(root.time, time); assert.equal(charge.age, 0);
    charge.destroy();
  } finally { bank.dispose(); }
});
