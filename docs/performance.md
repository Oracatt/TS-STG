# 性能测量

## 2026-10-03：图层修复后的 V8 实测

原作图层重排、双离屏合成和可见敌弹恢复之后，结束其他 Demo、测试、打包及图形验证进程，再串行运行两个实际 GPU 场景。使用同一 Release 宿主、V8 12.3.219.9、RTX 3060 Laptop GPU、Lunatic 与零音量；每帧固定一次更新和绘制，前 60 帧预热。

| 场景 | 总帧数 / 样本 | 工作均值 | P95 | 最大工作耗时 | GPU 均值 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Artia SC13 最初密集激光窗口，魔理沙 | 300 / 240 | 6.56 ms | 8.52 ms | 13.08 ms | 0.64 ms |
| Sunny SC2，灵梦 | 600 / 540 | 5.37 ms | 6.74 ms | 13.13 ms | 0.74 ms |

此处是修复后单次测量，没有把中间图形验收期间的并行负载数据用于比较，也没有省略子弹或效果。工作耗时不包含显示等待或分析器成本，GPU 查询单独记录。只验证这两个实际时间窗口，不能作为所有符卡全程帧率的保证。当前原始分项、代码哈希及截图在 `reports/rushboss/layers/performance/`；复跑 `node tools/verify-rushboss-portrait-graphics.mjs --backend v8 --scene artia-sc13 --out reports/rushboss/layers/performance`。

## 2026-10-03：图层修复前的 V8 JIT 与 QuickJS 独占对照

当前 Windows x64 宿主默认使用静态嵌入 V8 12.3.219.9，也保留 `--backend quickjs`。密集场景原先主要耗时来自 JS 动画/弹幕更新和绘制指令生成；本次没有改变生产 thlib、游戏规则、素材或效果。测试使用同一 Release exe、相同输入/种子/资源和 RTX 3060 Laptop GPU，按 QuickJS、V8、V8、QuickJS 的 ABBA 顺序串行执行，每后端两次。

| 实际 GPU 场景 | QuickJS 工作均值 | V8 工作均值 | QuickJS P95（两次范围） | V8 P95（两次范围） |
| --- | ---: | ---: | ---: | ---: |
| 主页面 | 8.47 ms | 2.54 ms | 11.52–11.67 ms | 3.08–3.13 ms |
| Sunny SC2，Lunatic、灵梦 | 38.02 ms | 5.21 ms | 43.18–43.72 ms | 6.46–6.47 ms |
| Artia SC13 长序列，Lunatic、魔理沙 | 13.07 ms | 1.89 ms | 33.31–33.37 ms | 3.61–3.86 ms |
| Artia SC13 最初密集激光窗口 | 46.53 ms | 6.00 ms | 53.01–54.07 ms | 7.74–8.26 ms |

前三组各运行 1,800 个真实渲染帧，前 600 帧用于 JIT/资源预热，统计后 1,200 帧；最后一组各 300 帧、跳过前 60 帧，保留原先卡顿的早期窗口单独比较。长序列的原攻击时间轴会改变弹幕密度，不能将其 1.89 ms 当作初期密集窗口成本。工作均值为两次均值的平均，P95 分别保留每次结果，不伪称合并样本百分位。CPU 工作包括 JS 更新/绘制、命令解码、提交和音频，不包括显示等待；GPU 查询单独记录。音量置零，资源和音频调用保留。

Sunny 密集场景和最初激光窗口的 CPU 工作分别约快 7.3 / 7.8 倍。V8 的命令解码反而有更高开销（主页面约 1.86 ms，对照 QuickJS 约 0.73 ms），主要收益来自 JS JIT；后续还可以优化通用指令通道。这里证明列出的时间窗口，不承诺所有实战组合或未经预热的首次效果全程稳定 60 FPS。

24 个 Demo 场景加 5 个通用 GPU 场景的 PNG 字节、RGBA 与完整图形状态均严格相同；每后端 139,200 帧固定游戏快照以及真实应用回放也通过。逐项原始 profile、源代码/二进制哈希与全部验收见 `reports/backends/report.json` 和 [后端验证](backend-verification.md)。重跑：`node tools/verify-backends.mjs --scope performance`，运行时结束其他游戏预览和重载测试。

以下各节保留早期实现的历史测量，不作为当前 V8 后端的性能结论。

默认演出已改为公共 `TouhouBossPresentation`，使用 TH20 原 ANM 与网格。下面的 Rush 着色器、512 段圈和对应数字属于上一轮历史版本，不能当作现行画面的性能结论。此前重构的图形验收期间曾并行执行 CPU 测试；`public-framework` 中的 profile 只作历史诊断。

## 2026-10-03：上一轮 Rush 演出的独占测量（历史）

恢复完整开卡演出后，Sunny SC2 的平均工作耗时从 29.84 降到 23.78 ms；Monstone SC8 没有明显改善，Artia SC13 的 P95 反而增加。**当前密集场景仍未稳定达到 60 FPS。** 下表如实记录最终版本的整体成本，不能将所有场景描述为性能提升。

本轮先只优化公共 ANM、弹幕绘制和原生命令通道，在没有改变演出内容的情况下，完成了 [12 场景缓存优化对照](../reports/rushboss/luastg-performance-after-cache/report.json)：PNG 文件哈希和完整快照全部严格相同。该轮部分捕获与 CPU 构建并行，像素和状态对照仍有效，其时间只作为诊断记录，不能用来承诺最终版本性能。

随后恢复了开卡条带、Cutin、原像素着色器扭曲、完整 512 段内外圆环、3D 魔法阵和叶片、原皮肤血条与两位小数计时。最终画面和演出快照有意改变，**不能宣称最终截图仍与旧版本逐像素相同**。下表对比 [本轮优化前基线](../reports/rushboss/luastg-performance-before/report.json) 与 [最终完整演出报告](../reports/rushboss/luastg-final-graphics/report.json)，包含优化收益和恢复演出的额外成本，不能据此单独归因某项缓存或 shader。

最终复测在本机 Windows x64、Release QuickJS-NG、NVIDIA GeForce RTX 3060 Laptop GPU 上依次运行，期间本轮任务没有并行构建、完整 CPU 回归或其它 GPU 测量。使用真实窗口与 GPU，关闭帧率限制，每个绘制帧执行一次固定更新；每场预热 60 个绘制帧。声音和音乐音量置零，资源加载与音频调用仍执行。战斗采用 Lunatic、静止无敌玩家，不持续射击或施放 Bomb，因此不是实战所有输入与命中路径的性能保证。

| 场景 | 总绘制帧数 | 优化前平均工作耗时 ms | 最终平均工作耗时 ms | 优化前 P95 ms | 最终 P95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 主页面（title） | 720 | 1.17 | 1.23 | 1.54 | 1.60 |
| Sunny Milk SC2，火精灵跃动 | 720 | 29.84 | 23.78 | 39.60 | 30.86 |
| Monstone SC8，多重幻影 | 800 | 18.87 | 19.07 | 26.51 | 26.61 |
| Artia SC8，异世界棱镜 | 800 | 26.00 | 23.52 | 48.86 | 45.14 |
| Artia SC13，最终符卡 | 800 | 13.16 | 12.88 | 39.19 | 43.11 |
| 第 480 帧暂停，绘制到第 720 帧（pause） | 720 | 25.95 | 19.68 | 38.75 | 30.85 |

数值取原生 profile 的 `frameWorkMs`：JS 更新、JS 绘制命令生成、C++ 解码、提交和音频处理的 CPU 工作时间；不包含显示等待、帧率限制和分析器自身成本，也不将异步 `gpuMs` 相加。720 帧场景有 660 个测量样本，800 帧场景有 740 个。暂停行包含预热后 420 帧战斗和 240 帧暂停绘制，不能当作纯暂停页面的耗时。GPU 时间由 `GL_TIME_ELAPSED` 独立记录；均值不能直接换算为正常游玩的固定帧率。

最终二进制为 `build/Release/ts-stg.exe`，SHA-256 为 `8f33d0943846100d2d0ba00a9ff6910c888947c4c76cde850319f667b1dcfe6c`；优化前基线为 `d9de14481f8ea6528d5792d0b5e19ecd6dbe4485a8265f61b508fcafa717e374`。完整报告保存各场景源码哈希、PNG、快照和原始 profile；上表是其中六个主要场景，其余菜单与切换场景也保留在报告中。

本轮保留全部弹幕、共享 ANM 动画和圆环的全部 512 段，没有删特效、减少弹数或降低网格精度。优化参考 LuaSTG 的对象与绘制状态复用：公共 ANM 缓存不变的局部几何和 UV、复用字节视图、合并通用绘制状态命令；零阻力/零力物理路径仍留在 JS，并通过冻结旧实现与 C++ 数值对照。C++ 只承担通用 shader、3D 网格和其它平台能力。

剩余成本主要仍在 QuickJS。以最终 Sunny SC2 原始 profile 为例，平均 JS 更新为 7.66 ms、JS 绘制命令生成为 13.89 ms，解码为 1.46 ms、提交为 0.76 ms；GPU 平均为 2.53 ms。Monstone SC8 的 JS 绘制平均为 12.70 ms。后续应继续检查 JS 动画调度、状态访问与几何生成，而不能只凭 GPU 时间判断密集弹幕已经流畅。

复现最终场景需要当前完整本地素材，并在没有并行基准或构建时运行；新测量应保存到独立目录：

```powershell
node tools/verify-rushboss-graphics.mjs --out build/rushboss-complete-presentation-profile --exe build/Release/ts-stg.exe
```

以下各节保留此前实现与测量条件，属于历史记录；旧表、旧截图相等结论和旧版简易模板的耗时不能代表上述最终完整演出版本。

## 历史测量：2026-10-03 原作素材场景卡顿与黑边修复

本节数据采集于同日后续的“精灵缺半边”修复之前，是性能优化的历史记录。后续已修复纹理切换时的图元模式错误，并增加独立完整覆盖检查；下列两路径画面一致不代表其当时已经正确绘出全部像素。该缺失修复的验收见 [验证记录](verification.md)，不能直接用本表承诺当前版本帧率。

在本机 i7-12700H / RTX 3060 Laptop GPU、Release QuickJS-NG 上，对相同输入、相同原作资源做完整窗口渲染前后对比。每个场景预热 60 个绘制帧；标题测 360 帧、灵梦满火力射击 480 帧、魔理沙 Bomb 和暂停各 240 帧。下表为每帧 CPU 工作时间，包含 JS 更新、JS 绘制命令生成、C++ 解码、提交和音频，不含帧率限制、交换等待和测量工具本身的成本。

| 实际场景 | 修复前平均 | 修复后平均 | 修复前 P95 | 修复后 P95 |
| --- | ---: | ---: | ---: | ---: |
| 标题 | 52.85 ms | 8.99 ms | 57.97 ms | 12.80 ms |
| 灵梦满火力射击 | 30.33 ms | 15.64 ms | 58.47 ms | 32.22 ms |
| 魔理沙 Bomb | 23.49 ms | 12.43 ms | 52.62 ms | 31.08 ms |
| 游戏到暂停 | 24.05 ms | 12.78 ms | 30.15 ms | 16.61 ms |

这些是无帧率限制、每次绘制恰好推进一帧的真实 GPU 基准，不能把平均耗时直接换算成正常游玩的固定帧率。**标题和常规画面明显改善，但密集弹幕、Bomb 仍存在超过 16.67 ms 的慢帧，尚未全程稳定 60 FPS。** 暂停进入时仍需同步读回和处理原噪声图，单次捕获帧最高约 136 ms；它不属于持续渲染耗时。没有通过减少弹幕、跳过特效或降低网格精度取得这些结果。

修复包括：

- 标题固定网格和索引复用、仅按需复制 strip、跳过权重为零的三角计算；保持每个原 float32 运算边界。
- 精灵局部角点缓存、绘制队列避免重复排序、位图字体排版缓存，降低解释器的分配和计算成本。
- 背景扭曲复用中间量；等待指令跳过无用闭包；内部插值借用结果，公开 API 默认仍返回独立数组；暂停点采样使用对齐像素字复制。
- 原生绘制延迟应用状态，合并相同混合、采样和透明度阈值，减少逐精灵刷新；通用 `quad` 在平台层展开最终顶点，动画和 STG 规则仍在 JS。
- 最终画布按 RGB 呈现，消除重复透明混合引起的黑框；恢复原作 alpha test 和第 6 号混合公式。原贴图字节没有改动，合法黑色像素保留。

四个场景修复前后的完整游戏快照和随机数状态严格相同。修复后的普通 mesh 与快速 quad 两条路径，四个场景的 PNG 哈希和游戏状态全部相同；此外有 4,360 组 quad 数值逐位对照、24 组 GPU 绘图对照和原素材透明度像素回归。像素一致结论仅覆盖这些对照，不等于整作与原 D3D 游戏逐像素一致。

复现完整场景与两种绘制路径：

```powershell
node tools/verify-th20-graphics.mjs --mesh --out build/th20-quad-mesh
node tools/verify-th20-graphics.mjs --out build/th20-quad-fast
node tools/compare-th20-graphics.mjs build/th20-quad-mesh build/th20-quad-fast --equal-images --out reports/th20/quad-game-equivalence.json
node tools/verify-quad.mjs
node tools/verify-th20-alpha.mjs

# 原标题 JS 分阶段测量；--wave -800 检查波形覆盖较多的区间
node tools/benchmark-th20.mjs --wave 0 --out build/title-profile.json
node tools/benchmark-th20.mjs --wave -800 --frames 120 --out build/title-wave-profile.json

# 普通游玩模式，另外观察追帧、显示等待和真实 GPU 时间
.\build\Release\ts-stg.exe games/touhou20/reimu.js --root . --frames 480 --input 80 --profile build/normal-play-profile.json
```

旧版本快照与详细本机证据在忽略目录 `reports/th20/game-performance.json`、`quad-game-equivalence.json`、`alpha-verification.json`、`js-performance.json` 和 `native-renderer-performance/report.json`。底层 2,000 精灵压力测试的工作耗时从 34.33 降到 5.78 ms，仅证明状态合并对该负载的收益，不能替代上表的整场景数据。

剩余热点主要是密集动画的 JS 状态访问、动画更新和几何计算。共享内存视图等进一步优化需要新的实测与源轨迹回归；当前没有采用未经验证的替换，也没有切换 JS 后端。

## 历史测量：早期通用弹幕脚本基准

性能数据必须区分 Node 与实际 QuickJS 后端。下表是 2026-10-02 在当前 Windows x64 开发机、Release 原生宿主中实测的 QuickJS 结果；不是不同电脑或完整游戏的帧率保证。

| 常驻弹数 | 生成绘制命令/帧 | JS 中位耗时 | JS P95 |
| ---: | ---: | ---: | ---: |
| 1,000 | 2,000 | 5 ms | 7 ms |
| 2,000 | 4,000 | 11 ms | 13 ms |
| 5,000 | 10,000 | 29 ms | 34 ms |

各组先预热 30 帧，再测量 240 帧。计时使用 QuickJS 的 `Date.now()`，分辨率为 1 ms。工作负载为种子 83、常驻圆弹、持续转向、边界反弹、每帧一次自机范围查询，以及每弹两个圆形绘制命令。

表中 JS 时间包含实体更新、空间哈希建立和查询、生成绘制命令；不包含 C++ 解析命令或 GPU 绘制。运行期间原生宿主实际执行了命令解析和校验，但这些成本没有计入上述 JS 计时。headless 模式不创建窗口或音频设备。

5,000 弹的 JS 中位时间在优化前为 43 ms，优化后为 29 ms。优化保留纯 JS 玩法边界，减少空调度开销、边界处理的临时函数、空间哈希临时对象与字符串、绘制排序及方法调用。**当前 QuickJS 的 5,000 弹配置不能承诺 60 FPS**。2,000 弹的测试仅说明这组脚本负载的成本；完整关卡还会增加敌机、自机、特效、音频、绘制和其他查询，需在目标硬件实测。

## 历史基准的复测方法

先构建原生宿主，再在项目根目录运行：

```powershell
# 默认 2,000 弹、240 个测量帧、30 个预热帧
npm run benchmark:native

# 指定弹数、测量帧数，可保存 JSON 报告
npm run benchmark:native -- 1000 240 --out build/performance-1000.json
npm run benchmark:native -- 2000 240 --out build/performance-2000.json
npm run benchmark:native -- 5000 240 --out build/performance-5000.json

# 自定义原生程序或预热长度
npm run benchmark:native -- 2000 240 --warmup 60 --exe build/Release/ts-stg.exe

# 无 Node 驱动时，也可以直接运行默认负载
.\build\Release\ts-stg.exe tools/benchmark-quickjs.js --root . --headless --frames 270
```

驱动脚本在 `build/` 下创建隔离的临时入口，传入工作负载参数，运行真实原生宿主，随后清理该入口。它不会修改引擎源码。默认优先使用 Release；也可通过 `TSSTG_BINARY` 指定程序。选择 Debug 会改变测量结果。

输出同时提供：

- `medianMs`、`p95Ms`：上述 JS 区间的中位数和第 95 百分位数。
- `meanUpdateMs`、`meanQueryMs`、`meanDrawMs`：JS 三个阶段的平均成本。
- `wallMs`：整个原生进程的实际耗时，包含启动、模块加载、预热、JS、C++ 命令解析和退出。
- `wallAverageFrameMs`：`wallMs / 总帧数`。该数值包含一次性启动成本，不能当作稳态渲染帧时间。
- `environment`：操作系统、架构、CPU 和原生程序路径，方便记录不同机器的测量条件。

`npm run benchmark -- 5000 240` 仍是 Node 的 CPU 脚本测量。Node 使用 JIT；QuickJS 的结果应由原生基准单独取得。绘图性能、真实音频和操作延迟需要运行图形模式验证。

## 历史测量：RushBoss 旧版简易模板图形场景

战斗夹具使用静止、无敌玩家，持续保留弹幕以测量密集绘制；这些数据不覆盖正常玩家的命中、擦弹与射击成本，也不是实战全程帧率保证。

2026-10-03 在 Windows x64、Release 原生宿主、QuickJS 和 NVIDIA GeForce RTX 3060 Laptop GPU 上实测。每个场景独立运行，每个 benchmark 帧都执行一次更新与完整绘制，预热 60 帧。测量未启用帧率限制。最终复测正确将声音和音乐音量置零，资源加载与音频调用仍执行；优化前基线生成于战斗音量设置修复之前，战斗音效仍使用默认音量。下表的工作耗时包含 JS、绘制命令解码、提交和音频处理，不包含显示等待和分析器自身耗时。

| 场景 | 总帧数 | 优化前平均工作耗时 ms | 优化后平均工作耗时 ms | 优化前 P95 ms | 优化后 P95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 主页面 | 720 | 1.56 | 1.62 | 2.12 | 2.42 |
| Sunny Milk 火精灵跃动，Lunatic | 720 | 19.51 | 10.67 | 22.68 | 17.37 |
| Monstone 多重幻影，Lunatic | 800 | 24.86 | 13.40 | 30.99 | 17.90 |
| Artia 异世界棱镜，Lunatic | 800 | 23.19 | 10.67 | 38.68 | 19.76 |
| Artia 最终符卡，Lunatic | 800 | 26.38 | 13.98 | 66.40 | 38.73 |
| 主页面进入 Practice 并选择符卡 | 720 | 1.59 | 1.59 | 2.09 | 2.05 |
| 第 480 帧暂停，持续绘制到第 720 帧 | 720 | 18.25 | 8.59 | 21.80 | 10.27 |

本次优化保留背景扭曲的 **49×37 采样点、UV/颜色公式、顶点位置与拓扑**，复用几何数组、扭曲中间量和颜色数据，并将每帧不随顶点变化的计算移出顶点循环。应用通过公共 `SpriteAtlas` 首次解析通用图案与纹理后，缓存裁切矩形，用公共 `DrawList.spriteRegion` 构建相同命令，避免每颗子弹重复解析名字和创建绘制选项；thlib API 与原生命令校验保持原样。没有减少弹幕或跳过绘制。七个场景优化前后的 PNG 文件字节与 SHA-256 全部一致，完整游戏快照也逐字段一致。该结论覆盖缓存优化前后这七个捕获点；不是与原游戏 EXE 的逐像素对照，也不代表整作复刻验收。

战斗和暂停场景的平均工作耗时降低约 45%～54%。最终符卡平均工作耗时从 26.38 降到 13.98 ms，P95 从 66.40 降到 38.73 ms；密集曲线激光的慢帧仍明显超过 16.67 ms。因此不能宣称所有符卡稳定 60 FPS。主页面和菜单不走扭曲网格，表中小幅变化属于不同运行的测量差异。

复现图形验证：

```powershell
node tools/verify-rushboss-graphics.mjs

# 与保留的本机优化前证据比较：七个 PNG 和完整快照必须一致。
node tools/verify-rushboss-graphics.mjs --compare reports/rushboss/graphics-before-cache

# 仅检查指定场景，也可用 --out 保存到另一目录。
node tools/verify-rushboss-graphics.mjs --scene artia-sc13 --out build/rushboss-final-profile
```

工具按顺序启动原生场景，校验每帧渲染、应用图集和多种 thlib 通用弹幕图集实际加载、练习菜单输入边沿以及暂停时模拟帧保持为 480。缺少通用素材的火焰弹、实心心弹与冻结雾可使用应用素材；其它缺失图案会使验证失败。截图、完整快照、原生 profile、代码哈希及对比结果保存在忽略目录 `reports/rushboss/graphics/`；报告入口为 `report.json`，优化前证据保留在 `reports/rushboss/graphics-before-cache/`。
## 历史说明：完整公共动画接入后的测量说明（2026-10-03）

RushBoss 现已改用此前在 touhou20 Demo 中还原的完整 `TouhouPlayer`、武器、Bomb 及标准弹幕 ANM。前面旧版简易模板的性能结果不能代表这套实现。当前 `reports/rushboss/graphics/` 与 `shared-player-graphics/` 主要用于资源、行为和画面接入检查，部分捕获与 CPU 模拟验证并行，不能用这些数值宣称帧率提升或稳定 60 FPS。完整动画的密集场景仍有超过 16.67 ms 的帧。

## 竖屏原作框架的激光起点修复（2026-10-03）

Artia最后符卡的24条脉冲激光，此前每条误用151/152整套Boss蓄力，共额外9600颗粒子。现在复用公共激光的原始`bullet58..73`起点（同一factory、原脉动/旋转/混合、优先级39）；真正Boss的400颗开场蓄力保持原样。画面变化是修正预置体选择，不是省略正确特效。实际300帧的发射哈希、统计、Boss位置、自机/武器/Bomb状态与修复前完全相同；绘制命令峰值由12744变为3168。

在验收与打包进程全部退出后，单独重跑原生QuickJS/RTX3060 Laptop GPU、Lunatic、魔理沙、300帧（前60帧不计样本）：update均值12.97ms，render28.68ms，decode1.36ms，GPU1.73ms；工作耗时均值43.45ms、P9549.79ms。见`reports/rushboss/portrait-graphics/artia-sc13-profile.json`及`artia-sc13-report.json`。其它整批截图有并行CPU验证，其profile仅供诊断。修复前存在并行负载，不把前后耗时直接换算成提升百分比。

这个场景仍无法稳定60FPS；下一项瓶颈是大量曲线段的JS绘制构建及逐帧模拟。没有使用减弹、跳帧或减少正确原作粒子数量来宣称稳定帧率。
