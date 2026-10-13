#pragma once

#include <string_view>

namespace tsstg {

enum class ConsoleMode {
    None,
    Parent,
    Visible,
};

// Windows GUI hosts stay detached by default. Existing pipe/file redirects are
// usable in every mode; requesting a console never replaces those redirects.
class ConsoleSession {
public:
    ConsoleSession() noexcept;
    ~ConsoleSession();
    ConsoleSession(const ConsoleSession&) = delete;
    ConsoleSession& operator=(const ConsoleSession&) = delete;

    // Parent only attaches when the parent has a console. Visible can allocate
    // one if attachment fails. Returns whether this process has a console.
    bool configure(ConsoleMode mode) noexcept;
    bool hasConsole() const noexcept;
    bool hasDiagnosticOutput() const noexcept;

    // The caller supplies the complete diagnostic, without a trailing newline.
    // Try the parent terminal before showing a GUI error when no output exists.
    void reportError(std::string_view message, bool allowDialog = true) noexcept;

private:
    bool ownsConnection_ = false;
};

} // namespace tsstg
