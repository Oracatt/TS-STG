import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BOSSES } from '../games/rushboss/src/catalog.js';
import { RUSH_BOSS_DAMAGE_PROTECTION_PROFILES, rushBossDamageProtection } from '../games/rushboss/src/boss-health-profile.js';

test('all 29 phases preserve ordinary handoff protection and only reconfigure explicit ECL515 boundaries', () => {
  const remaining = {
    sunny: [null, null, 120, null, 120, null, 20],
    monstone: [null, null, 120, null, 120, null, 120, null, 20],
    artia: [null, null, 120, null, 120, null, 120, null, 120, null, 120, 0, 0],
  };
  let phasesChecked = 0, resets = 0;
  assert.ok(Object.isFrozen(RUSH_BOSS_DAMAGE_PROTECTION_PROFILES));
  for (const { key, phases } of BOSSES) {
    assert.ok(Object.isFrozen(RUSH_BOSS_DAMAGE_PROTECTION_PROFILES[key]));
    assert.deepEqual(phases.map(phase => {
      phasesChecked++;
      const row = rushBossDamageProtection(key, phase.number);
      if (!row) return null;
      resets++;
      assert.ok(Object.isFrozen(row));
      assert.ok(Object.isFrozen(row.source));
      assert.ok(row.frames >= row.elapsedBeforePhase);
      return row.frames - row.elapsedBeforePhase;
    }), remaining[key], key);
    assert.equal(rushBossDamageProtection(key, 1), null, 'appearance owns the initial timer, not first-phase init');
  }
  assert.equal(phasesChecked, 29);
  assert.equal(resets, 14);
  assert.equal(rushBossDamageProtection('missing', 3), null);
  assert.equal(rushBossDamageProtection('sunny', 3.5), null);
  assert.equal(rushBossDamageProtection('sunny', '3'), null);
});

const reference = process.env.TOUHOU20_REFERENCE ?? path.resolve('../Touhou20Reconstruction');
test('damage protection metadata matches original ECL515 and the wait before standalone spells', {
  skip: !fs.existsSync(path.join(reference, 'scripts/recovered/ecl/st03bs.ecl.txt')),
}, () => {
  const sources = new Map();
  for (const rows of Object.values(RUSH_BOSS_DAMAGE_PROTECTION_PROFILES)) for (const row of Object.values(rows)) {
    const { source: s, frames, elapsedBeforePhase } = row;
    if (!sources.has(s.file)) sources.set(s.file, fs.readFileSync(path.join(reference, s.file), 'utf8').split(/\r?\n/));
    const lines = sources.get(s.file), line = n => lines[n - 1].trim();
    assert.equal(line(s.line), `ins_515(${frames});`, `${s.file}:${s.line}`);
    assert.ok(line(s.line + 1).startsWith('ins_511('), 'the source protection is paired with a health reset');
    const start = lines.lastIndexOf(`void ${s.phase}()`, s.line - 1);
    assert.ok(start >= 0, `missing source function ${s.phase}`);
    const end = lines.indexOf('}', start);
    assert.ok(end >= s.line, 'ECL515 belongs to the recorded wrapper');
    if (s.waitLine !== null) {
      assert.ok(s.waitLine > s.line && s.waitLine < end + 1);
      assert.equal(line(s.waitLine), `ins_23(${elapsedBeforePhase});`);
      assert.equal(line(s.waitLine + 1), `@BossCard${s.phase.slice(4)}();`);
    } else {
      assert.equal(elapsedBeforePhase, 0, 'normal phases begin at the wrapper entry');
    }
  }
});
