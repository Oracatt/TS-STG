# 原作 ANM 资源与动画

`tools/import-th20-assets.mjs` 只读取本机参考工程的原始 ANM，将纹理原始 PNG/JPEG 字节和解码后的精灵、脚本表保存到忽略目录 `games/demo/assets`。它不会运行原游戏 EXE，也不会把原作资源加入公开代码。默认导入自机、敌机、子弹、公共特效、HUD、标题、aura、text 截图动画、字体与已有 ebg 背景；当前本机得到 21 个归档、4,522 个精灵、1,809 个脚本，缺失纹理文件为 0。动态纹理与渲染目标单列在 manifest.runtimeTextures，须由通用宿主适配器提供。每份归档和纹理均保留 SHA-256；可找到参考工程已导出图片时，还核对两份原始字节。

```powershell
node tools/import-th20-assets.mjs --reference D:/AIWorkspace/Touhou20Reconstruction
node tools/verify-th20-anm.mjs
node tools/verify-th20-background.mjs
node tools/verify-th20-projection.mjs
node --test tests/th20-anm.test.js tests/th20-pause-menu.test.js tests/th20-background.test.js tests/th20-projection.test.js
```

解码依据为 `sprite_renderer/animation_file.hpp`、`postload_entry.cpp`；取顺序拼接的脚本/精灵索引，另行保留文件中的 storedId。ANM 命令保持原始操作码、时间、掩码、参数整数位；不能识别的操作码或绘制类型会报错，包含归档、脚本、指令位置与动画时间。

`AnmBank` 是纯 JS，宿主只传入纹理适配器与可选 RNG。文件载入时依次执行每个模板的 -1 帧，创建实例时复制原作 0x4c0 字节基础状态及插值器，再执行第 0 帧；精灵映射回调在模板初始化之后安装。`interrupt` 排队，`interruptNow` 立即执行，`draw` 输出通用 mesh、lineStrip、point、sampler、blendFactors 命令。常见调用：

```js
const bank = new AnmBank(decoded, {
  loadTexture: (path, width, height) => host.loadTexture(path, width, height),
});
const vm = bank.create(7, { x: 0, y: 300 });
vm.update();
vm.draw(draw, { x: 336, y: 24, scale: 1.5, screenScale: 1 });
```

传入纹理画布尺寸很重要：原作有 256×144 的 PNG 放在 256×256 的透明纹理画布内。丢掉尺寸会使原始 UV 错位。`spriteRemap` 在指令指定精灵之前调用，用于子弹原作颜色表；直接 `setSprite` 默认不重映射。

HUD 混用两套坐标。front 的图片多数为 1280×960 坐标且使用 313 模式 2，渐变下划线则用 640×480 和模式 1。整个 HUD 使用 `{scale:1,screenScale:1.5}`，不能统一乘 0.75。这个错误曾使 HUD 下划线落入自机区域，已有回归测试和原生截图验证。

动画所有权有两种有效方式：完整场景可调用 `bank.update/draw`；独立自机/敌机更新其根 VM 时，场景每帧另外调用 `bank.updateDetached()`，绘制时调用 `bank.drawDetached(draw,view)`，再 `bank.collect()` 清理失效对象。不要同时对相同根调用两种更新方式。附着子节点随父节点删除；504/506 产生的独立动画保持自己的生命期。

`bank.dispose()` 终止所有实例，调用 environment.unloadTexture 释放由 loadTexture 创建的文件纹理。resolveTexture 返回的动态/共享纹理由适配器所有，不会隐式释放；共享缓存适配器应维护引用计数。

跨归档绘制使用 `Th20RenderQueue`。原作先按主/次注册链映射 effective layer，再按 scheduler priority 绘制，不能简单按脚本的 layer 数值排序：例如 effective45 的 priority63 早于 effective26 的 priority72。`create(script,{secondary:true,front:true})` 对应注册 flags4/2；501/503 自己选择次链，500/502 自己选择主链，子节点不盲目继承父节点链。HUD root0、残机/Bomb 图标为次链，100/难度/头像为主链。`enqueuePriority` 接入原作手绘回调：自机本体30、道具35、激光39、graze特效42；TextRenderer 的层0..4分别为102/61/84/75/85。常规游戏视区的调度区间为10..62，特殊相机层应另配 viewport。

`tools/verify-th20-anm.mjs` 编译本地重建工程的 `anm_vm.cpp`、`animation.cpp`、`ecl_vm/math.cpp`，不链接或加载原游戏机器码。当前 70 个原作脚本、6,300 个帧状态，每帧 44 个可观察字段与 C++ 逐位相同，涵盖自机/射击、敌机、子弹、focus 特效及 HUD 残机/Bomb 中断。固定结果位于 `tests/fixtures/th20/anm.json`，证据摘要位于 `reports/th20/anm.json`。这些是选定状态字段的证据，不等于全游戏或逐像素一致。

另有资源哈希、混合坐标、针弹旋转、颜色重映射、独立子节点生存期、原作根祖先位置继承的测试；pl00/pl01/enemy/bullet/front/aura 的每个脚本都执行并绘制 24 帧，验证当前常规入口。此覆盖不代表所有中断分支均已验证。

真实敌机死亡动画使用 type8 的 XYZ 矩阵绘制。JS 按 `projected_draw.cpp:p441f00`、`binding.cpp`、`vertex_buffer.cpp` 生成世界矩阵与原锚点/UV，再提供通用 mesh3d 命令；硬件保留透视校正的纹理插值。`verify-th20-projection.mjs` 编译原函数体片段并调用 OS D3DX9_43，900 组真实动画状态、14,400 个世界矩阵字逐位一致，包含父子、六种旋转次序、三种比例；7 组标准相机矩阵也逐位相同。标准相机归一化保留 D3DX 的一 ULP 残差数值，覆盖原640/960/1280窗口模式；非标准镜头可显式传 `AnmView.projection`，未知默认配置不会伪装成已验证结果。原生透视 UV 像素夹具和实际 effect37/45/51 截图分别验证通用渲染与资源入口。

尚未声称一致的部分：ANM 目前只验证时钟倍率 1；type8 以外的部分投影/雾化绘制、相机动画变量、外部缓存矩阵、脚本 effect-spawn 508 和若干特殊几何操作明确报错。模板遇到尚未实现的外部依赖时保留错误，使用该模板就会报错；这不等于对整个文件所有脚本均已支持。OpenGL 与 D3D 的线/点覆盖、深度测试、纹理滤波边缘、像素中心差异也未做原游戏逐像素比对。背景资源的导入不等于 STG 原作完整 3D 场景解析。

普通暂停使用 front 脚本 0x90、原六项选项及 10/20/30/12 帧转换延时。退出/重试有默认选“否”的原作确认框；Replay、Manual、Options 由使用方注入页面，未注入时使用原作中断5禁用。游戏结束/成绩/Replay 文件保存页不属于这个普通暂停模块。

`Th20PauseCapture({bank:textBank,pixels:host,rng:visualRng})` 传给 `Th20Pause({capture})` 后，创建原 text87 及88..92子动画，捕获上个已完成画面的游戏视区，按原255×255目的区域缩放并加噪声。底层仅负责 readTexturePixels/updateTexture；颜色与 RNG 全在 JS。原代码宽/高颠倒的遍历、G/B/R 三次 raw RNG 顺序和整数除法均保留。6组缩放逐像素对照实际 OS D3DX9_43，包含能区分16.16步进与浮点采样的比例；3组噪声对照原C++循环，均无差异。目的区域外像素保留原纹理内容；初次动态纹理的未定义边缘并不声称与原D3D分配结果一致。没有像素适配器时仍可注入明确的 drawBackground 展示策略。

`Th20TitleBackground({textureId,rng})` 传入标题菜单，菜单把 priority67 以前的画面绘入应用提供的渲染目标，再在原layer27处提交64×48变形网格。wave、三角函数、顶点颜色和RNG复位均按原 `background_math.cpp` 运算；21组尺寸/位置/波形/颜色产生的451,647个32位字与编译源码完全一致。标题共享3072个顶点，逐三角验证与原63条strip循环顺序等价；此优化没有改动保留旧strip语义的关卡背景。矩阵与像素算法证据存于 `reports/th20/background.json`、`reports/th20/projection.json`，不能替代完整原作画面的像素比较。
