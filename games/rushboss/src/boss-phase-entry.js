// SPDX-License-Identifier: GPL-3.0-only
// Private source-script data for entering an independent final card. The
// public TouhouBossPhaseTimeline runs the wait; no Boss identity enters thlib.
const file = stage => `scripts/recovered/ecl/st0${stage}bs.ecl.txt`;
function entry(stage, wrapper, card, protectionFrames, lines) {
  return Object.freeze({ frames: 160, protectionFrames,
    move: Object.freeze({ duration: 90, easing: 9, x: 0, y: 128 }),
    source: Object.freeze({ file: file(stage), wrapper, card, ...lines }) });
}

export const RUSH_BOSS_PHASE_ENTRY_PROFILES = Object.freeze({
  sunny: Object.freeze({
    7: entry(3, 'Boss4', 'BossCard4', 180,
      { protectionLine: 512, healthLine: 513, settlementLine: 531, moveLine: 545, waitLine: 547, cardLine: 548 }),
  }),
  monstone: Object.freeze({
    9: entry(4, 'Boss4', 'BossCard4', 180,
      { protectionLine: 433, healthLine: 434, settlementLine: 452, moveLine: 466, waitLine: 468, cardLine: 469 }),
  }),
  artia: Object.freeze({
    12: entry(6, 'Boss6', 'BossCard6', 160,
      { protectionLine: 690, healthLine: 691, settlementLine: 711, moveLine: 725, waitLine: 727, cardLine: 728 }),
    13: entry(6, 'Boss7', 'BossCard7', 160,
      { protectionLine: 735, healthLine: 736, settlementLine: 756, moveLine: 770, waitLine: 772, cardLine: 773 }),
  }),
});

/** Ordinary progression executes a BossN wrapper before starting the card.
 * A selected card or spell practice jumps straight to BossCardN instead.
 * Call this for an actual phase handoff, not a direct selected-phase start.
 * Numbers are one-based Demo phase numbers, matching the HP source profile.
 */
export function rushBossPhaseEntry(boss, number, { practice = false } = {}) {
  if (practice || !Number.isInteger(number)) return null;
  return RUSH_BOSS_PHASE_ENTRY_PROFILES[boss]?.[number] ?? null;
}
