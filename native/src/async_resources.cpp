#include "tsstg/async_resources.hpp"
#include <fstream>
#include <stdexcept>

namespace tsstg {
PreparedResource::~PreparedResource(){if(image.data)UnloadImage(image);if(wave.data)UnloadWave(wave);}
AsyncResources::AsyncResources():worker_([this]{run();}){}
AsyncResources::~AsyncResources(){
    {std::lock_guard<std::mutex> lock(mutex_);stopping_=true;queue_.clear();}
    wake_.notify_one();worker_.join();
}
std::uint32_t AsyncResources::request(std::string kind,std::filesystem::path path,int width,int height){
    if(kind!="texture"&&kind!="model"&&kind!="sound"&&kind!="music")throw std::runtime_error("Unsupported asynchronous resource kind");
    if((width||height)&&(kind!="texture"||width<1||height<1||width>4096||height>4096))throw std::runtime_error("Invalid asynchronous texture canvas");
    std::lock_guard<std::mutex> lock(mutex_);
    if(jobs_.size()>=8)throw std::runtime_error("Asynchronous resource queue is full (8)");
    auto job=std::make_shared<Job>();job->kind=std::move(kind);job->path=std::move(path);job->width=width;job->height=height;
    const auto id=next_++;jobs_.emplace(id,job);queue_.push_back(job);wake_.notify_one();return id;
}
std::unique_ptr<PreparedResource> AsyncResources::take(std::uint32_t ticket){
    std::lock_guard<std::mutex> lock(mutex_);auto found=jobs_.find(ticket);
    if(found==jobs_.end())throw std::runtime_error("Unknown asynchronous resource ticket");
    auto& job=*found->second;if(!job.done)return {};
    auto result=std::move(job.result);auto error=std::move(job.error);jobs_.erase(found);
    if(!error.empty())throw std::runtime_error(error);return result;
}
void AsyncResources::cancel(std::uint32_t ticket){
    std::lock_guard<std::mutex> lock(mutex_);auto found=jobs_.find(ticket);
    if(found==jobs_.end())throw std::runtime_error("Unknown asynchronous resource ticket");
    found->second->cancelled=true;jobs_.erase(found);
}
void AsyncResources::run(){
    for(;;){
        std::shared_ptr<Job> job;
        {std::unique_lock<std::mutex> lock(mutex_);wake_.wait(lock,[this]{return stopping_||!queue_.empty();});
            if(stopping_)return;job=queue_.front();queue_.pop_front();if(job->cancelled)continue;}
        std::unique_ptr<PreparedResource> result;std::string error;
        try{
            result=std::make_unique<PreparedResource>();result->kind=job->kind;result->extension=job->path.extension().string();
            if(job->kind=="model")result->model=ModelStore::prepare(job->path);
            else {
                const auto size=std::filesystem::file_size(job->path);
                if(!size||size>256*1024*1024)throw std::runtime_error("Resource exceeds 256 MiB or is empty");
                std::ifstream file(job->path,std::ios::binary);std::vector<unsigned char> bytes(static_cast<std::size_t>(size));
                if(!file.read(reinterpret_cast<char*>(bytes.data()),bytes.size()))throw std::runtime_error("Cannot read resource");
                if(job->kind=="texture"){
                    result->image=LoadImageFromMemory(result->extension.c_str(),bytes.data(),static_cast<int>(bytes.size()));
                    if(!IsImageValid(result->image)||result->image.width>8192||result->image.height>8192)throw std::runtime_error("Cannot decode texture within 8192x8192");
                    ImageFormat(&result->image,PIXELFORMAT_UNCOMPRESSED_R8G8B8A8);
                    if(job->width)ImageResizeCanvas(&result->image,job->width,job->height,0,0,BLANK);
                }else if(job->kind=="sound"){
                    result->wave=LoadWaveFromMemory(result->extension.c_str(),bytes.data(),static_cast<int>(bytes.size()));
                    if(!IsWaveValid(result->wave))throw std::runtime_error("Cannot decode sound");
                }else result->bytes=std::move(bytes);
            }
        }catch(const std::exception& e){error=job->path.u8string()+": "+e.what();result.reset();}
        {std::lock_guard<std::mutex> lock(mutex_);if(!job->cancelled){job->result=std::move(result);job->error=std::move(error);job->done=true;}}
    }
}
}
