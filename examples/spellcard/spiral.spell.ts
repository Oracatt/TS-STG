import type {SpellContext} from './types.js';
// A spell is ordinary TypeScript. Edit this module and apply it to preview.
export const spellCard = {
  "id": "spiral",
  "name": "环符「回旋」",
  "duration": 1800,
  "hp": 3000,
  "seed": 1,
  "boss": {
    "x": 0,
    "y": 96
  }
};

export function createSpell(context: SpellContext) {
  let frame = 0;
  let alive = true;
  const completed = () => frame >= spellCard.duration;

  function fireRing(angle: number) {
    context.bullets.emit({
      x: context.boss.x, y: context.boss.y,
      type: 0, color: 2, pattern: 3, count: 24, rows: 1,
      speed: 2, angle,
    });
  }

  return {
    get frame() { return frame; },
    get alive() { return alive; },
    get completed() { return completed(); },
    update() {
      if (!alive) return;
      if (frame >= 60 && frame % 30 === 0) {
        fireRing((frame - 60) / 30 * 0.12);
      }
      frame++;
      if (completed()) alive = false;
    },
    stop() { alive = false; },
    snapshot() { return {frame, alive, completed: completed(), documentId: spellCard.id}; },
  };
}
