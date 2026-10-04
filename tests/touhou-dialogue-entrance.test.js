import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AnmBank, TouhouDialogue, createTouhouResources, TOUHOU_DIALOGUE_ENTRANCE_PRESETS } from '@ts-stg/thlib/touhou';
import { Keys, DrawList, SaveStore } from '@ts-stg/thlib';
import { RushDialogue, RUSH_DIALOGUE_DATA } from '../games/rushboss/src/dialogue.js';
import { RushPortraitApplication } from '../games/rushboss/src/portrait-application.js';

const tick = (owner, count, mask = 0) => { for (let frame = 0; frame < count; frame++) owner.update(mask); };
function fixture() {
  let handle = 0; const writes = [];
  const host = { readText: path => fs.readFileSync(path, 'utf8'), loadTexture: () => ++handle,
    createTexture: () => ++handle, createRenderTarget: () => ++handle, unloadTexture() {},
    encodeText: text => new Uint8Array([...text].reduce((count, character) => count + (character.codePointAt(0) > 127 ? 2 : 1), 0)),
    hasSystemFont: () => false, rasterizeBitmapText: (text, options) => {
      writes.push(text); return { width: options.width, height: options.height, pixels: new Uint8Array(options.width * options.height * 4) };
    }, updateTextureRegion() {} };
  return { host, resources: createTouhouResources(host), writes };
}
const first = { speaker: 'left', text: 'First line', coldFrames: 90, autoFrames: 600,
  portraits: { left: { present: true, emotion: 'NOTICE' }, right: { present: true, emotion: 'LOSE' } },
  events: [{ type: 'portrait', side: 'left' }, { type: 'portrait', side: 'right' },
    { type: 'active', side: 'left' }, { type: 'active', side: 'right' },
    { type: 'emotion', side: 'left' }, { type: 'text', text: 'First line' }] };

test('afterBoss entry creates portraits at0, starts speaking at4, writes at34 and opens input at38', () => {
  const f = fixture(), events = [];
  const dialogue = new TouhouDialogue({ resources: f.resources, entrance: 'afterBoss', steps: [first, { terminal: true }],
    onEvent: (event, _step, owner) => events.push([event.type, event.side ?? '', owner.age]) });
  try {
    assert.deepEqual(TOUHOU_DIALOGUE_ENTRANCE_PRESETS.afterBoss, { portraitFrame: 0, speakerFrame: 4, textFrame: 34, inputFrame: 38 });
    assert.ok(dialogue.portrait); assert.ok(dialogue.rightPortraitMotion); assert.equal(dialogue.box, undefined);
    assert.deepEqual(events, [['portrait', 'left', 0], ['portrait', 'right', 0], ['emotion', 'left', 0]]);
    assert.equal(dialogue.advance(), false); tick(dialogue, 3, Keys.FOCUS); assert.equal(dialogue.entranceState.speaker, false);
    dialogue.update(Keys.FOCUS); assert.equal(dialogue.entranceState.speaker, true);
    assert.deepEqual(events.slice(-2), [['active', 'left', 4], ['active', 'right', 4]]);
    tick(dialogue, 6, Keys.FOCUS);
    const draw = new DrawList(); dialogue.draw(draw); assert.ok(draw.commands.length > 0, 'portraits are visible well before the first text');
    assert.equal(dialogue.portraitMotion.layer, 36); assert.ok(dialogue.portraitState().alpha > 0);
    tick(dialogue, 23, Keys.FOCUS); assert.equal(dialogue.age, 33); assert.equal(dialogue.box, undefined); assert.deepEqual(f.writes, []);
    dialogue.update(Keys.FOCUS); assert.equal(dialogue.age, 34); assert.equal(dialogue.box.scriptId, 270);
    assert.ok(f.writes.includes('First line')); assert.equal(dialogue.entranceState.inputReady, false);
    assert.deepEqual(events.at(-1), ['text', '', 34]); assert.equal(dialogue.advance(), false);
    tick(dialogue, 3, Keys.FOCUS); assert.equal(dialogue.complete, false);
    dialogue.update(Keys.FOCUS); assert.equal(dialogue.age, 38); assert.equal(dialogue.complete, true);
    assert.equal(events.length, first.events.length, 'no event is lost or replayed by staged entry');
  } finally { dialogue.dispose(); f.resources.dispose(); }
});

test('portrait and text ANMs keep the original frame clocks while the MSG entry changes speaking and reveals text', () => {
  const f = fixture(), dialogue = new TouhouDialogue({ resources: f.resources, entrance: 'afterBoss', steps: [{ ...first, events: [] }] });
  const source = new AnmBank(JSON.parse(fs.readFileSync('games/touhou20/assets/anm/pl00.json'))), root = source.create(66);
  const sourceText = new AnmBank(JSON.parse(fs.readFileSync('games/touhou20/assets/anm/text.json'))), text = sourceText.create(20);
  root.interruptNow(17, true); const body = root.children.find(vm => vm.scriptId === 62);
  try {
    for (let frame = 0; frame <= 43; frame++) {
      if (frame) { source.update(); sourceText.update(); if (frame === 4) root.interruptNow(2, true);
        if (frame === 34) { text.interruptNow(3); text.interruptNow(2); } dialogue.update(); }
      assert.deepEqual(dialogue.portraitMotion.worldPosition({ screenScale: 1 }), body.worldPosition({ screenScale: 1 }), `portrait position frame${frame}`);
      assert.equal(dialogue.portraitMotion.color, body.color, `portrait fade/shade frame${frame}`);
      if (frame < 34) assert.equal(dialogue.box, undefined);
      if (frame >= 34) assert.equal(dialogue.texts[0].alpha, text.alpha, `source text fade frame${frame}`);
      if (frame === 38) assert.ok(dialogue.texts[0].alpha > 0 && dialogue.texts[0].alpha < 255);
      if (frame >= 42) assert.equal(dialogue.texts[0].alpha, 255);
    }
  } finally { dialogue.dispose(); source.dispose(); sourceText.dispose(); f.resources.dispose(); }
});

test('custom ordered entrance times and explicit event stages work without altering subsequent steps', () => {
  const f = fixture(), events = [], steps = [{ ...first, events: [
    { type: 'music', entranceStage: 'portraits' }, { type: 'custom', entranceStage: 'speaker' }, { type: 'text' }] },
    { text: 'Next', speaker: 'right', coldFrames: 3, events: [{ type: 'next' }] }, { terminal: true }];
  const dialogue = new TouhouDialogue({ resources: f.resources, steps, startDelayFrames: 2,
    entrance: { portraitFrame: 2, speakerFrame: 3, textFrame: 5, inputFrame: 8 },
    onEvent: (event, _step, owner) => events.push([event.type, owner.age]) });
  try {
    tick(dialogue, 2); assert.equal(dialogue.entranceState.frame, 0); assert.equal(dialogue.portrait, undefined);
    tick(dialogue, 2); assert.ok(dialogue.portrait); assert.deepEqual(events, [['music', 4]]);
    dialogue.update(); assert.deepEqual(events.at(-1), ['custom', 5]); tick(dialogue, 2); assert.deepEqual(events.at(-1), ['text', 7]);
    tick(dialogue, 3); assert.equal(dialogue.advance(), true); assert.equal(dialogue.index, 1); assert.equal(dialogue.entranceState, null);
    assert.equal(dialogue.box.scriptId, 271); assert.equal(dialogue.advance(), false); tick(dialogue, 3);
    assert.equal(dialogue.advance(), true); assert.equal(dialogue.complete, true);
  } finally { dialogue.dispose(); f.resources.dispose(); }
});

test('immediate default, before-battle timing, legacy Rush after delay and empty after scenes stay unchanged', () => {
  const f = fixture(); const owners = [];
  try {
    const plain = new TouhouDialogue({ resources: f.resources, steps: [first] }); owners.push(plain);
    assert.ok(plain.box); assert.equal(plain.entranceState, null); assert.equal('entrance' in plain.snapshot(), false);
    const before = new RushDialogue(f.resources, { bossId: 'sunny', phase: 'before' }); owners.push(before);
    assert.ok(before.box); assert.equal(before.entranceState, null);
    const legacy = new RushDialogue(f.resources, { bossId: 'sunny', phase: 'after' }); owners.push(legacy);
    assert.equal(legacy.startDelay, 50); assert.equal(legacy.portrait, undefined); tick(legacy, 50); assert.ok(legacy.box);
    const empty = new RushDialogue(f.resources, { bossId: 'artia', phase: 'after', entrance: 'afterBoss', startDelayFrames: 0 }); owners.push(empty);
    assert.equal(empty.complete, true); assert.equal(empty.portrait, undefined);
    assert.equal(RUSH_DIALOGUE_DATA.sequences['sunny:0:after'].startDelayFrames, 50, 'imported private oracle data is unchanged');
  } finally { for (const owner of owners) owner.dispose(); f.resources.dispose(); }
});

test('portrait application selects common afterBoss timing without the imported Rush50 delay', () => {
  const f = fixture(), graphics = { clearBattle() {}, draw(draw) { draw.clear(); }, snapshot: () => ({}) };
  const app = new RushPortraitApplication(f.host, { resources: f.resources, graphics, store: new SaveStore(), startBoss: 'sunny', skipDialogue: true });
  try {
    const session = app.application.game; session.openDialogue('after'); const dialogue = session.dialogue;
    assert.equal(dialogue.startDelay, 0); assert.deepEqual(dialogue.entranceTiming, TOUHOU_DIALOGUE_ENTRANCE_PRESETS.afterBoss);
    assert.ok(dialogue.portrait); assert.equal(dialogue.box, undefined); tick(dialogue, 10);
    assert.ok(dialogue.portraitState().alpha > 0); assert.equal(dialogue.box, undefined);
    tick(dialogue, 24); assert.ok(dialogue.box); assert.equal(dialogue.current.text, RUSH_DIALOGUE_DATA.sequences['sunny:0:after'].steps[0].text);
  } finally { app.destroy(); f.resources.dispose(); }
});

test('invalid or unordered entrance times are rejected rather than producing a stuck conversation', () => {
  const f = fixture();
  try {
    for (const entrance of ['unknown', { portraitFrame: -1, speakerFrame: 4, textFrame: 34, inputFrame: 38 },
      { portraitFrame: 0, speakerFrame: 4, textFrame: 3, inputFrame: 38 },
      { portraitFrame: 0, speakerFrame: 4, textFrame: 34.5, inputFrame: 38 }])
      assert.throws(() => new TouhouDialogue({ resources: f.resources, entrance, steps: [first] }), /entrance/);
  } finally { f.resources.dispose(); }
});
