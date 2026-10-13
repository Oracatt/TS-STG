#pragma once
#include "host.hpp"
#include <optional>
#include <string_view>

namespace tsstg {
// Preferences are platform presentation only and never part of game/replay data.
struct DisplayPreferences {
    DisplayOptions display;
    bool askEachStart = true;
};
std::optional<DisplayPreferences> parseDisplayPreferences(std::string_view text);
std::string serializeDisplayPreferences(const DisplayPreferences& preferences);
std::filesystem::path displayPreferencesPath(const std::filesystem::path& root,
                                            const std::filesystem::path& relative);
DisplayPreferences readDisplayPreferences(const std::filesystem::path& root,
                                         const std::filesystem::path& relative);
void saveDisplayPreferences(const std::filesystem::path& root,
                            const std::filesystem::path& relative,
                            const DisplayPreferences& preferences);
// False means the player cancelled before any game window/runtime was created.
bool prepareDisplay(Options& options);
}
