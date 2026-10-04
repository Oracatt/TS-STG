// Independent strict-float transcription of bullet_system/movement.cpp + bounds.cpp.
// Selected numerical kernels only; this is not a claim of original executable parity.
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
void polar(float& x,float& y,float angle,float length){x=m(static_cast<float>(std::cos(static_cast<double>(angle))),length);y=m(static_cast<float>(std::sin(static_cast<double>(angle))),length);}
std::uint32_t bits(float v){std::uint32_t b;std::memcpy(&b,&v,4);return b;}
struct Timer{int now=0;float value=0;void tick(float r){if(r>.99f&&r<1.01f){now++;value=a(value,1);}else{value=a(value,r);now=static_cast<int>(value);}}};
struct Bullet{float x=0,y=100,vx=0,vy=0,speed=2,angle=0;Timer timer;int count=0;bool active=true;};
void update(Bullet& b,int mode,float rate){
 if(b.active){
  if((mode<3)&&b.timer.now>=9)b.active=false;
  else if(mode==0){float ax,ay;polar(ax,ay,.4f,.125f);b.speed=a(b.speed,m(rate,.125f));b.vx=a(b.vx,m(ax,rate));b.vy=a(b.vy,m(ay,rate));if(std::fabs(b.vx)>.0001f||std::fabs(b.vy)>.0001f){b.angle=wrap(angle(b.vy,b.vx));b.speed=root(a(m(b.vx,b.vx),m(b.vy,b.vy)));}b.timer.tick(rate);}
  else if(mode==1){b.angle=wrap(wrap(a(b.angle,m(rate,.08f))));b.speed=a(b.speed,m(rate,-.03125f));polar(b.vx,b.vy,b.angle,b.speed);b.timer.tick(rate);}
  else if(mode==2){float dx,dy;polar(dx,dy,wrap(a(.2f,angle(s(280,b.y),s(70,b.x)))),3);b.vx=a(b.vx,m(s(dx,b.vx),.0625f));b.vy=a(b.vy,m(s(dy,b.vy),.0625f));b.speed=root(a(m(b.vx,b.vx),m(b.vy,b.vy)));b.angle=wrap(angle(b.vy,b.vx));b.timer.tick(rate);}
  else if(mode==3){float speed;if(b.timer.now>=4){b.count++;b.angle=wrap(a(b.angle,.6f));b.speed=speed=2.5f;b.timer={};if(b.count>=3)b.active=false;}else speed=s(b.speed,d(m(b.timer.value,b.speed),4));polar(b.vx,b.vy,b.angle,speed);if(b.active)b.timer.tick(rate);}
  else if(mode==4){
   if(b.x<=-192||b.x>=192||b.y<=0||b.y>=448){bool hit=false;
    if(b.y<0){b.angle=wrap(-b.angle);b.y=s(0,b.y);hit=true;}if(b.y>=448){b.angle=wrap(-b.angle);b.y=s(896,b.y);hit=true;}
    if(b.x>=192){b.angle=wrap(s(-b.angle,pi));b.angle=wrap(wrap(a(b.angle,0)));b.x=s(384,b.x);hit=true;}
    if(b.x< -192){b.angle=wrap(s(-b.angle,pi));b.angle=wrap(wrap(a(b.angle,0)));b.x=s(-384,b.x);hit=true;}
    if(hit){b.speed=2.75f;polar(b.vx,b.vy,b.angle,b.speed);b.count++;}if(b.count>=3)b.active=false;
   }
  }
 }
 b.x=a(b.x,m(b.vx,rate));b.y=a(b.y,m(b.vy,rate));
}
}
int main(){std::cout<<"[";bool firstCase=true;for(int mode=0;mode<5;mode++)for(float rate:{0.f,.5f,1.f,1.5f})for(float initial:{0.f,1.25f,-2.9f}){
 if(!firstCase)std::cout<<",";firstCase=false;Bullet b;b.angle=wrap(wrap(initial));polar(b.vx,b.vy,initial,b.speed);if(mode==4){b.x=195;b.y=-2;}
 std::cout<<"{\"mode\":"<<mode<<",\"rate\":"<<rate<<",\"angle\":"<<initial<<",\"values\":[";
 for(int frame=0;frame<24;frame++){update(b,mode,rate);if(frame)std::cout<<",";std::cout<<"["<<bits(b.x)<<","<<bits(b.y)<<","<<bits(b.vx)<<","<<bits(b.vy)<<","<<bits(b.angle)<<","<<bits(b.speed)<<","<<b.timer.now<<","<<b.count<<"]";}
 std::cout<<"]}";
}std::cout<<"]";}
