// Independent graphics oracle: compiles the authorized reference HLSL pixel
// shader directly. This does not link or execute the original game/engine.
#include <windows.h>
#include <d3d11.h>
#include <d3dcompiler.h>
#include <d3d11shader.h>
#include <dxgi.h>
#include <wrl/client.h>
#include <array>
#include <cmath>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

using Microsoft::WRL::ComPtr;
namespace {
void require(HRESULT status,const char* operation){if(FAILED(status))throw std::runtime_error(std::string(operation)+" failed: "+std::to_string(static_cast<unsigned long>(status)));}
std::vector<std::uint8_t> read(const std::filesystem::path& path){std::ifstream file(path,std::ios::binary);if(!file)throw std::runtime_error("Cannot read oracle input");return {std::istreambuf_iterator<char>(file),std::istreambuf_iterator<char>()};}
float real(const char* value){const double parsed=std::stod(value);if(!std::isfinite(parsed)||std::abs(parsed)>10000000)throw std::runtime_error("Invalid shader parameter");return static_cast<float>(parsed);}
ComPtr<ID3DBlob> compile(const std::string& source,const char* entry,const char* profile){
    ComPtr<ID3DBlob> code,errors;
    const auto status=D3DCompile(source.data(),source.size(),"original-warp.fx",nullptr,nullptr,entry,profile,D3DCOMPILE_ENABLE_STRICTNESS,0,code.GetAddressOf(),errors.GetAddressOf());
    if(FAILED(status)){const std::string message=errors?std::string(static_cast<const char*>(errors->GetBufferPointer()),errors->GetBufferSize()):"Unknown HLSL compilation error";throw std::runtime_error(message);}
    return code;
}
struct Vertex { float x,y,u,v; };
struct alignas(16) Frame {
    float warpScale,radius,limit,padding;
    float centerX,centerY,vpWidth,vpHeight;
    std::int32_t colorKey,padding2,padding3,padding4;
};
static_assert(sizeof(Frame)==48,"Reference cbPerFrame packing changed");
}
int main(int argc,char** argv){
    try{
        if(argc!=14)throw std::runtime_error("usage: warp-oracle source.fx input.rgba output.rgba width height centerX centerY vpWidth vpHeight radius warpScale limit colorKey");
        const auto width=std::stoi(argv[4]),height=std::stoi(argv[5]);
        if(width<1||height<1||width>4096||height>4096)throw std::runtime_error("Invalid oracle dimensions");
        const auto pixels=read(std::filesystem::u8path(argv[2]));
        if(pixels.size()!=static_cast<std::size_t>(width)*height*4)throw std::runtime_error("Oracle input must be tightly packed RGBA");
        const auto shaderBytes=read(std::filesystem::u8path(argv[1]));
        std::string original(shaderBytes.begin(),shaderBytes.end());const auto technique=original.find("technique11");
        if(technique==std::string::npos)throw std::runtime_error("Reference effect has no technique11 boundary");original.resize(technique);
        const auto psCode=compile(original,"PS","ps_5_0");
        const auto vsCode=compile(R"(
struct In {float2 position:POSITION;float2 uv:TEXCOORD;};
struct Out {float4 PosH:SV_POSITION;float3 PosW:POSITION;float3 NormalW:NORMAL;float2 Tex:TEXCOORD;};
Out VS(In v){Out o;o.PosH=float4(v.position,0,1);o.PosW=float3(0,0,0);o.NormalW=float3(0,0,0);o.Tex=v.uv;return o;}
)","VS","vs_5_0");
        ComPtr<IDXGIFactory1> factory;require(CreateDXGIFactory1(IID_PPV_ARGS(factory.GetAddressOf())),"Create DXGI factory");
        ComPtr<IDXGIAdapter1> selected;DXGI_ADAPTER_DESC1 selectedDesc{};
        for(UINT index=0;;++index){ComPtr<IDXGIAdapter1> adapter;if(factory->EnumAdapters1(index,adapter.GetAddressOf())==DXGI_ERROR_NOT_FOUND)break;
            DXGI_ADAPTER_DESC1 desc{};require(adapter->GetDesc1(&desc),"Read adapter description");if(desc.Flags&DXGI_ADAPTER_FLAG_SOFTWARE)continue;
            if(!selected||desc.DedicatedVideoMemory>selectedDesc.DedicatedVideoMemory){selected=adapter;selectedDesc=desc;}}
        if(!selected)throw std::runtime_error("A physical Direct3D11 adapter is required for this oracle");
        ComPtr<ID3D11Device> device;ComPtr<ID3D11DeviceContext> context;D3D_FEATURE_LEVEL level{};
        const D3D_FEATURE_LEVEL requested[]{D3D_FEATURE_LEVEL_11_0};
        require(D3D11CreateDevice(selected.Get(),D3D_DRIVER_TYPE_UNKNOWN,nullptr,0,requested,1,D3D11_SDK_VERSION,device.GetAddressOf(),&level,context.GetAddressOf()),"Create D3D11 oracle device");
        ComPtr<ID3D11VertexShader> vs;ComPtr<ID3D11PixelShader> ps;
        require(device->CreateVertexShader(vsCode->GetBufferPointer(),vsCode->GetBufferSize(),nullptr,vs.GetAddressOf()),"Create oracle vertex shader");
        require(device->CreatePixelShader(psCode->GetBufferPointer(),psCode->GetBufferSize(),nullptr,ps.GetAddressOf()),"Create original HLSL pixel shader");
        const D3D11_INPUT_ELEMENT_DESC elements[]{
            {"POSITION",0,DXGI_FORMAT_R32G32_FLOAT,0,0,D3D11_INPUT_PER_VERTEX_DATA,0},
            {"TEXCOORD",0,DXGI_FORMAT_R32G32_FLOAT,0,8,D3D11_INPUT_PER_VERTEX_DATA,0}};
        ComPtr<ID3D11InputLayout> layout;require(device->CreateInputLayout(elements,2,vsCode->GetBufferPointer(),vsCode->GetBufferSize(),layout.GetAddressOf()),"Create oracle input layout");
        const Vertex vertices[]{{-1.25f,1.25f,0,0},{1.25f,1.25f,1,0},{-1.25f,-1.25f,0,1},{-1.25f,-1.25f,0,1},{1.25f,1.25f,1,0},{1.25f,-1.25f,1,1}};
        D3D11_BUFFER_DESC bufferDesc{};bufferDesc.ByteWidth=sizeof(vertices);bufferDesc.Usage=D3D11_USAGE_IMMUTABLE;bufferDesc.BindFlags=D3D11_BIND_VERTEX_BUFFER;
        D3D11_SUBRESOURCE_DATA vertexData{};vertexData.pSysMem=vertices;ComPtr<ID3D11Buffer> buffer;
        require(device->CreateBuffer(&bufferDesc,&vertexData,buffer.GetAddressOf()),"Create oracle quad buffer");
        const Frame frame{real(argv[11]),real(argv[10]),real(argv[12]),0,real(argv[6]),real(argv[7]),real(argv[8]),real(argv[9]),std::stoi(argv[13]),0,0,0};
        if(frame.vpWidth<=0||frame.vpHeight<=0)throw std::runtime_error("Invalid viewport size");
        D3D11_BUFFER_DESC constantDesc{};constantDesc.ByteWidth=sizeof(frame);constantDesc.Usage=D3D11_USAGE_IMMUTABLE;constantDesc.BindFlags=D3D11_BIND_CONSTANT_BUFFER;
        D3D11_SUBRESOURCE_DATA constantData{};constantData.pSysMem=&frame;ComPtr<ID3D11Buffer> constants;
        require(device->CreateBuffer(&constantDesc,&constantData,constants.GetAddressOf()),"Create original cbPerFrame buffer");
        ComPtr<ID3D11ShaderReflection> reflection;require(D3DReflect(psCode->GetBufferPointer(),psCode->GetBufferSize(),IID_PPV_ARGS(reflection.GetAddressOf())),"Reflect original HLSL resources");
        D3D11_SHADER_INPUT_BIND_DESC cb{},textureBinding{},samplerBinding{};
        require(reflection->GetResourceBindingDescByName("cbPerFrame",&cb),"Locate original constant buffer slot");
        require(reflection->GetResourceBindingDescByName("gDiffuseMap",&textureBinding),"Locate original texture slot");
        require(reflection->GetResourceBindingDescByName("samp",&samplerBinding),"Locate original sampler slot");
        D3D11_TEXTURE2D_DESC imageDesc{};imageDesc.Width=width;imageDesc.Height=height;imageDesc.MipLevels=1;imageDesc.ArraySize=1;imageDesc.Format=DXGI_FORMAT_R8G8B8A8_UNORM;imageDesc.SampleDesc.Count=1;imageDesc.Usage=D3D11_USAGE_IMMUTABLE;imageDesc.BindFlags=D3D11_BIND_SHADER_RESOURCE;
        D3D11_SUBRESOURCE_DATA imageData{};imageData.pSysMem=pixels.data();imageData.SysMemPitch=static_cast<UINT>(width)*4;ComPtr<ID3D11Texture2D> image;
        require(device->CreateTexture2D(&imageDesc,&imageData,image.GetAddressOf()),"Upload oracle RGBA texture");
        ComPtr<ID3D11ShaderResourceView> imageView;require(device->CreateShaderResourceView(image.Get(),nullptr,imageView.GetAddressOf()),"Create oracle texture view");
        D3D11_SAMPLER_DESC sampling{};sampling.Filter=D3D11_FILTER_ANISOTROPIC;sampling.AddressU=sampling.AddressV=sampling.AddressW=D3D11_TEXTURE_ADDRESS_WRAP;sampling.MaxAnisotropy=4;sampling.ComparisonFunc=D3D11_COMPARISON_NEVER;sampling.MaxLOD=(std::numeric_limits<float>::max)();
        ComPtr<ID3D11SamplerState> sampler;require(device->CreateSamplerState(&sampling,sampler.GetAddressOf()),"Create original anisotropic wrap sampler");
        auto outputDesc=imageDesc;outputDesc.Usage=D3D11_USAGE_DEFAULT;outputDesc.BindFlags=D3D11_BIND_RENDER_TARGET;ComPtr<ID3D11Texture2D> output;
        require(device->CreateTexture2D(&outputDesc,nullptr,output.GetAddressOf()),"Create oracle render target");
        ComPtr<ID3D11RenderTargetView> target;require(device->CreateRenderTargetView(output.Get(),nullptr,target.GetAddressOf()),"Create oracle target view");
        D3D11_RASTERIZER_DESC rasterDesc{};rasterDesc.FillMode=D3D11_FILL_SOLID;rasterDesc.CullMode=D3D11_CULL_NONE;rasterDesc.DepthClipEnable=TRUE;
        ComPtr<ID3D11RasterizerState> raster;require(device->CreateRasterizerState(&rasterDesc,raster.GetAddressOf()),"Create oracle raster state");
        D3D11_DEPTH_STENCIL_DESC depthDesc{};depthDesc.DepthEnable=FALSE;ComPtr<ID3D11DepthStencilState> depth;
        require(device->CreateDepthStencilState(&depthDesc,depth.GetAddressOf()),"Create oracle depth state");
        // The input is opaque. Disabled blending equals the source NORMAL
        // SRC_ALPHA / INV_SRC_ALPHA RGB blend and ONE / ONE alpha accumulation
        // on a cleared destination, isolating the original pixel shader.
        const float clear[]{0,0,0,0};context->ClearRenderTargetView(target.Get(),clear);
        context->OMSetRenderTargets(1,target.GetAddressOf(),nullptr);context->OMSetBlendState(nullptr,nullptr,0xffffffff);context->OMSetDepthStencilState(depth.Get(),0);
        const D3D11_VIEWPORT viewport{0,0,static_cast<float>(width),static_cast<float>(height),0,1};context->RSSetViewports(1,&viewport);context->RSSetState(raster.Get());
        const UINT stride=sizeof(Vertex),offset=0;context->IASetVertexBuffers(0,1,buffer.GetAddressOf(),&stride,&offset);context->IASetInputLayout(layout.Get());context->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
        context->VSSetShader(vs.Get(),nullptr,0);context->PSSetShader(ps.Get(),nullptr,0);context->PSSetConstantBuffers(cb.BindPoint,1,constants.GetAddressOf());
        context->PSSetShaderResources(textureBinding.BindPoint,1,imageView.GetAddressOf());context->PSSetSamplers(samplerBinding.BindPoint,1,sampler.GetAddressOf());context->Draw(6,0);
        auto stagingDesc=outputDesc;stagingDesc.Usage=D3D11_USAGE_STAGING;stagingDesc.BindFlags=0;stagingDesc.CPUAccessFlags=D3D11_CPU_ACCESS_READ;ComPtr<ID3D11Texture2D> staging;
        require(device->CreateTexture2D(&stagingDesc,nullptr,staging.GetAddressOf()),"Create oracle readback buffer");context->CopyResource(staging.Get(),output.Get());
        D3D11_MAPPED_SUBRESOURCE mapped{};require(context->Map(staging.Get(),0,D3D11_MAP_READ,0,&mapped),"Read original HLSL pixels");
        const auto outputPath=std::filesystem::u8path(argv[3]);if(!outputPath.parent_path().empty())std::filesystem::create_directories(outputPath.parent_path());
        std::ofstream file(outputPath,std::ios::binary|std::ios::trunc);if(!file)throw std::runtime_error("Cannot write oracle pixels");
        for(int y=0;y<height;++y)file.write(static_cast<const char*>(mapped.pData)+static_cast<std::size_t>(y)*mapped.RowPitch,static_cast<std::streamsize>(width)*4);
        context->Unmap(staging.Get(),0);if(!file)throw std::runtime_error("Cannot write complete oracle pixels");
        std::wcout<<L"Original HLSL D3D11 adapter: "<<selectedDesc.Description<<L"; anisotropic wrap 4x; "<<width<<L" x "<<height<<L"\n";
        return 0;
    }catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}
}
