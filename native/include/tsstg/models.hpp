#pragma once
#include "backend.hpp"
#include <memory>

namespace tsstg {
// Static, embedded GLB resources. Geometry/materials are uploaded once, not
// serialized from a script on every frame. No game or stage rules live here.
class ModelStore {
public:
    explicit ModelStore(bool headless);
    ~ModelStore();
    ModelInfo load(std::uint32_t id, const std::filesystem::path& path);
    const ModelInfo& info(std::uint32_t id) const;
    void unload(std::uint32_t id);
    void begin(const std::array<float,16>& viewProjection, const std::array<float,18>& lighting);
    void draw(std::uint32_t id, const std::array<float,16>& transform, std::uint32_t tint);
    void end();
private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};
void validateModelMatrix(const std::array<float,16>& matrix, bool affine);
void validateModelLighting(const std::array<float,18>& lighting);
}
