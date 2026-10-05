// 月折「借光的纸鹤」 — a 45-second, five-phrase spell.
// Read the blue fold, bait the gold ink, then cross after the last paper wing.
// All objects, birth animations and hitboxes belong to public thlib.
export const spellCard = {
  format: 'ts-stg-spellcard', version: 1,
  id: 'moonfold', name: '月折「借光的纸鹤」',
  duration: 45 * 60, hp: 9000, seed: 0x4d4f4f4e,
  boss: {x: 0, y: 76}, events: [],
};

const INTRO = 120, PHRASE = 480, PHRASES = 5;
const BLUE = 8, VIOLET = 6, WHITE = 15, GOLD = 14;
const BIRTH = {type: 1, ints: [1]};

export function createSpell(context) {
  const {boss, bullets, player, presentation, sound} = context;
  let frame = 0, effectFrame = 0, alive = true, aim = Math.fround(Math.PI / 2);
  let charges = [];
  let emitted = 0;

  function point(x, y, type, color, speed, angle = Math.PI / 2) {
    const result = bullets.emit({
      x, y, type, color, pattern: 1, count: 1, rows: 1,
      speed, angle, commands: [BIRTH], shotSound: -1, commandSound: -1,
    });
    emitted += result.length;
  }

  function charge(x, y, color, delay) {
    const start = frame;
    if (presentation) charges.push(presentation.beginCharge({
      x, y, color, releaseColor: 'white', releaseFrame: delay,
      release: true, clock: () => Math.max(0, effectFrame - start),
    }));
    sound?.(54, x);
  }

  // Two edges meet at the central crease: a whole sheet travels as one shape.
  // The generous missing strip is a real opening, not a different hitbox.
  function paperWing(phrase, row, side) {
    const gap = side * (66 + row * 7);
    const halfGap = phrase < 2 ? 34 : 29;
    const speed = 1.95;
    for (let i = 0; i <= 46; i++) {
      const x = -184 + i * 8;
      if (Math.abs(x - gap) < halfGap) continue;
      const distance = Math.abs(x);
      const upper = 42 + distance * 0.08;
      const lower = 42 + distance * 0.31 + distance * distance * 0.0015;
      point(x, upper, 8, row % 2 ? VIOLET : BLUE, speed);
      if (i !== 23) point(x, lower, 8, row % 2 ? BLUE : VIOLET, speed);
      // A few white fold corners give the sheets a readable silhouette.
      if ((i === 0 || i === 23 || i === 46) && Math.abs(x - gap) >= halfGap + 8)
        point(x, lower - 7, 11, WHITE, speed);
    }
    sound?.(21, gap);
  }

  // An outer arc and a narrower inner arc draw an open crescent. Both fall
  // on the opposite side of the safe fold and leave before the crossing beat.
  function crescent(phrase, side, echo) {
    const radius = echo ? 52 : 66;
    const cx = -side * (echo ? 108 : 86), cy = echo ? 94 : 100;
    const inner = phrase < 3 ? 0.38 : 0.12;
    for (let i = 0; i <= 34; i++) {
      const angle = -Math.PI / 2 + Math.PI * i / 34;
      const y = cy + radius * Math.sin(angle);
      point(cx + side * radius * Math.cos(angle), y, 8, BLUE, 1.95);
      if (i !== 0 && i !== 34)
        point(cx + side * inner * radius * Math.cos(angle), y, 8, echo ? VIOLET : WHITE, 1.95);
    }
  }

  function goldenInk(phrase, burst) {
    // One captured angle for the entire phrase: moving does not drag the fan.
    const count = phrase < 3 ? 3 : 5;
    for (let i = 0; i < count; i++) {
      const angle = aim + (i - (count - 1) / 2) * 0.026;
      // Three beads make each needle a short, legible pen stroke.
      for (let bead = 0; bead < 3; bead++) {
        const offset = bead * 9;
        point(boss.x - Math.cos(angle) * offset, boss.y - Math.sin(angle) * offset,
          15, GOLD, 3.1, angle);
      }
    }
    sound?.(burst === 0 ? 6 : 21, boss.x);
  }

  function stop() {
    if (!alive) return;
    alive = false;
    for (const owner of charges) owner.stop();
    charges = [];
    // Emitted bullets remain under thlib's phase/Bomb/cancellation owner.
  }

  return {
    get frame() { return frame; },
    get alive() { return alive; },
    get completed() { return frame >= spellCard.duration; },
    update() {
      if (!alive) return;
      effectFrame = frame;
      if (frame === 36) charge(boss.x, boss.y, 'cyan', 84);
      if (frame >= INTRO && frame < INTRO + PHRASE * PHRASES) {
        const phrase = Math.floor((frame - INTRO) / PHRASE);
        const beat = (frame - INTRO) % PHRASE;
        const side = phrase % 2 ? 1 : -1;
        // A small slow bow stays above the play area; hold still to write gold.
        boss.x = beat < 252 ? side * 18 * Math.sin(beat / 252 * Math.PI) : 0;
        boss.y = 76;
        if (beat === 0) sound?.(6, boss.x);
        if (beat >= 24 && beat <= 168 && (beat - 24) % 36 === 0)
          paperWing(phrase, (beat - 24) / 36, side);
        if (beat === 64 || beat === 112) crescent(phrase, side, beat === 112);
        if (beat === 252) {
          aim = Math.fround(Math.atan2((player?.y ?? 400) - boss.y, (player?.x ?? side * 80) - boss.x));
          charge(boss.x, boss.y, 'yellow', 28);
        }
        if (beat === 280 || beat === 294 || beat === 308)
          goldenInk(phrase, (beat - 280) / 14);
        // 374..454 is the intended focused crossing beat. No new attacks here.
      }
      charges = charges.filter(owner => owner.alive);
      frame++;
      if (frame >= spellCard.duration) stop();
    },
    stop,
    snapshot() { return {frame, alive, emitted, aim, phrase: Math.max(0, Math.floor((frame - INTRO) / PHRASE))}; },
  };
}
