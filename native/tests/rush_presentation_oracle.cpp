// Independent source-expression oracle using Microsoft's DirectXMath. The
// original game is neither linked nor executed. Source camera/transform paths:
// VirtualLib Extend/LinearMath.h and Internal/Source/AComponents.cpp.
#include <DirectXMath.h>
#include <array>
#include <cmath>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <vector>

using namespace DirectX;
namespace {
void vector(FXMVECTOR value,unsigned count=4){XMFLOAT4 row;XMStoreFloat4(&row,value);const float parts[]{row.x,row.y,row.z,row.w};std::cout<<'[';for(unsigned i=0;i<count;++i){if(i)std::cout<<',';std::cout<<parts[i];}std::cout<<']';}
void matrix(FXMMATRIX value){XMFLOAT4X4 row;XMStoreFloat4x4(&row,value);std::cout<<'[';for(unsigned i=0;i<16;++i){if(i)std::cout<<',';std::cout<<row.m[i/4][i%4];}std::cout<<']';}
XMMATRIX world(FXMVECTOR position,FXMVECTOR scale,FXMVECTOR rotation){
    XMFLOAT3 p,s;XMStoreFloat3(&p,position);XMStoreFloat3(&s,scale);
    auto result=XMMatrixScaling(s.x,s.y,s.z);result*=XMMatrixRotationQuaternion(rotation);result*=XMMatrixTranslation(p.x,p.y,p.z);return result;
}
std::uint32_t randomState=0x72555348;
float random(float minimum,float maximum){randomState^=randomState<<13;randomState^=randomState>>17;randomState^=randomState<<5;return minimum+(maximum-minimum)*static_cast<float>(randomState>>8)*(1.f/16777216.f);}
}
int main(){
    std::cout<<std::setprecision(9);
    const float fov=static_cast<float>(3.14159265358979323846)/4.f;
    const auto projection=XMMatrixPerspectiveFovLH(fov,640.f/480.f,.1f,1000.f);
    const auto view=XMMatrixLookAtLH(XMVectorSet(0,0,0,0),XMVectorSet(0,0,1,0),XMVectorSet(0,1,0,0));
    const auto vp=view*XMMatrixTranspose(XMMatrixRotationQuaternion(XMVectorSet(0,0,0,1)))*projection;
    XMVECTOR determinant=XMMatrixDeterminant(vp);const auto inverse=XMMatrixInverse(&determinant,vp);
    std::cout<<"{\"projection\":";matrix(projection);std::cout<<",\"inverse\":";matrix(inverse);
    std::cout<<",\"screen\":[";
    const float depths[]{.9f,.95f,.99f};const std::array<std::array<float,2>,8> points{{{0,0},{-300,-180},{300,180},{-320,240},{75,-99},{-41.5f,179.25f},{.125f,-.75f},{160,120}}};
    bool first=true;
    for(const auto depth:depths)for(const auto& point:points){if(!first)std::cout<<',';first=false;
        const auto input=XMVectorSet(point[0]*2.f/640.f,point[1]*2.f/480.f,depth,0);
        const auto converted=XMVector3TransformCoord(input,inverse);
        std::cout<<"{\"input\":["<<point[0]<<','<<point[1]<<','<<depth<<"],\"world\":";vector(converted,3);
        auto back=XMVector3TransformCoord(converted,vp);back=XMVectorMultiply(back,XMVectorSet(320,240,1,1));std::cout<<",\"screen\":";vector(back,3);std::cout<<'}';
    }
    std::cout<<"],\"rotations\":[";
    std::vector<XMFLOAT4> rotations;
    for(unsigned i=0;i<24;++i){if(i)std::cout<<',';const float pitch=i==0?0:random(-3,3),yaw=i==0?-.006f:random(-3,3),roll=i==0?.012f:random(-3,3);
        const auto rotation=XMQuaternionRotationRollPitchYaw(pitch,yaw,roll);XMFLOAT4 stored;XMStoreFloat4(&stored,rotation);rotations.push_back(stored);
        std::cout<<"{\"input\":["<<pitch<<','<<yaw<<','<<roll<<"],\"quaternion\":";vector(rotation);std::cout<<'}';
    }
    std::cout<<"],\"products\":[";
    for(unsigned i=0;i<24;++i){if(i)std::cout<<',';const auto a=XMLoadFloat4(&rotations[i]),b=XMLoadFloat4(&rotations[(i+7)%rotations.size()]);std::cout<<"{\"a\":";vector(a);std::cout<<",\"b\":";vector(b);std::cout<<",\"value\":";vector(XMQuaternionMultiply(a,b));std::cout<<'}';}
    std::cout<<"],\"worlds\":[";
    for(unsigned i=0;i<24;++i){if(i)std::cout<<',';const auto p=XMVectorSet(random(-5,5),random(-5,5),random(.8f,10),0),s=XMVectorSet(random(.2f,3),random(.2f,3),1,0),q=XMLoadFloat4(&rotations[i]);
        std::cout<<"{\"position\":";vector(p,3);std::cout<<",\"scale\":";vector(s,3);std::cout<<",\"rotation\":";vector(q);std::cout<<",\"value\":";matrix(world(p,s,q));std::cout<<'}';}
    std::cout<<"],\"magic\":[";auto magic=XMVectorSet(-.002681f,-.446869f,.893746f,-.039161f);const auto delta=XMQuaternionRotationRollPitchYaw(0,-.006f,.012f);first=true;
    for(unsigned tick=1;tick<=30;++tick){const auto turns=tick<13?5:tick<27?4:tick<40?2:1;for(int i=0;i<turns;++i)magic=XMQuaternionMultiply(delta,magic);
        if(tick==1||tick==5||tick==30){if(!first)std::cout<<',';first=false;std::cout<<"{\"tick\":"<<tick<<",\"quaternion\":";vector(magic);std::cout<<",\"world\":";matrix(world(XMVectorSet(.1f,-.4f,10,0),XMVectorSet(2,2,1,0),magic));std::cout<<'}';}}
    std::cout<<"]}"<<'\n';return 0;
}
