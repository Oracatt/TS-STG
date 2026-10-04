#include "tsstg/geometry.hpp"
#include <cmath>

namespace tsstg {
namespace {
float transform(float local, float position, float scale, float offset) {
    const float translated=position+local;
    const float scaled=translated*scale;
    return offset+scaled;
}

float snap(float value) {
    // Round ties away from zero, retain the integer's binary32 boundary,
    // then subtract half a pixel. Unlike nearbyint, this is independent of
    // the current rounding mode's tie rule. Use double for abs(value)+0.5,
    // exactly as JavaScript does before the explicit Math.fround calls.
    const double rounded=std::copysign(std::floor(std::abs(static_cast<double>(value))+0.5),static_cast<double>(value));
    const float integer=static_cast<float>(rounded);
    return integer-0.5f;
}
}

std::array<MeshVertex, 4> expandQuad(const QuadGeometry& quad) {
    std::array<MeshVertex, 4> vertices{};
    for (unsigned i=0;i<4;++i) {
        float x=transform(quad.local[i*2],quad.x,quad.scale,quad.offsetX);
        float y=transform(quad.local[i*2+1],quad.y,quad.scale,quad.offsetY);
        if(quad.pixelSnap){x=snap(x);y=snap(y);}
        vertices[i]={x,y,quad.uv[(i&1)?2:0],quad.uv[(i>>1)?3:1],quad.colors[i]};
    }
    return vertices;
}
}
