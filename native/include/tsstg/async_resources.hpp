#pragma once
#include "models.hpp"
#include "raylib.h"
#include <condition_variable>
#include <deque>
#include <mutex>
#include <thread>
#include <map>

namespace tsstg {
struct PreparedResource {
    std::string kind, extension;
    Image image{};
    Wave wave{};
    std::vector<unsigned char> bytes;
    std::shared_ptr<PreparedModel> model;
    RasterizedText text;
    std::uint32_t handle=0;
    ~PreparedResource();
};
// A single CPU worker and a bounded queue. Never calls graphics/audio APIs.
// Ownership is handed to the main thread before any GPU upload begins.
class AsyncResources {
public:
    AsyncResources();
    ~AsyncResources();
    std::uint32_t request(std::string kind,std::filesystem::path path,int width,int height);
    std::uint32_t requestText(std::string text,const TextLayoutOptions& layout,const TextRasterOptions& raster);
    std::unique_ptr<PreparedResource> take(std::uint32_t ticket); // null = pending
    void cancel(std::uint32_t ticket);
private:
    struct Job {
        std::string kind,error;std::filesystem::path path;int width=0,height=0;
        std::string text;TextLayoutOptions layout;TextRasterOptions raster;
        bool done=false,cancelled=false;std::unique_ptr<PreparedResource> result;
    };
    void run();
    std::mutex mutex_;
    std::condition_variable wake_;
    std::map<std::uint32_t,std::shared_ptr<Job>> jobs_;
    std::deque<std::shared_ptr<Job>> queue_;
    std::uint32_t next_=1;
    bool stopping_=false;
    std::thread worker_;
};
}
