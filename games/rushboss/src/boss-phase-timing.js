// SPDX-License-Identifier: GPL-3.0-only
// Private Demo phase data. The public clock contains no Boss/stage branches.
// A new nonspell starts in the SAME damage pass as the previous spell ends;
// its protected preparation is not a separate 60-frame result-screen delay.
const file = stage => `scripts/recovered/ecl/st0${stage}bs.ecl.txt`;
const charge = (frame, script, releaseScript, duration, line) => Object.freeze({ frame, type: 'charge', script, sound: 54,
  options: Object.freeze({ color: script === 68 ? 'blue' : 'green',
    releaseColor: releaseScript === 79 ? 'magenta' : 'yellow', releaseFrame: duration }), sourceLine: line });
// The public charge owner creates the release ANM. This cue supplies its sound,
// not a second release animation.
const release = (frame, script, line) => Object.freeze({ frame, type: 'release', script, sound: 6, sourceLine: line });
function row(stage, phase, firstEmission, { leadIn, prepareLine, releaseLine, attackChargeLine, attackReleaseLine,
  attackCallLine, firstEmissionLine, preparationStartFrame = 0, movementWaitLine = null, dialogueLine = null }) {
  const attackStartFrame = preparationStartFrame + (attackChargeLine ? 180 : 120);
  const cues = [charge(preparationStartFrame, 68, 79, 90, prepareLine), release(preparationStartFrame + 90, 79, releaseLine)];
  if (attackChargeLine) cues.push(charge(preparationStartFrame + 120, 72, 89, 60, attackChargeLine),
    release(attackStartFrame, 89, attackReleaseLine));
  return Object.freeze({ attackStartFrame,
    // Measured private pattern startup, including actor creation. ENHL order.
    // Removing this existing lead-in from the clock delay keeps source attack
    // timing without advancing a hidden pattern or dropping its first bullets.
    patternLeadInByDifficulty: Object.freeze(leadIn.map(frames => frames - 1)),
    cues: Object.freeze(cues), source: Object.freeze({ file: file(stage), phase, firstEmission,
      attackCallLine, firstEmissionLine, movementWaitLine, dialogueLine,
      // The Demo keeps Rush dialogue only. Omit TH20-specific midfight lines,
      // while retaining the scripted movement wait before the common charge.
      omittedStageDialogue: dialogueLine !== null,
      phaseClockStartFrame: preparationStartFrame }) });
}

const sunny3 = row(3, 'Boss2', 'Boss2_at', { leadIn: [80, 80, 80, 80], prepareLine: 227, releaseLine: 230,
  attackChargeLine: 238, attackReleaseLine: 241, attackCallLine: 244, firstEmissionLine: 272 });
const sunny5 = row(3, 'Boss3', 'Boss3_at', { leadIn: [99, 99, 99, 99], prepareLine: 380, releaseLine: 383,
  attackChargeLine: 391, attackReleaseLine: 394, attackCallLine: 397, firstEmissionLine: 435 });
const monstone3 = row(4, 'Boss2', 'Boss2_at', { leadIn: [81, 80, 79, 78], prepareLine: 199, releaseLine: 202,
  attackChargeLine: 212, attackReleaseLine: 215, attackCallLine: 222, firstEmissionLine: 284 });
const monstone5 = row(4, 'Boss3', 'Boss3_at', { leadIn: [102, 99, 96, 93], prepareLine: 339, releaseLine: 342,
  attackChargeLine: 352, attackReleaseLine: 355, attackCallLine: 362, firstEmissionLine: 415 });
const monstone7 = Object.freeze({ ...monstone5, patternLeadInByDifficulty: Object.freeze([81, 80, 79, 78]) });
const artia3 = row(6, 'Boss2', 'Boss2_at', { leadIn: [75, 75, 75, 75], prepareLine: 192, releaseLine: 195,
  attackCallLine: 217, firstEmissionLine: 256 });
const artia5 = row(6, 'Boss3', 'Boss3_at', { leadIn: [86, 86, 86, 86], preparationStartFrame: 120,
  prepareLine: 309, releaseLine: 312, attackCallLine: 319, firstEmissionLine: 355, movementWaitLine: 302, dialogueLine: 303 });
const artia7 = row(6, 'Boss4', 'Boss4_at', { leadIn: [80, 80, 80, 80], prepareLine: 484, releaseLine: 487,
  attackCallLine: 501, firstEmissionLine: 540 });
const artia9 = row(6, 'Boss5', 'Boss5_at', { leadIn: [81, 81, 81, 81], preparationStartFrame: 120,
  prepareLine: 607, releaseLine: 611, attackCallLine: 624, firstEmissionLine: 650, movementWaitLine: 599, dialogueLine: 601 });
const artia11 = Object.freeze({ ...artia9, patternLeadInByDifficulty: Object.freeze([79, 79, 79, 79]) });

export const RUSH_BOSS_PHASE_TIMING_PROFILES = Object.freeze({
  sunny: Object.freeze({ 3: sunny3, 5: sunny5 }),
  monstone: Object.freeze({ 3: monstone3, 5: monstone5, 7: monstone7 }),
  artia: Object.freeze({ 3: artia3, 5: artia5, 7: artia7, 9: artia9, 11: artia11 }),
});

/** Practice jumps directly to a card and never runs an ordinary BossN wrapper.
 * A normal nonspell-to-spell handoff also has no new preparation wrapper here. */
export function rushBossPhaseTiming(boss, number, difficulty = 1, { practice = false } = {}) {
  if (practice || !Number.isInteger(number)) return null;
  const entry = RUSH_BOSS_PHASE_TIMING_PROFILES[boss]?.[number];
  if (!entry) return null;
  if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > 3) throw new RangeError('Unknown Rush difficulty');
  return Object.freeze({ ...entry, patternLeadIn: entry.patternLeadInByDifficulty[difficulty] });
}
