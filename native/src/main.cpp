#include "tsstg/host.hpp"
#include "tsstg/frame_stream.hpp"
#include "tsstg/display_setup.hpp"
#include "tsstg/console.hpp"
#include <algorithm>
#include <iostream>
#include <limits>
#include <stdexcept>

namespace {
std::uint64_t parseUnsigned(const std::string& text, const std::string& option) {
    if (text.empty() || text.front() == '-') throw std::runtime_error(option + " requires a nonnegative integer");
    std::size_t end = 0;
    const auto value = std::stoull(text, &end, 0);
    if (end != text.size()) throw std::runtime_error(option + " requires an integer");
    return value;
}
}
int main(int argc, char** argv) {
    tsstg::ConsoleSession console;
    bool showConsole = false;
    bool allowErrorDialog = true;
    try {
        tsstg::Options options;
        bool hasEntry = false;
        for (int i = 1; i < argc; ++i) {
            const std::string arg = argv[i];
            auto value = [&]() -> std::string {
                if (++i == argc) throw std::runtime_error("Missing value for " + arg);
                return argv[i];
            };
            if (arg == "--help" || arg == "-h") {
                console.configure(showConsole ? tsstg::ConsoleMode::Visible : tsstg::ConsoleMode::Parent);
                std::cout << "TS-STG 0.1.0\n"
                    "ts-stg [entry.js] [--root path] [--headless] [--frames N]\n"
                    "       [--backend auto|quickjs|v8]\n"
                    "       [--console] (Windows debugging console; hidden by default)\n"
                    "       [--window-size WIDTHxHEIGHT] [--windowed|--fullscreen]\n"
                    "       [--display-config path.json] [--configure-display]\n"
                    "       [--input mask] [--snapshot path.json] [--screenshot path.png]\n"
                    "       [--profile path.json] [--profile-warmup N] [--benchmark]\n"
                    "       [--frame-stream local-pipe] (Windows hidden RGBA presentation)\n"
                    "Arrows: move  Z: shoot/confirm  X: bomb/cancel  Shift: focus  C: special  Esc: pause\n"
                    "Left/Right Ctrl: control modifier (2048). --input accepts 0 through 4095.\n"
                    "Alt+Enter: toggle desktop fullscreen; the 960x720 canvas keeps its aspect ratio.\n"
                    "Headless defaults to one update. Explicit --input overrides keyboard.\n";
#ifdef TSSTG_HAS_V8
                std::cout << "Backends: V8 (JIT, auto default), QuickJS-NG.\n";
#else
                std::cout << "Backends: QuickJS-NG (auto default). V8 was not compiled in.\n";
#endif
                return 0;
            }
            if (arg == "--root") options.root = std::filesystem::u8path(value());
            else if (arg == "--console") { showConsole = true; console.configure(tsstg::ConsoleMode::Visible); }
            else if (arg == "--backend") {
                options.backend = value();
                if (options.backend != "auto" && options.backend != "quickjs" && options.backend != "v8")
                    throw std::runtime_error("--backend requires auto, quickjs or v8");
            }
            else if (arg == "--headless") { options.headless = true; allowErrorDialog = false; }
            else if (arg == "--window-size") { tsstg::setDisplaySize(options.display,value()); options.displayConfigured = true; }
            else if (arg == "--fullscreen") { options.display.mode = tsstg::WindowMode::BorderlessFullscreen; options.displayConfigured = true; }
            else if (arg == "--windowed") { options.display.mode = tsstg::WindowMode::Windowed; options.displayConfigured = true; }
            else if (arg == "--display-config") options.displayConfig = std::filesystem::u8path(value());
            else if (arg == "--configure-display") options.configureDisplay = true;
            else if (arg == "--frame-stream") { allowErrorDialog = false; options.frameStream = value(); tsstg::validateFrameStreamName(*options.frameStream); }
            else if (arg == "--benchmark") { options.benchmark = true; allowErrorDialog = false; }
            else if (arg == "--profile") options.profile = std::filesystem::u8path(value());
            else if (arg == "--profile-warmup") options.profileWarmup = parseUnsigned(value(),arg);
            else if (arg == "--frames") { allowErrorDialog = false; options.frames = parseUnsigned(value(), arg); }
            else if (arg == "--input") {
                auto mask = parseUnsigned(value(), arg);
                if (mask > 4095) throw std::runtime_error("--input mask must be between 0 and 4095");
                options.input = static_cast<std::uint32_t>(mask);
            }
            else if (arg == "--snapshot") options.snapshot = std::filesystem::u8path(value());
            else if (arg == "--screenshot") options.screenshot = std::filesystem::u8path(value());
            else if (!arg.empty() && arg.front() == '-') throw std::runtime_error("Unknown option: " + arg);
            else if (hasEntry) throw std::runtime_error("Only one entry module is supported");
            else { options.entry = arg; hasEntry = true; }
        }
        if (options.headless && options.screenshot) throw std::runtime_error("--screenshot requires graphical mode");
        if (options.headless && options.frameStream) throw std::runtime_error("--frame-stream cannot be combined with --headless");
        if ((options.headless || options.frameStream) && options.display.mode == tsstg::WindowMode::BorderlessFullscreen)
            throw std::runtime_error("--fullscreen requires a visible graphical window");
        if ((options.headless || options.frameStream) && options.configureDisplay)
            throw std::runtime_error("--configure-display requires a visible graphical window");
        if (options.benchmark && (!options.frames || !*options.frames)) throw std::runtime_error("--benchmark requires --frames greater than zero");
        if (options.headless && !options.frames) options.frames = 1;
        if (!showConsole && !allowErrorDialog) console.configure(tsstg::ConsoleMode::Parent);
        if (!tsstg::prepareDisplay(options)) return 0;
        return tsstg::runHost(options);
    } catch (const std::exception& error) {
        // An invalid option may precede --headless/--frames. Such failures
        // must never block an unattended caller on a Windows message box.
        const bool automated = std::any_of(argv + 1, argv + argc, [](const char* value) {
            const std::string arg = value;
            return arg == "--headless" || arg == "--frames" || arg == "--frame-stream" ||
                   arg == "--benchmark" || arg == "--help" || arg == "-h";
        });
        console.reportError(std::string("TS-STG error: ") + error.what(), allowErrorDialog && !automated);
        return 1;
    }
}
