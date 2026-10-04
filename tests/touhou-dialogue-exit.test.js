import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AnmBank, decodeAnm, TouhouDialogue, createTouhouResources,
  TOUHOU_DIALOGUE_EXIT_PRESETS, TOUHOU_DIALOGUE_PORTRAITS } from '@ts-stg/thlib/touhou';
import { Keys, DrawList } from '@ts-stg/thlib';

const tick = (owner, count, mask = 0) => { for (let frame = 0; frame < count; frame++) owner.update(mask); };
function fixture() {
  let handle = 0; const writes = [];
  const host = { readText: path => fs.readFileSync(path, 'utf8'), loadTexture: () => ++handle,
    createTexture: () => ++handle, unloadTexture() {}, encodeText: text => new Uint8Array(text.length),
    hasSystemFont: () => false, rasterizeBitmapText: (text, options) => {
      writes.push({ text, options }); return { width: options.width, height: options.height, pixels: new Uint8Array(options.width * options.height * 4) };
    }, updateTextureRegion() {} };
  return { resources: createTouhouResources(host), writes };
}
const step = { text: 'The last line', speaker: 'left', coldFrames: 0, autoFrames: 600,
  portraits: { left: { present: true, emotion: 'NOTICE' }, right: { present: true } } };

test('pre-Boss MSG completion waits30 frames with portrait tails updating, while terminal events still run once at exit start', () => {
  const f = fixture(), events = [], completed = [], seenSteps = [];
  const dialogue = new TouhouDialogue({ resources: f.resources, steps: [step, { terminal: true, events: [{ type: 'music' }, { type: 'complete' }] }],
    exit: 'beforeBoss', onEvent: event => events.push(event.type), onComplete: owner => completed.push(owner.exitState.frame),
    drawPortrait: (_draw, current) => { seenSteps.push(current); return false; } });
  try {
    tick(dialogue, 20); const body = dialogue.portraitMotion, x = body.worldPosition({ screenScale: 1 }).x;
    const box = dialogue.box; assert.equal(dialogue.advance(), true);
    assert.deepEqual(events, ['music', 'complete']); assert.equal(dialogue.exiting, true); assert.equal(dialogue.complete, false);
    assert.equal(dialogue.active, true); assert.equal(box.alive, false); assert.equal(dialogue.box, null);
    assert.ok(f.writes.slice(-4).every(write => write.text.trim() === ''), 'MSG6 explicitly blanks its four surfaces');
    assert.deepEqual(completed, []); assert.equal(dialogue.advance(), false);
    tick(dialogue, 10, Keys.FOCUS | Keys.CONFIRM); assert.equal(dialogue.complete, false);
    assert.ok(body.worldPosition({ screenScale: 1 }).x < x); assert.ok(body.alpha < 255 && body.alpha > 0);
    const draw = new DrawList(); dialogue.draw(draw); assert.ok(draw.commands.length > 0); assert.equal(seenSteps.at(-1), step);
    tick(dialogue, 19, Keys.FOCUS); assert.equal(dialogue.exitState.frame, 29); assert.equal(dialogue.complete, false);
    dialogue.update(Keys.CONFIRM); assert.equal(dialogue.complete, true); assert.equal(dialogue.active, false); assert.equal(dialogue.exiting, false);
    assert.deepEqual(completed, [30]); assert.deepEqual(events, ['music', 'complete']);
    dialogue.finish(); dialogue.update(); assert.deepEqual(completed, [30]);
    assert.deepEqual(TOUHOU_DIALOGUE_EXIT_PRESETS.beforeBoss, { completeFrame: 30, handoffFrame: null });
  } finally { dialogue.dispose(); f.resources.dispose(); }
});

test('post-Boss MSG hands off at+1 while remaining drawable, then completes once at+31', () => {
  const f = fixture(), events = [], observed = [];
  const dialogue = new TouhouDialogue({ resources: f.resources, steps: [step], exit: 'afterBoss',
    onExitHandoff: owner => events.push(['handoff', owner.exitState.frame, owner.active]),
    onComplete: owner => events.push(['complete', owner.exitState.frame, owner.active]),
    drawPortrait: (_draw, current) => { observed.push(current); return false; } });
  try {
    tick(dialogue, 20); dialogue.advance(); assert.equal(dialogue.current, null); assert.equal(dialogue.exitState.frame, 0);
    assert.deepEqual(events, []); dialogue.update(); assert.deepEqual(events, [['handoff', 1, true]]);
    const draw = new DrawList(); dialogue.draw(draw); assert.ok(draw.commands.length > 0); assert.equal(observed.at(-1), step);
    tick(dialogue, 29); assert.equal(dialogue.complete, false); assert.equal(dialogue.exitState.frame, 30);
    dialogue.update(); assert.equal(dialogue.complete, true);
    assert.deepEqual(events, [['handoff', 1, true], ['complete', 31, false]]);
    assert.deepEqual(dialogue.snapshot().exit, { frame: 31, handedOff: true });
  } finally { dialogue.dispose(); f.resources.dispose(); }
});

const rightSource = 'D:/AIWorkspace/Touhou20Reconstruction/scripts/recovered/roundtrip/anm/st01enm.anm';
test('both player portraits, right portrait and text retirement match source interrupt1 ANMs at every exit frame', { skip: !fs.existsSync(rightSource) }, () => {
  for (const character of [0, 1]) {
    const f = fixture(), dialogue = new TouhouDialogue({ resources: f.resources, character, steps: [step], exit: 'afterBoss' });
    const profile = character ? TOUHOU_DIALOGUE_PORTRAITS.marisa : TOUHOU_DIALOGUE_PORTRAITS.reimu;
    const leftBank = new AnmBank(JSON.parse(fs.readFileSync(`games/touhou20/assets/anm/pl0${character}.json`)));
    const rightBank = new AnmBank(decodeAnm(fs.readFileSync(rightSource), 'st01enm'));
    const textBank = new AnmBank(JSON.parse(fs.readFileSync('games/touhou20/assets/anm/text.json')));
    const left = leftBank.create(profile.root), right = rightBank.create(12), text = textBank.create(20);
    left.interruptNow(17, true); left.interruptNow(2, true); right.interruptNow(3, true); text.interruptNow(3); text.interruptNow(2);
    const leftBody = left.children.find(vm => vm.scriptId === profile.body), rightBody = right.children.find(vm => vm.scriptId === 10);
    try {
      for (let frame = 0; frame < 20; frame++) { dialogue.update(); leftBank.update(); rightBank.update(); textBank.update(); }
      dialogue.finish(); left.interrupt(1, true); right.interrupt(1, true); text.interrupt(1, true);
      for (let frame = 0; frame <= 31; frame++) {
        if (frame) { dialogue.update(); leftBank.update(); rightBank.update(); textBank.update(); }
        for (const [actual, source, name] of [[dialogue.portraitMotion, leftBody, 'player'], [dialogue.rightPortraitMotion, rightBody, 'Boss']]) {
          assert.equal(actual.alive, source.alive, `${character} ${name} lifetime frame${frame}`);
          if (source.alive) {
            assert.deepEqual(actual.worldPosition({ screenScale: 1 }), source.worldPosition({ screenScale: 1 }), `${character} ${name} exit movement frame${frame}`);
            assert.equal(actual.color, source.color, `${character} ${name} exit shade/fade frame${frame}`);
          }
        }
        assert.equal(dialogue.texts[0].alive, text.alive, `source text lifetime frame${frame}`);
        if (text.alive) assert.equal(dialogue.texts[0].alpha, text.alpha, `source text exit alpha frame${frame}`);
      }
    } finally { dialogue.dispose(); leftBank.dispose(); rightBank.dispose(); textBank.dispose(); f.resources.dispose(); }
  }
});

test('exit interrupts an unfinished entrance and prevents later first-line events or input from reviving it', () => {
  const f = fixture(), events = []; let completed = 0;
  const dialogue = new TouhouDialogue({ resources: f.resources, entrance: 'afterBoss', exit: 'beforeBoss',
    steps: [{ ...step, events: [{ type: 'portrait' }, { type: 'active' }, { type: 'text' }] }],
    onEvent: event => events.push(event.type), onComplete: () => completed++ });
  try {
    tick(dialogue, 10); dialogue.finish(); assert.equal(dialogue.entranceState, null); assert.equal(dialogue.exiting, true);
    tick(dialogue, 30, Keys.FOCUS); assert.deepEqual(events, ['portrait', 'active']); assert.equal(dialogue.box, null);
    assert.equal(completed, 1); assert.equal(dialogue.complete, true);
    assert.ok(f.writes.every(write => write.text.trim() === ''), 'no delayed line appears after exit started');
  } finally { dialogue.dispose(); f.resources.dispose(); }
});

test('custom timing allows an independently scheduled handoff and dispose aborts a tail without late callbacks', () => {
  const f = fixture(), events = [];
  const dialogue = new TouhouDialogue({ resources: f.resources, steps: [step], exit: { completeFrame: 40, handoffFrame: 5 },
    onExitHandoff: owner => events.push(['handoff', owner.exitState.frame]), onComplete: () => events.push(['complete']) });
  try {
    dialogue.finish(); tick(dialogue, 4); assert.deepEqual(events, []); dialogue.update(); assert.deepEqual(events, [['handoff', 5]]);
    dialogue.dispose(); tick(dialogue, 100); dialogue.finish(); assert.deepEqual(events, [['handoff', 5]]);
    assert.equal(dialogue.active, false); assert.equal(dialogue.complete, false);
  } finally { dialogue.dispose(); f.resources.dispose(); }
});

test('empty dialogues and legacy default finish immediately; invalid exit timing is rejected', () => {
  const f = fixture(); let completed = 0, handedOff = 0;
  const empty = new TouhouDialogue({ resources: f.resources, steps: [], exit: 'afterBoss', onComplete: () => completed++, onExitHandoff: () => handedOff++ });
  const legacy = new TouhouDialogue({ resources: f.resources, steps: [step], onComplete: () => completed++ });
  try {
    assert.equal(empty.complete, true); assert.equal(empty.exiting, false); assert.equal(handedOff, 0);
    legacy.advance(); assert.equal(legacy.complete, true); assert.equal('exit' in legacy.snapshot(), false); assert.equal(completed, 2);
    for (const exit of ['unknown', { completeFrame: -1 }, { completeFrame: 1.5 }, { completeFrame: 30, handoffFrame: 31 }])
      assert.throws(() => new TouhouDialogue({ resources: f.resources, steps: [step], exit }), /exit/);
  } finally { empty.dispose(); legacy.dispose(); f.resources.dispose(); }
});
