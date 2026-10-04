#pragma once
#include "tsstg/backend.hpp"

namespace tsstg {
// Generic quad assembly. Callers supply already-resolved local geometry,
// transform, UVs and colors; no animation or gameplay state crosses this API.
struct QuadGeometry {
    std::array<float, 8> local{}; // TL, TR, BL, BR (x,y pairs)
    float x=0, y=0, scale=1, offsetX=0, offsetY=0;
    std::array<float, 4> uv{}; // u0,v0,u1,v1
    std::array<std::uint32_t, 4> colors{};
    bool pixelSnap=false;
};

// Each arithmetic operation rounds to binary32. Compile the implementation
// with strict floating-point semantics; merging multiply/add changes pixels.
std::array<MeshVertex, 4> expandQuad(const QuadGeometry& quad);
}
