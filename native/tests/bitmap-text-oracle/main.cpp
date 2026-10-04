// Diagnostic only. Compile the read-only source Bitmap and font table, and the
// exact GDI raster function extracted by CMake. Never link the original game.
#include "raster.hpp"
#include "fonts.hpp"
#include "centered_constants.hpp"
#include <fstream>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <vector>
#include <emmintrin.h>

int main(int argc,char** argv){
    try{
        if(argc!=10)throw std::runtime_error("Usage: oracle output.rgba input.utf8 width height font spacing foregroundARGB backgroundARGB outline");
        std::ifstream input(argv[2],std::ios::binary);if(!input)throw std::runtime_error("Cannot read UTF-8 input");
        const std::string text((std::istreambuf_iterator<char>(input)),std::istreambuf_iterator<char>());
        std::vector<wchar_t> unicode(static_cast<std::size_t>(MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.c_str(),-1,nullptr,0)));
        if(unicode.empty()||!MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.c_str(),-1,unicode.data(),static_cast<int>(unicode.size())))throw std::runtime_error("Invalid UTF-8 input");
        std::vector<char> encoded(static_cast<std::size_t>(WideCharToMultiByte(932,0,unicode.data(),-1,nullptr,0,nullptr,nullptr)));
        if(encoded.empty()||!WideCharToMultiByte(932,0,unicode.data(),-1,encoded.data(),static_cast<int>(encoded.size()),nullptr,nullptr))throw std::runtime_error("Cannot encode CP932 input");
        const int width=std::stoi(argv[3]),height=std::stoi(argv[4]),font=std::stoi(argv[5]),spacing=std::stoi(argv[6]);
        const auto foreground=static_cast<std::uint32_t>(std::stoul(argv[7],nullptr,0)),background=static_cast<std::uint32_t>(std::stoul(argv[8],nullptr,0));
        if(width<1||width>2048||height<1||height>256||font<2||font==12||font>21)throw std::runtime_error("Invalid oracle dimensions/font");
        th20::source::platform_window::initialize_fonts();
        const auto advance=_mm_sub_ss(_mm_mul_ss(_mm_set_ss(th20::source::text::centered_font_widths[font]),_mm_set_ss(2.f)),_mm_set_ss(1.f));
        const auto measured=_mm_div_ss(_mm_mul_ss(_mm_set_ss(static_cast<float>(encoded.size()-1)),advance),_mm_set_ss(2.f));
        const int x=_mm_cvttss_si32(_mm_sub_ss(_mm_set_ss(static_cast<float>(width)),measured));
        auto raster=th20::source::text::rasterize_text({0,0,width,height},x,foreground,background,encoded.data(),font,spacing*2,std::stoi(argv[9])!=0);
        GdiFlush();std::ofstream out(argv[1],std::ios::binary);if(!out)throw std::runtime_error("Cannot write oracle pixels");
        const auto* pixels=raster.bitmap->pixels;
        for(int y=0;y<height;++y)for(int px=0;px<width;++px){
            const auto at=(y+raster.source.top)*raster.bitmap->pitch+px*4;
            const char rgba[]{static_cast<char>(pixels[at+2]),static_cast<char>(pixels[at+1]),static_cast<char>(pixels[at]),static_cast<char>(pixels[at+3])};
            out.write(rgba,4);
        }
        out.close();
        std::cout<<"{\"width\":"<<width<<",\"height\":"<<height<<",\"x\":"<<x<<",\"extentWidth\":"<<raster.extent.cx<<",\"extentHeight\":"<<raster.extent.cy
            <<",\"cp932Bytes\":"<<(encoded.size()-1)<<",\"modern\":"<<int(th20::source::platform_window::font_available[0])<<",\"mincho\":"<<int(th20::source::platform_window::font_available[2])<<"}\n";
        for(auto fontHandle:th20::source::platform_window::fonts)if(fontHandle)DeleteObject(fontHandle);
        return 0;
    }catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}
}
