#include <bgfx/bgfx.h>
#include <bgfx/platform.h>
#include <emscripten/emscripten.h>
#include <emscripten/html5.h>
#include <iostream>

void emscriptenSetCanvas(bgfx::Init& init) {
    // Get the canvas element
    EmscriptenWebGLContextAttributes attr;
    emscripten_webgl_init_context_attributes(&attr);
    attr.alpha = false;
    attr.depth = true;
    attr.stencil = true;
    attr.antialias = true;
    attr.premultipliedAlpha = false;
    attr.preserveDrawingBuffer = false;
    attr.failIfMajorPerformanceCaveat = false;
    attr.enableExtensionsByDefault = true;
    attr.explicitSwapControl = false;
    attr.renderViaOffscreenBackBuffer = false;

    // Debug: Check if the canvas element exists
    EMSCRIPTEN_WEBGL_CONTEXT_HANDLE context = emscripten_webgl_create_context("#canvas", &attr);
    if (context <= 0) {
        std::cerr << "Failed to create WebGL context! Check if the canvas element with id 'canvas' exists." << std::endl;
        return;
    }

    emscripten_webgl_make_context_current(context);

    init.platformData.context = (void*)(uintptr_t)context;
    init.platformData.nwh = (void *)"#canvas";
}

void mainLoop() {
    // Set clear color to red
    bgfx::setViewClear(0, BGFX_CLEAR_COLOR | BGFX_CLEAR_DEPTH, 0xff0000ff, 1.0f, 0);

    // Begin frame
    bgfx::touch(0);

    // End frame
    bgfx::frame();
}

int main(int argc, char** argv) {
    // Initialize BGFX
    bgfx::Init init;
    init.type = bgfx::RendererType::OpenGL;
    init.vendorId = 0;
    init.resolution.width = 800;
    init.resolution.height = 600;
    init.resolution.reset = BGFX_RESET_VSYNC;
    init.platformData.nwh = (void *)"#canvas";
    init.platformData.type = bgfx::NativeWindowHandleType::Default;

    // Set platform data
    // emscriptenSetCanvas(init);

    if (!bgfx::init(init)) {
        std::cerr << "bgfx::init failed" << std::endl;
        return 1;
    }
    std::cout << "bgfx::init success" << std::endl;

    // Set the main loop
    emscripten_set_main_loop(mainLoop, 0, 1);

    // Shutdown BGFX
    bgfx::shutdown();

    return 0;
}