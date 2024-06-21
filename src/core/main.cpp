#include <bgfx/bgfx.h>
#include <bgfx/platform.h>
#include <bx/math.h>
#include <emscripten/emscripten.h>
#include <emscripten/html5.h>
#include <iostream>
#include "shader/vs.h"
#include "shader/ps.h"

static bgfx::VertexLayout ms_layout;
static bgfx::ProgramHandle m_program;
static bgfx::VertexBufferHandle m_vbh;
static bgfx::IndexBufferHandle m_ibh;

struct PosColorVertex
{
    float x;
    float y;
    float z;
    uint32_t abgr;
};

static PosColorVertex s_cubeVertices[] =
{
    { 0.0f,  0.5f, 0.0f, 0xff0000ff },
    { 0.5f, -0.5f, 0.0f, 0xff00ff00 },
    {-0.5f, -0.5f, 0.0f, 0xffff0000 },
};

static const uint16_t s_cubeIndices[] =
{
    0, 1, 2,
};

void initBgfx()
{
    bgfx::Init init;
    init.type = bgfx::RendererType::Count;
    init.resolution.width = 800;
    init.resolution.height = 600;
    init.resolution.reset = BGFX_RESET_VSYNC;

    // 设置平台数据
    bgfx::PlatformData pd;
    pd.nwh = (void *)"#canvas";
    init.platformData = pd;

    if (!bgfx::init(init)) {
        std::cerr << "Failed to initialize bgfx!" << std::endl;
        return;
    }

    // 创建顶点布局
    ms_layout.begin()
        .add(bgfx::Attrib::Position, 3, bgfx::AttribType::Float)
        .add(bgfx::Attrib::Color0, 4, bgfx::AttribType::Uint8, true, true)
        .end();

    // 创建顶点缓冲
    m_vbh = bgfx::createVertexBuffer(
        bgfx::makeRef(s_cubeVertices, sizeof(s_cubeVertices)),
        ms_layout
    );

    // 创建索引缓冲
    m_ibh = bgfx::createIndexBuffer(
        bgfx::makeRef(s_cubeIndices, sizeof(s_cubeIndices))
    );

    // 加载着色器
    bgfx::ShaderHandle vsh = bgfx::createShader(bgfx::makeRef(vs_data, sizeof(vs_data)));
    bgfx::ShaderHandle fsh = bgfx::createShader(bgfx::makeRef(ps_data, sizeof(ps_data)));
    m_program = bgfx::createProgram(vsh, fsh, true);
}

void renderFrame()
{
    bgfx::touch(0);

    // 设置视图矩阵
    float view[16];
    bx::mtxIdentity(view);
    float proj[16];
    bx::mtxOrtho(proj, -1.0f, 1.0f, -1.0f, 1.0f, 0.0f, 100.0f, 0.0f, false);
    bgfx::setViewTransform(0, view, proj);

    // 设置模型矩阵
    float mtx[16];
    bx::mtxRotateXY(mtx, 0.0f, 0.0f);
    bgfx::setTransform(mtx);

    // 设置顶点和索引缓冲
    bgfx::setVertexBuffer(0, m_vbh);
    bgfx::setIndexBuffer(m_ibh);

    // 提交绘制命令
    bgfx::submit(0, m_program);

    // 交换帧缓冲
    bgfx::frame();
}

void mainLoop()
{
    renderFrame();
}

int main(int argc, char** argv)
{
    initBgfx();

    // 设置主循环
    emscripten_set_main_loop(mainLoop, 0, 1);

    return 0;
}