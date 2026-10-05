#pragma once
#include "raylib.h"

namespace tsstg {
// raylib 5.5 only resets an audio buffer while it is actively playing. Its
// StopMusicStream leaves queued PCM intact on paused/already stopped streams,
// and SeekMusicStream only moves the decoder and framesProcessed counter.
// Force that public reset path while muted; never expose private AudioBuffer
// layouts or unload/reopen a cached decoder just to rewind it.
inline void resetMusicStream(Music music, float volume) {
    SetMusicVolume(music, 0.f);
    PlayMusicStream(music);
    StopMusicStream(music);
    SetMusicVolume(music, volume);
}

inline void seekMusicStream(Music music, float seconds, float volume, bool playing, bool paused) {
    resetMusicStream(music, 0.f);
    SeekMusicStream(music, seconds);
    if (playing) {
        PlayMusicStream(music);
        // Prime while muted, keeping the stream's EOF policy. A region-loop
        // stream must not read past EOF and wrap into the file's intro.
        UpdateMusicStream(music);
        if (!IsMusicStreamPlaying(music)) {
            // raylib stops and rewinds when this fill reaches EOF. Preserve
            // the requested cursor/state; let the next normal host update
            // handle EOF and choose the configured region's start instead.
            resetMusicStream(music, 0.f);
            SeekMusicStream(music, seconds);
            PlayMusicStream(music);
        }
        if (paused) PauseMusicStream(music);
    }
    SetMusicVolume(music, volume);
}
}
