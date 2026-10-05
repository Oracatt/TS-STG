#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <string>

namespace tsstg {
// Local presentation transport, independent of scripts and gameplay.
void validateFrameStreamName(const std::string& name);
std::array<std::uint8_t, 16> frameStreamHeader(std::uint32_t width, std::uint32_t height, std::size_t payloadBytes);

class FrameStream final {
public:
    explicit FrameStream(const std::string& name);
    ~FrameStream();
    FrameStream(const FrameStream&) = delete;
    FrameStream& operator=(const FrameStream&) = delete;
    // RGBA rows must be supplied top to bottom. False means the reader closed.
    bool writeFrame(std::uint32_t width, std::uint32_t height, const std::uint8_t* pixels, std::size_t size);
private:
    bool writeAll(const std::uint8_t* bytes, std::size_t size);
    void close();
    void* pipe_ = nullptr;
};
}
