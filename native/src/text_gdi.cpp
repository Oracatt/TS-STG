#include "tsstg/text.hpp"
#include <algorithm>
#include <cstring>
#include <stdexcept>

#ifdef _WIN32
#include <windows.h>

namespace tsstg {
namespace {
std::wstring decode(const char* text,int size,UINT codePage,DWORD flags=0){
    if(!size)return {};
    const auto count=MultiByteToWideChar(codePage,flags,text,size,nullptr,0);
    if(!count)throw std::runtime_error("Cannot decode text with code page "+std::to_string(codePage));
    std::wstring value(static_cast<std::size_t>(count),L'\0');
    if(!MultiByteToWideChar(codePage,flags,text,size,value.data(),count))throw std::runtime_error("Text decoding failed");
    return value;
}
std::wstring utf8(const std::string& text){return decode(text.data(),static_cast<int>(text.size()),CP_UTF8,MB_ERR_INVALID_CHARS);}
void validateCodePage(UINT codePage){if(!IsValidCodePage(codePage))throw std::runtime_error("Unsupported text code page: "+std::to_string(codePage));}
struct DrawingContext {
    HDC dc=CreateCompatibleDC(nullptr);
    HGDIOBJ previousBitmap=nullptr,previousFont=nullptr;
    HBITMAP bitmap=nullptr;HFONT font=nullptr;
    DrawingContext(){if(!dc)throw std::runtime_error("Cannot create bitmap text context");}
    ~DrawingContext(){
        if(previousFont&&previousFont!=HGDI_ERROR)SelectObject(dc,previousFont);
        if(previousBitmap&&previousBitmap!=HGDI_ERROR)SelectObject(dc,previousBitmap);
        if(font)DeleteObject(font);if(bitmap)DeleteObject(bitmap);DeleteDC(dc);
    }
};
int CALLBACK foundFamily(const LOGFONTW*,const TEXTMETRICW*,DWORD,LPARAM result){*reinterpret_cast<bool*>(result)=true;return 0;}
}
bool platformHasSystemFont(const std::string& family){
    const auto face=utf8(family);if(face.empty()||face.size()>=LF_FACESIZE)throw std::runtime_error("System font family must contain 1..31 UTF-16 units");
    DrawingContext context;LOGFONTW description{};description.lfCharSet=DEFAULT_CHARSET;
    std::copy(face.begin(),face.end(),description.lfFaceName);bool found=false;
    EnumFontFamiliesExW(context.dc,&description,foundFamily,reinterpret_cast<LPARAM>(&found),0);return found;
}
std::vector<std::uint8_t> platformEncodeText(const std::string& text,std::uint32_t codePage){
    validateCodePage(codePage);const auto content=utf8(text);if(content.empty())return {};
    const auto count=WideCharToMultiByte(codePage,0,content.data(),static_cast<int>(content.size()),nullptr,0,nullptr,nullptr);
    if(!count)throw std::runtime_error("Cannot encode text with code page "+std::to_string(codePage));
    std::vector<std::uint8_t> encoded(static_cast<std::size_t>(count));
    if(!WideCharToMultiByte(codePage,0,content.data(),static_cast<int>(content.size()),reinterpret_cast<char*>(encoded.data()),count,nullptr,nullptr))throw std::runtime_error("Text encoding failed");
    return encoded;
}
BitmapTextPixels platformRasterizeBitmapText(const std::string& text,const BitmapTextOptions& options){
    if(options.width<1||options.height<1||options.width>4096||options.height>4096)throw std::runtime_error("Bitmap text dimensions must be in 1..4096");
    const auto face=utf8(options.fontFamily);
    if(!options.allowFontSubstitution&&!platformHasSystemFont(options.fontFamily))throw std::runtime_error("System font family is unavailable: "+options.fontFamily);
    const auto encoded=platformEncodeText(text,options.codePage);
    const auto content=decode(reinterpret_cast<const char*>(encoded.data()),static_cast<int>(encoded.size()),options.codePage);
    DrawingContext context;BITMAPV4HEADER header{};header.bV4Size=sizeof(header);
    header.bV4Width=options.width;header.bV4Height=-(options.height+1);header.bV4Planes=1;header.bV4BitCount=32;
    header.bV4V4Compression=BI_BITFIELDS;header.bV4SizeImage=static_cast<DWORD>(options.width*options.height*4);
    header.bV4RedMask=0x00ff0000;header.bV4GreenMask=0x0000ff00;header.bV4BlueMask=0x000000ff;header.bV4AlphaMask=0xff000000;
    void* storage=nullptr;context.bitmap=CreateDIBSection(nullptr,reinterpret_cast<BITMAPINFO*>(&header),DIB_RGB_COLORS,&storage,nullptr,0);
    if(!context.bitmap||!storage)throw std::runtime_error("Cannot allocate bitmap text pixels");
    context.previousBitmap=SelectObject(context.dc,context.bitmap);
    if(!context.previousBitmap||context.previousBitmap==HGDI_ERROR)throw std::runtime_error("Cannot select bitmap text surface");
    auto* bytes=static_cast<std::uint8_t*>(storage);
    for(std::size_t offset=0,count=static_cast<std::size_t>(options.width)*(options.height+1)*4;offset<count;offset+=4){
        bytes[offset]=static_cast<std::uint8_t>(options.background>>8);bytes[offset+1]=static_cast<std::uint8_t>(options.background>>16);
        bytes[offset+2]=static_cast<std::uint8_t>(options.background>>24);bytes[offset+3]=static_cast<std::uint8_t>(options.background);
    }
    if(!options.pixels.empty()){
        if(options.pixels.size()!=static_cast<std::size_t>(options.width)*options.height*4)throw std::runtime_error("Bitmap initial pixels require exactly width*height*4 RGBA bytes");
        for(std::size_t offset=0;offset<options.pixels.size();offset+=4){
            bytes[offset]=options.pixels[offset+2];bytes[offset+1]=options.pixels[offset+1];bytes[offset+2]=options.pixels[offset];bytes[offset+3]=options.pixels[offset+3];
        }
    }
    context.font=CreateFontW(options.fontSize,0,0,0,options.fontWeight,FALSE,FALSE,FALSE,
        options.charSet,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,options.quality,options.pitchAndFamily,face.c_str());
    if(!context.font)throw std::runtime_error("Cannot create bitmap text font");
    context.previousFont=SelectObject(context.dc,context.font);
    if(!context.previousFont||context.previousFont==HGDI_ERROR)throw std::runtime_error("Cannot select bitmap text font");
    if(!SetBkMode(context.dc,TRANSPARENT))throw std::runtime_error("Cannot set bitmap text transparency");
    if(SetTextColor(context.dc,RGB(options.fill>>24,(options.fill>>16)&255,(options.fill>>8)&255))==CLR_INVALID)throw std::runtime_error("Cannot set bitmap text color");
    SIZE extent{};const auto count=static_cast<int>(content.size());
    if(!GetTextExtentPoint32W(context.dc,content.data(),count,&extent))throw std::runtime_error("Cannot measure bitmap text");
    if(!options.spacing){
        if(!TextOutW(context.dc,options.x,options.y,content.data(),count))throw std::runtime_error("Cannot draw bitmap text");
    }else{
        auto at=options.x;for(int i=0;i<count;++i){
            if(!TextOutW(context.dc,at,options.y,content.data()+i,1))throw std::runtime_error("Cannot draw spaced bitmap text");
            at+=options.spacing;
        }
    }
    if(!GdiFlush())throw std::runtime_error("Cannot finish bitmap text drawing");
    BitmapTextPixels result;result.width=options.width;result.height=options.height;result.extentWidth=extent.cx;result.extentHeight=extent.cy;
    result.pixels.resize(static_cast<std::size_t>(options.width)*options.height*4);
    for(std::size_t offset=0;offset<result.pixels.size();offset+=4){
        result.pixels[offset]=bytes[offset+2];result.pixels[offset+1]=bytes[offset+1];result.pixels[offset+2]=bytes[offset];result.pixels[offset+3]=bytes[offset+3];
    }
    return result;
}
}
#else
namespace tsstg {
bool platformHasSystemFont(const std::string&){throw std::runtime_error("System bitmap text currently requires Windows GDI");}
std::vector<std::uint8_t> platformEncodeText(const std::string&,std::uint32_t){throw std::runtime_error("Code-page text encoding currently requires Windows");}
BitmapTextPixels platformRasterizeBitmapText(const std::string&,const BitmapTextOptions&){throw std::runtime_error("System bitmap text currently requires Windows GDI");}
}
#endif
