#include "tsstg/display.hpp"
#include <algorithm>
#include <charconv>
#include <cmath>
#include <stdexcept>

namespace tsstg {
void validateDisplayOptions(const DisplayOptions& display) {
    if (display.width < 480 || display.height < 360 || display.width > 16384 || display.height > 16384)
        throw std::runtime_error("Display size must be between 480x360 and 16384x16384");
}
void setDisplaySize(DisplayOptions& display, const std::string& size) {
    const auto separator = size.find('x');
    if (separator == std::string::npos || separator == 0 || separator + 1 == size.size())
        throw std::runtime_error("--window-size requires WIDTHxHEIGHT, for example 1280x960");
    const auto parse = [](const char* begin, const char* end) {
        int result = 0;
        const auto parsed = std::from_chars(begin, end, result, 10);
        if (parsed.ec != std::errc() || parsed.ptr != end)
            throw std::runtime_error("--window-size requires decimal WIDTHxHEIGHT");
        return result;
    };
    auto candidate = display;
    candidate.width = parse(size.data(), size.data()+separator);
    candidate.height = parse(size.data()+separator+1, size.data()+size.size());
    validateDisplayOptions(candidate);
    display = candidate;
}
DisplayViewport fitDisplayViewport(int width, int height) {
    if (width <= 0 || height <= 0) return {};
    const float scale = std::min(width / 960.f, height / 720.f);
    const float canvasWidth = 960.f * scale, canvasHeight = 720.f * scale;
    return {(width-canvasWidth)/2, (height-canvasHeight)/2, canvasWidth, canvasHeight};
}
DisplayCanvasSize displayCanvasSize(int renderWidth, int renderHeight) {
    const auto view = fitDisplayViewport(renderWidth, renderHeight);
    // Rounding the width to a multiple of four keeps both axes at exactly the
    // same density, including odd pixel sizes and non-integer desktop DPI.
    const int width = std::clamp(static_cast<int>(std::lround(view.width/4))*4, 960, 3840);
    return {width, width*3/4};
}
}
