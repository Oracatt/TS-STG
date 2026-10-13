#pragma once
#include <string>

namespace tsstg {
enum class WindowMode { Windowed, BorderlessFullscreen };
struct DisplayOptions {
    int width = 960, height = 720;
    WindowMode mode = WindowMode::Windowed;
};
struct DisplayViewport { float x=0, y=0, width=0, height=0; };
// The physical window never changes the 960 x 720 simulation/render canvas.
void setDisplaySize(DisplayOptions& display, const std::string& size);
void validateDisplayOptions(const DisplayOptions& display);
DisplayViewport fitDisplayViewport(int width, int height);
}
