#pragma once
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <iomanip>
#include <numeric>
#include <sstream>
#include <string>
#include <vector>

namespace tsstg {
using ProfileClock=std::chrono::steady_clock;
inline double elapsedMs(ProfileClock::time_point start) { return std::chrono::duration<double,std::milli>(ProfileClock::now()-start).count(); }
struct ProfileFrame { double update=0,render=0,decode=0,submit=0,wait=0,audio=0,profiler=0,total=0; std::size_t commands=0,updates=0; };
inline std::string profileQuote(const std::string& value) {
    std::ostringstream out;out<<'"';for(const auto ch:value){if(ch=='"'||ch=='\\')out<<'\\';if(static_cast<unsigned char>(ch)<32)out<<"\\u"<<std::hex<<std::setw(4)<<std::setfill('0')<<static_cast<unsigned>(static_cast<unsigned char>(ch));else out<<ch;}out<<'"';return out.str();
}
inline std::string profileStats(std::vector<double> values) {
    if(values.empty())return "{\"samples\":0,\"mean\":0,\"p50\":0,\"p95\":0,\"max\":0}";
    const auto mean=std::accumulate(values.begin(),values.end(),0.0)/values.size();std::sort(values.begin(),values.end());
    auto percentile=[&](double p){return values[static_cast<std::size_t>(std::ceil(p*values.size()))-1];};
    std::ostringstream out;out<<std::setprecision(9)<<"{\"samples\":"<<values.size()<<",\"mean\":"<<mean<<",\"p50\":"<<percentile(.5)<<",\"p95\":"<<percentile(.95)<<",\"max\":"<<values.back()<<'}';return out.str();
}
inline std::string profileJSON(const std::vector<ProfileFrame>& frames,const std::vector<double>& gpu,
    std::uint64_t warmup,std::uint64_t updates,bool headless,bool benchmark,double elapsed,const std::string& entry,const std::string& device,const std::string& backend) {
    const std::size_t skip=static_cast<std::size_t>(std::min<std::uint64_t>(warmup,frames.size()));
    std::ostringstream out;out<<std::setprecision(9)<<"{\n\"format\":\"ts-stg-profile-v1\",\"entry\":"<<profileQuote(entry)
        <<",\"backend\":"<<profileQuote(backend)<<",\"headless\":"<<(headless?"true":"false")<<",\"benchmark\":"<<(benchmark?"true":"false")
        <<",\"simulationFrames\":"<<updates<<",\"renderFrames\":"<<frames.size()<<",\"warmupRenderFrames\":"<<skip<<",\"elapsedMs\":"<<elapsed
        <<",\"gpuTimer\":"<<(gpu.empty()?"null":"\"GL_TIME_ELAPSED\"")<<",\"gpuDevice\":"<<profileQuote(device)<<",\n\"metrics\":{\n";
    bool first=true;auto metric=[&](const char* name,auto select){std::vector<double> values;values.reserve(frames.size()-skip);for(std::size_t i=skip;i<frames.size();++i)values.push_back(select(frames[i]));if(!first)out<<",\n";first=false;out<<profileQuote(name)<<':'<<profileStats(std::move(values));};
    metric("updateJsMs",[](const ProfileFrame& f){return f.update;});metric("renderJsMs",[](const ProfileFrame& f){return f.render;});
    metric("decodeMs",[](const ProfileFrame& f){return f.decode;});metric("submitMs",[](const ProfileFrame& f){return f.submit;});
    metric("presentWaitMs",[](const ProfileFrame& f){return f.wait;});metric("audioMs",[](const ProfileFrame& f){return f.audio;});
    metric("profilerMs",[](const ProfileFrame& f){return f.profiler;});
    metric("frameWorkMs",[](const ProfileFrame& f){return f.update+f.render+f.decode+f.submit+f.audio;});
    metric("frameTotalMs",[](const ProfileFrame& f){return f.total;});metric("commandCount",[](const ProfileFrame& f){return static_cast<double>(f.commands);});
    metric("updatesPerRender",[](const ProfileFrame& f){return static_cast<double>(f.updates);});
    std::vector<double> measuredGpu;for(std::size_t i=skip;i<gpu.size();++i)if(gpu[i]>=0)measuredGpu.push_back(gpu[i]);
    out<<",\n\"gpuMs\":"<<profileStats(std::move(measuredGpu))<<"},\n\"notes\":\"CPU submit includes driver work; presentWait includes swap/vsync/frame cap/input polling. GPU time uses asynchronous elapsed queries, independent of CPU timings. Benchmark draws one fixed update per frame with no intentional cap; headless does not measure graphics.\"\n}\n";return out.str();
}
}
