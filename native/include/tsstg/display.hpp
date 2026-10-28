#pragma once
#include <string>

namespace tsstg {
enum class WindowMode { Windowed, BorderlessFullscreen };
struct DisplayOptions {
    int width = 960, height = 720;
    WindowMode mode = WindowMode::Windowed;
};
struct DisplayViewport { float x=0, y=0, width=0, height=0; };
struct DisplayCanvasSize { int width=960, height=720; };
// Window pixels never change the 960 x 720 logical coordinate system.
void setDisplaySize(DisplayOptions& display, const std::string& size);
void validateDisplayOptions(const DisplayOptions& display);
DisplayViewport fitDisplayViewport(int width, int height);
// Physical 4:3 canvas, capped at 4x and never below the logical resolution.
DisplayCanvasSize displayCanvasSize(int renderWidth, int renderHeight);
}
