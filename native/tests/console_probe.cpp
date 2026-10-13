#include "tsstg/console.hpp"

#include <iostream>
#include <string>
#include <string_view>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>

namespace {

bool attached() {
    DWORD process = 0;
    return GetConsoleProcessList(&process, 1) != 0;
}

int runWithoutParentConsole() {
    // This executable has the GUI subsystem, so it is a parent that genuinely
    // has no console even when CTest or its test driver has one.
    if (attached()) return 20;
    std::wstring executable(32768, L'\0');
    const DWORD length = GetModuleFileNameW(nullptr, executable.data(), static_cast<DWORD>(executable.size()));
    if (length == 0 || length >= executable.size()) return 21;
    executable.resize(length);
    std::wstring command = L"\"" + executable + L"\" --parent";
    STARTUPINFOW startup{};
    startup.cb = sizeof(startup);
    startup.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    startup.wShowWindow = SW_HIDE;
    startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    startup.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
    startup.hStdError = GetStdHandle(STD_ERROR_HANDLE);
    PROCESS_INFORMATION child{};
    if (!CreateProcessW(executable.c_str(), command.data(), nullptr, nullptr, TRUE,
                        0, nullptr, nullptr, &startup, &child)) return 22;
    CloseHandle(child.hThread);
    if (WaitForSingleObject(child.hProcess, 5000) != WAIT_OBJECT_0) {
        TerminateProcess(child.hProcess, 23);
        CloseHandle(child.hProcess);
        return 23;
    }
    DWORD code = 24;
    GetExitCodeProcess(child.hProcess, &code);
    CloseHandle(child.hProcess);
    return static_cast<int>(code);
}

} // namespace
#endif

int main(int argc, char** argv) {
    const std::string_view option = argc > 1 ? argv[1] : "--none";
#ifdef _WIN32
    if (option == "--without-parent-console") return runWithoutParentConsole();
    if (option == "--preconnected" && !AllocConsole()) return 25;
    const bool before = attached();
#else
    const bool before = false;
#endif
    {
        tsstg::ConsoleSession console;
        const auto mode = option == "--visible" ? tsstg::ConsoleMode::Visible
            : option == "--parent" ? tsstg::ConsoleMode::Parent : tsstg::ConsoleMode::None;
        const bool configured = console.configure(mode);
        std::cout << "before=" << before << '\n'
                  << "configured=" << configured << '\n'
                  << "during=" << console.hasConsole() << '\n'
                  << "diagnostic=" << console.hasDiagnosticOutput() << '\n';
        std::string input;
        std::getline(std::cin, input);
        std::cout << "input=" << input << '\n' << "stdout-marker\n";
        std::cerr << "stderr-marker\n";
        // With redirects this must never block on a MessageBox, even though a
        // graphical application would otherwise be permitted to display one.
        console.reportError("probe-error", true);
        std::cout << "buffered-before-destruction\n";
    }
#ifdef _WIN32
    std::cout << "after=" << attached() << '\n';
    if (option == "--preconnected") FreeConsole();
#else
    std::cout << "after=0\n";
#endif
    return 0;
}
