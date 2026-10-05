#include "tsstg/music_stream.hpp"

#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

namespace {
constexpr unsigned sampleRate = 44100;
constexpr unsigned duration = 8;
constexpr float cursorTolerance = 2.0f / sampleRate;

void check(bool condition, const std::string& message) {
    if (!condition) throw std::runtime_error(message);
}

// A generated, silent WAV makes this a real streaming/device test without
// requiring game resources, making noise or creating a graphical window.
std::vector<unsigned char> silentWave() {
    constexpr unsigned channels = 2, sampleBytes = 2;
    constexpr unsigned dataBytes = sampleRate * duration * channels * sampleBytes;
    std::vector<unsigned char> bytes(44 + dataBytes, 0);
    auto write16 = [&](unsigned offset, unsigned value) {
        bytes[offset] = static_cast<unsigned char>(value);
        bytes[offset + 1] = static_cast<unsigned char>(value >> 8);
    };
    auto write32 = [&](unsigned offset, unsigned value) {
        for (unsigned i = 0; i < 4; ++i) bytes[offset + i] = static_cast<unsigned char>(value >> (8 * i));
    };
    std::memcpy(bytes.data(), "RIFF", 4);
    write32(4, dataBytes + 36);
    std::memcpy(bytes.data() + 8, "WAVEfmt ", 8);
    write32(16, 16);
    write16(20, 1);
    write16(22, channels);
    write32(24, sampleRate);
    write32(28, sampleRate * channels * sampleBytes);
    write16(32, channels * sampleBytes);
    write16(34, sampleBytes * 8);
    std::memcpy(bytes.data() + 36, "data", 4);
    write32(40, dataBytes);
    return bytes;
}

struct Stream {
    std::vector<unsigned char> bytes = silentWave();
    Music music = LoadMusicStreamFromMemory(".wav", bytes.data(), static_cast<int>(bytes.size()));
    Stream() {
        check(IsMusicValid(music), "Cannot create the generated WAV stream");
        music.looping = true;
        SetMusicVolume(music, 0);
    }
    ~Stream() { UnloadMusicStream(music); }
};

void waitMilliseconds(unsigned milliseconds) {
    std::this_thread::sleep_for(std::chrono::milliseconds(milliseconds));
}

void runAudio(Music music) {
    PlayMusicStream(music);
    for (unsigned i = 0; i < 12; ++i) {
        UpdateMusicStream(music);
        waitMilliseconds(5);
    }
}

void expectCursor(Music music, float expected, const char* label, float tolerance = cursorTolerance) {
    const float actual = GetMusicTimePlayed(music);
    std::cout << label << ": expected=" << expected << " actual=" << actual
              << " playing=" << IsMusicStreamPlaying(music) << '\n';
    check(std::isfinite(actual) && std::abs(actual - expected) <= tolerance,
          std::string(label) + ": stale or incorrect playback cursor");
}

void cachedRestart(bool legacy) {
    Stream stream;
    runAudio(stream.music);
    const float before = GetMusicTimePlayed(stream.music);
    if (legacy) StopMusicStream(stream.music);
    else tsstg::resetMusicStream(stream.music, 0);
    // Reproduce a cached track serviced between scenes. Even with the Host
    // scheduler fixed, seek must discard previously queued audio on its own.
    for (unsigned i = 0; i < 3; ++i) UpdateMusicStream(stream.music);
    if (legacy) SeekMusicStream(stream.music, 0);
    else tsstg::seekMusicStream(stream.music, 0, 0, false, false);
    std::cout << "cached restart: previous=" << before << " requested=0\n";
    expectCursor(stream.music, 0, "cached restart while stopped");
    check(!IsMusicStreamPlaying(stream.music), "Seek started a stopped stream");
    ResumeMusicStream(stream.music);
    check(!IsMusicStreamPlaying(stream.music), "Seek changed a stopped stream into a paused stream");
    PlayMusicStream(stream.music);
    PauseMusicStream(stream.music);
    expectCursor(stream.music, 0, "cached restart starts at the intro", .05f);
}

void pausedStop() {
    Stream stream;
    tsstg::seekMusicStream(stream.music, 1.25f, 0, true, true);
    expectCursor(stream.music, 1.25f, "paused before stop");
    check(!IsMusicStreamPlaying(stream.music), "Prepared paused stream is playing");
    tsstg::resetMusicStream(stream.music, 0);
    expectCursor(stream.music, 0, "stop clears a paused stream");
    ResumeMusicStream(stream.music);
    check(!IsMusicStreamPlaying(stream.music), "Stop retained the paused stream's playing flag");
    tsstg::resetMusicStream(stream.music, 0);
    expectCursor(stream.music, 0, "repeated stop remains at zero");
}

void seekStates() {
    Stream stream;
    tsstg::seekMusicStream(stream.music, 2.25f, 0, true, true);
    expectCursor(stream.music, 2.25f, "first paused seek");
    tsstg::seekMusicStream(stream.music, 4.5f, 0, true, true);
    expectCursor(stream.music, 4.5f, "second paused seek flushes previous audio");
    check(!IsMusicStreamPlaying(stream.music), "Seeking resumed a paused stream");
    waitMilliseconds(35);
    UpdateMusicStream(stream.music);
    expectCursor(stream.music, 4.5f, "paused seek remains stationary");
    ResumeMusicStream(stream.music);
    check(IsMusicStreamPlaying(stream.music), "Seeking lost the paused stream's resume state");
    PauseMusicStream(stream.music);

    tsstg::seekMusicStream(stream.music, 5, 0, false, false);
    expectCursor(stream.music, 5, "stopped nonzero seek");
    waitMilliseconds(25);
    expectCursor(stream.music, 5, "stopped seek remains stationary");
    ResumeMusicStream(stream.music);
    check(!IsMusicStreamPlaying(stream.music), "Resume started a stream stopped before seek");

    tsstg::seekMusicStream(stream.music, 2.75f, 0, true, false);
    check(IsMusicStreamPlaying(stream.music), "Seek stopped a playing stream");
    PauseMusicStream(stream.music);
    expectCursor(stream.music, 2.75f, "playing nonzero seek", .05f);

    // The pinned raylib reports its cursor modulo stream duration. At the
    // exact end that is zero; it must not retain the previously queued PCM.
    stream.music.looping = false;
    tsstg::seekMusicStream(stream.music, static_cast<float>(duration), 0, false, false);
    expectCursor(stream.music, 0, "exact-end seek has no stale buffer");
    check(!IsMusicStreamPlaying(stream.music), "Exact-end seek started a stopped stream");
}

void nonloopEndSeek() {
    Stream stream;
    // The Host disables raylib's file loop when it owns a custom loop region.
    // Seeking near EOF must still let the next update stop the stream, so the
    // Host can enter that region instead of accidentally playing the intro.
    stream.music.looping = false;
    auto exercise = [&](float position, bool paused) {
        const std::string label = std::string(paused ? "paused" : "playing") +
            (position == duration ? " exact-EOF seek" : " near-EOF seek");
        tsstg::seekMusicStream(stream.music, position, 0, true, paused);
        check(IsMusicStreamPlaying(stream.music) == !paused,
              label + ": seek changed the requested transport state");
        PauseMusicStream(stream.music);
        expectCursor(stream.music, position == duration ? 0 : position, label.c_str());

        ResumeMusicStream(stream.music);
        check(IsMusicStreamPlaying(stream.music), label + ": stream cannot resume");
        UpdateMusicStream(stream.music);
        check(!IsMusicStreamPlaying(stream.music),
              label + ": priming wrapped past EOF and hid the loop-region boundary");
        expectCursor(stream.music, 0, (label + " signals EOF to the Host").c_str());
    };
    exercise(7.999f, true);
    exercise(7.999f, false);
    exercise(static_cast<float>(duration), true);
    exercise(static_cast<float>(duration), false);
}
}

int main(int argc, char** argv) {
    if (argc > 2 || (argc == 2 && std::string(argv[1]) != "--legacy")) {
        std::cerr << "Usage: tsstg-music-transport [--legacy]\n";
        return 2;
    }
    SetTraceLogLevel(LOG_WARNING);
    InitAudioDevice();
    if (!IsAudioDeviceReady()) {
        std::cout << "SKIP: no audio device; real music transport was not verified\n";
        return 77;
    }
    int result = 0;
    try {
        const bool legacy = argc == 2;
        cachedRestart(legacy);
        if (!legacy) {
            pausedStop();
            seekStates();
            nonloopEndSeek();
        }
        std::cout << "PASS: real-device silent music transport ("
                  << (legacy ? "legacy raylib path" : "engine transport helpers") << ")\n";
    } catch (const std::exception& error) {
        std::cerr << "FAIL: " << error.what() << '\n';
        result = 1;
    }
    CloseAudioDevice();
    return result;
}
