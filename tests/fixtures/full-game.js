import { Game, Keys } from '../../packages/thlib/dist/index.js';
import { createStage } from '../../examples/danmaku/stage.js';
import { background, hud } from '../../examples/danmaku/art.js';

export function createFixture() {
  const game = new Game({ seed: 20261002, stageFactory: createStage,
    renderBackground: background, renderHUD: hud });
  const events = { phaseStarts: 0, phaseEnds: 0, spells: [], enemyKills: 0, clear: 0 };
  game.on('phaseStart', () => events.phaseStarts++);
  game.on('phaseEnd', ({ result }) => { events.phaseEnds++; events.spells.push(result); });
  game.on('enemyDefeated', () => events.enemyKills++);
  game.on('clear', () => events.clear++);
  game.start(); game.player.invulnerableFrames = 20000;
  let frame = 0, peakBullets = 0, peakLasers = 0;
  return {
    update() {
      game.update(Keys.SHOOT | Keys.FOCUS);
      peakBullets = Math.max(peakBullets, game.world.query('enemyBullet').length);
      peakLasers = Math.max(peakLasers, game.world.query('enemyLaser').length);
      frame++;
    },
    render() { return game.render(); },
    snapshot() { return { frames: frame, events, peakBullets, peakLasers, game: game.snapshot() }; },
    game
  };
}
globalThis.__tsstg_game = createFixture();
