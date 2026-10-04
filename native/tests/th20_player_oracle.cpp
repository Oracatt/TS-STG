// Isolated arithmetic vectors from the read-only TH20 reconstruction.
// The tested expressions are transcribed from movement.cpp, frame_helpers.cpp,
// option_frame.cpp, native_core.hpp, ecl_vm/math.cpp, bomb_system/reimu.cpp and
// bomb_system/marisa.cpp. This is a source oracle, not original-EXE execution.
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <algorithm>
#include <xmmintrin.h>
#include <emmintrin.h>
namespace {
float a(float x,float y){return _mm_cvtss_f32(_mm_add_ss(_mm_set_ss(x),_mm_set_ss(y)));}
float s(float x,float y){return _mm_cvtss_f32(_mm_sub_ss(_mm_set_ss(x),_mm_set_ss(y)));}
float m(float x,float y){return _mm_cvtss_f32(_mm_mul_ss(_mm_set_ss(x),_mm_set_ss(y)));}
float d(float x,float y){return _mm_cvtss_f32(_mm_div_ss(_mm_set_ss(x),_mm_set_ss(y)));}
int cv(float x){return _mm_cvtt_ss2si(_mm_set_ss(x));}
std::uint32_t bits(float v){std::uint32_t out;std::memcpy(&out,&v,4);return out;}
int signed32(std::uint32_t v){int out;std::memcpy(&out,&v,4);return out;}
constexpr float pi=3.1415927410125732421875f;
float wrap(float v){if(v>pi){unsigned c=0;do{v=s(v,m(pi,2));if(c>32)break;++c;}while(v>pi);}else if(v< -pi){unsigned c=0;do{v=a(m(pi,2),v);if(c>32)break;++c;}while(v< -pi);}return v;}
float snap(float v){return d(float(std::floor(double(m(v,100)))),100);}
void polar(float& x,float& y,float angle,float length){x=m(float(std::cos(double(angle))),length);y=m(float(std::sin(double(angle))),length);}
std::uint32_t next(std::uint32_t& state){const std::uint64_t p=std::uint64_t(state)*48271u;std::uint64_t v=(p>>31)+(p&0x7fffffffu);if(v>=0x7fffffffu)v-=0x7fffffffu;return state=std::uint32_t(v);}
struct Orb{int ordinal=0,time=0;bool second=false;float x=0,y=0,radius=0,angle=0,speed=0,dx=0,dy=0;int mode=2;};
// item_system/frame.cpp, with renderer/reward boundaries observed separately.
struct Item{float x=-120,y=160,vx=0,vy=0,attraction=0,scale=1;int state=1,delay=0,time=0;};
void item_update(Item& item,int frame,int scenario,float clock){
 float px=0,py=400;int player_state=1;
 if(scenario>=8&&frame>=20)py=100;
 if(scenario>=12&&frame>=40){player_state=4;py=400;}
 const bool forced=(player_state!=2&&player_state!=4&&!(128<=py));
 auto move=[&](float extra=1){item.x=a(item.x,m(m(item.vx,clock),extra));item.y=a(item.y,m(m(item.vy,clock),extra));};
 auto pursue=[&](){const auto x=s(px,item.x),y=s(py,item.y);const float angle=x==0&&y==0?d(pi,2):float(std::atan2(double(y),double(x)));polar(item.vx,item.vy,angle,item.attraction);move();if(item.attraction<12)item.attraction=a(item.attraction,.2f);if(player_state==4){item.state=1;item.vx=item.vy=0;}};
 if(item.state){
  bool skip=false;
  if(item.state==1){if(item.delay>0){--item.delay;skip=true;}else if(forced){item.attraction=5;item.state=3;pursue();}else{move(item.scale);item.vy=a(item.vy,m(m(clock,.03f),item.scale));if(item.vy>=0)item.vx=0;if(item.vy>2)item.vy=2;if(!(item.y<=472)||!(std::fabs(item.x)<200))item.state=0;}}
  else if(item.state==2){move();item.vy=a(item.vy,m(clock,.03f));if(item.vy>=0)item.state=1;if(item.y>472||std::fabs(item.x)>=200)item.state=0;}
  else if(item.state==3)pursue();else if(item.state==4){if(forced){item.attraction=5;item.state=3;}pursue();}
  if(!skip&&item.state){const float dx=s(px,item.x),dy=s(py,item.y),distance=a(m(dx,dx),m(dy,dy));if(distance<900)item.state=0;else{if(item.state!=2&&item.state!=3&&item.state!=4&&distance<4900){item.attraction=d(5,3);item.state=4;}item.time++;}}
 }
 if(item.scale<1)item.scale=a(item.scale,.1f);
}
void orb_update(Orb& o,float px,float py){
  const auto launch=o.ordinal*10+90;
  if(o.time<90){o.radius=a(o.radius,1.5f);o.angle=wrap(a(o.angle,d(o.second?-pi:pi,30)));}
  else if(o.time<launch)o.angle=wrap(a(o.angle,d(o.second?-pi:pi,30)));
  else if(o.time==launch){o.mode=0;o.angle=wrap(float(std::atan2(double(o.dy),double(o.dx))));o.speed=float(std::sqrt(double(a(m(o.dx,o.dx),m(o.dy,o.dy)))));}
  else if(o.x< -160||o.x>160||o.y<32||o.y>416)o.speed=m(o.speed,.9f);
  const auto oldx=o.x,oldy=o.y;float dx=0,dy=0;
  if(o.mode==2){o.radius=a(d(o.second?-pi:pi,64),o.radius);o.angle=wrap(a(o.speed,o.angle));polar(dx,dy,o.angle,o.radius);o.x=snap(a(px,dx));o.y=snap(a(py,dy));}
  else{polar(dx,dy,o.angle,o.speed);o.x=snap(a(o.x,dx));o.y=snap(a(o.y,dy));}
  o.dx=s(o.x,oldx);o.dy=s(o.y,oldy);o.time++;
}
}
int main(){
 std::cout<<"{\"movement\":[";bool comma=false;
 const float speeds[2][4]={{4.5f,2.f,3.181980609893799f,1.4142135381698608f},{5.f,2.f,3.535533905029297f,1.4142135381698608f}};
 const int signs[9][2]={{0,0},{0,-1},{0,1},{-1,0},{1,0},{-1,-1},{1,-1},{-1,1},{1,1}};
 const int masks[9]={0,4,8,1,2,5,6,9,10};
 for(int ch=0;ch<2;ch++)for(int direction=0;direction<9;direction++)for(int focus=0;focus<2;focus++)for(float rate:{.5f,1.f,1.25f}){
  int x=0,y=51200;const int speed=cv(m(speeds[ch][(direction>=5?2:0)+focus],128));
  for(int frame=0;frame<73;frame++){const int dx=cv(m(float(signs[direction][0]*speed),rate)),dy=cv(m(float(signs[direction][1]*speed),rate));x=signed32(std::uint32_t(x)+std::uint32_t(dx));y=signed32(std::uint32_t(y)+std::uint32_t(dy));if(x< -23552)x=-23552;if(x>23552)x=23552;if(y<4096)y=4096;if(y>55296)y=55296;}
  if(comma)std::cout<<',';comma=true;std::cout<<'['<<ch<<','<<masks[direction]+focus*64<<','<<bits(rate)<<','<<x<<','<<y<<']';
 }
 std::cout<<"],\"options\":[";comma=false;
 for(int target:{-24000,-4096,0,2048,51200})for(int current:{-51200,-5000,0,5000,52000})for(unsigned factor:{30u,45u,100u}){
  int value=current;for(int f=0;f<17;f++){const int delta=signed32((std::uint32_t(target)-std::uint32_t(value))*factor)/100;value=delta? signed32(std::uint32_t(value)+std::uint32_t(delta)):target;}
  if(comma)std::cout<<',';comma=true;std::cout<<'['<<target<<','<<current<<','<<factor<<','<<value<<']';
 }
 std::cout<<"],\"rng\":[";comma=false;
 for(std::uint32_t seed:{0u,1u,77u,0x7ffffffeu,0xffffffffu}){std::uint32_t state=seed%0x7fffffffu;if(!state)state=1;for(int frame=0;frame<20;frame++){const auto value=next(state);const float signedValue=s(d(float(double(value)),s(d(float(double(0x7fffffffu)),2),1)),1);if(comma)std::cout<<',';comma=true;std::cout<<'['<<seed<<','<<frame<<','<<value<<','<<bits(signedValue)<<']';}}
 std::cout<<"],\"orbs\":[";comma=false;
 for(int second=0;second<2;second++)for(int index=0;index<8;index++){
  Orb o;o.second=second!=0;o.ordinal=index;float angle=0;for(int i=0;i<index;i++)angle=wrap(a(angle,d(m(pi,2),8)));o.angle=angle;
  for(int frame=0;frame<190;frame++){const int global=frame+(second?40:0);const float px=m(float(global%60-30),.125f);orb_update(o,px,400);if(frame%5==0||frame==189){if(comma)std::cout<<',';comma=true;std::cout<<'['<<second<<','<<index<<','<<frame<<','<<bits(o.x)<<','<<bits(o.y)<<','<<bits(o.radius)<<','<<bits(o.angle)<<','<<bits(o.speed)<<']';}}
 }
 std::cout<<"],\"marisa\":[";comma=false;float angle=-1.5707963705062866f;
 for(int frame=0;frame<=300;frame++){const int horizontal=(frame%90<30?-1:frame%90<60?0:1);if(horizontal<0)angle=wrap(s(angle,.0026179938577115536f));else if(horizontal>0)angle=wrap(a(angle,.0026179938577115536f));if(frame&&frame%3==0){for(int distance:{208,240,304}){float x,y;polar(x,y,angle,float(distance));x=a(x,32);y=a(y,400);if(comma)std::cout<<',';comma=true;std::cout<<'['<<frame<<','<<distance<<','<<bits(angle)<<','<<bits(x)<<','<<bits(y)<<']';}}}
 std::cout<<"],\"items\":[";comma=false;
 for(int scenario=0;scenario<16;scenario++)for(float clock:{.5f,1.f,1.25f}){
  Item item;item.state=scenario%4+1;item.delay=scenario==0?2:0;item.scale=scenario%2?.4f:1.f;item.attraction=item.state>=3?d(5,3):0;
  polar(item.vx,item.vy,s(d(-pi,2),.125f),2);
  for(int frame=0;frame<70;frame++){item_update(item,frame,scenario,clock);if(comma)std::cout<<',';comma=true;std::cout<<'['<<scenario<<','<<bits(clock)<<','<<frame<<','<<item.state<<','<<bits(item.x)<<','<<bits(item.y)<<','<<bits(item.vx)<<','<<bits(item.vy)<<','<<bits(item.attraction)<<','<<item.delay<<','<<item.time<<','<<bits(item.scale)<<']';}
 }
 // rewards.cpp integer arithmetic, stone counter fixed at zero as excluded by scope.
 std::cout<<"],\"itemRewards\":[";comma=false;
 for(int type:{1,2,3,8})for(int initial:{100,399,400})for(float py:{127.99f,128.f,400.75f})for(float iy:{127.99f,128.f,400.75f})for(int state:{1,3})for(int base:{10000,1000000}){
  int power=initial,score=0,amount=0;auto round=[](int v){const int r=v-v%10;return r<1?10:r;};auto scoreadd=[&](int v){score+=unsigned(v)/10;};
  if(type==1){if(power<400){amount=100;power++;}else if(py<=128||state==3)amount=round(base);else{const int reduced=base*9/10;amount=round(reduced-reduced*(cv(py)-cv(128))/450);}scoreadd(amount);}
  else if(type==2){const int value=base/2;amount=iy<=128||state==3?round(value):round(value*9/10-(value*9/10)*cv(s(iy,128))/450);scoreadd(amount);}
  else if(type==3){if(power<400){power=std::min(400,power+100);amount=100;}else{amount=20000;scoreadd(20000);}scoreadd(amount);}
  else{if(power>=400){amount=round(base);scoreadd(amount);}else power=400;}
  if(comma)std::cout<<',';comma=true;std::cout<<'['<<type<<','<<initial<<','<<bits(py)<<','<<bits(iy)<<','<<state<<','<<base<<','<<power<<','<<score<<','<<amount<<']';
 }
 std::cout<<"],\"spellTiming\":[";comma=false;
 auto encode=[](int seconds,int hundredths){const int sec=signed32(unsigned(seconds)+66u)%1000,hun=signed32(unsigned(hundredths)+33u)%100;return signed32(unsigned(sec)*100u+unsigned(hun)+(unsigned(seconds)+22u+unsigned(hundredths))*100000u);};
 for(double elapsed:{-.1,0.,.001,.00834,.00835,.00836,.0167,.02499,.02505,.99999,1.,1.01,59.995,60.,123.45678,999.999,1001.}){
  const double before=elapsed,remainder=std::fmod(elapsed,.0167);elapsed-=remainder;if(remainder>=.0167/2)elapsed+=.0167;
  const double whole=std::floor(elapsed);const int seconds=std::min(_mm_cvttsd_si32(_mm_set_sd(whole)),999),hundredths=_mm_cvttsd_si32(_mm_set_sd((elapsed-whole)*100));
  if(comma)std::cout<<',';comma=true;std::cout.precision(17);std::cout<<'['<<before<<','<<seconds<<','<<hundredths<<','<<encode(seconds,hundredths)<<']';
 }
 std::cout<<"],\"spellDecay\":[";comma=false;
 const unsigned base[]{500000,1000000,1500000,2000000,1000000};
 for(int difficulty=0;difficulty<5;difficulty++)for(int stage:{1,6,999})for(int duration:{600,3600}){
  int bonus=signed32(unsigned(stage)*base[difficulty]),initial=std::min(bonus,999999999);
  for(int age=0;age<=duration;age++){if(age>=300){const int numerator=signed32(unsigned(initial)-unsigned(initial/3)),denominator=signed32(unsigned(duration)-300u);bonus=signed32(unsigned(bonus)-unsigned(numerator/denominator));bonus-=bonus%10;}
   if(age==0||age==299||age==300||age==301||age==duration){if(comma)std::cout<<',';comma=true;std::cout<<'['<<difficulty<<','<<stage<<','<<duration<<','<<age<<','<<bonus<<']';}}
 }
 std::cout<<"],\"graze\":[";comma=false;
 for(unsigned seed:{1u,77u,123456u}){
  unsigned state=seed;auto signed_unit=[&](){return s(d(float(double(next(state))),s(d(float(double(0x7fffffffu)),2),1)),1);};
  auto unit=[&](){return d(float(double(next(state))),s(float(double(0x7fffffffu)),1));};
  float angle=m(signed_unit(),pi),x[20]{},y[20]{};unsigned colors[20];
  for(unsigned i=0;i<20;i++)colors[i]=i<10?0xff9abceeu:0x9abceeu|((255u-(i-10)*24u)<<24);
  for(int index=1;index<20;index++){
   for(int i=0;i<index;i++){const auto alpha=colors[i]>>24;colors[i]=(colors[i]&0xffffffu)|((alpha<16?0u:alpha-16u)<<24);}
   const float length=a(m(unit(),8),1);polar(x[index],y[index],angle,length);x[index]=a(x[index],x[index-1]);y[index]=a(y[index],y[index-1]);
   angle=wrap(a(angle,m(signed_unit(),pi)));
   if(comma)std::cout<<',';comma=true;std::cout<<'['<<seed<<','<<index<<','<<bits(x[index])<<','<<bits(y[index])<<','<<bits(angle)<<','<<colors[0]<<','<<colors[index]<<','<<state<<']';
  }
 }
 std::cout<<"],\"continueGame\":[";comma=false;
 for(int unit:{100,200,400})for(int maximum_bombs:{0,1,3,7})for(int count:{0,8,9})for(int credits:{0,1,5}){
  const int bombs=std::min(3,maximum_bombs),power=std::min(400,unit*4),continues=std::clamp(count+1,0,9),credit=credits-1;
  if(comma)std::cout<<',';comma=true;std::cout<<'['<<unit<<','<<maximum_bombs<<','<<count<<','<<credits<<','<<bombs<<','<<power<<','<<continues<<','<<credit<<']';
 }
 std::cout<<"],\"damage\":[";comma=false;
 for(int input:{0,1,29,30,99,100,180})for(int player_state:{0,1,2})for(int flags:{0,33}){
  const int total=std::min(input,100);int amount=total;if(player_state==0||player_state==2)amount/=5;if(amount&&(flags&0x21)==0x21)amount/=30;
  const int score=total?unsigned(total/10+10)/10:0;
  if(comma)std::cout<<',';comma=true;std::cout<<'['<<input<<','<<player_state<<','<<flags<<','<<total<<','<<amount<<','<<score<<']';
 }
 std::cout<<"],\"spellHealth\":[";comma=false;
 for(int initial:{1,17,100})for(int threshold:{0,5}){unsigned words[7]{};words[0]=initial;words[3]=unsigned(initial)*7;words[4]=threshold;words[6]=1;
  for(int amount:{1,6,7,31,100}){words[5]+=unsigned(amount);words[3]-=unsigned(amount);const auto scaled=signed32(words[3]-words[4]*7u)/7;words[0]=unsigned(scaled)+words[4];
   if(comma)std::cout<<',';comma=true;std::cout<<'['<<initial<<','<<threshold<<','<<amount<<','<<signed32(words[0])<<','<<signed32(words[3])<<','<<signed32(words[5])<<']';}
 }
 std::cout<<"],\"enemyDefaults\":[";comma=false;
 // gameplay/enemy_spawn.cpp32-47 table; enemy_defeat.cpp directional threshold.
 for(int file:{1,2})for(int script=0;script<110;script++)for(int id:{0,1}){
  int effect=37;if(file==2)switch(script){case 5:case 25:case 53:case 94:effect=33;break;case 10:case 56:case 99:effect=41;break;case 15:case 109:effect=45;break;case 30:effect=51;break;case 35:effect=50;break;case 40:effect=49;break;}
  if(comma)std::cout<<',';comma=true;std::cout<<'['<<file<<','<<script<<','<<id<<','<<effect<<','<<((id&1)+3)<<']';
 }
 std::cout<<"],\"enemyContact\":[";comma=false;
 // gameplay/enemy_damage.cpp121-141 branch and swapped bounds64 order.
 for(unsigned primary:{0u,1u,2u,16u,32u,0x200u,0x1000u,0x1200u})for(unsigned flags:{0u,0x80u,0x400u,0x480u})for(int timer:{-1,0,1})for(int blocked:{0,1})for(int age:{5,6}){
  const bool calls=!(primary&0x22u)&&timer<=0&&!(flags&0x400u)&&(!blocked||(flags&0x80u));
  const int kind=calls?((primary&0x1000u)?2:1):0,graze=calls&&(primary&0x200u)&&age%6==0?1:0;
  if(comma)std::cout<<',';comma=true;std::cout<<'['<<primary<<','<<flags<<','<<timer<<','<<blocked<<','<<age<<','<<kind<<','<<graze<<']';
 }
 std::cout<<"],\"cancelItems\":[";comma=false;
 // item_system/spawn.cpp27: field1e0 is difficulty, player_state.hpp41.
 for(int difficulty=0;difficulty<5;difficulty++){int counter=0;for(int i=0;i<30;i++){counter+=difficulty+1;const int spawned=counter>=10?1:0;if(spawned)counter=0;if(comma)std::cout<<',';comma=true;std::cout<<'['<<difficulty<<','<<i<<','<<spawned<<','<<counter<<']';}}
 std::cout<<"],\"bossHud\":[";comma=false;
 // hud_system/update.cpp boss_panels/boss_pointer and enemy_frame.cpp timer.
 for(int scenario=0;scenario<10;scenario++){
  float fraction=0,marker_x=0,marker_y=0;bool near=false;int pointer_mode=0;const float x=scenario>=5?193.f:0.f,px=float((scenario%5)*20);
  for(int frame=0;frame<75;frame++){
   const int hp=1000-(frame/15)*225;const float target=d(float(hp),1000);if(fraction<target)fraction=a(fraction,.02500000037252903f);if(target<fraction)fraction=target;
   const float ring_angle=m(-fraction,m(pi,2));const bool visible=.25f<fraction;
   if(visible){const float angle=wrap(a(-d(m(pi,2),2),-m(m(pi,2),.25f)));marker_x=a(-m(112,float(std::sin(double(angle)))),m(x,2));marker_y=a(m(112,float(std::cos(double(angle)))),200);}
   const float py=frame<25?150.f:frame<50?195.f:196.f,dx=s(x,px),dy=s(100,py),distance=a(m(dx,dx),m(dy,dy));
   if(!near&&distance<m(80,80))near=true;else if(near&&m(96,96)<=distance)near=false;
   if(pointer_mode==0&&hp<700)pointer_mode=1;else if(pointer_mode==1&&hp<400)pointer_mode=2;else if(pointer_mode==2&&hp<200)pointer_mode=3;else if(pointer_mode==3&&hp>200)pointer_mode=0;
   const float horizontal=float(std::fabs(double(s(x,px))));int alpha=horizontal<64?cv(d(m(191,horizontal),64))+64:255;if(x< -192||192<x)alpha=0;
   const int remaining=360-frame,seconds=remaining/60,hundredths=(remaining%60)*100/60;
   if(comma)std::cout<<',';comma=true;std::cout<<'['<<scenario<<','<<frame<<','<<bits(fraction)<<','<<bits(target)<<','<<bits(ring_angle)<<','<<bits(marker_x)<<','<<bits(marker_y)<<','<<int(visible)<<','<<int(near)<<','<<pointer_mode<<','<<alpha<<','<<bits(m(a(a(x,32),192),2))<<','<<seconds<<','<<hundredths<<']';
  }
 }
 std::cout<<"],\"enemyFeedback\":[";comma=false;
 // enemy_damage.cpp143-163 hit flash/cooldown/default sound and survival suppression.
 for(unsigned flags:{0u,0x4080u,0x8000u,0xc080u})for(unsigned primary:{0u,0x2000u})for(unsigned spell:{0u,1u,9u})for(int hp:{50,150,600}){
  unsigned flash=0;int cooldown=0;for(int frame=0;frame<12;frame++){
   int sound=-1;const bool hit=frame%3==0,survival=(spell&9)==9;
   if(cooldown){flash=0;--cooldown;}else{
    if(flags&0x8000u)flash=frame%4==0?0xffff00ffu:0;
    if(!hit||(primary&0x2000u)){if(frame%4!=0)flash=0;else if((flags&0x4080u)&&!survival&&hp<((spell&1)?100:500))flash=0xff0000ffu;}
    else{flash=0xff0000ffu;cooldown=4;sound=(flags&0x4080u)&&!survival&&hp<((spell&1)?200:900)?35:34;}
   }
   if(comma)std::cout<<',';comma=true;std::cout<<'['<<flags<<','<<primary<<','<<spell<<','<<hp<<','<<frame<<','<<flash<<','<<cooldown<<','<<sound<<']';
  }
 }
 std::cout<<"],\"enemyDeathAngle\":[";comma=false;
 // enemy_defeat.cpp15: vector6c is the last accepted damage-region position.
 for(float x:{-40.f,0.f,10.f})for(float y:{0.f,80.f})for(float dx:{-.2f,0.f,.1999999f,.2f,4.f})for(float dy:{0.f,9.f}){
  const float before_x=a(x,dx),before_y=a(y,dy),delta_x=s(before_x,x),delta_y=s(before_y,y);
  const float angle=m(.2f,.2f)<=a(m(delta_x,delta_x),m(delta_y,delta_y))?float(std::atan2(double(s(y,before_y)),double(s(x,before_x)))):d(-pi,2);
  if(comma)std::cout<<',';comma=true;std::cout<<'['<<bits(x)<<','<<bits(y)<<','<<bits(before_x)<<','<<bits(before_y)<<','<<bits(angle)<<']';
 }
 std::cout<<"]}";
}
