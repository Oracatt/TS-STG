#include "tsstg/geometry.hpp"
#include <cstring>
#include <iostream>
#include <limits>

namespace {
std::uint32_t bits(float value){std::uint32_t word;std::memcpy(&word,&value,sizeof(word));return word;}
float fromBits(std::uint32_t word){float value;std::memcpy(&value,&word,sizeof(value));return value;}
std::uint32_t state=0x4a22beefu;
std::uint32_t randomWord(){state^=state<<13;state^=state>>17;state^=state<<5;return state;}
float coordinate(){return static_cast<float>(static_cast<std::int32_t>(randomWord()%20000001u)-10000000)/1024.0f;}
void print(const tsstg::QuadGeometry& q,bool comma){
    if(comma)std::cout<<',';
    std::cout<<"{\"input\":[";bool first=true;
    auto word=[&](std::uint32_t n){if(!first)std::cout<<',';first=false;std::cout<<n;};
    for(float value:q.local)word(bits(value));
    for(float value:{q.x,q.y,q.scale,q.offsetX,q.offsetY})word(bits(value));
    for(float value:q.uv)word(bits(value));
    std::cout<<"],\"colors\":[";first=true;for(auto color:q.colors)word(color);
    std::cout<<"],\"snap\":"<<(q.pixelSnap?"true":"false")<<",\"vertices\":[";first=true;
    for(const auto& v:tsstg::expandQuad(q)){word(bits(v.x));word(bits(v.y));word(bits(v.u));word(bits(v.v));word(v.color);word(bits(v.z));}
    std::cout<<"]}";
}
}

int main(){
    // Inputs are emitted as words, so the comparison also preserves signed
    // zero and subnormals rather than losing them through JSON numbers.
    std::cout<<"[";bool comma=false;
    const float edge[]={0.0f,-0.0f,0.5f,-0.5f,1.5f,-1.5f,2.5f,-2.5f,
        fromBits(0x3effffff),fromBits(0x3f000001),fromBits(0xbeffffff),fromBits(0xbf000001),
        fromBits(1),fromBits(0x80000001),std::numeric_limits<float>::min(),-std::numeric_limits<float>::min(),
        8388607.0f,-8388607.0f,8388608.0f,-8388608.0f,9999999.0f,-9999999.0f};
    for(float value:edge)for(float scale:{-1.0f,-0.0f,0.0f,0.5f,1.0f,1.5f})for(bool snap:{false,true}){
        tsstg::QuadGeometry q;q.local={value,-value,-0.0f,0.0f,0.5f,-0.5f,-value,value};
        q.x=-0.0f;q.y=0.0f;q.scale=scale;q.offsetX=-0.0f;q.offsetY=0.0f;
        q.uv={-0.0f,0.0f,0.1f,0.9f};q.colors={0,0xffffffff,0x01020304,0xabcdef01};q.pixelSnap=snap;
        print(q,comma);comma=true;
    }
    for(unsigned i=0;i<4096;++i){
        tsstg::QuadGeometry q;for(float& value:q.local)value=coordinate();
        q.x=coordinate();q.y=coordinate();q.scale=coordinate()/4096.0f;q.offsetX=coordinate();q.offsetY=coordinate();
        for(float& value:q.uv)value=coordinate()/512.0f;
        for(auto& color:q.colors)color=randomWord();q.pixelSnap=(i&1)!=0;
        print(q,comma);comma=true;
    }
    std::cout<<"]\n";
}
