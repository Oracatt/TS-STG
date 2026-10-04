// Test-only source oracle. Links the supplied reconstruction's ANM interpreter;
// no original executable, PE loader, or original machine code is used.
#include "anm_vm.hpp"
#include <iostream>
#include <vector>
#include <cstring>
#include <stdexcept>
#include <cstdlib>
namespace s=th20::source::sprite;namespace n=th20::recovered;
namespace {
float rate=1;std::uint32_t seed=1;std::vector<std::uint32_t>* code;
std::vector<s::Vec2> dimensions;
float f(std::uint32_t v){float x;std::memcpy(&x,&v,4);return x;}
std::uint32_t bits(float v){std::uint32_t x;std::memcpy(&x,&v,4);return x;}
[[noreturn]]void unavailable(){throw std::runtime_error("Unsupported oracle environment dependency");}
}
namespace th20::source::sprite::anm_environment {
float& clock_scale(){return rate;}const float* timer_rate(){return &rate;}
AnmInstruction* script(Animation&){return reinterpret_cast<AnmInstruction*>(code->data());}
bool gameplay_frozen(){return false;}
std::uint32_t random_next(){return n::lcg_next(seed)%0x7fffffffu;}
std::uint32_t random_bounded(std::uint32_t v){return random_next()%v;}
float random_unit(){return float(double(random_next()))/(float(0x7fffffffu)-1.f);}
float random_signed_unit(){return float(double(random_next()))/(float(0x7fffffffu)/2.f-1.f)-1.f;}
float camera_component(std::int32_t){unavailable();}
void assign_sprite(Animation& a,std::int32_t index){a.base.fields_10_28[4]=index;if(index>=0)a.base.vector_70=dimensions.at(index);}
void set_layer(Animation& a,std::int32_t layer){a.base.fields_10_28[1]=layer;const auto mode=layer>=3&&layer<=19?1u:layer>=20&&layer<=23?2u:0u;a.base.flags[2]=(a.base.flags[2]&~0x03000000u)|(mode<<24);if(((layer>19&&layer<37)||(layer>44&&layer<54))&&!(a.base.flags[1]&0x800000u))a.base.flags[3]=(a.base.flags[3]&~0xffu)|1u;}
void add_camera_offset(Vec3&){unavailable();}void calculate_corners(Animation&,Vec3(&)[4]){unavailable();}
float screen_scale(){return 1.5f;}std::int32_t screen_offset(unsigned,unsigned){return 0;}
void* allocate_geometry(std::uint32_t bytes){return std::calloc(1,bytes);}
std::uint32_t spawn_child(Animation&,std::int32_t,std::uint32_t){unavailable();}
std::uint32_t spawn_detached(Animation&,std::int32_t,std::uint32_t){unavailable();}
Animation& lookup_animation(std::uint32_t){unavailable();}void spawn_effect(Animation&,std::int32_t){unavailable();}
}
int main(){try{unsigned cases;std::cin>>cases;for(unsigned c=0;c<cases;c++){
 unsigned scripts,selected,count,frames,eventCount;std::cin>>scripts>>selected>>count>>frames>>eventCount>>seed;
 std::vector<std::vector<std::uint32_t>> programs(scripts);for(auto& program:programs){unsigned words;std::cin>>words;program.resize(words);for(auto& word:program)std::cin>>word;}dimensions.resize(count);
 for(auto& d:dimensions){std::uint32_t x,y;std::cin>>x>>y;d={f(x),f(y)};}
 std::vector<std::pair<int,int>> events(eventCount);for(auto& e:events)std::cin>>e.first>>e.second;
 std::vector<s::Animation> templates(scripts);for(unsigned index=0;index<scripts;index++){
   auto& t=templates[index];s::construct_animation(t);s::reset_animation_state(t);t.base.flags[2]=2;t.base.flags[0]&=~0x10000u;
   n::timer_set(t.timer_4c8,-1);n::timer_set(t.timer_4d8,-1);code=&programs[index];try{s::execute_animation(t);}catch(const std::exception&){if(index==selected)throw;}
 }
 s::Animation a;s::construct_animation(a);a.base=templates[selected].base;n::timer_set(a.timer_4c8,0);n::timer_set(a.timer_4d8,0);code=&programs[selected];bool alive=true;
 for(unsigned frame=0;frame<frames;frame++){
   for(auto event:events)if(event.first==int(frame))a.base.field_438=event.second;
   if(alive)alive=s::execute_animation(a)==0;
   const auto* raw=reinterpret_cast<const std::uint32_t*>(&a);
   std::cout<<c<<' '<<frame<<' '<<alive<<' '<<a.timer_4c8.current<<' '<<a.base.fields_10_28[6]<<' '<<seed;
   for(unsigned address:{0x14u,0x20u,0x2cu,0x30u,0x34u,0x38u,0x3cu,0x40u,0x44u,0x48u,0x4cu,0x50u,0x54u,0x58u,0x5cu,0x60u,0x64u,0x68u,0x6cu,0x70u,0x74u,0x78u,0x7cu,0x444u,0x448u,0x44cu,0x450u,0x454u,0x458u,0x45cu,0x460u,0x484u,0x488u,0x48cu,0x490u,0x494u,0x498u,0x4a4u,0x4a8u,0x4acu})std::cout<<' '<<raw[address/4];
   std::cout<<'\n';
 }
 }return 0;}catch(const std::exception& e){std::cerr<<e.what();return 1;}}
