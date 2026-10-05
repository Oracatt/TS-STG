#include "tsstg/frame_stream.hpp"
#include <algorithm>
#include <filesystem>
#include <limits>
#include <stdexcept>
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#endif

namespace tsstg {
void validateFrameStreamName(const std::string& name) {
    constexpr char prefix[] = "\\\\.\\pipe\\";
    if (name.compare(0, sizeof(prefix)-1, prefix) != 0 || name.size() <= sizeof(prefix)-1 || name.size() > 256)
        throw std::runtime_error("--frame-stream requires a local \\\\.\\pipe\\name (maximum 256 bytes)");
    for (std::size_t i = sizeof(prefix)-1; i < name.size(); ++i) {
        const auto ch = static_cast<unsigned char>(name[i]);
        if (ch < 32 || ch == '\\' || ch == '/' || ch == ':')
            throw std::runtime_error("--frame-stream requires a single local pipe name");
    }
}
std::array<std::uint8_t, 16> frameStreamHeader(std::uint32_t width, std::uint32_t height, std::size_t payloadBytes) {
    const auto area = static_cast<std::uint64_t>(width)*height;
    if (!width || !height || area > std::numeric_limits<std::uint32_t>::max()/4 || area*4 != payloadBytes)
        throw std::runtime_error("Frame stream requires exactly width*height*4 RGBA bytes");
    std::array<std::uint8_t, 16> header{'T','S','F','R'};
    const std::array<std::uint32_t, 3> values{width, height, static_cast<std::uint32_t>(payloadBytes)};
    for (std::size_t i = 0; i < values.size(); ++i)
        for (std::size_t byte = 0; byte < 4; ++byte)
            header[4+i*4+byte] = static_cast<std::uint8_t>(values[i] >> (byte*8));
    return header;
}
FrameStream::FrameStream(const std::string& name) {
    validateFrameStreamName(name);
#ifdef _WIN32
    const auto wide = std::filesystem::u8path(name).wstring();
    const auto pipe = CreateFileW(wide.c_str(), GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (pipe == INVALID_HANDLE_VALUE)
        throw std::runtime_error("Cannot connect frame stream pipe (Windows error " + std::to_string(GetLastError()) + ")");
    pipe_ = pipe;
#else
    throw std::runtime_error("--frame-stream currently requires Windows");
#endif
}
FrameStream::~FrameStream() { close(); }
void FrameStream::close() {
#ifdef _WIN32
    if (pipe_) CloseHandle(static_cast<HANDLE>(pipe_));
#endif
    pipe_ = nullptr;
}
bool FrameStream::writeAll(const std::uint8_t* bytes, std::size_t size) {
#ifdef _WIN32
    if (!pipe_) return false;
    while (size) {
        const auto count = static_cast<DWORD>(std::min(size, static_cast<std::size_t>(std::numeric_limits<DWORD>::max())));
        DWORD written = 0;
        if (!WriteFile(static_cast<HANDLE>(pipe_), bytes, count, &written, nullptr)) {
            const auto error = GetLastError();
            close();
            if (error == ERROR_BROKEN_PIPE || error == ERROR_NO_DATA || error == ERROR_PIPE_NOT_CONNECTED) return false;
            throw std::runtime_error("Cannot write frame stream (Windows error " + std::to_string(error) + ")");
        }
        if (!written) { close(); return false; }
        bytes += written;
        size -= written;
    }
    return true;
#else
    (void)bytes; (void)size;
    return false;
#endif
}
bool FrameStream::writeFrame(std::uint32_t width, std::uint32_t height, const std::uint8_t* pixels, std::size_t size) {
    const auto header = frameStreamHeader(width, height, size);
    if (!pixels) throw std::runtime_error("Frame stream pixels must not be null");
    return writeAll(header.data(), header.size()) && writeAll(pixels, size);
}
}
