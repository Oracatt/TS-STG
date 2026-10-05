// 月折「借光的纸鹤」 — choose a fold, bait the ink, slip between the wings.
// The paper unfolds radially; its two broad openings are choices, not rails.
// Every projectile retains thlib's normal birth, hitbox and cancellation.
export const spellCard = {
  id: 'moonfold', name: '月折「借光的纸鹤」',
  duration: 45 * 60, hp: 5000, seed: 0x4d4f4f4e,
  boss: {x: 0, y: 76},
};

const INTRO = 90, END = 2520;
const BLUE = 8, VIOLET = 6, WHITE = 15, GOLD = 14;
const BIRTH = {type: 1, ints: [1]};
const f = Math.fround, TAU = Math.PI * 2;

export function createSpell(context) {
  const {boss, bullets, player, presentation, sound} = context;
  let frame = 0, effectFrame = 0, alive = true, emitted = 0;
  let wave = 0, nextWave = INTRO, locks = 0;
  let charges = [], pending = [];

  function point(x, y, type, color, speed, angle) {
    emitted += bullets.emit({
      x, y, type, color, pattern: 1, count: 1, rows: 1,
      speed, angle, commands: [BIRTH], shotSound: -1, commandSound: -1,
    }).length;
  }

  function charge(x, y, color, delay) {
    const start = frame;
    if (presentation) charges.push(presentation.beginCharge({
      x, y, color, releaseColor: 'white', releaseFrame: delay,
      release: true, clock: () => Math.max(0, effectFrame - start),
    }));
    sound?.(54, x);
  }

  function foldedMoon(sheet, echo) {
    // A three-lobed speed contour opens into crane-like wings. Normal gaps
    // between individual bullets remain traversable outside the two folds.
    const count = echo ? 48 : 72;
    const offset = echo ? 0.02 : 0;
    const left = Math.PI / 2 + 0.32 + 0.09 * Math.sin(sheet.index * 0.83);
    const right = Math.PI / 2 - 0.32 + 0.09 * Math.sin(sheet.index * 0.61 + 1.2);
    for (let i = 0; i < count; i++) {
      const angle = i * TAU / count + offset;
      if (Math.abs(angle - left) < 0.105 || Math.abs(angle - right) < 0.105) continue;
      const speed = 1.48 + 0.24 * Math.cos(angle * 3 + sheet.index * 0.43);
      const x = sheet.x + Math.cos(angle) * 18, y = sheet.y + Math.sin(angle) * 12;
      const corner = !echo && i % 12 === 0;
      point(x, y, corner ? 11 : 8, corner ? WHITE : echo ? VIOLET : BLUE, speed, angle);
    }
    sound?.(21, sheet.x);
  }

  function lockInk(section) {
    // Each tell remembers one position. Later tells sample again, so an early
    // move changes the next stroke; movement after a tell cannot bend a shot.
    const targetX = player?.x ?? 0, targetY = player?.y ?? 400;
    const stroke = {kind: 'ink', due: frame + 24, x: f(boss.x), y: f(boss.y),
      angle: f(Math.atan2(targetY - boss.y, targetX - boss.x)), section};
    pending.push(stroke);locks++;
    charge(stroke.x, stroke.y, 'yellow', 24);
  }

  function writeInk(stroke) {
    // A narrow brush stroke can be streamed with small moves. Extra beads in
    // the last passage lengthen the commitment, without filling the whole fold.
    const beads = stroke.section === 2 ? 3 : 2;
    for (let lane = -1; lane <= 1; lane++) {
      const angle = stroke.angle + lane * 0.02;
      for (let bead = 0; bead < beads; bead++) {
        point(stroke.x - Math.cos(angle) * bead * 10, stroke.y - Math.sin(angle) * bead * 10,
          15, GOLD, 2.9, angle);
      }
    }
    sound?.(6, stroke.x);
  }

  function stop() {
    if (!alive) return;
    alive = false;pending = [];
    for (const owner of charges) owner.stop();
    charges = [];
    // The game owns bullets already in flight and phase settlement.
  }

  return {
    get frame() { return frame; },
    get alive() { return alive; },
    get completed() { return frame >= spellCard.duration; },
    update() {
      if (!alive) return;
      effectFrame = frame;
      boss.motion.position.x = f(24 * Math.sin(frame / 180));
      boss.motion.position.y = 76;
      if (frame === 30) charge(boss.x, boss.y, 'cyan', INTRO - frame);
      if (frame >= INTRO && frame < END) {
        const section = Math.min(2, Math.floor((frame - INTRO) / 810));
        if (frame === nextWave) {
          const sheet = {kind: 'echo', due: frame + 22, index: wave++, x: f(boss.x), y: f(boss.y)};
          foldedMoon(sheet, false);pending.push(sheet);
          nextWave += [108, 96, 84][section];
        }
        const inkBeat = (frame - 180) % 180;
        if (frame >= 180 && (inkBeat === 0 || inkBeat === 36 || inkBeat === 72)) lockInk(section);
      }
      const due = pending.filter(event => event.due === frame);
      pending = pending.filter(event => event.due > frame);
      for (const event of due) {
        if (event.kind === 'echo') foldedMoon(event, true);
        else writeInk(event);
      }
      charges = charges.filter(owner => owner.alive);
      frame++;
      if (frame >= spellCard.duration) stop();
    },
    stop,
    snapshot() { return {frame, alive, emitted, wave, locks, pending: pending.map(event => ({...event}))}; },
  };
}
