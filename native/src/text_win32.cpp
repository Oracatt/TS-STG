#include "tsstg/text.hpp"
#include <algorithm>
#include <cmath>
#include <map>
#include <stdexcept>

#ifdef _WIN32
#include <windows.h>
#include <d2d1.h>
#include <dwrite.h>
#include <wincodec.h>
#include <wrl/client.h>

namespace tsstg {
namespace {
using Microsoft::WRL::ComPtr;
void require(HRESULT result,const char* operation){
    if(FAILED(result))throw std::runtime_error(std::string(operation)+" failed (HRESULT "+std::to_string(static_cast<unsigned long>(result))+")");
}
std::wstring wide(const std::string& text){
    if(text.empty())return {};
    const auto count=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),static_cast<int>(text.size()),nullptr,0);
    if(!count)throw std::runtime_error("Invalid UTF-8 text");
    std::wstring result(static_cast<std::size_t>(count),L'\0');
    if(!MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),static_cast<int>(text.size()),result.data(),count))throw std::runtime_error("Cannot decode UTF-8 text");
    return result;
}
D2D1_COLOR_F color(std::uint32_t rgba){
    return D2D1::ColorF(static_cast<float>(rgba>>24)/255.f,static_cast<float>((rgba>>16)&255)/255.f,static_cast<float>((rgba>>8)&255)/255.f,static_cast<float>(rgba&255)/255.f);
}
struct Apartment {
    bool initialized=false;
    Apartment(){const auto status=CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);if(status!=RPC_E_CHANGED_MODE){require(status,"Initialize text COM apartment");initialized=true;}}
    ~Apartment(){if(initialized)CoUninitialize();}
};

// DirectWrite shapes/aligns the text. Drawing uses the actual glyph outline,
// transformed before stroking so strokeWidth remains in output pixel units.
class OutlineRenderer final : public IDWriteTextRenderer {
public:
    OutlineRenderer(ID2D1Factory* factory,ID2D1RenderTarget* target,const TextRasterOptions& options):factory_(factory),target_(target),options_(options){
        require(target_->CreateSolidColorBrush(color(options.fill),fill_.GetAddressOf()),"Create text fill brush");
        require(target_->CreateSolidColorBrush(color(options.outline),outline_.GetAddressOf()),"Create text outline brush");
    }
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid,void** result) override {
        if(!result)return E_POINTER;*result=nullptr;
        if(iid==__uuidof(IUnknown)||iid==__uuidof(IDWritePixelSnapping)||iid==__uuidof(IDWriteTextRenderer))*result=static_cast<IDWriteTextRenderer*>(this);
        else return E_NOINTERFACE;
        AddRef();return S_OK;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return static_cast<ULONG>(InterlockedIncrement(&references_)); }
    ULONG STDMETHODCALLTYPE Release() override { const auto remaining=InterlockedDecrement(&references_);if(!remaining)delete this;return static_cast<ULONG>(remaining); }
    HRESULT STDMETHODCALLTYPE IsPixelSnappingDisabled(void*,BOOL* disabled) override {if(!disabled)return E_POINTER;*disabled=FALSE;return S_OK;}
    HRESULT STDMETHODCALLTYPE GetCurrentTransform(void*,DWRITE_MATRIX* matrix) override {
        if(!matrix)return E_POINTER;target_->GetTransform(reinterpret_cast<D2D1_MATRIX_3X2_F*>(matrix));return S_OK;
    }
    HRESULT STDMETHODCALLTYPE GetPixelsPerDip(void*,FLOAT* value) override {if(!value)return E_POINTER;float dpi=96,unused=96;target_->GetDpi(&dpi,&unused);*value=dpi/96.f;return S_OK;}
    HRESULT STDMETHODCALLTYPE DrawGlyphRun(void*,FLOAT baselineX,FLOAT baselineY,DWRITE_MEASURING_MODE,const DWRITE_GLYPH_RUN* run,const DWRITE_GLYPH_RUN_DESCRIPTION*,IUnknown*) override {
        ComPtr<ID2D1PathGeometry> path;HRESULT status=factory_->CreatePathGeometry(path.GetAddressOf());if(FAILED(status))return status;
        ComPtr<ID2D1GeometrySink> sink;status=path->Open(sink.GetAddressOf());if(FAILED(status))return status;
        status=run->fontFace->GetGlyphRunOutline(run->fontEmSize,run->glyphIndices,run->glyphAdvances,run->glyphOffsets,run->glyphCount,run->isSideways,(run->bidiLevel&1)!=0,sink.Get());if(FAILED(status))return status;
        status=sink->Close();if(FAILED(status))return status;
        const auto transform=D2D1::Matrix3x2F::Translation(baselineX,baselineY)*
            D2D1::Matrix3x2F::Translation(options_.layoutX,options_.layoutY)*
            D2D1::Matrix3x2F::Scale(options_.scale,options_.scale)*
            D2D1::Matrix3x2F::Rotation(static_cast<float>(static_cast<double>(options_.rotation)*180.0/3.14159265358979323846))*
            D2D1::Matrix3x2F::Translation(options_.x,options_.y);
        ComPtr<ID2D1TransformedGeometry> geometry;status=factory_->CreateTransformedGeometry(path.Get(),transform,geometry.GetAddressOf());if(FAILED(status))return status;
        if(options_.strokeWidth>0&&(options_.outline&255))target_->DrawGeometry(geometry.Get(),outline_.Get(),options_.strokeWidth);
        if(options_.fill&255)target_->FillGeometry(geometry.Get(),fill_.Get());
        return S_OK;
    }
    HRESULT STDMETHODCALLTYPE DrawUnderline(void*,FLOAT,FLOAT,const DWRITE_UNDERLINE*,IUnknown*) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE DrawStrikethrough(void*,FLOAT,FLOAT,const DWRITE_STRIKETHROUGH*,IUnknown*) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE DrawInlineObject(void*,FLOAT,FLOAT,IDWriteInlineObject*,BOOL,BOOL,IUnknown*) override {return E_NOTIMPL;}
private:
    volatile LONG references_=1;
    ComPtr<ID2D1Factory> factory_;
    ComPtr<ID2D1RenderTarget> target_;
    ComPtr<ID2D1SolidColorBrush> fill_,outline_;
    TextRasterOptions options_;
};
}

struct PlatformText::Impl {
    Apartment apartment;
    ComPtr<ID2D1Factory> drawing;
    ComPtr<IDWriteFactory> writing;
    ComPtr<IWICImagingFactory> imaging;
    std::map<std::uint32_t,ComPtr<IDWriteTextLayout>> layouts;
    Impl(){
        require(D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED,drawing.GetAddressOf()),"Create Direct2D factory");
        require(DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED,__uuidof(IDWriteFactory),reinterpret_cast<IUnknown**>(writing.GetAddressOf())),"Create DirectWrite factory");
        require(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(imaging.GetAddressOf())),"Create WIC text raster factory");
    }
};

PlatformText::PlatformText():impl_(std::make_unique<Impl>()){}
PlatformText::~PlatformText()=default;
void PlatformText::createLayout(std::uint32_t id,const std::string& text,const TextLayoutOptions& options){
    const auto family=wide(options.fontFamily),locale=wide(options.locale),content=wide(text);
    ComPtr<IDWriteFontCollection> collection;require(impl_->writing->GetSystemFontCollection(collection.GetAddressOf()),"Read system font collection");
    UINT32 familyIndex=0;BOOL present=FALSE;require(collection->FindFamilyName(family.c_str(),&familyIndex,&present),"Resolve system font family");
    if(!present)throw std::runtime_error("System font family is unavailable: "+options.fontFamily);
    ComPtr<IDWriteTextFormat> format;
    require(impl_->writing->CreateTextFormat(family.c_str(),nullptr,DWRITE_FONT_WEIGHT_NORMAL,DWRITE_FONT_STYLE_NORMAL,DWRITE_FONT_STRETCH_NORMAL,options.fontSize,locale.c_str(),format.GetAddressOf()),"Create DirectWrite text format");
    require(format->SetTextAlignment(options.horizontalAlign=="right"?DWRITE_TEXT_ALIGNMENT_TRAILING:options.horizontalAlign=="center"?DWRITE_TEXT_ALIGNMENT_CENTER:DWRITE_TEXT_ALIGNMENT_LEADING),"Align text horizontally");
    require(format->SetParagraphAlignment(options.verticalAlign=="bottom"?DWRITE_PARAGRAPH_ALIGNMENT_FAR:options.verticalAlign=="center"?DWRITE_PARAGRAPH_ALIGNMENT_CENTER:DWRITE_PARAGRAPH_ALIGNMENT_NEAR),"Align text vertically");
    ComPtr<IDWriteTextLayout> layout;
    require(impl_->writing->CreateTextLayout(content.c_str(),static_cast<UINT32>(content.size()),format.Get(),options.width,options.height,layout.GetAddressOf()),"Create DirectWrite text layout");
    impl_->layouts.emplace(id,std::move(layout));
}
void PlatformText::destroyLayout(std::uint32_t id){
    if(!impl_->layouts.erase(id))throw std::runtime_error("Unknown text layout id: "+std::to_string(id));
}
RasterizedText PlatformText::rasterize(std::uint32_t id,const TextRasterOptions& options){
    const auto found=impl_->layouts.find(id);
    if(found==impl_->layouts.end())throw std::runtime_error("Unknown text layout id: "+std::to_string(id));
    ComPtr<IWICBitmap> bitmap;
    require(impl_->imaging->CreateBitmap(static_cast<UINT>(options.width),static_cast<UINT>(options.height),GUID_WICPixelFormat32bppPBGRA,WICBitmapCacheOnLoad,bitmap.GetAddressOf()),"Create text raster bitmap");
    ComPtr<ID2D1RenderTarget> target;
    const auto properties=D2D1::RenderTargetProperties(D2D1_RENDER_TARGET_TYPE_DEFAULT,D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM,D2D1_ALPHA_MODE_PREMULTIPLIED),96.f,96.f);
    require(impl_->drawing->CreateWicBitmapRenderTarget(bitmap.Get(),properties,target.GetAddressOf()),"Create Direct2D text raster target");
    target->BeginDraw();target->Clear(D2D1::ColorF(0,0,0,0));
    ComPtr<IDWriteTextRenderer> renderer;renderer.Attach(new OutlineRenderer(impl_->drawing.Get(),target.Get(),options));
    const auto drawn=found->second->Draw(nullptr,renderer.Get(),0,0);const auto ended=target->EndDraw();
    require(drawn,"Draw DirectWrite glyph outlines");require(ended,"Finish Direct2D text raster");
    const auto stride=static_cast<UINT>(options.width)*4;
    std::vector<std::uint8_t> full(static_cast<std::size_t>(stride)*options.height);
    require(bitmap->CopyPixels(nullptr,stride,static_cast<UINT>(full.size()),full.data()),"Read Direct2D text raster");
    int left=options.width,top=options.height,right=-1,bottom=-1;
    for(int y=0;y<options.height;++y)for(int x=0;x<options.width;++x)if(full[(static_cast<std::size_t>(y)*options.width+x)*4+3]){
        left=(std::min)(left,x);top=(std::min)(top,y);right=(std::max)(right,x);bottom=(std::max)(bottom,y);
    }
    RasterizedText result;if(right<left)return result;
    result.x=left;result.y=top;result.width=right-left+1;result.height=bottom-top+1;
    result.pixels.resize(static_cast<std::size_t>(result.width)*result.height*4);
    for(int y=0;y<result.height;++y)for(int x=0;x<result.width;++x){
        const auto src=(static_cast<std::size_t>(y+top)*options.width+x+left)*4,dst=(static_cast<std::size_t>(y)*result.width+x)*4;
        const auto alpha=full[src+3];
        for(unsigned c=0;c<3;++c){const auto value=full[src+2-c];result.pixels[dst+c]=!alpha?0:options.premultiplied?value:static_cast<std::uint8_t>((std::min)(255u,(static_cast<unsigned>(value)*255u+alpha/2u)/alpha));}
        result.pixels[dst+3]=alpha;
    }
    return result;
}
}
#else
namespace tsstg {
struct PlatformText::Impl {};
PlatformText::PlatformText(){throw std::runtime_error("System vector text rendering currently requires Windows DirectWrite/Direct2D");}
PlatformText::~PlatformText()=default;
void PlatformText::createLayout(std::uint32_t,const std::string&,const TextLayoutOptions&){throw std::runtime_error("System vector text rendering currently requires Windows DirectWrite/Direct2D");}
RasterizedText PlatformText::rasterize(std::uint32_t,const TextRasterOptions&){throw std::runtime_error("System vector text rendering currently requires Windows DirectWrite/Direct2D");}
void PlatformText::destroyLayout(std::uint32_t){throw std::runtime_error("System vector text rendering currently requires Windows DirectWrite/Direct2D");}
}
#endif
