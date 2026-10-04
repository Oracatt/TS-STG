import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BOSSES } from '../games/rushboss/src/catalog.js';
import { RUSH_BOSS_PHASE_ENTRY_PROFILES, rushBossPhaseEntry } from '../games/rushboss/src/boss-phase-entry.js';
import { RUSH_BOSS_HEALTH_PROFILES, rushBossDamageProtection } from '../games/rushboss/src/boss-health-profile.js';

test('only the four configured independent card wrappers acquire a phase-entry wait', () => {
  const selected = [];
  for (const { key, phases } of BOSSES) for (const phase of phases) {
    const entry = rushBossPhaseEntry(key, phase.number);
    assert.equal(rushBossPhaseEntry(key, phase.number, { practice: true }), null);
    if (!entry) continue;
    selected.push([key, phase.number]);
    assert.ok(phase.spell);
    assert.equal(RUSH_BOSS_HEALTH_PROFILES[key][phase.number - 1].source.thresholdHp, 0);
    const protection = rushBossDamageProtection(key, phase.number);
    assert.equal(entry.protectionFrames, protection.frames);
    assert.equal(entry.frames, protection.elapsedBeforePhase,
      'normal progression must spend the wait that a direct selected-card entry already skips');
  }
  assert.deepEqual(selected, [['sunny', 7], ['monstone', 9], ['artia', 12], ['artia', 13]]);
  // Artia has an additional Rush nonspell before the source's independent
  // BossCard6. Selecting a wrapper solely by preceding spell state is wrong.
  assert.equal(BOSSES[2].phases[10].spell, false);
  assert.ok(rushBossPhaseEntry('artia', 12));
  for (const [boss, number] of [['custom', 7], ['sunny', -1], ['sunny', 7.5], ['sunny', '7']])
    assert.equal(rushBossPhaseEntry(boss, number), null);
});

const reference = process.env.TOUHOU20_REFERENCE ?? path.resolve('../Touhou20Reconstruction');
const exists = fs.existsSync(path.join(reference, 'scripts/recovered/ecl/st01bs.ecl.txt'));
function sourceLines(file) { return fs.readFileSync(path.join(reference, file), 'utf8').split(/\r?\n/); }

test('entry profiles preserve source protection, settlement, movement, explicit wait and delayed card call', {
  skip: !exists,
}, () => {
  for (const rows of Object.values(RUSH_BOSS_PHASE_ENTRY_PROFILES)) for (const entry of Object.values(rows)) {
    const s = entry.source, lines = sourceLines(s.file), line = number => lines[number - 1].trim();
    assert.equal(line(s.protectionLine), `ins_515(${entry.protectionFrames});`);
    assert.equal(line(s.settlementLine), 'ins_523();');
    assert.equal(line(s.moveLine), `ins_401(${entry.move.duration}, ${entry.move.easing}, 0.0f, 128.0f);`);
    assert.equal(line(s.waitLine), `ins_23(${entry.frames});`);
    assert.equal(line(s.cardLine), `@${s.card}();`);
    assert.ok(s.protectionLine < s.healthLine && s.healthLine < s.settlementLine &&
      s.settlementLine < s.moveLine && s.moveLine < s.waitLine && s.waitLine < s.cardLine);
    const wrapper = lines.slice(0, s.protectionLine).findLast(text => text.startsWith('void '));
    assert.equal(wrapper, `void ${s.wrapper}()`);
    for (let index = s.moveLine; index < s.cardLine - 1; index++)
      assert.equal(lines[index].includes('ins_531('), false, 'new card presentation must not start during its wrapper wait');
  }
});

test('the user-reported stage-one card-two to card-three gap is an explicit 160-frame wrapper', {
  skip: !exists,
}, () => {
  const lines = sourceLines('scripts/recovered/ecl/st01bs.ecl.txt'), line = number => lines[number - 1].trim();
  assert.equal(line(637), 'ins_514(0, 0, 2400, "Boss3");');
  assert.equal(line(420), 'ins_515(180);');
  assert.equal(line(421), 'ins_511(2500);');
  assert.equal(line(439), 'ins_523();');
  assert.equal(line(453), 'ins_401(90, 9, 0.0f, 128.0f);');
  assert.equal(line(455), 'ins_23(160);');
  assert.equal(line(456), '@BossCard3();');
  assert.ok(line(831).startsWith('ins_531(8, 2100, 0, '));
});
