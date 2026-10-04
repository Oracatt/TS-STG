#include "tsstg/host.hpp"
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
                std::cout << "TS-STG 0.1.0\n"
                    "ts-stg [entry.js] [--root path] [--headless] [--frames N]\n"
                    "       [--backend auto|quickjs|v8]\n"
                    "       [--input mask] [--snapshot path.json] [--screenshot path.png]\n"
                    "       [--profile path.json] [--profile-warmup N] [--benchmark]\n"
                    "Arrows: move  Z: shoot/confirm  X: bomb/cancel  Shift: focus  Esc: pause\n"
                    "Headless defaults to one update. Explicit --input overrides keyboard.\n";
#ifdef TSSTG_HAS_V8
                std::cout << "Backends: V8 (JIT, auto default), QuickJS-NG.\n";
#else
                std::cout << "Backends: QuickJS-NG (auto default). V8 was not compiled in.\n";
#endif
                return 0;
            }
            if (arg == "--root") options.root = std::filesystem::u8path(value());
            else if (arg == "--backend") {
                options.backend = value();
                if (options.backend != "auto" && options.backend != "quickjs" && options.backend != "v8")
                    throw std::runtime_error("--backend requires auto, quickjs or v8");
            }
            else if (arg == "--headless") options.headless = true;
            else if (arg == "--benchmark") options.benchmark = true;
            else if (arg == "--profile") options.profile = std::filesystem::u8path(value());
            else if (arg == "--profile-warmup") options.profileWarmup = parseUnsigned(value(),arg);
            else if (arg == "--frames") options.frames = parseUnsigned(value(), arg);
            else if (arg == "--input") {
                auto mask = parseUnsigned(value(), arg);
                if (mask > 1023) throw std::runtime_error("--input mask must be between 0 and 1023");
                options.input = static_cast<std::uint32_t>(mask);
            }
            else if (arg == "--snapshot") options.snapshot = std::filesystem::u8path(value());
            else if (arg == "--screenshot") options.screenshot = std::filesystem::u8path(value());
            else if (!arg.empty() && arg.front() == '-') throw std::runtime_error("Unknown option: " + arg);
            else if (hasEntry) throw std::runtime_error("Only one entry module is supported");
            else { options.entry = arg; hasEntry = true; }
        }
        if (options.headless && options.screenshot) throw std::runtime_error("--screenshot requires graphical mode");
        if (options.benchmark && (!options.frames || !*options.frames)) throw std::runtime_error("--benchmark requires --frames greater than zero");
        if (options.headless && !options.frames) options.frames = 1;
        return tsstg::runHost(options);
    } catch (const std::exception& error) {
        std::cerr << "TS-STG error: " << error.what() << '\n';
        return 1;
    }
}
