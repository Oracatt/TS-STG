// Test-only oracle: compiled reconstruction source and OS D3DX surface service.
// Never loads the original game executable or machine code.
#include "native_core.hpp"
#include "ecl_vm/math.hpp"
#include "title_system/data.hpp"
#include <windows.h>
#include <d3d9.h>
#include <iostream>
#include <vector>
#include <cstring>
#include <stdexcept>
#include <type_traits>
#include <algorithm>
#include <cmath>
namespace th20::source::sprite {
struct Vertex28 {float x,y,z,rhw;std::uint32_t color;float u,v;};struct Vec3{float x,y,z;};
struct RenderMesh{int columns,rows;Vertex28* vertices;Vec3* positions;};
}
namespace th20::source::state {struct Random{std::uint32_t state=1,last=0,modulus=0x7fffffff;Random(int){}};}
namespace th20::source::title {struct TitleInf{sprite::RenderMesh* mesh;float wave;std::uint32_t color[4];};}
namespace n=th20::recovered;namespace s=th20::source::sprite;namespace state=th20::source::state;
namespace th20::source::state {
Random random_streams[4]{{0},{1},{2},{3}};
std::uint32_t next(Random& r){r.last=n::lcg_next(r.state);return r.last%r.modulus;}
}
static int width,height,offsetX,offsetY;
namespace th20::source::sprite {
namespace e {int scaled_dimension(unsigned axis){return axis?height:width;}int display_offset(unsigned axis){return axis?offsetY:offsetX;}}
float sub(float a,float b){return _mm_cvtss_f32(_mm_sub_ss(_mm_set_ss(a),_mm_set_ss(b)));}
float div(float a,float b){return _mm_cvtss_f32(_mm_div_ss(_mm_set_ss(a),_mm_set_ss(b)));}
void update_render_mesh_strips(RenderMesh&){}
#include "mesh-source.inc"
}
namespace th20::source::title {
#include "title-source.inc"
}
static std::uint32_t next_raw(state::Random& r){return r.last=n::lcg_next(r.state);}
static void noise(std::vector<std::uint32_t>& pixels,int pitch,int left,int top,int w,int h){
 const RECT destination_rect{left,top,left+w,top+h};
 const D3DLOCKED_RECT locked{pitch*4,pixels.data()+top*pitch+left};
#include "noise-source.inc"
}
static float f(std::uint32_t bits){float value;std::memcpy(&value,&bits,4);return value;}
static std::uint32_t bits(float value){std::uint32_t result;std::memcpy(&result,&value,4);return result;}
static void emit(std::uint32_t value){std::cout<<value<<' ';}
using CopySurface=HRESULT(WINAPI*)(IDirect3DSurface9*,const PALETTEENTRY*,const RECT*,IDirect3DSurface9*,const PALETTEENTRY*,const RECT*,DWORD,D3DCOLOR);
int main(){try{
 std::string mode;std::cin>>mode;unsigned count;std::cin>>count;
 if(mode=="title")for(unsigned i=0;i<count;i++){
  std::uint32_t wave,seed,modulus;std::cin>>width>>height>>offsetX>>offsetY>>wave>>seed>>modulus;
  std::aligned_storage_t<sizeof(th20::source::title::TitleInf),alignof(th20::source::title::TitleInf)> storage{};
  auto& title=*reinterpret_cast<th20::source::title::TitleInf*>(&storage);for(auto& c:title.color)std::cin>>c;
  std::vector<s::Vertex28> vertices(64*48);std::vector<s::Vec3> positions(64*48);s::RenderMesh mesh{};mesh.columns=64;mesh.rows=48;mesh.vertices=vertices.data();mesh.positions=positions.data();title.mesh=&mesh;title.wave=f(wave);
  state::Random rng(1);rng.state=seed;rng.modulus=modulus;s::initialize_display_render_mesh(mesh,0,0,float(width),float(height));
  th20::source::title::deform_background(title,rng);emit(bits(title.wave));emit(rng.state);emit(rng.last);
  for(const auto& v:vertices){emit(bits(v.x));emit(bits(v.y));emit(bits(v.z));emit(bits(v.rhw));emit(v.color);emit(bits(v.u));emit(bits(v.v));}std::cout<<'\n';
 }
 else if(mode=="noise")for(unsigned i=0;i<count;i++){
  int w,h,left,top,rw,rh;unsigned seed;std::cin>>w>>h>>left>>top>>rw>>rh>>seed;std::vector<std::uint32_t> p(w*h);for(auto& pixel:p)std::cin>>pixel;
  state::random_streams[1].state=seed;noise(p,w,left,top,rw,rh);emit(state::random_streams[1].state);for(auto pixel:p)emit(pixel);std::cout<<'\n';
 }
 else if(mode=="resize"){
  auto library=LoadLibraryW(L"d3dx9_43.dll");if(!library)throw std::runtime_error("OS D3DX9_43 unavailable");auto copy=reinterpret_cast<CopySurface>(GetProcAddress(library,"D3DXLoadSurfaceFromSurface"));
  auto* d3d=Direct3DCreate9(D3D_SDK_VERSION);auto window=CreateWindowExW(0,L"STATIC",L"TH20 surface oracle",WS_POPUP,0,0,8,8,nullptr,nullptr,GetModuleHandleW(nullptr),nullptr);
  D3DPRESENT_PARAMETERS params{};params.Windowed=TRUE;params.SwapEffect=D3DSWAPEFFECT_DISCARD;params.hDeviceWindow=window;params.BackBufferFormat=D3DFMT_UNKNOWN;
  IDirect3DDevice9* device=nullptr;if(FAILED(d3d->CreateDevice(0,D3DDEVTYPE_HAL,window,D3DCREATE_SOFTWARE_VERTEXPROCESSING,&params,&device)))throw std::runtime_error("D3D9 device unavailable");
  for(unsigned i=0;i<count;i++){
   int sw,sh,dw,dh;RECT sr,dr;std::cin>>sw>>sh>>dw>>dh>>sr.left>>sr.top>>sr.right>>sr.bottom>>dr.left>>dr.top>>dr.right>>dr.bottom;
   IDirect3DSurface9 *source=nullptr,*dest=nullptr;device->CreateOffscreenPlainSurface(sw,sh,D3DFMT_A8R8G8B8,D3DPOOL_SYSTEMMEM,&source,nullptr);device->CreateOffscreenPlainSurface(dw,dh,D3DFMT_A8R8G8B8,D3DPOOL_SYSTEMMEM,&dest,nullptr);
   D3DLOCKED_RECT lock{};source->LockRect(&lock,nullptr,0);for(int y=0;y<sh;y++)for(int x=0;x<sw;x++)reinterpret_cast<std::uint32_t*>(static_cast<char*>(lock.pBits)+lock.Pitch*y)[x]=0xff000000u|unsigned(y*sw+x);source->UnlockRect();
   dest->LockRect(&lock,nullptr,0);for(int y=0;y<dh;y++)for(int x=0;x<dw;x++)reinterpret_cast<std::uint32_t*>(static_cast<char*>(lock.pBits)+lock.Pitch*y)[x]=0;dest->UnlockRect();
   if(FAILED(copy(dest,nullptr,&dr,source,nullptr,&sr,2,0)))throw std::runtime_error("D3DX surface copy failed");
   dest->LockRect(&lock,nullptr,0);for(int y=0;y<dh;y++)for(int x=0;x<dw;x++)emit(reinterpret_cast<std::uint32_t*>(static_cast<char*>(lock.pBits)+lock.Pitch*y)[x]);dest->UnlockRect();std::cout<<'\n';source->Release();dest->Release();
  }device->Release();DestroyWindow(window);d3d->Release();FreeLibrary(library);
 }else throw std::runtime_error("Unknown mode");
}catch(const std::exception& e){std::cerr<<e.what();return 1;}}
