// Links the unmodified reconstruction effect_system/converging_particles.cpp.
// Only named ANM allocation/lookup and RNG services are supplied by this CPU
// fixture; this does not load or execute the original game executable.
#include "effect_system/converging_particles.hpp"
#include "sprite_renderer/named_spawn.hpp"
#include "sprite_renderer/anm_vm.hpp"
#include "runtime_state/state.hpp"
#include <iostream>
#include <array>
#include <vector>
#include <cstring>
namespace s=th20::source::sprite;namespace fx=th20::source::effects;namespace n=th20::recovered;
static std::array<s::Animation,201> children{};static std::array<int,201> scripts{};static unsigned count;
alignas(fx::Controller) static unsigned char owner_storage[sizeof(fx::Controller)];
alignas(s::Controller) static unsigned char sprites_storage[sizeof(s::Controller)];
static s::AnimationFile file{};
static float from_bits(std::uint32_t bits){float result;std::memcpy(&result,&bits,4);return result;}
static std::uint32_t bits(float value){std::uint32_t result;std::memcpy(&result,&value,4);return result;}
static float input_float(){std::uint32_t word;std::cin>>word;return from_bits(word);}
namespace th20::source::state {
Random random_streams[4]{Random(0),Random(1),Random(2),Random(3)};
float clock_scale=1;const float* timer_rate=&clock_scale;
std::uint32_t next(Random& r){r.last=n::lcg_next(r.state);return r.last%r.modulus;}
float unit(Random& r){const auto numerator=_mm_set_ss(static_cast<float>(static_cast<double>(next(r))));const auto denominator=_mm_sub_ss(_mm_set_ss(static_cast<float>(static_cast<double>(r.modulus))),_mm_set_ss(1.f));return _mm_cvtss_f32(_mm_div_ss(numerator,denominator));}
float signed_unit(Random& r){const float value=static_cast<float>(static_cast<double>(next(r))),limit=static_cast<float>(static_cast<double>(r.modulus));return _mm_cvtss_f32(_mm_sub_ss(_mm_div_ss(_mm_set_ss(value),_mm_sub_ss(_mm_div_ss(_mm_set_ss(limit),_mm_set_ss(2)),_mm_set_ss(1))),_mm_set_ss(1)));}
}
namespace th20::source::effects {
Controller* controller(std::int32_t) noexcept{return reinterpret_cast<Controller*>(owner_storage);}
namespace environment {s::Controller& sprites(){return *reinterpret_cast<s::Controller*>(sprites_storage);}}
}
namespace th20::source::sprite {
std::uint32_t spawn_named_animation(Controller&,AnimationFile&,const char*,std::int32_t script,std::int32_t,Animation**){scripts[++count]=script;return count;}
Animation* resolve_animation_handle(Controller&,std::uint32_t& handle) noexcept{return handle&&handle<=count?&children[handle]:nullptr;}
void set_animation_color(Animation& a,std::uint32_t color) noexcept{a.base.field_490=color;}
float animation_slowdown(Animation& a) noexcept{return from_bits(a.fields_550[4]);}
}
static void output_vector(s::Vec3 v){std::cout<<bits(v.x)<<' '<<bits(v.y)<<' '<<bits(v.z)<<' ';}
int main(){
  fx::controller(0)->files[0]=&file;unsigned cases;std::cin>>cases;
  for(unsigned c=0;c<cases;c++){
    children={};scripts={};count=0;s::Animation parent{};fx::ConvergingParticles effect(parent);fx::Parameters parameters{};effect.initialize(parameters,0);
    auto& rng=th20::source::state::random_streams[1];rng.modulus=0x7fffffff;
    std::cin>>rng.state>>effect.age.current>>effect.age.previous>>parent.base.fields_444[0];rng.last=rng.state;effect.age.current_f=static_cast<float>(effect.age.current);
    parent.vector_5bc={input_float(),input_float(),input_float()};parent.base.vector_38.z=input_float();parent.base.fields_444[10]=bits(input_float());std::cin>>parent.base.field_490;parent.fields_550[4]=bits(input_float());
    unsigned existing;std::cin>>existing;
    for(unsigned i=0;i<existing;i++){
      effect.handles[i]=++count;auto& child=children[count];std::cin>>effect.stages[i]>>child.timer_4d8.current;
      effect.targets[i]={input_float(),input_float(),input_float()};effect.tangents[i]={input_float(),input_float(),input_float()};
    }
    const auto result=effect.update();
    std::cout<<result<<' '<<rng.state<<' '<<rng.last<<' '<<effect.age.current<<' '<<effect.age.previous<<' '<<bits(effect.age.current_f)<<' '<<count<<' ';
    for(unsigned i=0;i<200;i++)if(effect.handles[i]){
      auto& child=children[effect.handles[i]];auto& curve=child.base.interpolation_8c;
      std::cout<<effect.handles[i]<<' '<<effect.stages[i]<<' '<<scripts[effect.handles[i]]<<' '<<child.base.field_490<<' '<<child.base.fields_444[0]<<' '<<child.fields_550[4]<<' '<<curve.duration<<' '<<curve.mode<<' ';
      output_vector(effect.targets[i]);output_vector(effect.tangents[i]);output_vector(curve.start);output_vector(curve.end);output_vector(curve.current);output_vector(curve.tangent_start);output_vector(curve.tangent_end);
    }
    std::cout<<'\n';
  }
}
