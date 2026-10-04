// Reproducible media coverage. The tiny checkerboard and demo WAV are original test assets.
const texture = tsstg.loadTexture('native/tests/assets/checker.bmp');
const sound = tsstg.loadSound('packages/thlib/assets/audio/shot.wav');
const music = tsstg.loadMusic('packages/thlib/assets/audio/shot.wav');
tsstg.playSound(sound, 0.1, 0.75, true);
tsstg.stopSound(sound);
tsstg.playMusic(music, 0.1);
tsstg.setMusicLoop(music, 0.005, 0.02);
tsstg.seekMusic(music, 0);
if (!Number.isFinite(tsstg.getMusicTime(music))) throw new Error('Invalid stream time');
let frame = 0;
globalThis.__tsstg_game = {
  update() { if (++frame === 4) tsstg.stopMusic(music); },
  render() { return [
    ['clear', 0x181d2fff],
    ['lineStrip', [[20,20,0xff0000ff],[40,30,0x00ff00ff],[60,10,0x0000ffff]]], ['point',65,20,0xffffffff],
    ['sprite', texture, 100, 120, 64, 64, 0, 0xffffffff],
    ['spriteRegion', texture, 0, 0, 1, 1, 200, 120, 64, 64, Math.PI / 4, 0xffffffff],
    ['blend', 'add'], ['circle', 300, 120, 32, 0xff003388], ['circle', 330, 120, 32, 0x0088ff88], ['blendEnd'],
    ['blend', 'multiply'], ['rect', 390, 90, 64, 64, 0x88ffffff], ['blendEnd'],
    ['scissor', 500, 90, 32, 64], ['rect', 480, 80, 90, 90, 0xffcc88ff], ['scissorEnd']
  ]; },
  snapshot() { if (frame !== 4) throw new Error('Media frame count mismatch'); return { frame, texture, sound, music }; }
};
