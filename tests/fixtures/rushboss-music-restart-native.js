// Private-media integration fixture. Requires a real audio device and normal
// paced rendering; headless/benchmark runs cannot verify stream transport.
import { SaveStore } from '@ts-stg/thlib';
import { RushMusic } from '../../games/rushboss/src/music.js';
import { createRushPortraitGame } from '../../games/rushboss/src/portrait-application.js';

export const RUSH_MUSIC_RESTART_FRAMES = Object.freeze({ transport: 450, application: 360 });

export function createRushMusicRestartFixture(host, { scene = 'transport' } = {}) {
  const nativeHost=host;
  host={...nativeHost,playMusic:id=>nativeHost.playMusic(id,0),setMusicVolume:id=>nativeHost.setMusicVolume(id,0),playSound(){}};
  if (!Object.hasOwn(RUSH_MUSIC_RESTART_FRAMES, scene)) throw new RangeError('Unknown music restart scene');
  const trace = [], completedTracks = new Set();
  let frame = 0, checks = 0, pausedTime = null, stoppedTime = null, pausedHandle = null;
  let app = null, music, titleHandle;
  const check = (condition, message) => {
    checks++;
    if (!condition) throw new Error(`Rush music ${scene}, frame ${frame}: ${message}`);
  };
  if (scene === 'application') {
    const store = new SaveStore();
    store.set('profile', { musicVolume: 0, soundVolume: 0 });
    app = createRushPortraitGame(host, { store, invincible: true, skipDialogue: true, seed: 13 });
    music = app.graphics.musicPlayer;
  } else {
    const manifest = JSON.parse(host.readText('games/rushboss/assets/manifest.json'));
    music = new RushMusic(host, manifest.music, { volume: 0 });
    music.play('title', { restart: true });
  }
  titleHandle = music.current;
  const time = (id = music.current) => host.getMusicTime(id);
  const sample = label => {
    const value = time();
    check(Number.isFinite(value), `${label}: invalid stream time`);
    const point = { frame, label, key: music.key, handle: music.current, time: value,
      ...(app ? { screen: app.screen } : {}) };
    trace.push(point);
    return value;
  };
  const zero = label => {
    const value = sample(label);
    check(Math.abs(value) < 0.025, `${label}: stream did not rewind to zero (${value})`);
  };
  const beganAtIntro = label => {
    const value = sample(label);
    check(value >= 0 && value < 1, `${label}: stream skipped the intro (${value})`);
  };
  const advanced = label => {
    const value = sample(label);
    check(value > 0.1, `${label}: audio did not advance; a real working audio device is required (${value})`);
    completedTracks.add(music.key);
    return value;
  };
  const play = key => { music.play(key, { restart: true }); zero('start-' + key); };
  const checkTitleHandle = () => check(music.current === titleHandle, 'Title restart replaced its cached music handle');
  const returnToTitle = () => {
    app.application.game.onExit();
    check(app.screen === 'title' && music.key === 'title', 'Game exit did not activate title scene/music');
    checkTitleHandle();
    zero('return-title');
  };
  const startBattle = () => {
    app.start({ character: 0, difficulty: 1, mode: 'normal', bossIndex: 0, phaseIndex: 0 });
    check(app.screen === 'battle' && music.key === 'grassland', 'Actual Rush session did not start its combat track');
    zero('start-game');
  };
  zero('initial-title');

  function updateTransport() {
    if (frame === 60) { advanced('title-before-pause'); music.pause(); pausedTime = time(); sample('paused-title'); }
    if (frame > 60 && frame < 90)
      check(Math.abs(time() - pausedTime) < 0.001, 'Paused title position advanced');
    if (frame === 90) { sample('pause-end'); music.resume(); }
    if (frame === 120) {
      check(advanced('title-resumed') > pausedTime + 0.1, 'Resume did not continue past the paused position');
      music.stop(); stoppedTime = time(titleHandle); trace.push({ frame, label: 'title-stopped', time: stoppedTime });
    }
    if (frame > 120 && frame < 240)
      check(Math.abs(time(titleHandle) - stoppedTime) < 0.001, 'Stopped cached title position advanced');
    if (frame === 180) play('grassland');
    if (frame === 181) beganAtIntro('grassland-first-frame');
    if (frame === 210) advanced('grassland-playing');
    if (frame === 240) { play('title'); checkTitleHandle(); }
    if (frame === 241) beganAtIntro('returned-title-first-frame');
    if (frame === 270) {
      advanced('returned-title-playing'); host.seekMusic(music.current, 3.25);
      const value = sample('playing-seek');
      check(Math.abs(value - 3.25) < 0.05, `Playing seek did not set decoder position (${value})`);
    }
    if (frame === 271) {
      const value = sample('playing-seek-next-frame');
      check(value >= 3.2 && value < 4.25, `Playing seek retained old buffered audio position (${value})`);
    }
    if (frame === 300) { play('title'); checkTitleHandle(); }
    if (frame === 301) beganAtIntro('same-title-restart-first-frame');
    if (frame === 330) { advanced('same-title-restart-playing'); play('gamestart'); }
    if (frame === 360) { advanced('gamestart-playing'); play('riverside'); }
    if (frame === 390) { advanced('riverside-playing'); play('frozenforest'); }
    if (frame === 420) { advanced('frozenforest-playing'); play('title'); checkTitleHandle(); }
    if (frame === 421) beganAtIntro('final-title-first-frame');
    if (frame === 450) advanced('final-title-playing');
  }

  function updateApplication() {
    if (frame === 60) advanced('title-playing');
    if (frame === 61) startBattle();
    if (frame === 62) beganAtIntro('first-game-first-frame');
    if (frame === 91) advanced('first-game-playing');
    if (frame === 121) {
      app.application.game.openPause(0); pausedHandle = music.current; pausedTime = time(); sample('game-paused');
    }
    if (frame > 121 && frame < 151)
      check(Math.abs(time(pausedHandle) - pausedTime) < 0.001, 'Actual pause menu did not hold music position');
    if (frame === 151) returnToTitle();
    if (frame === 152) beganAtIntro('paused-game-return-first-frame');
    if (frame === 180) advanced('paused-game-return-playing');
    if (frame === 181) startBattle();
    if (frame === 182) beganAtIntro('cached-game-first-frame');
    if (frame === 211) advanced('cached-game-playing');
    if (frame === 241) returnToTitle();
    if (frame === 242) beganAtIntro('active-game-return-first-frame');
    if (frame === 270) advanced('active-game-return-playing');
    if (frame === 271) app.application.menu.openUtilityPage(7);
    if (frame === 300) { app.application.menu.external.finish(); zero('options-return-title'); }
    if (frame === 301) beganAtIntro('options-return-first-frame');
    if (frame === 330) { advanced('options-return-playing'); app.application.menu.openDifficulty(); }
    if (frame === 340) { app.application.menu.returnMain(); zero('selection-return-title'); }
    if (frame === 341) beganAtIntro('selection-return-first-frame');
    if (frame === 360) advanced('selection-return-playing');
    app.update(0);
  }

  return {
    update() { frame++; if (scene === 'application') updateApplication(); else updateTransport(); },
    render() { return app ? app.render() : [['clear', 0x101820ff], ['text', 'Silent native music restart verification', 40, 40, 22, 0xffffffff]]; },
    snapshot() {
      check(frame === RUSH_MUSIC_RESTART_FRAMES[scene], 'Fixture ended before every transport check');
      check(completedTracks.size === (scene === 'transport' ? 5 : 2), 'Not every required music stream advanced');
      return { passed: true, scene, frame, checks, realAudioAdvanced: true, completedTracks: [...completedTracks],
        titleHandleReused: music.current === titleHandle, handleCount: music.handles.size, trace };
    },
    destroy() { if (app) app.destroy(); else music.dispose(); },
  };
}
