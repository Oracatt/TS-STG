import { Game, SaveStore } from '@ts-stg/thlib';
import { createStage } from './stage.js';
import { background, hud } from './art.js';

const nativeHost = globalThis.tsstg;
const store = new SaveStore(nativeHost ? {
  readText: name => nativeHost.readText(`userdata/${name}`),
  writeText: (name, text) => nativeHost.writeText(name, text)
} : null);
export const game = new Game({
  seed: 20261002, difficulty: 'normal', title: 'THE MOONLIT ARCHIVE',
  bounds: { x: 32, y: 24, width: 576, height: 672 },
  stageFactory: createStage,
  menu: { title: 'MOONLIT ARCHIVE', subtitle: 'An open sky for your imagination', layout: { x: 84, y: 300, width: 476 } },
  renderBackground: background, renderHUD: hud,
  store, onQuit: () => nativeHost?.quit()
});

// Only this adapter knows the native host. thlib remains independently importable.
if (globalThis.tsstg) {
  const native = globalThis.tsstg;
  const sound = {};
  try {
    // The application supplies the installed asset location. thlib's manifest
    // contains only paths relative to this explicitly selected directory.
    const soundRoot = 'packages/thlib/assets';
    const manifest = JSON.parse(native.readText(`${soundRoot}/manifest.json`));
    for (const [key, clip] of Object.entries(manifest.sounds))
      sound[key] = native.loadSound(`${soundRoot}/${clip.file}`);
    const music = native.loadMusic('examples/danmaku/assets/moonlit.wav');
    native.playMusic(music, game.settings.volume * .5);
    game.on('settings', () => native.playMusic(music, game.settings.volume * .5));
  } catch (error) { native.log(`Audio unavailable: ${error.message}`); }
  const lastFrame = {};
  for (const [event, cue] of [['shot','shot'], ['graze','graze'], ['item','pickup'], ['miss','hit'], ['bomb','bomb']])
    game.on(event, () => {
      const frame = game.world?.frame ?? 0;
      if (sound[cue] && frame - (lastFrame[cue] ?? -100) >= (cue === 'shot' ? 7 : 3)) {
        native.playSound(sound[cue], (cue === 'shot' ? .17 : .57) * game.settings.volume);
        lastFrame[cue] = frame;
      }
    });
}
globalThis.__tsstg_game = game;
