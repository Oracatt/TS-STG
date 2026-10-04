// Source fragments are copied byte-for-byte by verify-th20-projection.mjs.
#define NOMINMAX
#include <Windows.h>
#include <d3d9.h>
#include "anm_vm.hpp"
#include "projected_draw.hpp"
#include "quad.hpp"
#include "ecl_vm/math.hpp"
#include <iostream>
#include <vector>
#include <cstring>
#include <stdexcept>
static float scale;static int offsets[2][2];
namespace th20::source::sprite::anm_environment {float screen_scale(){return scale;}std::int32_t screen_offset(unsigned preset,unsigned axis){return offsets[preset][axis];}}
namespace th20::source::sprite {
namespace n=th20::recovered;namespace m=th20::source::ecl::math;namespace env=anm_environment;namespace e=draw_environment;
Vertex28 animation_quad[4];
namespace draw_environment {static program_entry::ViewportState camera{};program_entry::ViewportState& current_camera(){return camera;}}
constexpr Matrix4 identity{{1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1}};
template<class T>T& at(Animation& a,unsigned offset){return *reinterpret_cast<T*>(reinterpret_cast<char*>(&a)+offset);}
float sub(float a,float b){return _mm_cvtss_f32(_mm_sub_ss(_mm_set_ss(a),_mm_set_ss(b)));}
float length(const Vec3& v){return m::square_root(n::add32(n::add32(n::mul32(v.x,v.x),n::mul32(v.y,v.y)),n::mul32(v.z,v.z)));}
struct MatrixSdk {
 HMODULE module=LoadLibraryW(L"d3dx9_43.dll");using Rotation=D3DMATRIX*(WINAPI*)(D3DMATRIX*,float);using Multiply=D3DMATRIX*(WINAPI*)(D3DMATRIX*,const D3DMATRIX*,const D3DMATRIX*);using Perspective=D3DMATRIX*(WINAPI*)(D3DMATRIX*,float,float,float,float);using LookAt=D3DMATRIX*(WINAPI*)(D3DMATRIX*,const Vec3*,const Vec3*,const Vec3*);
 using Project=Vec3*(WINAPI*)(Vec3*,const Vec3*,const D3DVIEWPORT9*,const D3DMATRIX*,const D3DMATRIX*,const D3DMATRIX*);
 Rotation rotations[3];Multiply multiply;Perspective perspective;LookAt look;Project project;
 MatrixSdk(){if(!module)throw std::runtime_error("D3DX unavailable");rotations[0]=reinterpret_cast<Rotation>(GetProcAddress(module,"D3DXMatrixRotationX"));rotations[1]=reinterpret_cast<Rotation>(GetProcAddress(module,"D3DXMatrixRotationY"));rotations[2]=reinterpret_cast<Rotation>(GetProcAddress(module,"D3DXMatrixRotationZ"));multiply=reinterpret_cast<Multiply>(GetProcAddress(module,"D3DXMatrixMultiply"));perspective=reinterpret_cast<Perspective>(GetProcAddress(module,"D3DXMatrixPerspectiveFovLH"));look=reinterpret_cast<LookAt>(GetProcAddress(module,"D3DXMatrixLookAtLH"));project=reinterpret_cast<Project>(GetProcAddress(module,"D3DXVec3Project"));}
 ~MatrixSdk(){FreeLibrary(module);}
};
MatrixSdk& sdk(){static MatrixSdk value;return value;}
#include "projection-source.inc"
Matrix4 world_for(Animation& a){
#include "world-source.inc"
 return world;
}
}
static float f(std::uint32_t value){float out;std::memcpy(&out,&value,4);return out;}
static std::uint32_t bits(float value){std::uint32_t out;std::memcpy(&out,&value,4);return out;}
int main(){try{namespace s=th20::source::sprite;std::string mode;unsigned count;std::cin>>mode>>count;
 if(mode=="world")for(unsigned c=0;c<count;c++){
  unsigned nodes,scaleBits;std::cin>>nodes>>scaleBits;scale=f(scaleBits);for(auto& row:offsets)for(auto& v:row)std::cin>>v;
  std::vector<s::Animation> animations(nodes);for(unsigned i=0;i<nodes;i++){int parent,root;std::cin>>parent>>root;auto& a=animations[i];auto* words=reinterpret_cast<std::uint32_t*>(&a);for(unsigned j=0;j<sizeof(a)/4;j++)std::cin>>words[j];a.fields_550[2]=root>=0?reinterpret_cast<std::uint32_t>(&animations[root]):0;a.fields_550[3]=parent>=0?reinterpret_cast<std::uint32_t>(&animations[parent]):0;}
  auto result=s::world_for(animations.back());for(auto value:result.elements)std::cout<<bits(value)<<' ';std::cout<<'\n';
 }
 else if(mode=="camera")for(unsigned c=0;c<count;c++){
  unsigned x,y,w,h,fovBits;std::cin>>x>>y>>w>>h>>fovBits;const float fov=f(fovBits);float tangent=float(std::tan(double(fov/2.f)));s::Vec3 eye{float(x)+float(w)/2,float(y)+float(h)/2,float(h>>1)/tangent},target{float(x)+float(w)/2,float(y)+float(h)/2,0},up{0,-1,0};D3DMATRIX view,projection;s::sdk().look(&view,&eye,&target,&up);s::sdk().perspective(&projection,fov,float(w)/float(h),1,10000);for(unsigned i=0;i<16;i++)std::cout<<bits(reinterpret_cast<float*>(&view)[i])<<' ';for(unsigned i=0;i<16;i++)std::cout<<bits(reinterpret_cast<float*>(&projection)[i])<<' ';std::cout<<'\n';
 }
 else if(mode=="reciprocal-table"){
  std::uint32_t previous=0;for(std::uint32_t i=0;i<0x800000u;i++){
   const auto value=bits(_mm_cvtss_f32(_mm_rcp_ss(_mm_set_ss(f(0x3f800000u+i)))));
   if(value!=previous){std::cout<<i<<' '<<value<<'\n';previous=value;}
  }
 }
 else if(mode=="billboard"||mode=="billboard-debug"||mode=="billboard-state")for(unsigned c=0;c<count;c++){
  unsigned nodes;std::cin>>nodes;auto& camera=s::draw_environment::camera;
  std::cin>>camera.viewport.X>>camera.viewport.Y>>camera.viewport.Width>>camera.viewport.Height;camera.viewport.MinZ=0;camera.viewport.MaxZ=1;
  for(float& value:camera.vectors[4]){unsigned word;std::cin>>word;value=f(word);}
  for(unsigned i=0;i<16;i++){unsigned word;std::cin>>word;reinterpret_cast<float*>(&camera.view)[i]=f(word);}
  for(unsigned i=0;i<16;i++){unsigned word;std::cin>>word;reinterpret_cast<float*>(&camera.projection)[i]=f(word);}
  std::vector<s::Animation> animations(nodes);for(unsigned i=0;i<nodes;i++){int parent,root;std::cin>>parent>>root;auto& a=animations[i];auto* words=reinterpret_cast<std::uint32_t*>(&a);for(unsigned j=0;j<sizeof(a)/4;j++)std::cin>>words[j];a.fields_550[2]=root>=0?reinterpret_cast<std::uint32_t>(&animations[root]):0;a.fields_550[3]=parent>=0?reinterpret_cast<std::uint32_t>(&animations[parent]):0;}
  if(mode=="billboard-debug"){
    auto& a=animations.back();s::Matrix4 world=s::identity;for(unsigned j=0;j<3;j++)world.elements[12+j]=s::n::add32(s::n::add32(reinterpret_cast<float*>(&a.base.vector_2c)[j],reinterpret_cast<float*>(&a.vector_5bc)[j]),reinterpret_cast<float*>(&a.base.vector_484)[j]);
    D3DMATRIX first,matrix;s::sdk().multiply(&first,reinterpret_cast<D3DMATRIX*>(&world),&camera.view);s::sdk().multiply(&matrix,&first,&camera.projection);for(unsigned j=0;j<16;j++)std::cout<<bits(reinterpret_cast<float*>(&matrix)[j])<<' ';
    s::Vec3 point{},output{};s::sdk().project(&output,&point,&camera.viewport,&camera.projection,&camera.view,reinterpret_cast<D3DMATRIX*>(&world));std::cout<<bits(output.x)<<' '<<bits(output.y)<<' '<<bits(output.z)<<' ';
    s::sdk().project(&output,reinterpret_cast<s::Vec3*>(&camera.vectors[4]),&camera.viewport,&camera.projection,&camera.view,reinterpret_cast<D3DMATRIX*>(&world));std::cout<<bits(output.x)<<' '<<bits(output.y)<<' '<<bits(output.z)<<' ';
    const float w=matrix._44,r=_mm_cvtss_f32(_mm_rcp_ss(_mm_set_ss(w))),nr=r*(2.f-w*r);std::cout<<bits(w)<<' '<<bits(1.f/w)<<' '<<bits(r)<<' '<<bits(nr)<<'\n';
  }else{const auto result=s::prepare_projected_billboard(animations.back());
    if(mode=="billboard-state")for(const auto& a:animations)std::cout<<bits(a.base.vector_38.x)<<' '<<bits(a.base.vector_38.y)<<' '<<bits(a.base.vector_38.z)<<' ';
    else{std::cout<<result<<' ';if(result==0)for(const auto& vertex:s::animation_quad)std::cout<<bits(vertex.x)<<' '<<bits(vertex.y)<<' '<<bits(vertex.z)<<' ';}std::cout<<'\n';}
 }else throw std::runtime_error("Unknown mode");
 }catch(const std::exception& e){std::cerr<<e.what();return 1;}}
