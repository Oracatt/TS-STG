#include "tsstg/display_setup.hpp"
#include <algorithm>
#include <array>
#include <atomic>
#include <cctype>
#include <cerrno>
#include <chrono>
#include <cstdio>
#include <cwctype>
#include <fstream>
#include <iterator>
#include <stdexcept>
#include <system_error>
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#else
#include <fcntl.h>
#include <unistd.h>
#endif

namespace tsstg {
namespace fs = std::filesystem;
namespace {
constexpr std::array<std::array<int, 2>, 5> sizes{{
    {{640, 480}}, {{960, 720}}, {{1280, 960}}, {{1920, 1440}}, {{2560, 1920}}
}};
bool preset(int width, int height) {
    return std::any_of(sizes.begin(), sizes.end(), [&](const auto& size) {
        return size[0] == width && size[1] == height;
    });
}
// A bounded parser for this versioned, flat schema. Unknown/duplicate fields,
// coercions, fractional dimensions and trailing JSON are deliberately rejected.
class PreferenceParser {
public:
    explicit PreferenceParser(std::string_view text) : text_(text) {}
    DisplayPreferences parse() {
        DisplayPreferences value;
        unsigned seen = 0;
        require('{');
        for (;;) {
            const auto key = string();
            require(':');
            unsigned bit = 0;
            if (key == "version") { bit = 1; if (integer() != 1) fail(); }
            else if (key == "width") { bit = 2; value.display.width = integer(); }
            else if (key == "height") { bit = 4; value.display.height = integer(); }
            else if (key == "mode") {
                bit = 8;
                const auto mode = string();
                if (mode == "windowed") value.display.mode = WindowMode::Windowed;
                else if (mode == "fullscreen") value.display.mode = WindowMode::BorderlessFullscreen;
                else fail();
            } else if (key == "askEachStart") { bit = 16; value.askEachStart = boolean(); }
            else fail();
            if (seen & bit) fail();
            seen |= bit;
            if (take('}')) break;
            require(',');
        }
        whitespace();
        if (seen != 31 || position_ != text_.size() || !preset(value.display.width, value.display.height)) fail();
        return value;
    }
private:
    [[noreturn]] static void fail() { throw std::invalid_argument("Invalid display preferences"); }
    void whitespace() {
        while (position_ < text_.size() && (text_[position_] == ' ' || text_[position_] == '\r' ||
               text_[position_] == '\n' || text_[position_] == '\t')) ++position_;
    }
    bool take(char c) {
        whitespace();
        if (position_ == text_.size() || text_[position_] != c) return false;
        ++position_;
        return true;
    }
    void require(char c) { if (!take(c)) fail(); }
    std::string string() {
        require('"');
        std::string result;
        while (position_ < text_.size()) {
            unsigned char c = static_cast<unsigned char>(text_[position_++]);
            if (c == '"') return result;
            if (c < 0x20 || c > 0x7f) fail(); // All schema strings are ASCII.
            if (c == '\\') {
                if (position_ == text_.size()) fail();
                c = static_cast<unsigned char>(text_[position_++]);
                switch (c) {
                case '"': case '\\': case '/': break;
                case 'b': c = '\b'; break;
                case 'f': c = '\f'; break;
                case 'n': c = '\n'; break;
                case 'r': c = '\r'; break;
                case 't': c = '\t'; break;
                case 'u': {
                    unsigned code = 0;
                    for (int i = 0; i < 4; ++i) {
                        if (position_ == text_.size()) fail();
                        const char digit = text_[position_++];
                        code *= 16;
                        if (digit >= '0' && digit <= '9') code += digit - '0';
                        else if (digit >= 'a' && digit <= 'f') code += digit - 'a' + 10;
                        else if (digit >= 'A' && digit <= 'F') code += digit - 'A' + 10;
                        else fail();
                    }
                    if (code > 0x7f) fail();
                    c = static_cast<unsigned char>(code);
                    break;
                }
                default: fail();
                }
            }
            result.push_back(static_cast<char>(c));
        }
        fail();
    }
    int integer() {
        whitespace();
        if (position_ == text_.size() || text_[position_] < '0' || text_[position_] > '9') fail();
        int result = 0;
        const bool zero = text_[position_] == '0';
        int count = 0;
        while (position_ < text_.size() && text_[position_] >= '0' && text_[position_] <= '9') {
            if (++count > 5 || (zero && count > 1)) fail();
            result = result * 10 + text_[position_++] - '0';
        }
        return result;
    }
    bool boolean() {
        whitespace();
        if (text_.substr(position_, 4) == "true") { position_ += 4; return true; }
        if (text_.substr(position_, 5) == "false") { position_ += 5; return false; }
        fail();
    }
    std::string_view text_;
    std::size_t position_ = 0;
};
bool sameComponent(const fs::path& first, const fs::path& second) {
#ifdef _WIN32
    const auto left = first.native(), right = second.native();
    return CompareStringOrdinal(left.c_str(), static_cast<int>(left.size()), right.c_str(),
                                static_cast<int>(right.size()), TRUE) == CSTR_EQUAL;
#else
    return first == second;
#endif
}
bool containedBy(const fs::path& root, const fs::path& path) {
    auto child = path.begin();
    for (auto parent = root.begin(); parent != root.end(); ++parent, ++child) {
        if (child == path.end() || !sameComponent(*parent, *child)) return false;
    }
    return child != path.end();
}
void atomicWrite(const fs::path& target, const std::string& contents) {
    static std::atomic<unsigned long> serial{0};
    fs::path temporary;
    const auto nonce = std::chrono::steady_clock::now().time_since_epoch().count();
#ifdef _WIN32
    HANDLE file = INVALID_HANDLE_VALUE;
    for (int attempt = 0; attempt < 32; ++attempt) {
        temporary = target;
        temporary += L".tmp." + std::to_wstring(GetCurrentProcessId()) + L"." +
                     std::to_wstring(nonce) + L"." + std::to_wstring(serial++);
        file = CreateFileW(temporary.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW,
                           FILE_ATTRIBUTE_NORMAL, nullptr);
        if (file != INVALID_HANDLE_VALUE) break;
        if (GetLastError() != ERROR_FILE_EXISTS) throw std::system_error(GetLastError(), std::system_category(), "Create display preferences");
    }
    if (file == INVALID_HANDLE_VALUE) throw std::runtime_error("Cannot create display preferences temporary file");
    DWORD written = 0;
    const bool saved = WriteFile(file, contents.data(), static_cast<DWORD>(contents.size()), &written, nullptr) &&
                       written == contents.size() && FlushFileBuffers(file);
    const DWORD error = saved ? ERROR_SUCCESS : GetLastError();
    CloseHandle(file);
    if (!saved) {
        DeleteFileW(temporary.c_str());
        throw std::system_error(error, std::system_category(), "Write display preferences");
    }
    if (!MoveFileExW(temporary.c_str(), target.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
        const DWORD moveError = GetLastError();
        DeleteFileW(temporary.c_str());
        throw std::system_error(moveError, std::system_category(), "Replace display preferences");
    }
#else
    int file = -1;
    for (int attempt = 0; attempt < 32; ++attempt) {
        temporary = target;
        temporary += ".tmp." + std::to_string(getpid()) + "." + std::to_string(nonce) + "." + std::to_string(serial++);
        file = open(temporary.c_str(), O_CREAT | O_EXCL | O_WRONLY, 0600);
        if (file >= 0) break;
        if (errno != EEXIST) throw std::system_error(errno, std::generic_category(), "Create display preferences");
    }
    if (file < 0) throw std::runtime_error("Cannot create display preferences temporary file");
    std::size_t offset = 0;
    int error = 0;
    while (offset < contents.size()) {
        const auto count = write(file, contents.data() + offset, contents.size() - offset);
        if (count < 0 && errno == EINTR) continue;
        if (count <= 0) { error = errno ? errno : EIO; break; }
        offset += static_cast<std::size_t>(count);
    }
    if (!error && fsync(file)) error = errno;
    if (close(file) && !error) error = errno;
    if (!error && rename(temporary.c_str(), target.c_str())) error = errno;
    if (error) { unlink(temporary.c_str()); throw std::system_error(error, std::generic_category(), "Save display preferences"); }
#endif
}

#ifdef _WIN32
constexpr int windowedId = 101, fullscreenId = 102, resolutionId = 103, askId = 104;
void initializeDisplayDpi() {
    // GLFW makes this same choice at InitWindow; do it before creating the
    // startup dialog so work-area limits and the game use the same pixels.
    const HMODULE user = GetModuleHandleW(L"user32.dll");
    using SetContext = BOOL (WINAPI*)(HANDLE);
    if (const auto setContext = reinterpret_cast<SetContext>(GetProcAddress(user, "SetProcessDpiAwarenessContext"))) {
        setContext(reinterpret_cast<HANDLE>(static_cast<INT_PTR>(-4))); // PER_MONITOR_AWARE_V2
        return; // ERROR_ACCESS_DENIED also means a caller already chose awareness.
    }
    if (HMODULE shcore = LoadLibraryExW(L"shcore.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32)) {
        using SetAwareness = HRESULT (WINAPI*)(int);
        const auto setAwareness = reinterpret_cast<SetAwareness>(GetProcAddress(shcore, "SetProcessDpiAwareness"));
        if (setAwareness) setAwareness(2); // PROCESS_PER_MONITOR_DPI_AWARE
        FreeLibrary(shcore);
        if (setAwareness) return;
    }
    SetProcessDPIAware();
}
int primaryDpi() {
    using GetDpi = UINT (WINAPI*)();
    if (const auto getDpi = reinterpret_cast<GetDpi>(GetProcAddress(GetModuleHandleW(L"user32.dll"), "GetDpiForSystem")))
        return static_cast<int>(getDpi());
    HDC screen = GetDC(nullptr);
    const int dpi = screen ? GetDeviceCaps(screen, LOGPIXELSY) : 96;
    if (screen) ReleaseDC(nullptr, screen);
    return dpi;
}
void adjustWindow(RECT& rectangle, DWORD style, DWORD extendedStyle, int dpi) {
    using Adjust = BOOL (WINAPI*)(LPRECT, DWORD, BOOL, DWORD, UINT);
    if (const auto adjust = reinterpret_cast<Adjust>(GetProcAddress(GetModuleHandleW(L"user32.dll"), "AdjustWindowRectExForDpi")))
        adjust(&rectangle, style, FALSE, extendedStyle, static_cast<UINT>(dpi));
    else AdjustWindowRectEx(&rectangle, style, FALSE, extendedStyle);
}
struct SetupDialog {
    DisplayPreferences preferences;
    std::vector<std::array<int, 2>> available;
    HWND window = nullptr, resolution = nullptr;
    HFONT font = nullptr;
    bool complete = false, accepted = false;
    int dpi = 96;
    int pixels(int value) const { return MulDiv(value, dpi, 96); }
};
RECT workArea() {
    // GLFW initially centers the game on the primary monitor. Its work area
    // must also determine which windowed resolutions the player can choose.
    MONITORINFO monitor{sizeof(monitor)};
    if (!GetMonitorInfoW(MonitorFromPoint(POINT{0, 0}, MONITOR_DEFAULTTOPRIMARY), &monitor))
        throw std::runtime_error("Cannot query display work area");
    return monitor.rcWork;
}
std::vector<std::array<int, 2>> fittingSizes(const RECT& work) {
    std::vector<std::array<int, 2>> available;
    for (const auto& size : sizes) {
        RECT outer{0, 0, size[0], size[1]};
        adjustWindow(outer, WS_OVERLAPPEDWINDOW, 0, primaryDpi());
        if (outer.right - outer.left <= work.right - work.left &&
            outer.bottom - outer.top <= work.bottom - work.top) available.push_back(size);
    }
    return available;
}
void fitWindowPreference(DisplayPreferences& preferences, const std::vector<std::array<int, 2>>& available) {
    if (available.empty()) { preferences.display.mode = WindowMode::BorderlessFullscreen; return; }
    const auto selected = std::find_if(available.begin(), available.end(), [&](const auto& size) {
        return size[0] == preferences.display.width && size[1] == preferences.display.height;
    });
    if (selected == available.end()) {
        preferences.display.width = available.back()[0];
        preferences.display.height = available.back()[1];
    }
}
void updateResolutionEnabled(SetupDialog& dialog) {
    EnableWindow(dialog.resolution, IsDlgButtonChecked(dialog.window, windowedId) == BST_CHECKED && !dialog.available.empty());
}
LRESULT CALLBACK setupWindowProc(HWND window, UINT message, WPARAM wp, LPARAM lp) {
    auto* dialog = reinterpret_cast<SetupDialog*>(GetWindowLongPtrW(window, GWLP_USERDATA));
    if (message == WM_NCCREATE) {
        dialog = static_cast<SetupDialog*>(reinterpret_cast<CREATESTRUCTW*>(lp)->lpCreateParams);
        SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(dialog));
        dialog->window = window;
    }
    if (!dialog) return DefWindowProcW(window, message, wp, lp);
    if (message == WM_CLOSE || (message == WM_COMMAND && LOWORD(wp) == IDCANCEL)) {
        dialog->complete = true;
        DestroyWindow(window);
        return 0;
    }
    if (message == WM_COMMAND) {
        const int id = LOWORD(wp);
        if (id == windowedId || id == fullscreenId) {
            CheckRadioButton(window, windowedId, fullscreenId, id);
            updateResolutionEnabled(*dialog);
            return 0;
        }
        if (id == IDOK) {
            const auto index = SendMessageW(dialog->resolution, CB_GETCURSEL, 0, 0);
            if (index >= 0 && static_cast<std::size_t>(index) < dialog->available.size()) {
                dialog->preferences.display.width = dialog->available[static_cast<std::size_t>(index)][0];
                dialog->preferences.display.height = dialog->available[static_cast<std::size_t>(index)][1];
            }
            dialog->preferences.display.mode = IsDlgButtonChecked(window, fullscreenId) == BST_CHECKED ?
                WindowMode::BorderlessFullscreen : WindowMode::Windowed;
            dialog->preferences.askEachStart = IsDlgButtonChecked(window, askId) == BST_CHECKED;
            dialog->accepted = true;
            dialog->complete = true;
            DestroyWindow(window);
            return 0;
        }
    }
    return DefWindowProcW(window, message, wp, lp);
}
bool showSetup(DisplayPreferences& preferences, const RECT& work, std::vector<std::array<int, 2>> available) {
    SetupDialog dialog;
    dialog.preferences = preferences;
    dialog.available = std::move(available);
    dialog.dpi = primaryDpi();
    // Keep the confirm/cancel controls reachable even on a small high-DPI
    // work area. The game resolution choices themselves remain physical px.
    dialog.dpi = std::max(48, std::min({dialog.dpi,
        static_cast<int>((work.right - work.left - 24) * 96 / 390),
        static_cast<int>((work.bottom - work.top - 64) * 96 / 276)}));
    const HINSTANCE instance = GetModuleHandleW(nullptr);
    const wchar_t* className = L"TSSTG.DisplaySetup";
    WNDCLASSW klass{};
    klass.lpfnWndProc = setupWindowProc;
    klass.hInstance = instance;
    klass.hCursor = LoadCursorW(nullptr, MAKEINTRESOURCEW(32512));
    klass.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_BTNFACE + 1);
    klass.lpszClassName = className;
    if (!RegisterClassW(&klass) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS)
        throw std::runtime_error("Cannot register display setup window");
    const DWORD style = WS_CAPTION | WS_SYSMENU;
    RECT outer{0, 0, dialog.pixels(390), dialog.pixels(276)};
    adjustWindow(outer, style, WS_EX_DLGMODALFRAME, primaryDpi());
    const int width = outer.right - outer.left, height = outer.bottom - outer.top;
    const int x = work.left + std::max(0L, (work.right - work.left - width) / 2);
    const int y = work.top + std::max(0L, (work.bottom - work.top - height) / 2);
    HWND window = CreateWindowExW(WS_EX_DLGMODALFRAME | WS_EX_CONTROLPARENT, className, L"显示设置",
        style, x, y, width, height, nullptr, nullptr, instance, &dialog);
    if (!window) throw std::runtime_error("Cannot create display setup window");
    dialog.font = CreateFontW(-MulDiv(10, dialog.dpi, 72), 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
        DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Microsoft YaHei UI");
    auto control = [&](const wchar_t* type, const wchar_t* label, DWORD flags, int id, int left, int top, int w, int h) {
        HWND child = CreateWindowExW(0, type, label, WS_CHILD | WS_VISIBLE | flags, dialog.pixels(left),
            dialog.pixels(top), dialog.pixels(w), dialog.pixels(h), window,
            reinterpret_cast<HMENU>(static_cast<INT_PTR>(id)), instance, nullptr);
        if (child) SendMessageW(child, WM_SETFONT, reinterpret_cast<WPARAM>(dialog.font), TRUE);
        return child;
    };
    control(L"STATIC", L"请选择游戏的显示方式", 0, -1, 22, 18, 344, 24);
    control(L"BUTTON", L"窗口", WS_TABSTOP | WS_GROUP | BS_AUTORADIOBUTTON, windowedId, 24, 54, 110, 24);
    control(L"BUTTON", L"全屏（保持画面比例）", BS_AUTORADIOBUTTON, fullscreenId, 142, 54, 224, 24);
    control(L"STATIC", L"窗口分辨率", 0, -1, 24, 96, 104, 24);
    dialog.resolution = control(L"COMBOBOX", L"", WS_TABSTOP | CBS_DROPDOWNLIST | WS_VSCROLL, resolutionId, 142, 92, 214, 170);
    for (std::size_t i = 0; i < dialog.available.size(); ++i) {
        const auto& size = dialog.available[i];
        const auto label = std::to_wstring(size[0]) + L" × " + std::to_wstring(size[1]);
        SendMessageW(dialog.resolution, CB_ADDSTRING, 0, reinterpret_cast<LPARAM>(label.c_str()));
        if (size[0] == preferences.display.width && size[1] == preferences.display.height)
            SendMessageW(dialog.resolution, CB_SETCURSEL, i, 0);
    }
    control(L"STATIC", L"全屏使用桌面分辨率，画面等比居中。\r\n游戏中可按 Alt + Enter 切换显示方式。", 0, -1, 24, 133, 340, 42);
    control(L"BUTTON", L"每次启动时询问", WS_TABSTOP | BS_AUTOCHECKBOX, askId, 24, 185, 322, 24);
    control(L"BUTTON", L"启动游戏", WS_TABSTOP | BS_DEFPUSHBUTTON, IDOK, 162, 232, 94, 28);
    control(L"BUTTON", L"取消", WS_TABSTOP | BS_PUSHBUTTON, IDCANCEL, 268, 232, 94, 28);
    CheckRadioButton(window, windowedId, fullscreenId, preferences.display.mode == WindowMode::Windowed ? windowedId : fullscreenId);
    CheckDlgButton(window, askId, preferences.askEachStart ? BST_CHECKED : BST_UNCHECKED);
    if (dialog.available.empty()) EnableWindow(GetDlgItem(window, windowedId), FALSE);
    updateResolutionEnabled(dialog);
    ShowWindow(window, SW_SHOW);
    SetForegroundWindow(window);
    SetFocus(GetDlgItem(window, IDOK));
    MSG message{};
    while (!dialog.complete) {
        const auto result = GetMessageW(&message, nullptr, 0, 0);
        if (result <= 0) { if (result == 0) PostQuitMessage(static_cast<int>(message.wParam)); break; }
        if (message.message == WM_KEYDOWN && message.wParam == VK_ESCAPE) {
            SendMessageW(window, WM_COMMAND, IDCANCEL, 0);
            continue;
        }
        if (message.message == WM_KEYDOWN && message.wParam == VK_RETURN &&
            !SendMessageW(dialog.resolution, CB_GETDROPPEDSTATE, 0, 0)) {
            SendMessageW(window, WM_COMMAND, GetFocus() == GetDlgItem(window, IDCANCEL) ? IDCANCEL : IDOK, 0);
            continue;
        }
        if (!IsDialogMessageW(window, &message)) { TranslateMessage(&message); DispatchMessageW(&message); }
    }
    if (IsWindow(window)) DestroyWindow(window);
    if (dialog.font) DeleteObject(dialog.font);
    if (dialog.accepted) preferences = dialog.preferences;
    return dialog.accepted;
}
#endif
}

std::optional<DisplayPreferences> parseDisplayPreferences(std::string_view text) {
    if (text.empty() || text.size() > 4096) return std::nullopt;
    try { return PreferenceParser(text).parse(); }
    catch (const std::invalid_argument&) { return std::nullopt; }
}
std::string serializeDisplayPreferences(const DisplayPreferences& preferences) {
    if (!preset(preferences.display.width, preferences.display.height))
        throw std::invalid_argument("Display preferences must use a supported window resolution");
    if (preferences.display.mode != WindowMode::Windowed && preferences.display.mode != WindowMode::BorderlessFullscreen)
        throw std::invalid_argument("Invalid display preference mode");
    return "{\n  \"version\": 1,\n  \"width\": " + std::to_string(preferences.display.width) +
        ",\n  \"height\": " + std::to_string(preferences.display.height) + ",\n  \"mode\": \"" +
        (preferences.display.mode == WindowMode::Windowed ? "windowed" : "fullscreen") +
        "\",\n  \"askEachStart\": " + (preferences.askEachStart ? "true" : "false") + "\n}\n";
}
fs::path displayPreferencesPath(const fs::path& root, const fs::path& relative) {
    if (relative.empty() || relative.is_absolute() || relative.has_root_name() || relative.has_root_directory() || !relative.has_filename())
        throw std::invalid_argument("Display preferences path must be relative to the project root");
    for (const auto& component : relative) {
        const auto name = component.native();
        if (component == ".." || name.find(fs::path::value_type(0)) != fs::path::string_type::npos)
            throw std::invalid_argument("Invalid display preferences path");
#ifdef _WIN32
        if (name.find(L':') != std::wstring::npos) throw std::invalid_argument("Invalid display preferences path");
#endif
    }
    const auto base = fs::canonical(root);
    const auto resolved = fs::weakly_canonical(base / relative);
    if (!containedBy(base, resolved)) throw std::invalid_argument("Display preferences path escapes the project root");
    return resolved;
}
DisplayPreferences readDisplayPreferences(const fs::path& root, const fs::path& relative) {
    const auto path = displayPreferencesPath(root, relative);
    std::ifstream file(path, std::ios::binary);
    if (!file) return {};
    std::array<char, 4097> bytes{};
    file.read(bytes.data(), static_cast<std::streamsize>(bytes.size()));
    const auto count = file.gcount();
    if (file.bad() || count > 4096) return {};
    return parseDisplayPreferences(std::string_view(bytes.data(), static_cast<std::size_t>(count))).value_or(DisplayPreferences{});
}
void saveDisplayPreferences(const fs::path& root, const fs::path& relative, const DisplayPreferences& preferences) {
    auto path = displayPreferencesPath(root, relative);
    const auto contents = serializeDisplayPreferences(preferences);
    fs::create_directories(path.parent_path());
    // Recheck after creating parent directories, including existing junctions.
    path = displayPreferencesPath(root, relative);
    atomicWrite(path, contents);
}
bool prepareDisplay(Options& options) {
    if (options.headless || options.frames || options.frameStream || options.displayConfigured) return true;
    if (!options.displayConfig && !options.configureDisplay) return true;
    const auto relative = options.displayConfig.value_or(fs::path("userdata/display.json"));
    auto preferences = readDisplayPreferences(options.root, relative);
#ifdef _WIN32
    initializeDisplayDpi();
    const bool force = (GetAsyncKeyState(VK_SHIFT) & 0x8000) || (GetAsyncKeyState(VK_CONTROL) & 0x8000);
    const auto work = workArea();
    auto available = fittingSizes(work);
    fitWindowPreference(preferences, available);
    if (options.configureDisplay || preferences.askEachStart || force) {
        if (!showSetup(preferences, work, std::move(available))) return false;
        saveDisplayPreferences(options.root, relative, preferences);
    }
#endif
    options.display = preferences.display;
    return true;
}
}
