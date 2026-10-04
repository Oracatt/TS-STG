// Independent C++ oracle for the RushBoss JS port.
// RNG code is transcribed from TouhouRushBoss-main/src/Rand.cpp (GPL-3.0).
// Motion equations are transcribed from src/UserComponent.h MoveBody and
// src/BaseObject.h MovingObject::PrivateMoveBody. The original VirtualLib vector
// implementation and Lerp helper are absent from the reference repository; the
// tiny V2 adapter below uses float fields/operators and the conventional
// start+(end-start)*value Lerp equation, matching the source's visible usage.
// This verifies the equations and float rounding, not original executable output.
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <random>
#include <vector>

uint32_t bits(float value) { uint32_t out; std::memcpy(&out, &value, 4); return out; }
struct V2 {
  float x=0, y=0;
  V2 operator+(V2 v) const { return {x+v.x,y+v.y}; }
  V2 operator-(V2 v) const { return {x-v.x,y-v.y}; }
  V2 operator*(float s) const { return {x*s,y*s}; }
  V2 operator/(float s) const { return {x/s,y/s}; }
  V2& operator+=(V2 v) { x+=v.x;y+=v.y;return *this; }
  float GetLength() const { return std::sqrt(x*x+y*y); }
  V2 GetNormalized() const { return *this/GetLength(); }
};
uint32_t randomIndex(std::mt19937& rng, uint32_t range) {
  if(range==0)return rng();
  constexpr uint32_t mask=UINT32_MAX;
  for(;;){const uint32_t value=rng();if(value/range<mask/range||mask%range==range-1)return value%range;}
}
float randomFloat(std::mt19937& rng,float min,float max) {
  const float unit=static_cast<float>(rng())/4294967296.0f;
  return unit*(max-min)+min;
}
int32_t randomInt(std::mt19937& rng,int32_t min,int32_t max) {
  auto adjust=[](uint32_t value){return value<0x80000000U?value+0x80000000U:value-0x80000000U;};
  const uint32_t amin=adjust(static_cast<uint32_t>(min)),amax=adjust(static_cast<uint32_t>(max));
  const uint32_t range=amax-amin+1;
  return static_cast<int32_t>(adjust(randomIndex(rng,range)+amin));
}
struct Body { V2 position,velocity,force,drag; };
void stepBody(Body& b) {
  const double deltaTime=1.0/60.0;
  const float sqv2=std::sqrt(b.velocity.x*b.velocity.x+b.velocity.y*b.velocity.y);
  const V2 d=V2{b.drag.x*sqv2*b.velocity.x,b.drag.y*sqv2*b.velocity.y}/100;
  b.velocity+=(b.force-d)*deltaTime;
  b.position+=b.velocity*deltaTime;
}
struct Move { V2 position,target;float speed,maxSpeed,minSpeed,maxDistance;bool moving=true; };
Move moving(V2 pos,V2 target,float max,float min) {
  return {pos,target,max,max,min,(target-pos).GetLength(),true};
}
void stepMove(Move& m) {
  const float deltaTime=1/60.0f;
  if(!m.moving)return;
  const float distance=(m.target-m.position).GetLength();
  if(distance<m.speed*deltaTime){m.position=m.target;m.moving=false;}
  else {
    m.position+=(m.target-m.position).GetNormalized()*m.speed*deltaTime;
    const float value=1-distance/m.maxDistance;
    m.speed=m.maxSpeed+(m.minSpeed-m.maxSpeed)*value;
  }
}
void uintArray(const std::vector<uint32_t>& values) {
  std::cout << '[';for(size_t i=0;i<values.size();i++){if(i)std::cout<<',';std::cout<<values[i];}std::cout<<']';
}
void bodyRecord(const Body& b) {
  std::cout << '[' << bits(b.position.x)<<','<<bits(b.position.y)<<','<<bits(b.velocity.x)<<','<<bits(b.velocity.y)<<']';
}
int main() {
  std::cout << "{\"oracle\":\"RushBoss C++ source equations, float V2 adapter\",\"streams\":[";
  const uint32_t seeds[]={0,5489,123456789};
  for(size_t s=0;s<3;s++) {
    if(s)std::cout<<',';
    std::mt19937 rng(seeds[s]);std::vector<uint32_t> values;
    for(int i=0;i<1000;i++)values.push_back(rng());
    std::cout << "{\"seed\":"<<seeds[s]<<",\"uints\":";uintArray(values);
    std::cout << ",\"floats\":[";
    rng.seed(seeds[s]);
    const float bounds[][2]={{0,1},{-0.3f,0.3f},{-310,310},{30,50},{-1000.123f,900.731f},{0,6.283185307179586f}};
    for(size_t i=0;i<36;i++) {if(i)std::cout<<',';auto& p=bounds[i%6];std::cout<<'['<<bits(p[0])<<','<<bits(p[1])<<','<<bits(randomFloat(rng,p[0],p[1]))<<']';}
    std::cout<<"],\"ints\":[";rng.seed(seeds[s]);
    const int32_t ibounds[][2]={{0,15},{0,1},{-50,50},{-2147483647-1,2147483647},{-2147483647-1,0},{-2147483647-1,-2147483640},{-1073741824,1073741824},{3,3}};
    for(size_t i=0;i<64;i++){if(i)std::cout<<',';auto&p=ibounds[i%8];std::cout<<'['<<p[0]<<','<<p[1]<<','<<randomInt(rng,p[0],p[1])<<']';}
    std::cout<<"]}";
  }
  std::cout<<"],\"bodies\":[";
  const Body bodies[]={
    {{0,100},{300,0},{0,0},{0,0}},
    {{-120,150},{250,-160},{80,-40},{0.2f,0.2f}},
    {{0,0},{0,0},{75,-135},{1,1}},
    {{140,80},{-300,120},{0,-150},{2,0.05f}},
    {{2.31f,-190.789f},{0.0001f,-0.0001f},{50,-50},{0.2f,0.3f}},
    {{-10,20},{-500,-50},{220,130},{0.01f,0.9f}},
  };
  for(size_t j=0;j<6;j++){
    if(j)std::cout<<',';Body b=bodies[j];
    std::cout<<"{\"initial\":";bodyRecord(b);
    std::cout<<",\"force\":["<<bits(b.force.x)<<','<<bits(b.force.y)<<"],\"drag\":["<<bits(b.drag.x)<<','<<bits(b.drag.y)<<"],\"frames\":[";
    for(int tick=0;tick<180;tick++){if(tick)std::cout<<',';stepBody(b);bodyRecord(b);}
    std::cout<<"]}";
  }
  std::cout<<"],\"moves\":[";
  const Move moves[]={
    moving({0,250},{0,100},150,50),moving({-135,79},{22,88},157.25775f,50),
    moving({12.35f,200.71f},{-173.9f,81.3f},440,75),moving({180,110},{-50,80},90,90),
    moving({0,0},{0.1f,0.1f},300,50),
  };
  for(size_t j=0;j<5;j++){
    if(j)std::cout<<',';Move m=moves[j];
    std::cout<<"{\"initial\":["<<bits(m.position.x)<<','<<bits(m.position.y)<<','<<bits(m.target.x)<<','<<bits(m.target.y)<<','<<bits(m.maxSpeed)<<','<<bits(m.minSpeed)<<"],\"frames\":[";
    for(int tick=0;tick<300;tick++){if(tick)std::cout<<',';stepMove(m);std::cout<<'['<<bits(m.position.x)<<','<<bits(m.position.y)<<','<<bits(m.speed)<<','<<(m.moving?1:0)<<']';}
    std::cout<<"]}";
  }
  std::cout<<"]}\n";
}
