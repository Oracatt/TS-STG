#include "tsstg/display_setup.hpp"
#include <chrono>
#include <fstream>
#include <iostream>
#include <stdexcept>

namespace fs = std::filesystem;
namespace {
void check(bool condition, const char* description) {
    if (!condition) throw std::runtime_error(description);
}
template<class Function> void rejects(Function action, const char* description) {
    try { action(); } catch (const std::exception&) { return; }
    throw std::runtime_error(description);
}
struct TemporaryDirectory {
    fs::path path = fs::temp_directory_path() / ("tsstg-display-preferences-" +
        std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
    TemporaryDirectory() { if (!fs::create_directory(path)) throw std::runtime_error("Cannot create test root"); }
    ~TemporaryDirectory() { std::error_code ignored; fs::remove_all(path, ignored); }
};
}
int main() {
    try {
        const tsstg::DisplayPreferences defaults;
        auto parsed = tsstg::parseDisplayPreferences(tsstg::serializeDisplayPreferences(defaults));
        check(parsed && parsed->display.width == 960 && parsed->display.height == 720 &&
              parsed->display.mode == tsstg::WindowMode::Windowed && parsed->askEachStart,
              "Default preferences round trip");
        auto fullscreen = defaults;
        fullscreen.display = {1280, 960, tsstg::WindowMode::BorderlessFullscreen};
        fullscreen.askEachStart = false;
        parsed = tsstg::parseDisplayPreferences(tsstg::serializeDisplayPreferences(fullscreen));
        check(parsed && parsed->display.width == 1280 && parsed->display.height == 960 &&
              parsed->display.mode == tsstg::WindowMode::BorderlessFullscreen && !parsed->askEachStart,
              "Fullscreen retains window dimensions and remembered prompt setting");
        parsed = tsstg::parseDisplayPreferences(R"({"askEachStart":false,"mode":"windowed","height":480,"width":640,"version":1})");
        check(parsed && parsed->display.width == 640, "Field order is irrelevant");
        parsed = tsstg::parseDisplayPreferences(R"({"askEachStart":false,"mode":"w\u0069ndowed","height":480,"width":640,"version":1})");
        check(parsed.has_value(), "Legal escaped ASCII is decoded before schema validation");
        const char* invalid[] = {
            "", "{}", "null", "[]", "{", "true", "{\"version\":1,}",
            R"({"version":1,"width":960,"height":720,"mode":"windowed","askEachStart":true} false)",
            R"({"version":1,"width":960,"height":720,"mode":"windowed","askEachStart":true,"width":960})",
            R"({"version":1,"width":960,"height":720,"mode":"windowed","askEachStart":true,"extra":0})",
            R"({"version":2,"width":960,"height":720,"mode":"windowed","askEachStart":true})",
            R"({"version":1,"width":960,"height":720,"mode":"exclusive","askEachStart":true})",
            R"({"version":1,"width":960,"height":720,"mode":"windowed","askEachStart":1})",
            R"({"version":1,"width":"960","height":720,"mode":"windowed","askEachStart":true})",
            R"({"version":1,"width":960.0,"height":720,"mode":"windowed","askEachStart":true})",
            R"({"version":1,"width":9.6e2,"height":720,"mode":"windowed","askEachStart":true})",
            R"({"version":1,"width":0960,"height":720,"mode":"windowed","askEachStart":true})",
            R"({"version":1,"width":-960,"height":720,"mode":"windowed","askEachStart":true})",
            R"({"version":1,"width":99999999999999999999999,"height":720,"mode":"windowed","askEachStart":true})",
            R"({"version":1,"width":960,"height":960,"mode":"windowed","askEachStart":true})",
            R"({"version":1,"width":960,"height":720,"mode":"windowed"})",
            R"({"version":1,"width":960,"height":720,"mode":"windowed","askEachStart":true,})",
            R"({"version":1,"width":960,"height":720,"mode":"windowed","askEachStart":true/*x*/})",
            R"({"version":1,"width":960,"height":720,"mode":"w\xindowed","askEachStart":true})"
        };
        for (const auto* text : invalid) check(!tsstg::parseDisplayPreferences(text), "Malformed or unsupported JSON must be rejected");
        check(!tsstg::parseDisplayPreferences(std::string(4097, ' ')), "Oversized preference data rejected");
        TemporaryDirectory temporary;
        const auto root = temporary.path;
        const auto relative = fs::path("userdata/display.json");
        const auto target = root / relative;
        check(tsstg::readDisplayPreferences(root, relative).askEachStart && !fs::exists(target),
              "Missing file returns defaults without creating userdata");
        rejects([&] { tsstg::displayPreferencesPath(root, "../display.json"); }, "Parent traversal accepted");
        rejects([&] { tsstg::displayPreferencesPath(root, root / "display.json"); }, "Absolute path accepted");
        rejects([&] { tsstg::displayPreferencesPath(root, "."); }, "Root directory accepted as config");
        rejects([&] { tsstg::displayPreferencesPath(root, ""); }, "Empty path accepted");
#ifdef _WIN32
        rejects([&] { tsstg::displayPreferencesPath(root, "userdata/display.json:stream"); }, "Alternate stream accepted");
        rejects([&] { tsstg::displayPreferencesPath(root, "\\display.json"); }, "Root-relative path accepted");
#endif
        // An existing symlink must not bypass root containment. Windows without
        // symlink privilege skips only the platform operation, not other cases.
        TemporaryDirectory outside;
        std::error_code linkError;
        fs::create_directory_symlink(outside.path, root / "outside", linkError);
        if (!linkError) rejects([&] { tsstg::displayPreferencesPath(root, "outside/display.json"); }, "Escaping directory symlink accepted");
        tsstg::saveDisplayPreferences(root, relative, fullscreen);
        parsed = tsstg::readDisplayPreferences(root, relative);
        check(parsed->display.width == 1280 && !parsed->askEachStart, "Saved preferences reload");
        tsstg::saveDisplayPreferences(root, relative, defaults);
        parsed = tsstg::readDisplayPreferences(root, relative);
        check(parsed->display.width == 960 && parsed->askEachStart, "Existing preferences replaced atomically");
        for (const auto& file : fs::directory_iterator(target.parent_path()))
            check(file.path().filename() == "display.json", "Atomic save left a temporary file");
        auto invalidPreferences = defaults;
        invalidPreferences.display.width = 123;
        rejects([&] { tsstg::saveDisplayPreferences(root, relative, invalidPreferences); }, "Unsupported preferences saved");
        check(tsstg::readDisplayPreferences(root, relative).display.width == 960, "Failed validation must preserve old file");
        { std::ofstream file(target); file << "{ broken JSON"; }
        check(tsstg::readDisplayPreferences(root, relative).askEachStart, "Corrupt file falls back to safe prompt defaults");
        { std::ofstream file(target); file << std::string(4097, ' '); }
        check(tsstg::readDisplayPreferences(root, relative).display.width == 960, "Oversized file falls back to defaults");
        for (int scenario = 0; scenario < 4; ++scenario) {
            tsstg::Options options;
            options.root = root;
            options.displayConfig = "userdata/never-created.json";
            options.configureDisplay = true;
            if (scenario == 0) options.headless = true;
            if (scenario == 1) options.frames = 0;
            if (scenario == 2) options.frameStream = "test";
            if (scenario == 3) options.displayConfigured = true;
            check(tsstg::prepareDisplay(options) && !fs::exists(root / *options.displayConfig),
                  "Automated/explicit display startup must not prompt or write preferences");
        }
        tsstg::Options noConfiguration;
        noConfiguration.root = root;
        check(tsstg::prepareDisplay(noConfiguration), "Generic engine remains opt-in");
        std::cout << "Display preferences: schema, persistence, containment, fallback and automation bypass passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
