import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RUSH_BOSS_PHASE_TIMING_PROFILES, rushBossPhaseTiming } from '../games/rushboss/src/boss-phase-timing.js';

test('new nonspells select the common clock with private source timings and measured pattern preparation', () => {
  const expected = { sunny: { 3: 180, 5: 180 }, monstone: { 3: 180, 5: 180, 7: 180 },
    artia: { 3: 120, 5: 240, 7: 120, 9: 240, 11: 240 } };
  let count = 0;
  for (const [boss, rows] of Object.entries(expected)) for (const [number, attackStartFrame] of Object.entries(rows)) {
    const template = RUSH_BOSS_PHASE_TIMING_PROFILES[boss][number]; count++;
    assert.ok(Object.isFrozen(template));
    assert.equal(template.cues.some(cue=>[68,79].includes(cue.script)),false,'the demo omits blue/magenta handoff effects');
    assert.ok(template.cues.every(cue=>cue.frame>=template.source.phaseClockStartFrame+120),
      'the removed preparation must not retain an early charge or release sound cue');
    assert.deepEqual(template.cues.map(cue=>[cue.script,cue.sound]),boss==='artia'?[]:[[72,54],[89,6]],
      'only the explicit attack charge and release remain');
    for (let difficulty = 0; difficulty < 4; difficulty++) {
      const entry = rushBossPhaseTiming(boss, Number(number), difficulty);
      assert.equal(entry.attackStartFrame, attackStartFrame);
      assert.equal(entry.patternLeadIn, template.patternLeadInByDifficulty[difficulty]);
      assert.ok(entry.patternLeadIn < attackStartFrame, 'a pattern never needs hidden simulation before phase entry');
      assert.equal(rushBossPhaseTiming(boss, Number(number), difficulty, { practice: true }), null);
    }
  }
  assert.equal(count, 10);
  for (const boss of Object.keys(expected)) for (const number of [1, 2, 4, 6])
    assert.equal(rushBossPhaseTiming(boss, number), null, 'appearance and ordinary spells do not restart a normal-route wrapper');
  assert.throws(() => rushBossPhaseTiming('sunny', 3, 4), RangeError);
});

const reference = process.env.TOUHOU20_REFERENCE ?? path.resolve('../Touhou20Reconstruction');
test('retained attack cues and first-emission sites match the original ECL', {
  skip: !fs.existsSync(path.join(reference, 'scripts/recovered/ecl/st03bs.ecl.txt')),
}, () => {
  const sources = new Map();
  for (const rows of Object.values(RUSH_BOSS_PHASE_TIMING_PROFILES)) for (const row of Object.values(rows)) {
    const source = row.source;
    if (!sources.has(source.file)) sources.set(source.file, fs.readFileSync(path.join(reference, source.file), 'utf8').split(/\r?\n/));
    const lines = sources.get(source.file), line = n => lines[n - 1].trim();
    for (const cue of row.cues) {
      assert.equal(line(cue.sourceLine), `ins_307(1, ${cue.script});`, `${source.file}:${cue.sourceLine}`);
      assert.equal(line(cue.sourceLine + 1), `ins_516(${cue.sound});`);
      if (cue.type === 'charge') {
        // Keep the source wait for retained attack charges. The separate
        // blue/magenta preparation has deliberately been omitted by the demo.
        const following = lines.slice(cue.sourceLine + 1, cue.sourceLine + 5).join('\n');
        assert.ok(following.includes(`ins_23(${cue.options.releaseFrame});`));
      }
    }
    assert.ok(line(source.attackCallLine).startsWith(`@${source.firstEmission}(`));
    assert.match(line(source.firstEmissionLine), /^ins_(601|702|703)\(/, 'source launches a projectile with no preceding coroutine wait');
    if (source.movementWaitLine !== null) {
      assert.equal(line(source.movementWaitLine), 'ins_23(120);');
      assert.match(line(source.dialogueLine), /^ins_518\(/);
      assert.equal(source.phaseClockStartFrame, 120);
      assert.equal(source.omittedStageDialogue, true);
    }
  }
});
