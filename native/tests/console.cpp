#include "tsstg/console.hpp"

#include <iostream>
#include <stdexcept>
#include <string>
#include <string_view>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>

#include <filesystem>

namespace {

void check(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

struct Handle {
    HANDLE value = nullptr;
    Handle() = default;
    explicit Handle(HANDLE handle) : value(handle) {}
    ~Handle() { reset(); }
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
    void reset(HANDLE handle = nullptr) {
        if (value != nullptr && value != INVALID_HANDLE_VALUE) CloseHandle(value);
        value = handle;
    }
};

struct Pipe {
    Handle read;
    Handle write;
    explicit Pipe(bool input = false) {
        SECURITY_ATTRIBUTES attributes{sizeof(SECURITY_ATTRIBUTES), nullptr, TRUE};
        check(CreatePipe(&read.value, &write.value, &attributes, 0) != FALSE, "CreatePipe failed");
        check(SetHandleInformation(input ? write.value : read.value, HANDLE_FLAG_INHERIT, 0) != FALSE,
              "SetHandleInformation failed");
    }
};

struct TemporaryFile {
    std::wstring path;
    Handle handle;
    TemporaryFile() {
        wchar_t directory[MAX_PATH + 1]{};
        wchar_t filename[MAX_PATH + 1]{};
        check(GetTempPathW(MAX_PATH, directory) != 0, "GetTempPath failed");
        check(GetTempFileNameW(directory, L"tst", 0, filename) != 0, "GetTempFileName failed");
        path = filename;
        SECURITY_ATTRIBUTES attributes{sizeof(SECURITY_ATTRIBUTES), nullptr, TRUE};
        handle.reset(CreateFileW(path.c_str(), GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE,
                                 &attributes, CREATE_ALWAYS, FILE_ATTRIBUTE_TEMPORARY | FILE_FLAG_DELETE_ON_CLOSE,
                                 nullptr));
        check(handle.value != INVALID_HANDLE_VALUE, "CreateFile failed");
    }
};

std::string readAll(HANDLE input) {
    std::string output;
    char buffer[2048];
    DWORD count = 0;
    while (ReadFile(input, buffer, sizeof(buffer), &count, nullptr) && count > 0) {
        output.append(buffer, count);
    }
    return output;
}

struct Result {
    std::string output;
    std::string error;
};

Result run(const std::wstring& executable, std::wstring_view option, bool fileOutput = false,
           bool redirectError = true) {
    Pipe input(true);
    Pipe output;
    Pipe error;
    TemporaryFile file;
    STARTUPINFOW startup{};
    startup.cb = sizeof(startup);
    startup.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    startup.wShowWindow = SW_HIDE;
    startup.hStdInput = input.read.value;
    startup.hStdOutput = fileOutput ? file.handle.value : output.write.value;
    startup.hStdError = redirectError ? error.write.value : nullptr;
    PROCESS_INFORMATION child{};
    std::wstring command = L"\"" + executable + L"\" " + std::wstring(option);
    check(CreateProcessW(executable.c_str(), command.data(), nullptr, nullptr, TRUE, 0,
                         nullptr, nullptr, &startup, &child) != FALSE, "CreateProcess failed");
    Handle process(child.hProcess);
    Handle thread(child.hThread);
    input.read.reset();
    output.write.reset();
    error.write.reset();
    constexpr char token[] = "console-input\n";
    DWORD written = 0;
    check(WriteFile(input.write.value, token, sizeof(token) - 1, &written, nullptr) != FALSE,
          "WriteFile stdin failed");
    input.write.reset();
    if (WaitForSingleObject(process.value, 5000) != WAIT_OBJECT_0) {
        TerminateProcess(process.value, 90);
        throw std::runtime_error("console probe timed out (unexpected dialog or pipe failure)");
    }
    DWORD exitCode = 91;
    check(GetExitCodeProcess(process.value, &exitCode) != FALSE && exitCode == 0, "console probe failed");
    if (fileOutput) {
        LARGE_INTEGER start{};
        check(SetFilePointerEx(file.handle.value, start, nullptr, FILE_BEGIN) != FALSE,
              "SetFilePointerEx failed");
    }
    return {readAll(fileOutput ? file.handle.value : output.read.value), readAll(error.read.value)};
}

void contains(const std::string& output, std::string_view expected) {
    if (output.find(expected) == std::string::npos) {
        throw std::runtime_error("missing probe output: " + std::string(expected) + "\nreceived:\n" + output);
    }
}

void verify(const Result& result, bool before, bool during, bool after, bool redirectedError = true) {
    contains(result.output, before ? "before=1" : "before=0");
    contains(result.output, during ? "configured=1" : "configured=0");
    contains(result.output, during ? "during=1" : "during=0");
    contains(result.output, "diagnostic=1");
    contains(result.output, "input=console-input");
    contains(result.output, "stdout-marker");
    contains(result.output, "buffered-before-destruction");
    contains(result.output, after ? "after=1" : "after=0");
    if (redirectedError) {
        contains(result.error, "stderr-marker");
        contains(result.error, "probe-error");
        check(result.output.find("stderr-marker") == std::string::npos, "stderr leaked into stdout");
    } else {
        contains(result.output, "probe-error");
        check(result.error.empty(), "unredirected stderr wrote to an unrelated pipe");
    }
}

} // namespace
#endif

int main(int argc, char** argv) {
    try {
#ifdef _WIN32
        check(argc == 2, "usage: tsstg-console <GUI console-probe.exe>");
        const auto executable = std::filesystem::u8path(argv[1]).wstring();
        tsstg::ConsoleSession parent;
        const bool parentAttached = parent.hasConsole();
        verify(run(executable, L"--none"), false, false, false);
        verify(run(executable, L"--visible"), false, true, false);
        verify(run(executable, L"--visible", true), false, true, false);
        verify(run(executable, L"--parent"), false, parentAttached, false);
        verify(run(executable, L"--without-parent-console"), false, false, false);
        verify(run(executable, L"--preconnected"), true, true, true);
        verify(run(executable, L"--none", false, false), false, false, false, false);
        check(parent.hasConsole() == parentAttached, "child session detached or changed its parent's console");
#else
        (void)argc;
        (void)argv;
        tsstg::ConsoleSession console;
        if (console.configure(tsstg::ConsoleMode::None) ||
            console.configure(tsstg::ConsoleMode::Parent) ||
            console.configure(tsstg::ConsoleMode::Visible) || !console.hasDiagnosticOutput()) {
            throw std::runtime_error("non-Windows console setup must be a no-op");
        }
#endif
        std::cout << "console session checks passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
