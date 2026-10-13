#include "tsstg/console.hpp"

#include <cstdio>
#include <iostream>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <fcntl.h>
#include <io.h>

#include <algorithm>
#include <array>
#include <cstdint>
#include <limits>
#include <string>
#endif

namespace tsstg {
namespace {

void flushOutput() noexcept {
    try {
        std::cout.flush();
        std::cerr.flush();
        std::clog.flush();
    } catch (...) {
        // Destruction and fatal-error reporting must not throw.
    }
    std::fflush(stdout);
    std::fflush(stderr);
}

#ifdef _WIN32
bool validHandle(HANDLE handle) noexcept {
    if (handle == nullptr || handle == INVALID_HANDLE_VALUE) return false;
    SetLastError(ERROR_SUCCESS);
    return GetFileType(handle) != FILE_TYPE_UNKNOWN || GetLastError() == ERROR_SUCCESS;
}

bool consoleHandle(HANDLE handle) noexcept {
    DWORD mode = 0;
    return validHandle(handle) && GetConsoleMode(handle, &mode) != FALSE;
}

bool redirectedHandle(HANDLE handle) noexcept {
    // Include NUL and other valid character devices: an explicit redirect must
    // not be replaced by a console or produce an unexpected error dialog.
    return validHandle(handle) && !consoleHandle(handle);
}

HANDLE streamHandle(FILE* stream) noexcept {
    const int descriptor = _fileno(stream);
    // A GUI subsystem starts unbound CRT streams with descriptor -2.
    if (descriptor < 0) return nullptr;
    return reinterpret_cast<HANDLE>(_get_osfhandle(descriptor));
}

struct StreamBinding {
    FILE* stream;
    DWORD standardId;
    bool input;
    HANDLE redirect = nullptr;
};

using StreamBindings = std::array<StreamBinding, 3>;

StreamBindings captureRedirects() noexcept {
    StreamBindings bindings{{
        {stdin, STD_INPUT_HANDLE, true},
        {stdout, STD_OUTPUT_HANDLE, false},
        {stderr, STD_ERROR_HANDLE, false},
    }};
    for (auto& binding : bindings) {
        const HANDLE standard = GetStdHandle(binding.standardId);
        const HANDLE crt = streamHandle(binding.stream);
        if (redirectedHandle(standard)) binding.redirect = standard;
        else if (redirectedHandle(crt)) binding.redirect = crt;
    }
    return bindings;
}

bool bindRedirect(FILE* stream, HANDLE redirect, bool input) noexcept {
    // freopen owns the old CRT descriptor, so operate on a duplicate of the
    // inherited redirect rather than transferring ownership of the caller's handle.
    HANDLE copy = nullptr;
    if (!DuplicateHandle(GetCurrentProcess(), redirect, GetCurrentProcess(),
                         &copy, 0, FALSE, DUPLICATE_SAME_ACCESS)) return false;
    const int source = _open_osfhandle(reinterpret_cast<std::intptr_t>(copy),
                                      (input ? _O_RDONLY : _O_WRONLY) | _O_TEXT);
    if (source < 0) {
        CloseHandle(copy);
        return false;
    }
    int destination = _fileno(stream);
    if (destination < 0) {
        // Give an unbound FILE a valid descriptor before _dup2. No console is
        // involved, and the inherited pipe/file is never reopened by pathname.
        if (std::freopen("NUL", input ? "r" : "w", stream) == nullptr) {
            _close(source);
            return false;
        }
        destination = _fileno(stream);
    }
    const bool rebound = destination >= 0 && _dup2(source, destination) == 0;
    _close(source);
    if (rebound) std::clearerr(stream);
    return rebound;
}

void restoreStreams(const StreamBindings& bindings, bool attached) noexcept {
    for (const auto& binding : bindings) {
        if (binding.redirect != nullptr) {
            // A CRT redirect may differ deliberately from GetStdHandle. Keep
            // both original destinations when both were valid before attachment.
            if (!redirectedHandle(streamHandle(binding.stream))) {
                bindRedirect(binding.stream, binding.redirect, binding.input);
            }
            SetStdHandle(binding.standardId, binding.redirect);
        } else if (attached) {
            if (!consoleHandle(streamHandle(binding.stream))) {
                std::freopen(binding.input ? "CONIN$" : "CONOUT$",
                             binding.input ? "r" : "w", binding.stream);
            }
            const HANDLE handle = streamHandle(binding.stream);
            if (validHandle(handle)) SetStdHandle(binding.standardId, handle);
        }
    }
    try {
        std::cin.clear();
        std::cout.clear();
        std::cerr.clear();
        std::clog.clear();
    } catch (...) {
    }
}

bool outputAvailable(FILE* stream, DWORD id) noexcept {
    return validHandle(streamHandle(stream)) || validHandle(GetStdHandle(id));
}

void writeDiagnostic(FILE* stream, DWORD id, std::string_view message) noexcept {
    if (validHandle(streamHandle(stream))) {
        std::fwrite(message.data(), 1, message.size(), stream);
        std::fputc('\n', stream);
        std::fflush(stream);
        return;
    }
    // Keep diagnostics available even if CRT descriptor repair failed.
    const HANDLE output = GetStdHandle(id);
    while (!message.empty()) {
        const auto count = static_cast<DWORD>((std::min)(
            message.size(), static_cast<std::size_t>((std::numeric_limits<DWORD>::max)())));
        DWORD written = 0;
        if (!WriteFile(output, message.data(), count, &written, nullptr) || written == 0) break;
        message.remove_prefix(written);
    }
    DWORD written = 0;
    WriteFile(output, "\n", 1, &written, nullptr);
}

void errorDialog(std::string_view message) noexcept {
    try {
        const auto length = static_cast<int>((std::min)(
            message.size(), static_cast<std::size_t>((std::numeric_limits<int>::max)())));
        const int count = MultiByteToWideChar(CP_UTF8, 0, message.data(), length, nullptr, 0);
        std::wstring text(static_cast<std::size_t>(count), L'\0');
        if (count > 0) MultiByteToWideChar(CP_UTF8, 0, message.data(), length, text.data(), count);
        MessageBoxW(nullptr, count > 0 ? text.c_str() : L"An unexpected error occurred.",
                    L"TS-STG", MB_OK | MB_ICONERROR);
    } catch (...) {
        MessageBoxW(nullptr, L"An unexpected error occurred.", L"TS-STG", MB_OK | MB_ICONERROR);
    }
}
#endif

} // namespace

ConsoleSession::ConsoleSession() noexcept {
#ifdef _WIN32
    // GUI startup still inherits redirected handles. Repair unbound CRT streams
    // without attaching to a terminal or creating a console window.
    restoreStreams(captureRedirects(), false);
#endif
}

ConsoleSession::~ConsoleSession() {
    flushOutput();
#ifdef _WIN32
    if (ownsConnection_) FreeConsole();
#endif
}

bool ConsoleSession::configure(ConsoleMode mode) noexcept {
#ifdef _WIN32
    if (mode == ConsoleMode::None) return hasConsole();
    const auto bindings = captureRedirects();
    if (!hasConsole()) {
        if (AttachConsole(ATTACH_PARENT_PROCESS)) ownsConnection_ = true;
        else if (mode == ConsoleMode::Visible && !hasConsole() && AllocConsole()) ownsConnection_ = true;
    }
    const bool attached = hasConsole();
    restoreStreams(bindings, attached);
    return attached;
#else
    (void)mode;
    return false;
#endif
}

bool ConsoleSession::hasConsole() const noexcept {
#ifdef _WIN32
    // Pseudoconsole sessions need not have a console HWND.
    DWORD process = 0;
    return GetConsoleProcessList(&process, 1) != 0;
#else
    return false;
#endif
}

bool ConsoleSession::hasDiagnosticOutput() const noexcept {
#ifdef _WIN32
    return hasConsole() || outputAvailable(stderr, STD_ERROR_HANDLE) || outputAvailable(stdout, STD_OUTPUT_HANDLE);
#else
    return true;
#endif
}

void ConsoleSession::reportError(std::string_view message, bool allowDialog) noexcept {
#ifdef _WIN32
    if (!outputAvailable(stderr, STD_ERROR_HANDLE) && !outputAvailable(stdout, STD_OUTPUT_HANDLE)) {
        configure(ConsoleMode::Parent);
    }
    if (outputAvailable(stderr, STD_ERROR_HANDLE)) {
        writeDiagnostic(stderr, STD_ERROR_HANDLE, message);
    } else if (outputAvailable(stdout, STD_OUTPUT_HANDLE)) {
        writeDiagnostic(stdout, STD_OUTPUT_HANDLE, message);
    } else if (allowDialog) {
        errorDialog(message);
    }
#else
    (void)allowDialog;
    std::fwrite(message.data(), 1, message.size(), stderr);
    std::fputc('\n', stderr);
    std::fflush(stderr);
#endif
}

} // namespace tsstg
