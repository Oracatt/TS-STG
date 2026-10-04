#pragma once
#include "backend.hpp"

namespace tsstg {
bool platformHasSystemFont(const std::string& family);
std::vector<std::uint8_t> platformEncodeText(const std::string& text,std::uint32_t codePage);
BitmapTextPixels platformRasterizeBitmapText(const std::string& text,const BitmapTextOptions& options);
// System font shaping and vector outlines are platform rendering services.
// No font files, menu layout or gameplay decisions are embedded here.
class PlatformText final {
public:
    PlatformText();
    ~PlatformText();
    void createLayout(std::uint32_t id,const std::string& text,const TextLayoutOptions& options);
    RasterizedText rasterize(std::uint32_t id,const TextRasterOptions& options);
    void destroyLayout(std::uint32_t id);
private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};
}
