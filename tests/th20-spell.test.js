import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Th20Spell, encodeTh20SpellTime, invalidTh20SpellTime, quantizeTh20SpellTime } from '../games/touhou20/src/spell.js';
import { AnmBank } from '../games/touhou20/src/anm.js';
import { Th20BitmapFont } from '../games/touhou20/src/font.js';
import { DrawList } from '../packages/thlib/src/render.js';
const vectors = JSON.parse(fs.readFileSync(new URL('./fixtures/th20-player-vectors.json', import.meta.url)));
const make = options => new Th20Spell({ player: { x: 0, y: 400, score: 0, bomb: null }, ...options });

test('spell bonus first decay, integer rounding and initial clamp match recovered C++', () => {
  let key, spell, current;
  for (const [difficulty, stage, duration, age, bonus] of vectors.spellDecay) {
    const next = `${difficulty}:${stage}:${duration}`;
    if (key !== next) { key = next; spell = make({ difficulty, stage }).begin({ duration }); current = -1; }
    while (current < age) { spell.update(); current++; }
    assert.equal(spell.bonus, bonus, `${key} age ${age}`);
  }
});

test('spell platform-clock quantization and checksum match C++ double operations', () => {
  for (const [elapsed, seconds, hundredths, encoded] of vectors.spellTiming)
    assert.deepEqual(quantizeTh20SpellTime(elapsed), { seconds, hundredths, encoded });
  for (let seconds = 0; seconds <= 999; seconds += 37) for (let h = 0; h <= 99; h += 9) {
    const encoded = encodeTh20SpellTime(seconds, h); assert.equal(invalidTh20SpellTime(encoded), false);
    assert.equal(invalidTh20SpellTime(encoded + 100000), true);
  }
});

test('source sixty-frame failure grace and lingering-bomb suppression remain distinct', () => {
  const spell = make().begin({ duration: 600 }); spell.player.bomb = { alive: true };
  assert.equal(spell.notifyBombStart(), false); assert.equal(spell.captureEligible, true);
  assert.equal(spell.scaleDamage(99), 3);
  for (let i = 0; i < 60; i++) spell.update();
  assert.equal(spell.captureEligible, true, 'existing early bomb does not retroactively fail');
  spell.player.bomb.alive = false; spell.update(); assert.equal(spell.scaleDamage(99), 99);
  assert.equal(spell.notifyPlayerHit(), true); assert.equal(spell.captureEligible, false); assert.equal(spell.bonus, 0);
  assert.equal(spell.capture().captured, false); assert.equal(spell.player.score, 0);
});

test('timeout fails normal spells, captures survival and retains attempt/capture counters', () => {
  const spell = make().begin({ id: 2, duration: 600, survival: true });
  for (let i = 0; i < 600; i++) spell.update();
  const full = spell.bonus; assert.equal(full, 1000000);
  assert.equal(spell.timeout().captured, true); assert.equal(spell.player.score, full / 10);
  assert.deepEqual(spell.records[2], { name: '', captures: [1, 0], attempts: [1, 0] });
  spell.begin({ id: 2, duration: 600 }); for (let i = 0; i < 600; i++) spell.update();
  assert.equal(spell.timeout().captured, false);
  assert.deepEqual(spell.records[2].attempts, [2, 0]); assert.deepEqual(spell.records[2].captures, [1, 0]);
});

test('spell info fade hysteresis, bonus division trap and timing replay corruption are explicit', () => {
  const spell = make().begin({ duration: 300 });
  for (let i = 0; i < 120; i++) spell.update();
  spell.player.y = 95; spell.update(); assert.equal(spell.flags & 4, 4);
  spell.player.y = 120; spell.update(); assert.equal(spell.flags & 4, 4);
  spell.player.y = 129; spell.update(); assert.equal(spell.flags & 4, 0);
  spell.age.set(300); assert.throws(() => spell.update(), /division trap/);
  const replay = make({ playback: true }); replay.begin({}); replay.postFrame(12); replay.finish();
  assert.equal(replay.postFrame(15, { readSpellTime: () => 0 }), encodeTh20SpellTime(999, 99));
  assert.equal(replay.captureIndex, 1); assert.deepEqual(replay.records, {});
});

test('original spell info, aura and bonus glyph assets update and draw without substitutions', () => {
  const read = name => JSON.parse(fs.readFileSync(new URL(`../games/touhou20/assets/anm/${name}.json`, import.meta.url)));
  const text = read('ascii_960'), spell = make({ textBank: new AnmBank(text, { loadTexture: () => 1 }),
    effectBank: new AnmBank(read('effect'), { loadTexture: () => 1 }), font: new Th20BitmapFont(text, { loadTexture: () => 1 }) });
  spell.begin({ duration: 600 });
  for (let i = 0; i < 180; i++) { spell.update(); if (i % 30 === 0) { const draw = new DrawList(); spell.draw(draw); assert.ok(draw.commands.length > 0); } }
  spell.finish(); for (let i = 0; i < 40; i++) spell.update();
});
