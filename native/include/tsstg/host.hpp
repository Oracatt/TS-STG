#pragma once
#include "backend.hpp"
#include <optional>

namespace tsstg {
struct Options {
    std::filesystem::path root = std::filesystem::current_path();
    std::string entry = "main.js";
    std::string backend = "auto";
    bool headless = false;
    bool benchmark = false;
    std::uint64_t profileWarmup = 60;
    std::optional<std::filesystem::path> profile;
    std::optional<std::uint64_t> frames;
    std::optional<std::uint32_t> input;
    std::optional<std::filesystem::path> snapshot;
    std::optional<std::filesystem::path> screenshot;
};
int runHost(const Options& options);
}
