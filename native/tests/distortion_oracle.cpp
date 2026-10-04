// Isolated numerical reference harness, transcribed from read-only reconstruction:
// render_mesh.cpp initialize_render_mesh / render_mesh_uv,
// mesh_distortion.cpp update_mesh_distortion, enemy_mesh.cpp update_enemy_mesh.
// No original binary or machine code is loaded. This verifies the JS port against
// the reconstructed C++ formulas; it does not establish original-game pixel parity.
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <vector>
#include <xmmintrin.h>
namespace {
float a(float x,float y){return _mm_cvtss_f32(_mm_add_ss(_mm_set_ss(x),_mm_set_ss(y)));}
float s(float x,float y){return _mm_cvtss_f32(_mm_sub_ss(_mm_set_ss(x),_mm_set_ss(y)));}
float m(float x,float y){return _mm_cvtss_f32(_mm_mul_ss(_mm_set_ss(x),_mm_set_ss(y)));}
float d(float x,float y){return _mm_cvtss_f32(_mm_div_ss(_mm_set_ss(x),_mm_set_ss(y)));}
constexpr float pi=3.1415927410125732421875f;
float sine(float x){return static_cast<float>(std::sin(static_cast<double>(x)));}
float root(float x){return static_cast<float>(std::sqrt(static_cast<double>(x)));}
float wrap(float value){
    if(value>pi){unsigned count=0;do{value=s(value,m(pi,2));if(count>32)break;++count;}while(value>pi);}
    else if(value < -pi){unsigned count=0;do{value=a(m(pi,2),value);if(count>32)break;++count;}while(value < -pi);}
    return value;
}
std::uint32_t bits(float value){std::uint32_t b;std::memcpy(&b,&value,4);return b;}
struct V {float x=0,y=0,z=0,rhw=1;std::uint32_t color=0xffffffff;float u=0,v=0;};
struct P {float x=0,y=0,z=0;};
struct Grid {
    int cols,rows,ox,oy,width,height;
    std::vector<V> vertices,strips;
    std::vector<P> positions;
    Grid(int c,int r,int x,int y,int w,int h):cols(c),rows(r),ox(x),oy(y),width(w),height(h),vertices(c*r),positions(c*r){}
    void uv(P p,V& v){v.u=d(p.x,float(width));v.v=d(p.y,float(height));if(v.u<0)v.u=0;if(v.v<0)v.v=0;}
    void update(){strips.clear();for(int col=0;col<cols-1;++col)for(int row=0;row<rows;++row){strips.push_back(vertices[col*rows+row]);strips.push_back(vertices[(col+1)*rows+row]);}}
    void initialize(float x,float y,float w,float h){
        float px=a(float(ox),x),py=a(float(oy),y);int index=0;
        const float cx=s(float(cols),1),cy=s(float(rows),1);
        for(int col=0;col<cols;++col){for(int row=0;row<rows;++row,++index){
            auto& p=positions[index];auto& v=vertices[index];p={px,py,0};v.x=px;v.y=py;v.z=0;v.rhw=1;v.color=0xffffffff;uv(p,v);py=a(py,d(h,cy));
        }py=a(float(oy),y);px=a(px,d(w,cx));}update();
    }
};
void stage(Grid& g,int mode,float& phaseX,float& phaseY){
    float px=phaseX,py=phaseY;g.initialize(-192,0,384,mode==1?128.f:448.f);int index=0;
    for(int col=0;col<g.cols;++col){for(int row=0;row<g.rows;++row,++index){
        auto& v=g.vertices[index];auto& p=g.positions[index];v.color=(v.color&0xffffff)|0xc0000000;
        const float amplitude=s(24,d(m(float(row),24),float(g.rows-1)));
        const float x=m(sine(px),amplitude),y=m(sine(py),amplitude);
        if(col&&row&&col!=g.cols-1&&row!=g.rows-1){v.x=a(v.x,x);v.y=a(v.y,y);v.z=p.z=0;}
        px=wrap(a(px,d(pi,4.7f)));
    }py=wrap(s(py,d(pi,2.1f)));}
    phaseX=wrap(a(phaseX,d(pi,64)));phaseY=wrap(a(phaseY,d(pi,80)));
}
void enemy(Grid& g,float target,float& current,std::uint32_t color,float& phaseX,float& phaseY,P center,float clock){
    const float radius=current;float px=phaseX,py=phaseY;
    if(current<target)current=a(current,m(clock,2));
    g.initialize(s(s(center.x,radius),20),s(s(center.y,radius),20),a(m(radius,2),40),a(m(radius,2),40));
    center.x=a(float(g.ox),center.x);center.y=a(float(g.oy),center.y);
    for(std::size_t i=0;i<g.vertices.size();++i){auto& v=g.vertices[i];auto& p=g.positions[i];
        P delta{s(p.x,center.x),s(p.y,center.y),s(p.z,center.z)};
        float weight=s(m(radius,radius),a(m(delta.x,delta.x),m(delta.y,delta.y)));
        if(weight<0)v.color&=0x00ffffff;
        else{
            weight=d(weight,m(radius,radius));v.color=color;
            for(unsigned shift:{16u,8u,0u}){const auto old=(v.color>>shift)&255;const auto value=unsigned(int(s(255,m(float(255-old),weight))))&255u;v.color=(v.color&~(255u<<shift))|(value<<shift);}
            v.color|=0xff000000;
            const float len=root(a(a(m(delta.x,delta.x),m(delta.y,delta.y)),m(delta.z,delta.z))),mag=m(weight,32);
            if(std::fabs(len)>=.01f){delta.x=m(d(delta.x,len),mag);delta.y=m(d(delta.y,len),mag);delta.z=m(d(delta.z,len),mag);}
            else{delta.x=m(delta.x,mag);delta.y=m(delta.y,mag);delta.z=m(delta.z,mag);}
            delta.x=a(m(m(sine(px),weight),8),delta.x);delta.y=a(m(m(sine(py),weight),8),delta.y);
            v.x=a(v.x,delta.x);v.y=a(v.y,delta.y);v.z=p.z=0;
        }
        px=wrap(a(px,d(pi,32)));py=wrap(s(py,d(pi,64)));
        if(p.x>0){if(float(g.width)<=p.x)v.x=p.x=s(float(g.width),1);}else v.x=p.x=1;
        if(p.y>0){if(float(g.height)<=p.y)v.y=p.y=s(float(g.height),1);}else v.y=p.y=1;
        g.uv(p,v);
    }
    phaseX=wrap(a(phaseX,m(d(pi,16),clock)));phaseY=wrap(a(phaseY,m(d(pi,32),clock)));g.update();
}
void dump(const std::vector<V>& list){std::cout<<'[';bool first=true;for(const auto& v:list){if(!first)std::cout<<',';first=false;std::cout<<'['<<bits(v.x)<<','<<bits(v.y)<<','<<bits(v.z)<<','<<bits(v.rhw)<<','<<v.color<<','<<bits(v.u)<<','<<bits(v.v)<<']';}std::cout<<']';}
}
int main(){
    std::cout<<"[";
    for(int test=0;test<96;++test){
        const int cols=2+test%16,rows=2+(test*7)%16,ox=test%4?224:-40,oy=test%3?16:-30,w=test%2?640:960,h=test%2?480:720;
        const int type=test%3,frames=1+test%7;float px=d(float(test-48),7),py=d(float(48-test),9),current=float(16+test%120);
        const float desired=112,clock=float(test%5)*.5f;const std::uint32_t color=0xff000000u|(std::uint32_t(test*193173)&0xffffff);
        const P center{float((test*37)%520-260),float((test*19)%530-30),float(test%5-2)};
        Grid g(cols,rows,ox,oy,w,h);
        if(test)std::cout<<',';
        std::cout<<"{\"type\":"<<type<<",\"columns\":"<<cols<<",\"rows\":"<<rows<<",\"viewOffsetX\":"<<ox<<",\"viewOffsetY\":"<<oy<<",\"screenWidth\":"<<w<<",\"screenHeight\":"<<h<<",\"frames\":"<<frames
            <<",\"phaseX\":"<<bits(px)<<",\"phaseY\":"<<bits(py)<<",\"currentRadius\":"<<bits(current)<<",\"radius\":"<<bits(desired)<<",\"clock\":"<<bits(clock)<<",\"color\":"<<color<<",\"center\":["<<bits(center.x)<<','<<bits(center.y)<<','<<bits(center.z)<<"]";
        for(int i=0;i<frames;++i){if(type==0)enemy(g,desired,current,color,px,py,center,clock);else stage(g,type,px,py);}
        std::cout<<",\"finalPhaseX\":"<<bits(px)<<",\"finalPhaseY\":"<<bits(py)<<",\"finalRadius\":"<<bits(current)<<",\"vertices\":";dump(g.vertices);std::cout<<",\"strips\":";dump(g.strips);
        std::cout<<",\"positions\":[";for(std::size_t i=0;i<g.positions.size();++i){if(i)std::cout<<',';const auto& p=g.positions[i];std::cout<<'['<<bits(p.x)<<','<<bits(p.y)<<','<<bits(p.z)<<']';}std::cout<<"]}";
    }
    std::cout<<"]\n";
}
