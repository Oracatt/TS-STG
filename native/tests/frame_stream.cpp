#include "tsstg/frame_stream.hpp"
#include <functional>
#include <iostream>
#include <stdexcept>
#include <string>

namespace {
void require(bool condition, const char* message) { if (!condition) throw std::runtime_error(message); }
void rejects(const std::function<void()>& operation) {
    bool rejected = false;
    try { operation(); } catch (const std::exception&) { rejected = true; }
    require(rejected, "Invalid frame stream argument was accepted");
}
}
int main() {
    try {
        tsstg::validateFrameStreamName("\\\\.\\pipe\\ts-stg-preview-123");
        for (const auto* name : {"", "preview", "C:\\preview", "\\\\server\\pipe\\preview", "\\\\.\\pipe\\", "\\\\.\\pipe\\nested\\preview", "\\\\.\\pipe\\bad/name", "\\\\.\\pipe\\bad:name"})
            rejects([&] { tsstg::validateFrameStreamName(name); });
        rejects([] { tsstg::validateFrameStreamName(std::string("\\\\.\\pipe\\bad\0name", 16)); });
        rejects([] { tsstg::validateFrameStreamName("\\\\.\\pipe\\" + std::string(256, 'a')); });
        const auto header = tsstg::frameStreamHeader(960, 720, 2764800);
        const std::array<std::uint8_t, 16> expected{'T','S','F','R',0xc0,3,0,0,0xd0,2,0,0,0,0x30,0x2a,0};
        require(header == expected, "Frame stream header must be little endian TSFR RGBA");
        rejects([] { tsstg::frameStreamHeader(0, 720, 0); });
        rejects([] { tsstg::frameStreamHeader(960, 720, 2764799); });
        rejects([] { tsstg::frameStreamHeader(0xffffffff, 0xffffffff, 0); });
        std::cout << "Frame stream protocol and local endpoint validation passed\n";
        return 0;
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
