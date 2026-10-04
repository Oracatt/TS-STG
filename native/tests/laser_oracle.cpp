// Strict-float reference transcribed from laser_system/type2_path.cpp.
// Compares selected reconstructed C++ curve arithmetic, not original executable output.
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <xmmintrin.h>
namespace {
float a(float x,float y){return _mm_cvtss_f32(_mm_add_ss(_mm_set_ss(x),_mm_set_ss(y)));}
float s(float x,float y){return _mm_cvtss_f32(_mm_sub_ss(_mm_set_ss(x),_mm_set_ss(y)));}
float m(float x,float y){return _mm_cvtss_f32(_mm_mul_ss(_mm_set_ss(x),_mm_set_ss(y)));}
float d(float x,float y){return _mm_cvtss_f32(_mm_div_ss(_mm_set_ss(x),_mm_set_ss(y)));}
constexpr float pi=3.1415927410125732421875f;
float wrap(float v){if(v>pi){unsigned n=0;do{v=s(v,m(pi,2));if(n>32)break;++n;}while(v>pi);}else if(v < -pi){unsigned n=0;do{v=a(m(pi,2),v);if(n>32)break;++n;}while(v < -pi);}return v;}
float angle(float y,float x){return static_cast<float>(std::atan2(static_cast<double>(y),static_cast<double>(x)));}
float root(float x){return static_cast<float>(std::sqrt(static_cast<double>(x)));}
std::uint32_t bits(float v){std::uint32_t b;std::memcpy(&b,&v,4);return b;}
struct V{float x=0,y=0,z=0;};
V polar(float angle,float length){return{m(static_cast<float>(std::cos(static_cast<double>(angle))),length),m(static_cast<float>(std::sin(static_cast<double>(angle))),length),0};}
V add(V x,V y){return{a(x.x,y.x),a(x.y,y.y),a(x.z,y.z)};}V sub(V x,V y){return{s(x.x,y.x),s(x.y,y.y),s(x.z,y.z)};}V mul(V x,float k){return{m(x.x,k),m(x.y,k),m(x.z,k)};}
struct Sample{V p;float speed=0,angle=0;};
struct Node{int kind;V p,dir;float speed,angle,acceleration,angular;};
Sample absolute(const Node& c,float t){Sample result;
 if(c.kind==0){result={add(c.p,mul(mul(c.dir,t),c.speed)),c.speed,c.angle};}
 else if(c.kind==1){if(!(c.angular < -990)){auto v=add(polar(c.angle,c.speed),polar(c.angular,c.acceleration));result={add(c.p,mul(v,t)),root(a(m(v.x,v.x),m(v.y,v.y))),angle(v.y,v.x)};}
 else{auto v=mul(mul(c.dir,a(m(t,c.acceleration),m(c.speed,2))),a(t,1));v={d(v.x,2),d(v.y,2),d(v.z,2)};result={add(c.p,v),a(m(c.acceleration,t),c.speed),c.angle};}}
 else{auto p=c.p;float angle=c.angle,speed=c.speed;for(int i=0;i<int(t);i++){auto v=polar(angle,speed);angle=wrap(a(angle,c.angular));speed=a(speed,c.acceleration);p=add(p,v);}result={add(p,mul(polar(angle,speed),s(t,float(std::floor(double(t)))))),speed,angle};}return result;}
Sample backwards(const Node& c,const Sample& prev,float time){Sample result;
 if(c.kind==0)result={sub(prev.p,mul(c.dir,c.speed)),c.speed,c.angle};
 else if(c.kind==1){if(!(c.angular < -990)){auto v=add(polar(prev.angle,-prev.speed),polar(c.angular,-c.acceleration));result={add(prev.p,v),root(a(m(v.x,v.x),m(v.y,v.y))),angle(v.y,v.x)};}
 else result={sub(prev.p,mul(c.dir,s(prev.speed,c.acceleration))),s(c.speed,c.acceleration),prev.angle};}
 else{auto p=sub(prev.p,mul(polar(prev.angle,prev.speed),s(time,float(std::floor(double(time))))));const auto speed=s(prev.speed,c.acceleration),angle=wrap(s(prev.angle,c.angular));result={sub(p,mul(polar(angle,speed),a(s(1,time),float(std::floor(double(time)))))),speed,angle};}return result;}
}
int main(){std::cout<<"[";bool first=true;for(int mode=0;mode<4;mode++)for(float initial:{0.f,1.25f,-2.9f})for(float time:{.5f,1.5f,9.75f,24.f}){
 if(!first)std::cout<<",";first=false;Node node{mode==0?0:mode==3?2:1,{12.25f,-8.5f,.1f},polar(initial,1),2.5f,initial,.125f,mode==1?-999.f:.071f};
 std::cout<<"{\"mode\":"<<mode<<",\"angle\":"<<initial<<",\"time\":"<<time<<",\"values\":[";Sample previous;
 for(int i=0;i<8;i++){const auto t=s(time,float(i));Sample current;if(t>=0)current=i?backwards(node,previous,t):absolute(node,t);previous=current;if(i)std::cout<<",";std::cout<<"["<<bits(current.p.x)<<","<<bits(current.p.y)<<","<<bits(current.p.z)<<","<<bits(current.speed)<<","<<bits(current.angle)<<"]";}
 std::cout<<"]}";
}std::cout<<"]";}
