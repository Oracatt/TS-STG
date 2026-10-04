# LuaSTG / THlib 设计参考

2026-10-03 按用户要求拉取、阅读了两个上游仓库，参考副本保存在工作区外侧的 `D:/AIWorkspace/references`，不进入 SDK。

| 上游 | 固定版本 | 本次阅读范围 |
| --- | --- | --- |
| [LuaSTG-Sub](https://github.com/Legacy-LuaSTG-Engine/LuaSTG-Sub) | `8728b3f9e91e6cd577665a7f5777c6c7c23b5f31` | `LuaSTG/LuaSTG/GameObject/GameObjectPool.*`、`engine/collection/core/FixedObjectPool.hpp`、`engine/graphics/common/PrimitiveBatchRenderer.cpp`、`engine/graphics/core/Graphics/Renderer_D3D11.cpp` |
| [Bundle-After-Ex-Plus](https://github.com/Legacy-LuaSTG-Engine/Bundle-After-Ex-Plus) | `082c22727cb9099037fdf6629eeaf84d6a11dc35` | `game/packages/thlib-scripts/THlib`，以及 `thlib-scripts-v2`、`thlib-experiment` 和文档 |

LuaSTG 的固定对象池、按层维护的绘制集合、相邻绘制状态缓存，以及 THlib 普通子弹只在指定颜色/混合覆盖时更改图像状态，提示应减少重复分配、重复状态变更和重复解码。这些设计用于检查 TS-STG 的热点，没有把 LuaSTG 原生对象池或碰撞规则移进本引擎。TS-STG 的游戏对象、弹幕、角色、动画、碰撞和符卡仍在纯 JS thlib / 业务脚本；C++ 仅提供平台服务。

本次具体改动包括：ANM 保持同一内存缓冲区的类型视图、受原始字段变化控制的 UV / 局部几何缓存、等待状态的等价快速路径、默认颜色不做临时覆盖，以及一次提交完整状态四边形的 `statefulQuad` 通用命令。四边形原有浮点运算顺序、三角形顺序、颜色、采样及混合语义保持不变。冻结旧实现的指令流 / 内存对照与原生 PNG 回归负责检查这些优化，而不是用运行速度推断画面一致。

符卡演出的具体依据是本机 `D:/c++/TouhouRushBoss-main` 和实际找到的 `D:/c++/VirtualLib-main`。前者的 `Boss.cpp`、`BossParticle.h`、`Effect.h`、`CardBackground.h`、`GameScene.cpp`、`CardBackgroundDeriver.h` 和 `shader/warp.fx` 决定演出时序和布局；后者提供相机、四元数、圆环和 DirectWrite / Direct2D 的实际渲染行为。通用透视精灵、纹理圆环与通用素材归 thlib，RushBoss 的参数、具体背景、Boss 和标题配置留在业务层。

底层新增可配置 GLSL shader scope 和 Windows 系统字体矢量布局/描边。RushBoss 的扭曲公式保存在 GPL 业务模块 `games/rushboss/src/warp-pass.js`，没有硬编码进 C++。原着色器逐像素计算和 125% 背景合成取代旧网格近似；系统宋体通过系统字库读取，不复制到发布物。

`tools/verify-rushboss-warp.mjs` 将原 `warp.fx` 的 PS 直接交给独立 D3D11 测试程序，再与真正原生宿主中的 GLSL 结果比较。同一输入图、四倍各向异性采样、WRAP、放大矩形和参数下，当前 7 例的最大通道差为 1/255。这个证据只覆盖该着色器，不能扩展成整个原游戏逐像素等价的结论。验证过程没有运行原游戏 EXE。

实际测试、截图和性能结果见 [验证记录](verification.md)、[性能记录](performance.md) 和 [RushBoss Demo 说明](../games/rushboss/README.md)。
