# Original music volume and fade

Music files, track selection and loop points belong to the consuming game. The public `@ts-stg/thlib/touhou` entry provides the source volume conversion and a host-independent fade clock, without including any game's BGM.

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

Source evidence is `Touhou20Reconstruction/source_reconstruction/audio_runtime/audio_state.cpp::music_volume` and `music_stream.cpp::fade_out/tick_fade` (mode 1). `sound_controller.cpp` command 2 stops, reopens at position zero, resets/fills and plays a new track; commands 6/7 use the separate pause/resume path. `dialogue_script.cpp` operation 21 starts the stage-clear owner, whose dismissal requests a two-second fade.

The common spell sound is already owned by `TouhouSpell.begin`: source `card_system/start.cpp:36` requests sound 33 at the same time as the title and SpellCardAttack animation. `audio_constants.cpp` maps 33 to `se_cat00.wav` at -900 attenuation. Consumers should forward the spell context's `sound(id, x)` to their `TouhouAudio` and flush once after each fixed application update; adding a second demo-owned opening sound would duplicate the source event. The Rush regression tests cover all 16 practice cards, normal nonspell-to-spell handoff and the independent card's 160-frame preparation using the real common audio manifest and a recording host adapter. These are silent transport/call-order tests, not a claim of listening verification.
