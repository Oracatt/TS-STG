#pragma once
#include <array>
#include <cstdint>
#include <filesystem>
#include <memory>
#include <string>
#include <vector>

namespace tsstg {
enum class DrawKind { Clear, Circle, Ring, Line, Rect, Text, Triangle, Scissor, ScissorEnd, Sprite, SpriteRegion, Blend, BlendEnd, Mesh, TargetBegin, TargetEnd, BlendFactors, Sampler, LineStrip, Point, Mesh3D, AlphaTest, Quad, StatefulQuad, ShaderBegin, ShaderEnd };
struct ShaderUniform { std::string name; int type=0; std::array<float,16> values{}; };
struct MeshVertex { float x, y, u, v; std::uint32_t color; float z=0; };
struct TexturePixels { int width=0,height=0;std::vector<std::uint8_t> pixels; };
struct TextLayoutOptions {
    std::string fontFamily="Arial",locale="en-us",horizontalAlign="left",verticalAlign="top";
    float fontSize=20,width=300,height=50;
};
struct TextRasterOptions {
    int width=960,height=720;
    float x=0,y=0,layoutX=0,layoutY=0,scale=1,rotation=0,strokeWidth=0;
    std::uint32_t fill=0xffffffff,outline=0x000000ff;
    bool premultiplied=false;
};
struct RasterizedText { int x=0,y=0,width=0,height=0;std::vector<std::uint8_t> pixels; };
struct TextTexture { std::uint32_t texture=0;int x=0,y=0,width=0,height=0; };
struct BitmapTextOptions {
    std::string fontFamily="Arial";
    int width=300,height=50,x=0,y=0,fontSize=20,fontWeight=400,spacing=0;
    std::uint32_t charSet=1,quality=0,pitchAndFamily=0,codePage=65001;
    std::uint32_t fill=0xffffffff,background=0x000000ff;
    std::vector<std::uint8_t> pixels;
    bool allowFontSubstitution=false;
};
struct BitmapTextPixels { int width=0,height=0,extentWidth=0,extentHeight=0;std::vector<std::uint8_t> pixels; };
struct DrawCommand {
    DrawKind kind;
    std::array<float, 9> values{};
    std::uint32_t color = 0xffffffff;
    std::uint32_t resource = 0;
    std::string text;
    std::vector<MeshVertex> vertices;
    std::vector<std::uint32_t> indices;
    std::array<std::string, 6> modes;
    std::array<float, 16> matrix{};
    // Quads reuse values for four xy pairs and matrix[0..3] for the UV
    // rectangle, avoiding two heap allocations for each four-vertex mesh.
    // Scoped quad states use matrix[10..12] for sampler codes and [13] for
    // alpha cutoff; modes retains the ordinary generic blend factors.
    std::array<std::uint32_t, 4> quadColors{};
    std::vector<ShaderUniform> uniforms;
};

// All script-engine types stay behind this interface. The host has no STG rules.
class HostServices {
public:
    virtual ~HostServices() = default;
    virtual std::filesystem::path resolveModule(const std::string& name, const std::string& base) const = 0;
    virtual std::string readModule(const std::filesystem::path& path) const = 0;
    virtual std::string readText(const std::string& name) const = 0;
    virtual void writeText(const std::string& name, const std::string& text) = 0;
    virtual std::uint32_t loadTexture(const std::string& name, int canvasWidth = 0, int canvasHeight = 0) = 0;
    virtual std::uint32_t loadSound(const std::string& name) = 0;
    virtual std::uint32_t loadMusic(const std::string& name) = 0;
    virtual std::uint32_t loadFont(const std::string& name, int size) = 0;
    virtual std::uint32_t createTextLayout(const std::string& text,const TextLayoutOptions& options) = 0;
    virtual TextTexture rasterizeTextLayout(std::uint32_t id,const TextRasterOptions& options) = 0;
    virtual void destroyTextLayout(std::uint32_t id) = 0;
    virtual bool hasSystemFont(const std::string& family) const = 0;
    virtual std::vector<std::uint8_t> encodeText(const std::string& text,std::uint32_t codePage) const = 0;
    virtual BitmapTextPixels rasterizeBitmapText(const std::string& text,const BitmapTextOptions& options) const = 0;
    virtual std::uint32_t createRenderTarget(int width, int height) = 0;
    virtual std::uint32_t createTexture(int width, int height, const std::vector<std::uint8_t>& pixels) = 0;
    virtual void updateTexture(std::uint32_t id, const std::vector<std::uint8_t>& pixels) = 0;
    virtual void updateTextureRegion(std::uint32_t id,int x,int y,int width,int height,const std::vector<std::uint8_t>& pixels) = 0;
    virtual TexturePixels readTexturePixels(std::uint32_t id) const = 0;
    virtual void unloadTexture(std::uint32_t id) = 0;
    virtual void unloadSound(std::uint32_t id) = 0;
    virtual void unloadMusic(std::uint32_t id) = 0;
    virtual void unloadFont(std::uint32_t id) = 0;
    virtual void playSound(std::uint32_t id, float volume, float pan, bool loop) = 0;
    virtual void stopSound(std::uint32_t id) = 0;
    virtual void pauseSound(std::uint32_t id) = 0;
    virtual void resumeSound(std::uint32_t id) = 0;
    virtual bool isSoundPlaying(std::uint32_t id) const = 0;
    virtual void playMusic(std::uint32_t id, float volume) = 0;
    virtual void setMusicVolume(std::uint32_t id, float volume) = 0;
    virtual void stopMusic(std::uint32_t id) = 0;
    virtual void pauseMusic(std::uint32_t id) = 0;
    virtual void resumeMusic(std::uint32_t id) = 0;
    virtual void setMusicLoop(std::uint32_t id, float start, float end) = 0;
    virtual void seekMusic(std::uint32_t id, float seconds) = 0;
    virtual float getMusicTime(std::uint32_t id) const = 0;
    virtual void validateTexture(std::uint32_t id) const = 0;
    virtual void validateFont(std::uint32_t id) const = 0;
    virtual void validateRenderTarget(std::uint32_t id) const = 0;
    virtual std::uint32_t createShader(const std::string& vertex,const std::string& fragment) = 0;
    virtual void unloadShader(std::uint32_t id) = 0;
    virtual void validateShader(std::uint32_t id) const = 0;
    virtual void requestQuit() = 0;
    virtual void log(const std::string& message) = 0;
};

class ScriptBackend {
public:
    virtual ~ScriptBackend() = default;
    virtual const char* name() const = 0;
    virtual void load(const std::filesystem::path& entry) = 0;
    virtual void update(std::uint32_t inputMask) = 0;
    virtual std::vector<DrawCommand> render() = 0;
    virtual std::array<double,2> renderTimings() const = 0; // JS call, command decoding (milliseconds)
    virtual std::string snapshot() = 0;
};
std::unique_ptr<ScriptBackend> makeQuickJSBackend(HostServices& services);
std::unique_ptr<ScriptBackend> makeV8Backend(HostServices& services);
}
