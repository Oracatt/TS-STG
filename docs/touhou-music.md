# Shared music lifecycle, volume and fade

Music files, track keys and loop points belong to the consuming game. The public `@ts-stg/thlib/touhou` entry provides `TouhouMusic` for cached playback, temporary-screen interruptions and the source volume/fade behavior. `TouhouApplication` and `TouhouGameOver` own the common continue-screen lifecycle; the application supplies the music player and its track table. No game's BGM is included in thlib or the default SDK.

```js
import {TouhouApplication, TouhouMusic} from '@ts-stg/thlib/touhou';

const music = new TouhouMusic(host, {
  stage: {file: 'stage.ogg', loopStart: 12, loopEnd: 90},
  'game-over': {file: 'players-score.ogg', loopStart: 7, loopEnd: 35},
}, {basePath: 'assets/music', volume: 0.75});
const app = new TouhouApplication({
  resources,
  musicPlayer: music,
  onAfterUpdate() { music.update(); },
});
// Select the business track when its stage starts; do not repeat every frame.
music.play('stage', {restart: true});
// app.destroy() does not dispose this caller-owned music player.
```

The sample filenames and loop bounds are illustrative; consumers supply their own tracks. `TouhouMusic` takes volume from 0 to 1 and loads each stream on its first request. `play(key, {restart:true})` starts at zero, including cached tracks. `play(key)` for the current track leaves its cursor unchanged. Pause/resume use the host's dedicated transport, and `update()` advances a fade once per fixed frame unless the player is paused. The caller disposes the music player when its application no longer needs it.

On an unfinished, non-spell-practice game over, `TouhouGameOver` saves the current track, position, pause state and fade, then starts the configured temporary track at zero. The default key is `game-over`; change it through `gameOverOptions.music`, or use `null` to disable automatic switching. An injected `TouhouMusic` must contain the selected key; unknown interruption tracks throw instead of silently losing the existing music. When Continue succeeds, the common owner restores the saved track position before the consumer's `onContinue` callback. Exit, retry and destruction stop the temporary track without restoring the abandoned run. Options, manual and replay-saving pages within the result menu keep the temporary music playing.

Original exceptions remain explicit: mode 2 (spell practice) retains the ongoing track on failure; a completed practice/result screen does not replace it; the replay/restart exit path does not start game-over music. Ordinary pause/resume remains separate from game over. `onOpen` is a notification/adapter hook, not a reason for demos using `musicPlayer` to implement a second switch.

Other temporary screens can call `music.interrupt(key)` directly. Its token exposes `restore()` and `discard()`, both safe to call more than once. Replacing a temporary track preserves the original recovery point and invalidates the old token; an explicit known `play`, `stop` or `dispose` invalidates outstanding tokens so an old screen cannot resume a track over a newer scene. Restoration uses the current volume setting and resumes a saved fade at its frozen frame. Accurate cursor restoration requires the injected host's `getMusicTime` and `seekMusic`; the native host supplies both. The application accepts an adapter implementing only `interrupt` when consumers already own another music transport.

Rush supplies six private tracks, including its own Player's Score asset. `RushMusic` only translates the imported loop-marker format into `TouhouMusic` tracks. Loading, pause/resume, gain, fades, restart and interruption handling use the shared owner; no Rush music rules or paths enter thlib.

`touhouMusicVolume(attenuation, volume)` returns DirectSound attenuation in hundredths of a decibel. `volume` is the original 0–100 setting. Convert its result to a linear host gain using `10 ** (attenuation / 2000)`. The music setting uses `1 - (1 - volume / 100)²`; sound effects deliberately use the separate cubic curve in `touhouEffectVolume`. For example, a music setting of 70 gives -450, approximately 0.596 linear gain. At setting 0 the source returns -10000.

```js
const fade = new TouhouMusicFade({
  seconds: 2,
  volume: 70,
  setVolume: gain => host.setMusicVolume(trackHandle, gain),
  stop: () => host.stopMusic(trackHandle),
});
// Update once per running fixed frame. Omit updates while the game is paused.
fade.update();
// Settings changes preserve the fade clock and playback position.
fade.setVolume(50);
```

Construction does not change volume or advance time. The default fade lasts 120 updates: frames 1–119 apply the source integer attenuation ramp from 0 toward -5000; frame 120 invokes `stop` once. Fade duration is truncated to the source float32 `seconds * 60` frame count. A duration below one frame stops on its first update. `destroy()` cancels future volume updates and completion without stopping the external stream. `snapshot()` exposes `frame`, `alive`, `remaining`, `duration`, `attenuation` and `volume` for tests or application state inspection. Neither the class nor these functions loads or selects a track.

The adapter must change gain without changing transport. Calling `playMusic` every frame is not a substitute for `setMusicVolume`: it can reset stream buffers and resume a paused track. A new game, stage or retry should explicitly stop and seek a cached track to zero before playing it. Pause and resume must instead use their dedicated transport calls, preserving the cursor. Repeated dialogue/combat requests for the same ongoing track can remain idempotent.

Resource caching and playback position have separate owners. `TouhouMusic` retains one handle per requested track and unloads them when disposed. Rush's title, title-subpage return, retry and new-run events request the appropriate cached track explicitly. Volume changes and pause/resume preserve its position. Track names, paths and scene-specific restart policy remain in the demo, while the common continue menu restores the interrupted track through thlib.

Loading is mixed according to resource type: the common resource owner reads animation JSON up front, while atlas textures and common sound handles load on first use. Rush's private textures and music also load on first use. These handles remain cached until their resource/graphics owner is disposed; changing scenes does not mean unloading every reusable asset. Scene animation objects and temporary text resources have shorter lifetimes.

The native host clears queued PCM when stopping or seeking, and never refills a stopped stream. The actual-device regression `native.music-transport` uses a generated silent WAV to check the pinned raylib transport; no audio device produces an explicit CTest skip. `node tools/verify-rushboss-music-restart.mjs` additionally exercises all six local Rush tracks and the real application's cached title/stage returns, failure switch, Continue cursor restoration, repeated failure and completed-result playback on V8 and QuickJS. It requires playback time to advance on an audio device and records source, executable and music hashes under `reports/rushboss/music-restart`. Output is muted; these checks verify playback state and cursor behavior, not listening quality or sample-exact mixing.

Source evidence is `Touhou20Reconstruction/source_reconstruction/audio_runtime/audio_state.cpp::music_volume` and `music_stream.cpp::fade_out/tick_fade` (mode 1). `sound_controller.cpp` command 2 stops, reopens at position zero, resets/fills and plays a new track; commands 6/7 use the separate pause/resume path. `dialogue_script.cpp` operation 21 starts the stage-clear owner, whose dismissal requests a two-second fade.

Continue-screen evidence is `pause_system/transitions.cpp:14,23–35`: ordinary game over pauses and saves the current track, then switches to the score track; spell practice and practice completion skip that switch. `environment.cpp:44` chooses `th128_08.wav`. `resume.cpp:28` reopens the saved song and seeks to its saved seconds, while `resume.cpp:36` uses UnPause for an ordinary pause. The local LuaSTG reference likewise puts interruption ownership in `THlib/ext/ext_pause_menu.lua:351–385` and death/continue selection in `ext_stage_group.lua:261–335`. Its included score recording is separate from this SDK's injected-resource policy.

The common spell sound is already owned by `TouhouSpell.begin`: source `card_system/start.cpp:36` requests sound 33 at the same time as the title and SpellCardAttack animation. `audio_constants.cpp` maps 33 to `se_cat00.wav` at -900 attenuation. Consumers should forward the spell context's `sound(id, x)` to their `TouhouAudio` and flush once after each fixed application update; adding a second demo-owned opening sound would duplicate the source event. The Rush regression tests cover all 16 practice cards, normal nonspell-to-spell handoff and the independent card's 160-frame preparation using the real common audio manifest and a recording host adapter. These are silent transport/call-order tests, not a claim of listening verification.
