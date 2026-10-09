#include "tsstg/host.hpp"
#include "tsstg/profile.hpp"
#include "tsstg/text.hpp"
#include "tsstg/music_stream.hpp"
#include "tsstg/frame_stream.hpp"
#include "raylib.h"
#include "rlgl.h"
#include "external/glad.h"
#include <algorithm>
#include <cmath>
#include <fstream>
#include <iostream>
#include <map>
#include <set>
#include <stdexcept>
#include <system_error>

namespace tsstg {
namespace fs = std::filesystem;
namespace {
constexpr int canvasWidth = 960, canvasHeight = 720;
std::string readFile(const fs::path& path) {
    if (!fs::is_regular_file(path)) throw std::runtime_error("File not found: " + path.u8string());
    if (fs::file_size(path) > 32 * 1024 * 1024) throw std::runtime_error("Text file exceeds 32 MiB: " + path.u8string());
    std::ifstream file(path, std::ios::binary);
    if (!file) throw std::runtime_error("Cannot read: " + path.u8string());
    return {std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>()};
}
void writeFile(const fs::path& path, const std::string& content) {
    if (!path.parent_path().empty()) fs::create_directories(path.parent_path());
    std::ofstream file(path, std::ios::binary | std::ios::trunc);
    if (!file || !file.write(content.data(), static_cast<std::streamsize>(content.size())))
        throw std::runtime_error("Cannot write: " + path.u8string());
}
bool containedBy(const fs::path& root, const fs::path& path) {
    auto child = path.begin();
    for (auto parent = root.begin(); parent != root.end(); ++parent, ++child) {
        if (child == path.end()) return false;
#ifdef _WIN32
        // Module names use '/', whereas canonical Windows paths use '\\'.
        if (_wcsicmp(parent->generic_wstring().c_str(), child->generic_wstring().c_str()) != 0) return false;
#else
        if (*parent != *child) return false;
#endif
    }
    return true;
}
fs::path safePath(const fs::path& root, const fs::path& candidate) {
    const auto resolved = fs::weakly_canonical(candidate);
    if (!containedBy(root, resolved)) throw std::runtime_error("Path escapes the permitted root: " + candidate.u8string() + " (root: " + root.u8string() + ", resolved: " + resolved.u8string() + ")");
    return resolved;
}
fs::path relativePath(const fs::path& root, const std::string& name) {
    const auto path = fs::u8path(name);
    if (name.empty() || name.find('\0') != std::string::npos || path.is_absolute() || path.has_root_name())
        throw std::runtime_error("Expected a relative resource path");
    for (const auto& part : path) if (part == "..") throw std::runtime_error("Resource path traversal is forbidden");
    return safePath(root, root / path);
}
Color unpack(std::uint32_t rgba) {
    return Color{static_cast<unsigned char>(rgba >> 24), static_cast<unsigned char>(rgba >> 16),
        static_cast<unsigned char>(rgba >> 8), static_cast<unsigned char>(rgba)};
}
void beginTexturedPrimitive(int mode, unsigned int texture) {
    // A texture switch may allocate a new rlgl draw slot whose default mode
    // is QUADS. Establish the primitive mode after that switch. rlBegin can
    // in turn reset the texture, so reapply it once the empty slot has its
    // final mode. Repeated mode/texture pairs still share the same GPU batch.
    rlSetTexture(texture);
    rlBegin(mode);
    rlSetTexture(texture);
}
class Host final : public HostServices {
public:
    explicit Host(const Options& options) : root_(fs::canonical(options.root)), headless_(options.headless), profiling_(options.profile.has_value()) {
        SetTraceLogLevel(LOG_WARNING);
        if (options.frameStream) {
            if (headless_) throw std::runtime_error("--frame-stream requires graphical mode");
            frameStream_ = std::make_unique<FrameStream>(*options.frameStream);
        }
        if (!headless_) {
            SetConfigFlags(FLAG_WINDOW_RESIZABLE | (options.benchmark || frameStream_ ? 0 : FLAG_VSYNC_HINT) | FLAG_MSAA_4X_HINT |
                (frameStream_ ? FLAG_WINDOW_HIDDEN | FLAG_WINDOW_ALWAYS_RUN : 0));
            InitWindow(canvasWidth, canvasHeight, "TS-STG");
            if (!IsWindowReady()) throw std::runtime_error("Cannot initialize graphics window");
            SetWindowMinSize(480, 360);
            SetExitKey(KEY_NULL);
            SetTargetFPS(options.benchmark?0:60);
            canvas_ = LoadRenderTexture(canvasWidth, canvasHeight);
            if (!IsRenderTextureValid(canvas_)) { CloseWindow(); throw std::runtime_error("Cannot create logical canvas"); }
            SetTextureWrap(canvas_.texture,TEXTURE_WRAP_CLAMP);
            BeginTextureMode(canvas_);ClearBackground(BLANK);EndTextureMode();
            InitAudioDevice();
            audioReady_ = IsAudioDeviceReady();
            if (!audioReady_) std::cerr << "TS-STG: no audio device; audio is disabled\n";
        }
    }
    ~Host() override {
        if(!headless_)for(auto query:queries_)if(query)glDeleteQueries(1,&query);
        if(alphaShader_.id)UnloadShader(alphaShader_);
        for(const auto& entry:shaders_)if(!headless_&&entry.second.id)UnloadShader(entry.second);
        for (const auto& entry : fonts_) if (entry.second.font.texture.id) UnloadFont(entry.second.font);
        for (const auto& entry : music_) if (entry.second.stream.buffer) UnloadMusicStream(entry.second);
        for (const auto& entry : sounds_) if (entry.second.stream.buffer) UnloadSound(entry.second);
        for (const auto& entry : textures_) if (entry.second.id && !targets_.count(entry.first)) UnloadTexture(entry.second);
        for (const auto& entry : targets_) if (entry.second.id) UnloadRenderTexture(entry.second);
        if (audioReady_) CloseAudioDevice();
        if (!headless_) { UnloadRenderTexture(canvas_); CloseWindow(); }
    }
    fs::path resolveModule(const std::string& name, const std::string& base) const override {
        if (name.find('\0') != std::string::npos) throw std::runtime_error("Invalid module name");
        fs::path path;
        const std::string packageName = "@ts-stg/thlib";
        if (name == packageName || name.rfind(packageName + "/", 0) == 0) {
            const auto section = name == packageName ? std::string() : name.substr(packageName.size() + 1);
            // Public library modules resolve exclusively under compiled dist.
            // TypeScript compilation belongs to the SDK build, not either VM.
            // Import sections
            // contain plain identifiers; traversal and absolute paths are invalid.
            if (!section.empty() && (section.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789-_/") != std::string::npos ||
                section.front() == '/' || section.back() == '/' || section.find("//") != std::string::npos))
                throw std::runtime_error("Unsupported module import: " + name);
            if (name != packageName && section.empty()) throw std::runtime_error("Unsupported module import: " + name);
            if (!libraryRoot_) {
                for (const auto& candidate : {root_ / "packages/thlib/dist", root_ / "node_modules/@ts-stg/thlib/dist"}) {
                    if (fs::is_regular_file(candidate / "index.js")) { libraryRoot_ = fs::canonical(candidate); break; }
                }
                if (!libraryRoot_) throw std::runtime_error("Cannot resolve @ts-stg/thlib: install a built package in node_modules or run npm run build for packages/thlib/dist");
            }
            auto entry = section.empty() ? *libraryRoot_ / "index.js" : *libraryRoot_ / section / "index.js";
            if (!section.empty() && !fs::is_regular_file(entry)) entry = *libraryRoot_ / (section + ".js");
            if (!fs::is_regular_file(entry)) throw std::runtime_error("Unsupported module import: " + name);
            return safePath(*libraryRoot_, entry);
        }
        else if (base.empty()) path = fs::u8path(name).is_absolute() ? fs::u8path(name) : root_ / fs::u8path(name);
        else if (name.rfind("./", 0) == 0 || name.rfind("../", 0) == 0) {
            path = fs::u8path(base).parent_path() / fs::u8path(name);
            if (libraryRoot_ && containedBy(*libraryRoot_, fs::u8path(base))) return safePath(*libraryRoot_, path);
        }
        else throw std::runtime_error("Unsupported module import: " + name);
        return safePath(root_, path);
    }
    std::string readModule(const fs::path& path) const override {
        const auto resolved = fs::weakly_canonical(path);
        if (containedBy(root_, resolved) || (libraryRoot_ && containedBy(*libraryRoot_, resolved))) return readFile(resolved);
        throw std::runtime_error("Module path escapes project and selected thlib source roots");
    }
    std::string readText(const std::string& name) const override { return readFile(relativePath(root_, name)); }
    void writeText(const std::string& name, const std::string& text) override {
        const auto data = safePath(root_, root_ / "userdata");
        writeFile(relativePath(data, name), text);
    }
    std::uint32_t loadTexture(const std::string& name, int paddedWidth, int paddedHeight) override {
        const auto path = resourcePath(name);
        const auto id = nextId_++;
        Image image = LoadImage(path.c_str());
        if (!IsImageValid(image)) throw std::runtime_error("Cannot decode texture: " + name);
        ImageFormat(&image,PIXELFORMAT_UNCOMPRESSED_R8G8B8A8);
        if (paddedWidth) ImageResizeCanvas(&image,paddedWidth,paddedHeight,0,0,BLANK);
        Texture2D texture{};
        if (headless_) {
            texture.width=image.width; texture.height=image.height;texture.format=PIXELFORMAT_UNCOMPRESSED_R8G8B8A8;
            const auto* data=static_cast<const std::uint8_t*>(image.data);
            pixels_[id]=std::vector<std::uint8_t>(data,data+static_cast<std::size_t>(image.width)*image.height*4);
        }
        else texture=LoadTextureFromImage(image);
        UnloadImage(image);
        if (!headless_&&!IsTextureValid(texture)) throw std::runtime_error("Cannot load texture: " + name);
        textures_[id] = texture;
        return id;
    }
    std::uint32_t loadSound(const std::string& name) override {
        const auto path = resourcePath(name);
        Wave wave = LoadWave(path.c_str());
        if (!IsWaveValid(wave)) throw std::runtime_error("Cannot decode sound: " + name);
        const auto id = nextId_++;
        Sound sound{};
        if (audioReady_) sound = LoadSoundFromWave(wave);
        UnloadWave(wave);
        if (audioReady_ && !IsSoundValid(sound)) throw std::runtime_error("Cannot load sound: " + name);
        sounds_[id] = sound;
        return id;
    }
    std::uint32_t loadMusic(const std::string& name) override {
        const auto path = resourcePath(name);
        const auto id = nextId_++;
        Music music{};
        if (audioReady_) {
            music = LoadMusicStream(path.c_str());
            if (!IsMusicValid(music)) throw std::runtime_error("Cannot load music: " + name);
            music.looping = true;
        }
        music_[id] = music;
        musicVolumes_[id] = 1.f;
        return id;
    }
    std::uint32_t loadFont(const std::string& name, int size) override {
        const auto path = resourcePath(name);
        FontResource resource;
        resource.path = path;
        resource.size = size;
        for (int codepoint = 32; codepoint < 127; ++codepoint) resource.codepoints.insert(codepoint);
        if (headless_) {
            int bytes = 0;
            auto* data = LoadFileData(path.c_str(), &bytes);
            if (!data) throw std::runtime_error("Cannot read font: " + name);
            auto* glyphs = LoadFontData(data, bytes, size, nullptr, 95, FONT_DEFAULT);
            UnloadFileData(data);
            if (!glyphs) throw std::runtime_error("Cannot decode font: " + name);
            UnloadFontData(glyphs, 95);
        } else {
            resource.font = LoadFontEx(path.c_str(), size, nullptr, 95);
            if (!IsFontValid(resource.font) || resource.font.texture.id == GetFontDefault().texture.id)
                throw std::runtime_error("Cannot decode font: " + name);
        }
        const auto id = nextId_++;
        fonts_[id] = std::move(resource);
        return id;
    }
    std::uint32_t createTextLayout(const std::string& text,const TextLayoutOptions& options) override {
        if(!textEngine_)textEngine_=std::make_unique<PlatformText>();
        const auto id=nextId_++;textEngine_->createLayout(id,text,options);return id;
    }
    TextTexture rasterizeTextLayout(std::uint32_t id,const TextRasterOptions& options) override {
        if(!textEngine_)throw std::runtime_error("Unknown text layout id: "+std::to_string(id));
        const auto image=textEngine_->rasterize(id,options);
        const auto texture=image.width?createTexture(image.width,image.height,image.pixels):0;
        return {texture,image.x,image.y,image.width,image.height};
    }
    void destroyTextLayout(std::uint32_t id) override {
        if(!textEngine_)throw std::runtime_error("Unknown text layout id: "+std::to_string(id));
        textEngine_->destroyLayout(id);
    }
    bool hasSystemFont(const std::string& family) const override {return platformHasSystemFont(family);}
    std::vector<std::uint8_t> encodeText(const std::string& text,std::uint32_t codePage) const override {return platformEncodeText(text,codePage);}
    BitmapTextPixels rasterizeBitmapText(const std::string& text,const BitmapTextOptions& options) const override {return platformRasterizeBitmapText(text,options);}
    void playSound(std::uint32_t id, float volume, float pan, bool loop) override {
        auto found = sounds_.find(id);
        if (found == sounds_.end()) throw std::runtime_error("Unknown sound id: " + std::to_string(id));
        if (audioReady_) { SetSoundVolume(found->second, volume); SetSoundPan(found->second, pan); ::PlaySound(found->second); }
        pausedSounds_.erase(id);
        if(loop)loopingSounds_.insert(id);else loopingSounds_.erase(id);
    }
    void stopSound(std::uint32_t id) override {
        auto found = sounds_.find(id);
        if (found == sounds_.end()) throw std::runtime_error("Unknown sound id: " + std::to_string(id));
        if (audioReady_) ::StopSound(found->second);
        loopingSounds_.erase(id);pausedSounds_.erase(id);
    }
    void pauseSound(std::uint32_t id) override {
        auto found=sounds_.find(id);if(found==sounds_.end())throw std::runtime_error("Unknown sound id: "+std::to_string(id));
        if(audioReady_)::PauseSound(found->second);pausedSounds_.insert(id);
    }
    void resumeSound(std::uint32_t id) override {
        auto found=sounds_.find(id);if(found==sounds_.end())throw std::runtime_error("Unknown sound id: "+std::to_string(id));
        if(audioReady_)::ResumeSound(found->second);pausedSounds_.erase(id);
    }
    bool isSoundPlaying(std::uint32_t id) const override {
        auto found=sounds_.find(id);if(found==sounds_.end())throw std::runtime_error("Unknown sound id: "+std::to_string(id));
        return audioReady_&&::IsSoundPlaying(found->second);
    }
    void playMusic(std::uint32_t id, float volume) override {
        auto found = music_.find(id);
        if (found == music_.end()) throw std::runtime_error("Unknown music id: " + std::to_string(id));
        if (audioReady_) { SetMusicVolume(found->second, volume); PlayMusicStream(found->second); }
        musicVolumes_[id]=volume;
        musicPlaying_[id]=true;pausedMusic_.erase(id);
    }
    void setMusicVolume(std::uint32_t id, float volume) override {
        auto found=music_.find(id);
        if(found==music_.end())throw std::runtime_error("Unknown music id: "+std::to_string(id));
        if(!std::isfinite(volume)||volume<0||volume>1)throw std::runtime_error("Volume must be between 0 and 1");
        // Volume is independent of transport: changing gain must not start,
        // resume, stop or seek a stream, including a paused/stopped stream.
        if(audioReady_)SetMusicVolume(found->second,volume);
        musicVolumes_[id]=volume;
    }
    void stopMusic(std::uint32_t id) override {
        auto found = music_.find(id);
        if (found == music_.end()) throw std::runtime_error("Unknown music id: " + std::to_string(id));
        if (audioReady_) resetMusicStream(found->second,musicVolumes_.at(id));
        musicPlaying_[id]=false;pausedMusic_.erase(id);
    }
    void pauseMusic(std::uint32_t id) override {
        auto found=music_.find(id);if(found==music_.end())throw std::runtime_error("Unknown music id: "+std::to_string(id));
        if(audioReady_)PauseMusicStream(found->second);pausedMusic_.insert(id);
    }
    void resumeMusic(std::uint32_t id) override {
        auto found=music_.find(id);if(found==music_.end())throw std::runtime_error("Unknown music id: "+std::to_string(id));
        if(audioReady_)ResumeMusicStream(found->second);pausedMusic_.erase(id);
    }
    void setMusicLoop(std::uint32_t id,float start,float end) override {
        auto found=music_.find(id);
        if(found==music_.end()) throw std::runtime_error("Unknown music id: "+std::to_string(id));
        if(!std::isfinite(start)||!std::isfinite(end)||start<0||!(end>start)) throw std::runtime_error("Music loop requires finite 0 <= start < end");
        if(audioReady_&&end>GetMusicTimeLength(found->second)+0.001f) throw std::runtime_error("Music loop end exceeds stream duration");
        found->second.looping=false;musicLoops_[id]={start,end};
    }
    void seekMusic(std::uint32_t id,float seconds) override {
        auto found=music_.find(id);
        if(found==music_.end()) throw std::runtime_error("Unknown music id: "+std::to_string(id));
        if(!std::isfinite(seconds)||seconds<0||(audioReady_&&seconds>GetMusicTimeLength(found->second))) throw std::runtime_error("Music seek outside stream duration");
        if(audioReady_) seekMusicStream(found->second,seconds,musicVolumes_.at(id),musicPlaying_[id],pausedMusic_.count(id)!=0);
    }
    float getMusicTime(std::uint32_t id) const override {
        auto found=music_.find(id);
        if(found==music_.end()) throw std::runtime_error("Unknown music id: "+std::to_string(id));
        return audioReady_?GetMusicTimePlayed(found->second):0.f;
    }
    std::uint32_t createTexture(int width,int height,const std::vector<std::uint8_t>& pixels) override {
        if(width<1||height<1||width>4096||height>4096||pixels.size()!=static_cast<std::size_t>(width)*height*4)
            throw std::runtime_error("Texture requires 1..4096 dimensions and exactly width*height*4 RGBA bytes");
        const auto id=nextId_++;Texture2D texture{};
        if(headless_){texture.width=width;texture.height=height;texture.format=PIXELFORMAT_UNCOMPRESSED_R8G8B8A8;pixels_[id]=pixels;}
        else {Image image{const_cast<std::uint8_t*>(pixels.data()),width,height,1,PIXELFORMAT_UNCOMPRESSED_R8G8B8A8};texture=LoadTextureFromImage(image);if(!IsTextureValid(texture))throw std::runtime_error("Cannot create texture");}
        textures_[id]=texture;return id;
    }
    void updateTexture(std::uint32_t id,const std::vector<std::uint8_t>& pixels) override {
        validateTexture(id);const auto texture=textures_.at(id);
        if(pixels.size()!=static_cast<std::size_t>(texture.width)*texture.height*4)throw std::runtime_error("Texture update requires exactly width*height*4 RGBA bytes");
        if(headless_)pixels_[id]=pixels;
        else if(targets_.count(id)){
            auto flipped=pixels;const auto stride=static_cast<std::size_t>(texture.width)*4;
            for(int y=0;y<texture.height;++y)std::copy_n(pixels.data()+static_cast<std::size_t>(y)*stride,stride,flipped.data()+static_cast<std::size_t>(texture.height-y-1)*stride);
            UpdateTexture(texture,flipped.data());
        }else UpdateTexture(texture,pixels.data());
    }
    void updateTextureRegion(std::uint32_t id,int x,int y,int width,int height,const std::vector<std::uint8_t>& pixels) override {
        validateTexture(id);const auto texture=textures_.at(id);
        if(x<0||y<0||width<1||height<1||x>texture.width-width||y>texture.height-height)
            throw std::runtime_error("Texture update region must lie within the texture");
        if(pixels.size()!=static_cast<std::size_t>(width)*height*4)throw std::runtime_error("Texture region update requires exactly width*height*4 RGBA bytes");
        const auto stride=static_cast<std::size_t>(width)*4;
        if(headless_){
            auto& destination=pixels_[id];if(destination.empty())destination.resize(static_cast<std::size_t>(texture.width)*texture.height*4);
            for(int row=0;row<height;++row)std::copy_n(pixels.data()+static_cast<std::size_t>(row)*stride,stride,destination.data()+(static_cast<std::size_t>(y+row)*texture.width+x)*4);
        }else if(targets_.count(id)){
            auto flipped=pixels;for(int row=0;row<height;++row)std::copy_n(pixels.data()+static_cast<std::size_t>(row)*stride,stride,flipped.data()+static_cast<std::size_t>(height-row-1)*stride);
            UpdateTextureRec(texture,{static_cast<float>(x),static_cast<float>(texture.height-y-height),static_cast<float>(width),static_cast<float>(height)},flipped.data());
        }else UpdateTextureRec(texture,{static_cast<float>(x),static_cast<float>(y),static_cast<float>(width),static_cast<float>(height)},pixels.data());
    }
    TexturePixels readTexturePixels(std::uint32_t id) const override {
        if(id)validateTexture(id);const auto texture=id?textures_.at(id):canvas_.texture;
        TexturePixels result;result.width=id?texture.width:canvasWidth;result.height=id?texture.height:canvasHeight;
        if(headless_){const auto found=pixels_.find(id);if(found!=pixels_.end())result.pixels=found->second;else result.pixels.resize(static_cast<std::size_t>(result.width)*result.height*4);return result;}
        Image image=LoadImageFromTexture(texture);if(!IsImageValid(image))throw std::runtime_error("Cannot read texture pixels");
        if(!id||targets_.count(id))ImageFlipVertical(&image);ImageFormat(&image,PIXELFORMAT_UNCOMPRESSED_R8G8B8A8);
        const auto* data=static_cast<const std::uint8_t*>(image.data);result.pixels.assign(data,data+static_cast<std::size_t>(result.width)*result.height*4);UnloadImage(image);return result;
    }
    void unloadTexture(std::uint32_t id) override {
        validateTexture(id);auto target=targets_.find(id);
        if(target!=targets_.end()){if(!headless_)UnloadRenderTexture(target->second);targets_.erase(target);}
        else if(!headless_)UnloadTexture(textures_.at(id));
        textures_.erase(id);pixels_.erase(id);samplerStates_.erase(id);
    }
    void unloadSound(std::uint32_t id) override {
        auto found=sounds_.find(id);if(found==sounds_.end())throw std::runtime_error("Unknown sound id: "+std::to_string(id));
        if(audioReady_)UnloadSound(found->second);sounds_.erase(found);loopingSounds_.erase(id);pausedSounds_.erase(id);
    }
    void unloadMusic(std::uint32_t id) override {
        auto found=music_.find(id);if(found==music_.end())throw std::runtime_error("Unknown music id: "+std::to_string(id));
        if(audioReady_){StopMusicStream(found->second);UnloadMusicStream(found->second);}music_.erase(found);musicLoops_.erase(id);musicPlaying_.erase(id);musicVolumes_.erase(id);pausedMusic_.erase(id);
    }
    void unloadFont(std::uint32_t id) override {
        auto found=fonts_.find(id);if(found==fonts_.end())throw std::runtime_error("Unknown font id: "+std::to_string(id));
        if(!headless_)UnloadFont(found->second.font);fonts_.erase(found);
    }
    void validateTexture(std::uint32_t id) const override {
        if (!textures_.count(id)) throw std::runtime_error("Unknown texture id: " + std::to_string(id));
    }
    void validateFont(std::uint32_t id) const override {
        if (!fonts_.count(id)) throw std::runtime_error("Unknown font id: " + std::to_string(id));
    }
    std::uint32_t createRenderTarget(int width, int height) override {
        const auto id = nextId_++;
        RenderTexture2D target{};
        if (!headless_) {
            target = LoadRenderTexture(width, height);
            if (!IsRenderTextureValid(target)) throw std::runtime_error("Cannot allocate render target");
            SetTextureFilter(target.texture, TEXTURE_FILTER_BILINEAR);
            SetTextureWrap(target.texture,TEXTURE_WRAP_CLAMP);
            BeginTextureMode(target);ClearBackground(BLANK);EndTextureMode();
        } else { target.texture.width = width; target.texture.height = height; }
        targets_[id] = target;
        textures_[id] = target.texture;
        if(headless_)pixels_[id].resize(static_cast<std::size_t>(width)*height*4);
        return id;
    }
    void validateRenderTarget(std::uint32_t id) const override {
        if (!targets_.count(id)) throw std::runtime_error("Unknown render target id: " + std::to_string(id));
    }
    std::uint32_t createShader(const std::string& vertex,const std::string& fragment) override {
        if(fragment.empty()||fragment.size()>1024*1024||vertex.size()>1024*1024||fragment.find('\0')!=std::string::npos||vertex.find('\0')!=std::string::npos)throw std::runtime_error("Shader source must contain nonempty fragment GLSL and at most 1 MiB per stage");
        Shader shader{};
        if(!headless_){shader=LoadShaderFromMemory(vertex.empty()?nullptr:vertex.c_str(),fragment.c_str());
            if(!shader.id||shader.id==rlGetShaderIdDefault())throw std::runtime_error("Cannot compile shader");}
        const auto id=nextId_++;shaders_[id]=shader;return id;
    }
    void unloadShader(std::uint32_t id) override {validateShader(id);if(!headless_)UnloadShader(shaders_.at(id));shaders_.erase(id);}
    void validateShader(std::uint32_t id) const override {if(!shaders_.count(id))throw std::runtime_error("Unknown shader id: "+std::to_string(id));}
    void requestQuit() override { quit_ = true; }
    void log(const std::string& text) override { std::cout << text << '\n'; }
    bool quit() const { return quit_; }
    std::array<double,4> present(const std::vector<DrawCommand>& commands) {
        const auto submitStart=ProfileClock::now();
        const bool gpu=profiling_&&glGenQueries&&glGetQueryObjectui64v;
        if(gpu){unsigned query=0;glGenQueries(1,&query);queries_.push_back(query);gpuMs_.push_back(-1);glBeginQuery(GL_TIME_ELAPSED,query);}
        // Grow each font atlas only when a previously unseen Unicode glyph is used.
        std::set<std::uint32_t> changedFonts;
        for (const auto& command : commands) if (command.kind == DrawKind::Text && command.resource) {
            auto& resource = fonts_.at(command.resource);
            int count = 0;
            int* codepoints = LoadCodepoints(command.text.c_str(), &count);
            for (int i = 0; i < count; ++i) if (resource.codepoints.insert(codepoints[i]).second) changedFonts.insert(command.resource);
            UnloadCodepoints(codepoints);
        }
        for (const auto id : changedFonts) {
            auto& resource = fonts_.at(id);
            std::vector<int> codepoints(resource.codepoints.begin(), resource.codepoints.end());
            auto replacement = LoadFontEx(resource.path.c_str(), resource.size, codepoints.data(), static_cast<int>(codepoints.size()));
            if (!IsFontValid(replacement) || replacement.texture.id == GetFontDefault().texture.id)
                throw std::runtime_error("Cannot build Unicode font atlas");
            UnloadFont(resource.font);
            resource.font = replacement;
        }
        BeginTextureMode(canvas_);
        ClearBackground(BLACK);
        struct BlendState{int mode=BLEND_ALPHA;std::array<int,6> factors{};bool operator==(const BlendState& other)const{return mode==other.mode&&(mode!=BLEND_CUSTOM_SEPARATE||factors==other.factors);}};
        BlendState desiredBlend,appliedBlend;
        float desiredCutoff=0,appliedCutoff=0;bool shaderActive=false;std::uint32_t customShader=0;
        auto applyStates=[&](){
            if(!(desiredBlend==appliedBlend)){
                if(desiredBlend.mode==BLEND_CUSTOM_SEPARATE){const auto& f=desiredBlend.factors;rlSetBlendFactorsSeparate(f[0],f[1],f[3],f[4],f[2],f[5]);}
                BeginBlendMode(desiredBlend.mode);appliedBlend=desiredBlend;
            }
            if(!customShader&&desiredCutoff!=appliedCutoff){
                if(!shaderActive){ensureAlphaShader();BeginShaderMode(alphaShader_);shaderActive=true;}
                rlDrawRenderBatchActive();SetShaderValue(alphaShader_,alphaLocation_,&desiredCutoff,SHADER_UNIFORM_FLOAT);appliedCutoff=desiredCutoff;
            }
        };
        auto applySampler=[&](std::uint32_t id,const std::array<int,3>& state){
            const auto cached=samplerStates_.find(id);
            if(cached!=samplerStates_.end()&&cached->second==state)return;
            const bool wasAnisotropic=cached!=samplerStates_.end()&&cached->second[0]==TEXTURE_FILTER_ANISOTROPIC_4X;
            rlDrawRenderBatchActive();samplerStates_[id]=state;
            const auto texture=textures_.at(id);
            if(state[0]==TEXTURE_FILTER_ANISOTROPIC_4X)SetTextureFilter(texture,TEXTURE_FILTER_BILINEAR);
            else if(wasAnisotropic)rlTextureParameters(texture.id,RL_TEXTURE_FILTER_ANISOTROPIC,1);
            SetTextureFilter(texture,state[0]);
            rlTextureParameters(texture.id,RL_TEXTURE_WRAP_S,state[1]);
            rlTextureParameters(texture.id,RL_TEXTURE_WRAP_T,state[2]);
        };
        for (const auto& command : commands) {
            const auto& v = command.values;
            const auto color = unpack(command.color);
            // State commands only express intent. Apply at the next drawing
            // command so adjacent identical sprite scopes share one GPU batch.
            switch(command.kind){case DrawKind::Circle:case DrawKind::Ring:case DrawKind::Line:case DrawKind::Point:case DrawKind::LineStrip:case DrawKind::Rect:case DrawKind::Text:case DrawKind::Triangle:case DrawKind::Sprite:case DrawKind::SpriteRegion:case DrawKind::Mesh:case DrawKind::Mesh3D:case DrawKind::Quad:applyStates();break;default:break;}
            switch (command.kind) {
            case DrawKind::Clear: rlDrawRenderBatchActive();ClearBackground(color); break;
            case DrawKind::Circle: DrawCircleV({v[0], v[1]}, v[2], color); break;
            case DrawKind::Ring: DrawRing({v[0], v[1]}, v[2], v[3], 0, 360, 48, color); break;
            case DrawKind::Line: DrawLineEx({v[0], v[1]}, {v[2], v[3]}, v[4], color); break;
            case DrawKind::Point: DrawPixelV({v[0],v[1]},color); break;
            case DrawKind::LineStrip:
                beginTexturedPrimitive(RL_LINES,rlGetTextureIdDefault());
                for (std::size_t i=1;i<command.vertices.size();++i) for(auto index:{i-1,i}) {
                    const auto& vertex=command.vertices[index];const auto tint=unpack(vertex.color);
                    rlColor4ub(tint.r,tint.g,tint.b,tint.a);rlVertex2f(vertex.x,vertex.y);
                }
                rlEnd();rlSetTexture(0);break;
            case DrawKind::Rect: DrawRectangleRec({v[0], v[1], v[2], v[3]}, color); break;
            case DrawKind::Text:
                if (command.resource) DrawTextEx(fonts_.at(command.resource).font, command.text.c_str(), {v[0],v[1]}, v[2], 1, color);
                else DrawText(command.text.c_str(), static_cast<int>(v[0]), static_cast<int>(v[1]), static_cast<int>(v[2]), color);
                break;
            case DrawKind::Triangle: {
                Vector2 a{v[0],v[1]}, b{v[2],v[3]}, c{v[4],v[5]};
                if ((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x) > 0) std::swap(b, c);
                DrawTriangle(a,b,c,color); break;
            }
            case DrawKind::Scissor: BeginScissorMode(static_cast<int>(v[0]),static_cast<int>(v[1]),static_cast<int>(v[2]),static_cast<int>(v[3])); break;
            case DrawKind::ScissorEnd: EndScissorMode(); break;
            case DrawKind::Sprite: {
                const auto texture = textures_.at(command.resource);
                DrawTexturePro(texture, {0,0,static_cast<float>(texture.width),static_cast<float>(texture.height)*(targets_.count(command.resource)?-1:1)},
                    {v[0],v[1],v[2],v[3]}, {v[2]/2,v[3]/2}, v[4]*RAD2DEG, color); break;
            }
            case DrawKind::SpriteRegion: {
                const auto texture = textures_.at(command.resource);
                const bool target = targets_.count(command.resource) != 0;
                DrawTexturePro(texture, {v[0],target?texture.height-v[1]-v[3]:v[1],v[2],target?-v[3]:v[3]}, {v[4],v[5],v[6],v[7]},
                    {v[6]/2,v[7]/2}, v[8]*RAD2DEG, color); break;
            }
            case DrawKind::Blend:
                desiredBlend.mode=command.text == "add" ? BLEND_ADDITIVE : command.text == "multiply" ? BLEND_MULTIPLIED : BLEND_ALPHA;break;
            case DrawKind::BlendEnd: desiredBlend.mode=BLEND_ALPHA;break;
            case DrawKind::AlphaTest: desiredCutoff=v[0];break;
            case DrawKind::ShaderBegin: {
                rlDrawRenderBatchActive();if(shaderActive){EndShaderMode();shaderActive=false;}
                const auto shader=shaders_.at(command.resource);BeginShaderMode(shader);customShader=command.resource;
                for(const auto& uniform:command.uniforms){
                    const int location=GetShaderLocation(shader,uniform.name.c_str());
                    if(location<0)throw std::runtime_error("Shader uniform is absent or inactive: "+uniform.name);
                    if(uniform.type==8){const auto& m=uniform.values;const Matrix matrix{m[0],m[4],m[8],m[12],m[1],m[5],m[9],m[13],m[2],m[6],m[10],m[14],m[3],m[7],m[11],m[15]};SetShaderValueMatrix(shader,location,matrix);}
                    else if(uniform.type>=4){std::array<int,4> ints{};for(unsigned i=0;i<4;++i)ints[i]=static_cast<int>(uniform.values[i]);SetShaderValue(shader,location,ints.data(),uniform.type);}
                    else SetShaderValue(shader,location,uniform.values.data(),uniform.type);
                }
                break;
            }
            case DrawKind::ShaderEnd: EndShaderMode();customShader=0;appliedCutoff=0;break;
            case DrawKind::Quad:
            case DrawKind::StatefulQuad: {
                const bool scoped=command.kind==DrawKind::StatefulQuad;
                if(scoped){
                    desiredCutoff=command.matrix[13];desiredBlend.mode=BLEND_CUSTOM_SEPARATE;
                    for(unsigned i=0;i<6;++i)desiredBlend.factors[i]=(i==2||i==5)?blendEquation(command.modes[i]):blendFactor(command.modes[i]);
                    if(command.resource){
                        static const int wraps[]{RL_TEXTURE_WRAP_CLAMP,RL_TEXTURE_WRAP_REPEAT,RL_TEXTURE_WRAP_MIRROR_REPEAT};
                        applySampler(command.resource,{command.matrix[10]==0?TEXTURE_FILTER_POINT:command.matrix[10]==1?TEXTURE_FILTER_BILINEAR:TEXTURE_FILTER_ANISOTROPIC_4X,wraps[static_cast<unsigned>(command.matrix[11])],wraps[static_cast<unsigned>(command.matrix[12])]});
                    }
                    applyStates();
                }
                const bool flipped=targets_.count(command.resource)!=0;
                beginTexturedPrimitive(RL_TRIANGLES,command.resource?textures_.at(command.resource).id:rlGetTextureIdDefault());
                static constexpr unsigned triangles[][3]{{0,1,2},{1,3,2}};
                for(const auto& triangle:triangles){
                    auto a=triangle[0],b=triangle[1],c=triangle[2];
                    if((v[b*2]-v[a*2])*(v[c*2+1]-v[a*2+1])-(v[b*2+1]-v[a*2+1])*(v[c*2]-v[a*2])>0)std::swap(b,c);
                    for(auto index:{a,b,c}){
                        const auto tint=unpack(command.quadColors[index]);
                        const auto u=command.matrix[(index&1)?2:0],uv=command.matrix[(index>>1)?3:1];
                        rlColor4ub(tint.r,tint.g,tint.b,tint.a);rlTexCoord2f(u,flipped?1.f-uv:uv);rlVertex2f(v[index*2],v[index*2+1]);
                    }
                }
                rlEnd();rlSetTexture(0);
                if(scoped){desiredBlend.mode=BLEND_ALPHA;desiredCutoff=0;}
                break;
            }
            case DrawKind::Mesh: {
                const bool flipped = targets_.count(command.resource) != 0;
                beginTexturedPrimitive(RL_TRIANGLES,command.resource?textures_.at(command.resource).id:rlGetTextureIdDefault());
                for (std::size_t i = 0; i < command.indices.size(); i += 3) {
                    auto a = command.indices[i], b = command.indices[i+1], c = command.indices[i+2];
                    const auto& va=command.vertices[a]; const auto& vb=command.vertices[b]; const auto& vc=command.vertices[c];
                    if ((vb.x-va.x)*(vc.y-va.y)-(vb.y-va.y)*(vc.x-va.x)>0) std::swap(b,c);
                    for (auto index : {a,b,c}) {
                        const auto& vertex = command.vertices[index]; const auto tint=unpack(vertex.color);
                        rlColor4ub(tint.r,tint.g,tint.b,tint.a);
                        rlTexCoord2f(vertex.u,flipped?1.f-vertex.v:vertex.v);
                        rlVertex2f(vertex.x,vertex.y);
                    }
                }
                rlEnd(); rlSetTexture(0); break;
            }
            case DrawKind::Mesh3D: {
                // JS supplies a generic OpenGL clip transform. Keeping clip W
                // on the GPU preserves perspective-correct texture interpolation.
                rlDrawRenderBatchActive();
                const Matrix savedProjection=rlGetMatrixProjection(),savedModelview=rlGetMatrixModelview();
                const auto& m=command.matrix;
                const Matrix projection{m[0],m[4],m[8],m[12],m[1],m[5],m[9],m[13],m[2],m[6],m[10],m[14],m[3],m[7],m[11],m[15]};
                const Matrix identity{1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1};
                rlSetMatrixProjection(projection);rlSetMatrixModelview(identity);rlDisableBackfaceCulling();
                const bool flipped=targets_.count(command.resource)!=0;
                beginTexturedPrimitive(RL_TRIANGLES,command.resource?textures_.at(command.resource).id:rlGetTextureIdDefault());
                for(const auto index:command.indices){
                    const auto& vertex=command.vertices[index];const auto tint=unpack(vertex.color);
                    rlColor4ub(tint.r,tint.g,tint.b,tint.a);rlTexCoord2f(vertex.u,flipped?1.f-vertex.v:vertex.v);rlVertex3f(vertex.x,vertex.y,vertex.z);
                }
                rlEnd();rlSetTexture(0);rlDrawRenderBatchActive();
                rlSetMatrixProjection(savedProjection);rlSetMatrixModelview(savedModelview);rlEnableBackfaceCulling();break;
            }
            case DrawKind::TargetBegin:
                EndTextureMode(); BeginTextureMode(targets_.at(command.resource)); ClearBackground(color); break;
            case DrawKind::TargetEnd:
                EndTextureMode(); BeginTextureMode(canvas_); break;
            case DrawKind::BlendFactors:
                desiredBlend.mode=BLEND_CUSTOM_SEPARATE;
                for(unsigned i=0;i<6;++i)desiredBlend.factors[i]=(i==2||i==5)?blendEquation(command.modes[i]):blendFactor(command.modes[i]);break;
            case DrawKind::Sampler: {
                const std::array<int,3> state{command.modes[0]=="point"?TEXTURE_FILTER_POINT:command.modes[0]=="bilinear"?TEXTURE_FILTER_BILINEAR:TEXTURE_FILTER_ANISOTROPIC_4X,wrapMode(command.modes[1]),wrapMode(command.modes[2])};
                applySampler(command.resource,state);break;
            }
            }
        }
        EndTextureMode();
        BeginDrawing();
        ClearBackground({8, 9, 16, 255});
        // Present already-composited canvas RGB. Its alpha channel belongs to
        // offscreen rendering and must not blend the finished image a second time.
        desiredCutoff=0;desiredBlend.mode=BLEND_CUSTOM_SEPARATE;desiredBlend.factors={GL_ONE,GL_ZERO,GL_FUNC_ADD,GL_ONE,GL_ZERO,GL_FUNC_ADD};applyStates();
        const auto scale = std::min(GetScreenWidth()/static_cast<float>(canvasWidth), GetScreenHeight()/static_cast<float>(canvasHeight));
        DrawTexturePro(canvas_.texture, {0,0,static_cast<float>(canvasWidth),-static_cast<float>(canvasHeight)},
            {(GetScreenWidth()-canvasWidth*scale)/2,(GetScreenHeight()-canvasHeight*scale)/2,canvasWidth*scale,canvasHeight*scale},{0,0},0,WHITE);
        EndBlendMode();if(shaderActive)EndShaderMode();
        // Submit drawing before the measured swap/frame-cap section. An empty
        // EndDrawing flush is a no-op; GPU queries are read asynchronously.
        if(profiling_)rlDrawRenderBatchActive();
        if(gpu)glEndQuery(GL_TIME_ELAPSED);
        const auto submitMs=elapsedMs(submitStart);const auto waitStart=ProfileClock::now();
        EndDrawing();
        const auto waitMs=elapsedMs(waitStart);const auto audioStart=ProfileClock::now();
        if(audioReady_)for(auto id:loopingSounds_)if(!pausedSounds_.count(id)&&!IsSoundPlaying(sounds_.at(id)))::PlaySound(sounds_.at(id));
        if (audioReady_) for (auto& entry : music_) {
            if(!musicPlaying_[entry.first]||pausedMusic_.count(entry.first))continue;
            UpdateMusicStream(entry.second);
            const auto loop=musicLoops_.find(entry.first);
            if(loop!=musicLoops_.end()&&musicPlaying_[entry.first]) {
                const auto elapsed=GetMusicTimePlayed(entry.second);
                if(elapsed>=loop->second[1]||!IsMusicStreamPlaying(entry.second)) {
                    // Generic streamed loop regions are serviced once per display frame.
                    seekMusic(entry.first,loop->second[0]+std::fmod(std::max(0.f,elapsed-loop->second[1]),loop->second[1]-loop->second[0]));
                }
            }
        }
        const auto audioMs=elapsedMs(audioStart);const auto profilerStart=ProfileClock::now();
        if(gpu)collectGpu(false);
        return {submitMs,waitMs,audioMs,elapsedMs(profilerStart)};
    }
    const std::vector<double>& gpuTimings(){if(!headless_)collectGpu(true);return gpuMs_;}
    bool streamFrame() {
        if (!frameStream_ || ++streamFrames_ % 2 != 0) return true;
        auto image = readTexturePixels(0);
        // The finished canvas is presented opaquely, as in screenshot(). Its
        // offscreen alpha must not trigger a second compositing operation.
        for (std::size_t i = 3; i < image.pixels.size(); i += 4) image.pixels[i] = 255;
        return frameStream_->writeFrame(image.width, image.height, image.pixels.data(), image.pixels.size());
    }
    std::string gpuDevice()const{return headless_?"":reinterpret_cast<const char*>(glGetString(GL_RENDERER));}
    void screenshot(const fs::path& path) {
        if (!path.parent_path().empty()) fs::create_directories(path.parent_path());
        Image image = LoadImageFromTexture(canvas_.texture);
        ImageFlipVertical(&image);
        ImageFormat(&image,PIXELFORMAT_UNCOMPRESSED_R8G8B8A8);
        auto* exported=static_cast<unsigned char*>(image.data);
        for(std::size_t i=3;i<static_cast<std::size_t>(image.width)*image.height*4;i+=4)exported[i]=255;
        const bool success = ExportImage(image, path.u8string().c_str());
        UnloadImage(image);
        if (!success) throw std::runtime_error("Cannot export screenshot: " + path.u8string());
    }
private:
    void ensureAlphaShader(){
        if(alphaShader_.id)return;
        static const char* fragment="#version 330\nin vec2 fragTexCoord;in vec4 fragColor;uniform sampler2D texture0;uniform vec4 colDiffuse;uniform float alphaCutoff;out vec4 finalColor;void main(){finalColor=texture(texture0,fragTexCoord)*colDiffuse*fragColor;if(finalColor.a<alphaCutoff)discard;}";
        alphaShader_=LoadShaderFromMemory(nullptr,fragment);
        if(!alphaShader_.id||alphaShader_.id==rlGetShaderIdDefault()){alphaShader_={};throw std::runtime_error("Cannot compile generic alpha-test shader");}
        alphaLocation_=GetShaderLocation(alphaShader_,"alphaCutoff");
    }
    void collectGpu(bool wait){
        while(queryRead_+(wait?0:3)<queries_.size()){
            const auto id=queries_[queryRead_];int available=0;if(!wait){glGetQueryObjectiv(id,GL_QUERY_RESULT_AVAILABLE,&available);if(!available)break;}
            GLuint64 nanoseconds=0;glGetQueryObjectui64v(id,GL_QUERY_RESULT,&nanoseconds);gpuMs_[queryRead_]=static_cast<double>(nanoseconds)/1000000.0;
            glDeleteQueries(1,&id);queries_[queryRead_++]=0;
        }
    }
    static int blendFactor(const std::string& name) {
        static const std::map<std::string,int> factors{{"zero",0},{"one",1},{"srcColor",0x0300},{"oneMinusSrcColor",0x0301},
            {"srcAlpha",0x0302},{"oneMinusSrcAlpha",0x0303},{"dstAlpha",0x0304},{"oneMinusDstAlpha",0x0305},
            {"dstColor",0x0306},{"oneMinusDstColor",0x0307}};
        return factors.at(name);
    }
    static int blendEquation(const std::string& name) {
        static const std::map<std::string,int> equations{{"add",0x8006},{"subtract",0x800a},{"reverseSubtract",0x800b},{"min",0x8007},{"max",0x8008}};
        return equations.at(name);
    }
    static int wrapMode(const std::string& name) { return name=="wrap"?RL_TEXTURE_WRAP_REPEAT:name=="mirror"?RL_TEXTURE_WRAP_MIRROR_REPEAT:RL_TEXTURE_WRAP_CLAMP; }
    struct FontResource { std::string path; int size = 32; Font font{}; std::set<int> codepoints; };
    std::string resourcePath(const std::string& name) const {
        auto path = relativePath(root_, name);
        if (!fs::is_regular_file(path) || fs::file_size(path) == 0) throw std::runtime_error("Missing or empty resource: " + name);
        return path.u8string();
    }
    fs::path root_;
    std::unique_ptr<FrameStream> frameStream_;
    std::uint64_t streamFrames_ = 0;
    mutable std::optional<fs::path> libraryRoot_;
    bool headless_, profiling_=false,audioReady_ = false, quit_ = false;
    std::vector<unsigned> queries_;
    std::vector<double> gpuMs_;
    std::size_t queryRead_=0;
    RenderTexture2D canvas_{};
    std::uint32_t nextId_ = 1;
    std::map<std::uint32_t, Texture2D> textures_;
    std::map<std::uint32_t,std::array<int,3>> samplerStates_;
    Shader alphaShader_{};int alphaLocation_=-1;
    std::map<std::uint32_t,Shader> shaders_;
    std::map<std::uint32_t, std::vector<std::uint8_t>> pixels_;
    std::map<std::uint32_t, RenderTexture2D> targets_;
    std::map<std::uint32_t, Sound> sounds_;
    std::set<std::uint32_t> loopingSounds_;
    std::set<std::uint32_t> pausedSounds_,pausedMusic_;
    std::map<std::uint32_t, Music> music_;
    std::map<std::uint32_t, std::array<float,2>> musicLoops_;
    std::map<std::uint32_t, bool> musicPlaying_;
    std::map<std::uint32_t, float> musicVolumes_;
    std::map<std::uint32_t, FontResource> fonts_;
    std::unique_ptr<PlatformText> textEngine_;
};
std::uint32_t keyboardInput() {
    std::uint32_t mask = 0;
    if (IsKeyDown(KEY_LEFT)) mask |= 1;
    if (IsKeyDown(KEY_RIGHT)) mask |= 2;
    if (IsKeyDown(KEY_UP)) mask |= 4;
    if (IsKeyDown(KEY_DOWN)) mask |= 8;
    if (IsKeyDown(KEY_Z)) mask |= 16 | 256;
    if (IsKeyDown(KEY_X)) mask |= 32 | 512;
    if (IsKeyDown(KEY_LEFT_SHIFT) || IsKeyDown(KEY_RIGHT_SHIFT)) mask |= 64;
    if (IsKeyDown(KEY_ESCAPE)) mask |= 128;
    if (IsKeyDown(KEY_ENTER) || IsKeyDown(KEY_KP_ENTER)) mask |= 256;
    return mask;
}
}
int runHost(const Options& options) {
#ifndef TSSTG_HAS_V8
    if(options.backend == "v8") throw std::runtime_error("V8 backend is not compiled in; rebuild with TSSTG_ENABLE_V8=ON");
#endif
    Host host(options);
#ifdef TSSTG_HAS_V8
    auto backend = options.backend == "quickjs" ? makeQuickJSBackend(host) : makeV8Backend(host);
#else
    auto backend = makeQuickJSBackend(host);
#endif
    if(!options.headless) SetWindowTitle((std::string("TS-STG / ") + backend->name()).c_str());
    backend->load(host.resolveModule(options.entry, ""));
    std::uint64_t frame = 0;
    std::vector<ProfileFrame> profile;
    const auto profileStart=ProfileClock::now();
    if (options.headless) {
        while (!host.quit() && frame < options.frames.value_or(1)) {
            const auto start=ProfileClock::now();ProfileFrame sample;
            backend->update(options.input.value_or(0));
            sample.update=elapsedMs(start);sample.updates=1;
            auto commands=backend->render();const auto timings=backend->renderTimings();
            sample.render=timings[0];sample.decode=timings[1];sample.commands=commands.size();sample.total=elapsedMs(start);
            if(options.profile)profile.push_back(sample);
            ++frame;
        }
    } else {
        constexpr double timestep = 1.0 / 60.0;
        double previous = GetTime(), accumulator = timestep;
        do {
            if (WindowShouldClose() || host.quit()) break;
            const auto start=ProfileClock::now();ProfileFrame sample;
            const double now = GetTime();
            accumulator += std::min(now - previous, 0.25);
            previous = now;
            if(options.benchmark)accumulator=timestep;
            while (accumulator >= timestep && (!options.frames || frame < *options.frames) && !host.quit()) {
                backend->update(options.input.value_or(options.frameStream ? 0 : keyboardInput()));
                ++frame;
                ++sample.updates;
                accumulator -= timestep;
            }
            sample.update=elapsedMs(start);
            auto commands=backend->render();const auto timings=backend->renderTimings();
            sample.render=timings[0];sample.decode=timings[1];sample.commands=commands.size();
            const auto presentation=host.present(commands);sample.submit=presentation[0];sample.wait=presentation[1];sample.audio=presentation[2];sample.profiler=presentation[3];sample.total=elapsedMs(start);
            if(options.profile)profile.push_back(sample);
            if (!host.streamFrame()) break;
        } while ((!options.frames || frame < *options.frames) && !host.quit());
        if (options.screenshot) host.screenshot(*options.screenshot);
    }
    if (options.snapshot) writeFile(*options.snapshot, backend->snapshot() + "\n");
    if(options.profile)writeFile(*options.profile,profileJSON(profile,host.gpuTimings(),options.profileWarmup,frame,options.headless,options.benchmark,elapsedMs(profileStart),options.entry,host.gpuDevice(),backend->name()));
    std::cout << "TS-STG completed " << frame << " simulation frames (" << backend->name() << ")\n";
    return 0;
}
}
