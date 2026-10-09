import { Game, Keys, stateHash } from '../../packages/thlib/dist/index.js';
import { createStage } from '../../examples/danmaku/stage.js';

const game = new Game({ seed: 78421, stageFactory: createStage, player: { lives: 20 } });
game.start();
let calls = 0, original, replay, verified = false;
globalThis.__tsstg_game = {
  update() {
    if (calls < 900) {
      const mask = Keys.SHOOT | (calls % 240 < 120 ? Keys.LEFT : Keys.RIGHT) |
        (calls % 170 < 85 ? Keys.FOCUS : 0) | ([280, 540].includes(calls) ? Keys.BOMB : 0) |
        ([400, 430].includes(calls) ? Keys.PAUSE : 0);
      game.update(mask);
      if (calls === 899) { original = game.snapshot(); replay = game.exportReplay(); }
    } else {
      if (calls === 900) game.playReplay(replay);
      game.update(0);
      if (calls === 1799) {
        if (stateHash(original) !== stateHash(game.snapshot())) throw new Error('Native replay final-state mismatch');
        verified = true;
      }
    }
    calls++;
  },
  render() { return game.render(); },
  snapshot() { return { calls, verified, recordedFrames: replay?.frames, simulationFrames: game.world.frame,
    bombsUsed: game.stats.bombsUsed, checksum: stateHash(original) }; }
};
