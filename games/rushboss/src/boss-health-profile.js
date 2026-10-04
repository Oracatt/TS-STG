// SPDX-License-Identifier: GPL-3.0-only
// Private Demo balance data, not a thlib preset. See docs/rushboss-source-health.md.
// Use the ordinary TH20 ECL route on every difficulty and in spell practice.
// ins_511 sets the WHOLE group's HP; ins_514's threshold is the spell's HP.
const file = stage => `scripts/recovered/ecl/st0${stage}bs.ecl.txt`;
function entry(stage, phase, hp, source, mapping = 'ordered') {
  return Object.freeze({ hp, mapping, source: Object.freeze({ file: file(stage), phase,
    flow: 'normal', difficulties: 'ENHL', ...source }) });
}
function pair(stage, number, total, threshold, healthLine, thresholdLine, nonspellFrames, spellTimeLine, spellFrames) {
  const source = { initialHp: total, thresholdHp: threshold, healthLine, thresholdLine };
  return [
    entry(stage, `Boss${number}`, total - threshold,
      { ...source, timeLine: thresholdLine, timeFrames: nonspellFrames }),
    entry(stage, `BossCard${number}`, threshold,
      { ...source, timeLine: spellTimeLine, timeFrames: spellFrames }),
  ];
}
function standalone(stage, number, hp, healthLine, timeLine, timeFrames) {
  return entry(stage, `BossCard${number}`, hp,
    { initialHp: hp, thresholdHp: 0, healthLine, thresholdLine: null, timeLine, timeFrames });
}
function reuse(row, mapping) { return Object.freeze({ ...row, mapping }); }

const stage3 = [
  ...pair(3, 1, 23000, 3000, 20, 63, 2400, 574, 2100),
  ...pair(3, 2, 23200, 3200, 193, 225, 2100, 805, 2400),
  ...pair(3, 3, 23200, 3400, 345, 377, 2100, 974, 2700),
  standalone(3, 4, 3400, 513, 1181, 2700),
];
const stage4 = [
  ...pair(4, 1, 22800, 2800, 20, 63, 2400, 496, 2400),
  ...pair(4, 2, 22800, 2800, 165, 197, 2100, 703, 2700),
  ...pair(4, 3, 22800, 2500, 304, 336, 2100, 856, 2700),
  standalone(4, 4, 4300, 434, 939, 3300),
];
const stage5Card3 = pair(5, 3, 19200, 3200, 384, 416, 2700, 863, 3300)[1];
const stage6 = [
  ...pair(6, 1, 21900, 3900, 20, 82, 3000, 800, 3300),
  ...pair(6, 2, 21900, 3900, 157, 189, 3000, 912, 3600),
  ...pair(6, 3, 20000, 4000, 267, 306, 3600, 1012, 3900),
  ...pair(6, 4, 20000, 4000, 449, 481, 3600, 1169, 4200),
  ...pair(6, 5, 17000, 4000, 565, 605, 3600, 1360, 4800),
  standalone(6, 6, 4500, 691, 1473, 3900),
  // Boss7 first sets 4500, but BossCard7 overwrites it with 12000 before combat.
  standalone(6, 7, 12000, 1646, 1647, 7200),
];

export const RUSH_BOSS_HEALTH_PROFILES = Object.freeze({
  sunny: Object.freeze(stage3),
  monstone: Object.freeze([...stage4.slice(0, 6),
    reuse(stage4[4], 'additional-nonspell-reuses-stage4-Boss3'),
    reuse(stage5Card3, 'additional-survival-uses-stage5-BossCard3'), stage4[6]]),
  artia: Object.freeze([...stage6.slice(0, 10),
    reuse(stage6[8], 'additional-nonspell-reuses-stage6-Boss5'), ...stage6.slice(10)]),
});

/** One-based phase number, matching the three Demo attack lists. */
export function rushBossHealth(boss, phaseNumber) {
  const row = Number.isInteger(phaseNumber) && RUSH_BOSS_HEALTH_PROFILES[boss]?.[phaseNumber - 1];
  if (!row) throw new RangeError(`No source health profile for ${boss} phase ${phaseNumber}`);
  return row.hp;
}

function protection(stage, phase, frames, line, elapsedBeforePhase = 0, waitLine = null) {
  return Object.freeze({ frames, elapsedBeforePhase,
    source: Object.freeze({ file: file(stage), phase, line, waitLine }) });
}

/** Private ECL515 timings for ordinary progression. The public damage owner
 * consumes the timer; these rows only select source script data. Missing rows
 * preserve the existing timer, including ordinary nonspell-to-spell handoffs.
 * Boss()'s initial 120 frames begin at appearance and also elapse during fog
 * and dialogue, so they must not be restarted by a first-phase row here.
 * Standalone cards begin after their BossN wrapper's 160-frame wait. Practice
 * jumps directly to its card from Boss(), bypassing these normal-route rows. */
export const RUSH_BOSS_DAMAGE_PROTECTION_PROFILES = Object.freeze({
  sunny: Object.freeze({
    3: protection(3, 'Boss2', 120, 192),
    5: protection(3, 'Boss3', 120, 344),
    7: protection(3, 'Boss4', 180, 512, 160, 547),
  }),
  monstone: Object.freeze({
    3: protection(4, 'Boss2', 120, 164),
    5: protection(4, 'Boss3', 120, 303),
    7: protection(4, 'Boss3', 120, 303),
    9: protection(4, 'Boss4', 180, 433, 160, 468),
  }),
  artia: Object.freeze({
    3: protection(6, 'Boss2', 120, 156),
    5: protection(6, 'Boss3', 120, 266),
    7: protection(6, 'Boss4', 120, 448),
    9: protection(6, 'Boss5', 120, 564),
    11: protection(6, 'Boss5', 120, 564),
    12: protection(6, 'Boss6', 160, 690, 160, 727),
    13: protection(6, 'Boss7', 160, 735, 160, 772),
  }),
});

/** One-based phase number; null means no ECL515 at this phase boundary. */
export function rushBossDamageProtection(boss, phaseNumber) {
  return (Number.isInteger(phaseNumber) && RUSH_BOSS_DAMAGE_PROTECTION_PROFILES[boss]?.[phaseNumber]) || null;
}
