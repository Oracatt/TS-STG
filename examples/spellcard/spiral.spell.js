import {TouhouSpellCardTimeline} from '@ts-stg/thlib/touhou';

// The visual editor maintains only this JSON literal. All other code is yours.
// @spellcard-editor:begin
export const spellCard = {
  "format": "ts-stg-spellcard",
  "version": 1,
  "id": "spiral",
  "name": "环符「回旋」",
  "duration": 1800,
  "hp": 3000,
  "seed": 1,
  "boss": {
    "x": 0,
    "y": 96
  },
  "events": [
    {
      "id": "charge-1",
      "type": "charge",
      "frame": 0,
      "enabled": true,
      "x": 0,
      "y": 0,
      "origin": "boss",
      "color": "magenta",
      "releaseColor": "white",
      "releaseFrame": 60,
      "release": true,
      "sound": 54,
      "releaseSound": 6
    },
    {
      "id": "bullet-1",
      "type": "bullet",
      "frame": 60,
      "enabled": true,
      "x": 0,
      "y": 0,
      "origin": "boss",
      "duration": 1740,
      "interval": 30,
      "color": 2,
      "angle": 0,
      "rotation": 0.12,
      "bulletType": 0,
      "pattern": 3,
      "count": 24,
      "rows": 1,
      "speed": 2,
      "speedStep": 0,
      "angleStep": 0
    }
  ]
};
// @spellcard-editor:end

export function createSpell(context) {
  const timeline = new TouhouSpellCardTimeline(spellCard, context);

  return {
    get frame() { return timeline.frame; },
    get alive() { return timeline.alive; },
    get completed() { return timeline.completed; },

    update() {
      if (!timeline.alive) return;
      const frame = timeline.frame;

      // Add ordinary JavaScript here: loops, functions and your own state.
      // Example: emit a second ring every 60 frames before the visual events.
      // if (frame % 60 === 0) {
      //   context.bullets.emit({
      //     x: context.boss.x, y: context.boss.y, type: 0, color: 6,
      //     pattern: 3, count: 12, rows: 1, speed: 2,
      //     angle: context.random.unit() * Math.PI * 2,
      //   });
      // }

      timeline.update();
    },
    stop() { timeline.stop(); },
    snapshot() { return timeline.snapshot(); },
  };
}
