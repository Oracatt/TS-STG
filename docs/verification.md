# 本机验证记录

## 2026-10-05：缓存 BGM 返回标题和重新入场

定位到原生音频缓冲：固定版本 raylib 5.5 对暂停/已停止流调用 Stop 不清空队列，Seek 只移动解码器和计数；宿主还会继续填充已停止的缓存流。旧路径在真实设备的8秒静音 WAV 上，要求回到0秒却报告7.92744秒，随后可能误触发游戏配置的循环点。宿主现在通过公开音频 API 静音复位缓冲，停止服务已停止流，并让定位保持播放/暂停/停止状态。Rush 的标题子页返回也显式重播标题曲，曲目和场景策略仍在业务层。

- Release 构建通过；104 项 CTest 全部通过，包含实际音频设备测试，本机没有跳过。旧 transport 路径按预期失败，修复路径覆盖缓存重播、暂停后停止、重复停止、非零定位和播放状态保持；非循环流在曲尾附近及精确 EOF 定位后仍向宿主报告结束，不越过自定义循环边界偷偷重播片头。
- 22 项相关 Node 测试通过，覆盖重试、返回主菜单、再次入场、设置/回放/说明页返回及取消选择。
- V8、QuickJS 各通过450帧真实五曲 transport 和360帧真实 Rush 应用流程，使用同一缓存句柄的重播时间回到0，下一帧未错误跳到循环点；音频时间确实推进。检查暂停保持、停止后等待、非零定位、标题子页返回和两次进入首关。
- V8、QuickJS 各通过7200帧完整模拟及1800次录像驱动调用。本地 SDK 已重建，独立消费者、双后端应用流程和严格 TypeScript 检查通过；不含 Demo 或游戏 BGM，未发布。

运行方式为 `node tools/verify-rushboss-music-restart.mjs`，报告在 `reports/rushboss/music-restart/report.json`。真实设备检查静音输出，验证播放游标与状态，不声称已完成听感或原作混音逐采样比较。资源首次加载后缓存的策略保留，详见 [音乐与资源生命周期](touhou-music.md)。

## 2026-10-05：还原框架的组合接口

对照固定版本 LuaSTG/THlib 的所有权分工，新增共享 `TouhouWorld`、固定帧 `TouhouPhaseSequence`、自机 profile/rules、武器/Bomb 工厂、业务道具、任意应用场景和选择页、资源与立绘注册、可替换续关策略。Boss 登记和演出焦点分离，聚能不隐式开战；旧退出序列按符卡属主和 generation 结算，避免误收新卡。默认原作预设继续提供相同素材和机制，具体游戏内容未迁入 thlib。

- 853 项 Node 测试全部通过，没有跳过。覆盖默认源 C++ 浮点向量、碰撞、自机和16项魔理沙升火力回归，以及新阶段/工厂销毁、跨 Boss 属主、角色与道具、HUD 容量和自定义武器档位。
- V8、QuickJS 各通过7200帧完整模拟和1800次录像驱动调用；这是各后端与对应 Node 模拟/回放的验证，不是性能基准。
- `verify-touhou-framework-extension.mjs` 的120帧新接口夹具在 Node、V8、QuickJS 的状态逐值一致，覆盖共享世界、自定义角色/Bomb/道具、阶段取消和场景交接，全程无窗口。
- 魔理沙连续射击到400火力的高速/低速原生状态和 PNG 在两后端一致，且 V8 两张 PNG 与本轮重构前保存的截图字节相同。Boss 保留身体对话、飞离、移除及爆炸四组原生场景的状态/PNG 也在两后端一致；已查看代表图。
- 实际 npm tarball 独立安装检查、本地 SDK 重建及消费者运行通过，严格 TypeScript 消费者包含新接口并拒绝84种错误用法。SDK 仍不含两个 Demo、具体 Boss/背景或 BGM；未发布。

新接口用法见 [thlib 使用方式](thlib-guide.md)。报告位于 `reports/touhou/framework-extension`、`reports/touhou/marisa-power`、`reports/touhou/boss-outcome`；构建日志在 `build/framework-*`。Rush 输入录像版本由14提升至15，以拒绝旧机制版本。上述证据覆盖所列模拟与画面，不等同于全游戏和原作 EXE 逐像素验证；本轮未运行原作 EXE。

## 2026-10-04：RushBoss 三关背景与具体 Boss 美术

按最新范围，竖屏 Demo 恢复 Rush 原草地、河岸、冰雪森林透视场景、三套符卡背景、三个 Boss 的精灵动画、对白表情立绘和90帧开卡立绘。素材保持源资源包字节与哈希；导入校验通过（190文件、108纹理），未运行或复制原 EXE。具体场景和美术均属于 `games/rushboss`，公共 thlib 的灵梦／魔理沙、自机武器、Bomb、弹幕和碰撞、HUD、开卡双圈、SpellCardAttack、倒计时和扭曲保持共用。

`stage-artwork.js` 按源滚动、透视、距离雾和混合规则绘制，河岸保留源12次水面采样，森林保留树丛和落雪。私有符卡底图在优先级11、公共开卡双圈在13进入初始捕获后接受原作扭曲；Boss 本体与分身在29、开卡立绘在63，名字仍在81。Boss 精灵保留原帧矩形、动作切换、朝向、浮动和冻结残影。

实际对白首次截图发现公共左皮肤过宽遮住右 Boss 脸，已通过通用可选 `playerPortrait` 布局处理。公共缺省命令保持逐值一致；Rush 注入 `{-280,172,260}`，自机立绘和原动作位移均等比缩放。`drawPortrait` 返回 `false` 可增加右立绘并保留公共左人物。左右人物说话状态、两自机的实际截图已查看，两侧脸与身体主体可见，气泡和文字在前。

- 437个 Node 测试通过，含新资源所有权、三关背景、三 Boss 动画、完整原对白立绘、实际应用组装、暂停／重开及旧公共默认命令回归；没有跳过用例。
- V8 原生 GPU 的27个菜单／对白／非符／开卡／符卡／Bomb／暂停／结算／回放场景通过，生产源码哈希在整套运行期间不变。
- 6组立绘 GPU 配对（12次原生运行）只关闭业务图片绘制，完整 session、application 和公共 Boss 演出严格相同；每对游戏区外零RGB差异。另检查3个左方说话状态及魔理沙／Sunny对白。
- 8组图层组件配对通过，非符弹幕、三个符卡名和开卡双圈可见；18个独立对比色像素断言验证裁剪和扭曲顺序。
- QuickJS 的河岸非符、Artia最后符卡、Sunny开卡三个实际GPU场景与同帧V8的PNG、完整RGBA像素及全部生产快照严格相同；两组源码哈希相同。
- 通用7200帧原生集成与1800帧输入回放通过；SDK已重建，独立消费者与严格TypeScript检查通过，发布目录无Demo及私有Rush素材。

报告分别为 `reports/rushboss/artwork-v8/report.json`、`artwork-portraits/report.json`、`artwork-layers/report.json` 和 `artwork-quickjs/backend-image-equivalence.json`。复跑工具为 `verify-rushboss-portrait-graphics.mjs`、`verify-rushboss-artwork-portraits.mjs`、`verify-rushboss-layers.mjs`。本轮验证源参数、素材、实际合成和后端一致性，不宣称原EXE逐像素等价。源仓库缺少VirtualLib相机实现，近／远裁面采用通用 `.1/1000` 并在背景snapshot记录；视觉随机流与游戏RNG分离。性能profile仅供诊断，没有据此作所有场景稳定60FPS的结论。

## 2026-10-04：符卡名字与底板注册顺序

原作 `card_system/start.cpp:29` 依次注册 `ascii_960:0` 名字底板、`text:22` 动态字图、`ascii_960:1` Bonus/History底板；三者同属layer32、回调优先级81。源 `sprite_renderer/pool.cpp:80` 普通注册追加到列表。同层不能仅凭较高的全局优先级保证文字在自己的底板之前或之后。

公共 `TouhouSpell.begin()` 原先先调用名字工厂，再创建底板，造成文字后面叠加底板。现在恢复源注册顺序，没有抬高文字层或修改底板透明度。公共名字工厂仍可缓存位图，每次新建ANM；上一张卡的三动画保持原退出寿命。

401个Node测试通过。新增两条回归使用真实公共ANM bank、文字renderer和实际队列提交，修复前均稳定失败，修复后底板/字图/记录提交顺序正确；第二条覆盖字图缓存与相邻开卡。默认本地SDK已重建，独立消费者和严格TypeScript检查通过。

实际GPU有6组V8生产配对（Sunny第24/60/120/300帧、Monstone和Artia第300帧）以及1组QuickJS配对。控制组只将名字VM的注册排序提前到名字底板之前，不删除文字或底板。完整production snapshot和三动画状态严格一致，名字矩形外零像素变化。第24帧原底板alpha0，差异为0；随后各镜头字图被正确置于底板之上。QuickJS Sunny300的修复/旧序PNG及完整状态分别与V8相同。

三次独立真实bank控制色夹具，各有1014个按原底板纹理alpha/颜色预选的GPU像素断言通过：文字区域写入明确纯绿色，保留原ANM几何/混合和原底板，正确顺序为RGB=[0,255,0]，旧顺序绿色不超过192。实际生产镜头保留完整中文名字。已查看代表截图；源码在整个GPU验证期间稳定。报告见 `reports/rushboss/spell-name-order/report.json`，复跑工具为 `node tools/verify-touhou-spell-name.mjs --backend v8`（QuickJS可用 `--backend quickjs --scene sunny-300`）。没有运行原作EXE，不宣称与原作EXE逐像素一致。

## 2026-10-03：符卡双圈与捕获 alpha

原作 `effect.anm` 4/5 的双圈仅在首 8 帧由 alpha255 降至128，此后倒计时阶段保持128，并从第80帧起按符卡时长缩小半径；末段才执行20帧淡出。新增真实 ANM 时间线和绘制顶点测试覆盖这些条件。

图层重排后的第一版合成器遗漏源回调14的捕获 alpha255步骤。原作 Boss mesh 的纹理组合明确选顶点 alpha，忽略纹理 alpha；当前通用宿主 mesh 使用纹理与顶点相乘。已经混合进背景的双圈因此又被纹理 alpha 乘了一次，产生额外变淡。公共合成器现在在首个捕获面提交完优先级13后，按原作 ZERO/ONE 保留RGB、ONE/ZERO将扩展相机区域alpha设255，再进行扭曲。

源码依据为 `platform_window/graphics_callbacks.cpp:49`、`sprite_renderer/render_mesh.cpp:29`、`geometry_draw.cpp:30`、`render_state.cpp:22`。这是恢复原作合成状态，没有调高双圈脚本自身的透明度或取消半径变化。

- 399 个 Node 测试全部通过；新增 3 个真实双圈 ANM 测试覆盖持续阶段、末段淡出及重新开卡。
- V8 原生 GPU 的 11 个独立夹具通过，验证捕获 RGB 保留、alpha255 的区域及提交时机、DESTALPHA，以及原作只取顶点 alpha 的独立 shader。alpha64/128 的已混合颜色在旧采样下分别衰减至16/64，恢复捕获状态后分别保持64/128，与原作 shader 结果一致。
- Sunny 实际符卡第120和600帧各有开启/关闭修复的配对截图，完整游戏 snapshot 严格一致；关闭修复的 PNG 与修复前 baseline 字节相同。实际截图已检查。
- 非符敌弹、右上符卡名及开卡图层的 3 组 V8 原生 GPU 回归通过。默认本地 SDK 已重建，独立消费者及严格 TypeScript 检查通过；未发布。

报告为 `reports/rushboss/capture-alpha/report.json`，复跑命令为 `node tools/verify-touhou-capture-alpha.mjs`；图层回归报告位于同目录 `layers/`。没有运行原作 EXE，本轮验证原作脚本、合成状态与实际宿主画面，不宣称原作 EXE 逐像素一致。

## 2026-10-03：原作图层调度与公共合成管线

本轮按重建源码区分全局 ANM 层、注册顺序和实体管理器绘制回调，修复非符敌弹被背景覆盖、右上符卡信息顺序及开卡双圈未进入扭曲采样的问题。公共 `TouhouGameplayCompositor` 由两个 Demo 共用，包含两张离屏纹理交替合成、ONE/ZERO 颜色与 alpha 复制、扩展游戏相机及界面裁剪。源调度及代码位置见 [图层审计](TOUHOU_RENDER_SOURCE_AUDIT.md)，公开 API 见 [接入说明](touhou-rendering.md)。

- 396 个 Node 测试全部通过，包含实际子弹主体与注册子动画、两角色子机注册顺序、擦弹及符卡数字回调。
- V8 原生 GPU：27 个菜单、非符、开卡、符卡、Bomb、暂停、结算及回放画面场景通过；另有 8 组实际场景组件关闭对照，非符敌弹及符卡名字的像素可见性通过，配对的完整战斗快照严格一致。
- QuickJS 原生 GPU：3 组关键组件对照通过。两后端共 36 个独立像素断言验证合成顺序、颜色/alpha 复制、扭曲范围及裁剪；3 张实际画面和 2 张合成夹具逐 RGBA 一致。
- 实际开卡动画 4/5 在优先级 13 进入首个捕获面；常驻圈 99/105/107 在优先级 16 随后绘制，108 的粒子 106 单独处于优先级 10。符卡名 22 在优先级 81、最终合成之后绘制；数字文字为 84。
- 修复前后两个 300 帧非符/符卡场景的完整战斗快照严格一致。V8 7,200 帧原生通用关卡及 1,800 帧回放验证通过。
- 独立 npm 包和 SDK 消费者通过，发布包仅含引擎、thlib、通用素材及文档。新合成 API、双 RT 选项及只读回调常量纳入严格 TypeScript 正例与误用检查。

图像与源码哈希、配对像素变化、实际 VM 所处 render target 和玩法对照记录位于 `reports/rushboss/layers/acceptance.json`。复跑：`node tools/verify-rushboss-layers.mjs --backend v8` 和 `node tools/verify-rushboss-portrait-graphics.mjs --backend v8`。没有运行原作 EXE；这轮证据验证源码调度及实际宿主可见性，不代表已经完成原作 EXE 逐像素验收。原始 416×480 中间面采样及深度缓冲仍是 [公开说明](touhou-rendering.md) 记录的平台映射边界；初始捕获 alpha 状态已在后续双圈修复中补齐。

## 2026-10-03：V8 / QuickJS 双后端

同一 Release 宿主增加静态嵌入 V8 12.3.219.9，Windows x64 的 `auto` 选择 V8，仍可显式选择 QuickJS-NG。生产 thlib 和 RushBoss 游戏规则/素材没有改变。当前二进制 SHA-256 为 `b9c78ba26ea23bd09499f273c411ed33c980b2727721b79c28d25e6bf0b68750`。

- 101 项 CTest 通过，覆盖原有数值对照与两后端的宿主/绘图检查；新增双后端边界驱动 97 次原生进程调用通过，包含循环/动态 ESM、顶层 await、TypedArray 偏移、异常堆栈、微任务与超时。
- 每后端 29 阶段 × 4 难度 × 2 自机 × 600 帧，即 139,200 帧；完整 `RushBattle.snapshot()` 严格相同。额外原始二进制浮点字段单独记录，QuickJS 与 Node 的 1,128 个末位差最大约 5.68e-14，V8 与 Node 的该组原始字段全等。
- 每后端 420 帧真实应用录制加 420 帧原生存档读回后的回放，实际触发中文对白、暂停/恢复、移动与射击；同后端回放及两后端最终 session 均严格相同，哈希 `267944c8`。
- 24 个 Demo GPU 场景与 5 个通用 GPU 场景：两后端 PNG 字节、RGBA 像素及完整图形快照全等，零变化像素。此结果验证后端替换，不是与原作 EXE 的逐像素对照。
- 两后端分别通过 7,200 帧通用完整关卡集成与 1,800 帧通用回放；同后端回放正确，通用原始浮点快照不承诺跨后端哈希一致。
- SDK 的仓库外消费者在 auto / QuickJS / V8 下验证真实后端与独立公共应用、自机/武器/Bomb、暂停/重试/返回流程；15 份 V8 来源/许可证、严格 TypeScript 消费检查通过。独立 QuickJS-only 构建的 auto 及明确拒绝未编入 V8 也通过。

性能测量使用串行 ABBA、同一输入/资源及明确预热窗口，结果与重跑方法见 [后端验证](backend-verification.md)。原始分项报告在 `reports/backends/`；独立 SDK 与构建报告在 `build/sdk-verification.json`、`build/jit-quickjs-only-report.json`。

验证时间：2026-10-02 至 2026-10-03。Windows x64、VS2019 / MSVC 19.29、Windows SDK 10.0.19041、Release；Node 24.16.0、QuickJS-NG 0.10.1；TypeScript 5.9.3 严格声明检查。

## 2026-10-03：竖屏 RushBoss 完整应用

默认 `games/rushboss/main.js` 采用原作公共应用框架，只使用 Rush 的攻击/阶段和对白业务内容。该轮原生程序为 `c6297a1e66605cd75fca9c04ab86a3825dd0c67d52e7a99032778f23185e8a68`，当时未改 C++；此后已接入上节的 V8 后端。

- **387/387 Node 测试、52/52 CTest**，通用7200帧组合与1800帧原生录像通过。三关/29阶段的快速流程探针、真实420帧录制再播放也通过；探针使用独立存储，不写玩家高分。
- 竖屏 **232例×600帧=139200帧**，四难度/两自机全部29阶段的完整固定统计 snapshot 在 Node/QuickJS 无容差全等。额外所有实体的原始 binary64 诊断有24例、1128个末位差（最大约5.68e-14），主要是 angle/length/fx/fy；未声称完整实体全状态或原 EXE 等价。见 `reports/rushboss/portrait-runtime.json`。
- 原 `Dialog.h::OnUpdate` 独立编译：**40例、210000帧、840000字段**一致；原始10类、84步事件、74句文本全部提取，Artia无战后对白未补写。见 `reports/rushboss/dialogue-timers.json`。
- **24个实际 QuickJS/GPU 场景**：标题/转场/两种练习/设置/说明/回放页、两角色对白、Boss入场、开卡、三套原符卡背景、两种Bomb、暂停、结算、播放结束。检查原99/108、4/5、13、17×17扭曲和`48/24/576/672`视口，并查看代表截图；不以此宣称原 EXE 像素一致。见 `reports/rushboss/portrait-graphics/report.json`。
- 修复菜单子树显示位（源hide_animation_tree使用49c flags1）、选人标题退出，以及私有标题背景不更新的问题。激光起点抽成公共 `createTouhouLaserOrigin`，16色×120帧的完整VM内存与绘制命令，对旧源初始化及现`TouhouLaserField`三方全等。24条激光只创建24个起点，移除误生成的9600个Boss蓄力粒子；真正Boss蓄力保持400颗。更换前后的实际300帧战斗发射哈希、统计、自机状态及Boss位置全部一致，视觉有意改正。
- 最终公共资源为 **9库、1322脚本、2239 sprites、88 PNG、50唯一音效**。默认SDK与真实npm tarball（325文件）均独立安装验证，双自机120帧及应用300帧流程通过；TS5.9.3 strict/noUncheckedIndexedAccess/skipLibCheck:false及7条类型反例通过。无Demo或私有背景/BGM进入SDK，未发布。见`build/{sdk-verification,thlib-package-verification}.json`。

当前原作3D道中未实现，Boss本体选用公共小怪；默认对白整身皮肤是已剔除魔石的原作选人图。特定背景与BGM仍在Demo。密集激光单独实测仍超过16.67ms，见[性能记录](performance.md)。

## 2026-10-03：公共应用框架与原作预置体重构（前一轮）

当前构建 SHA-256：`c6297a1e66605cd75fca9c04ab86a3825dd0c67d52e7a99032778f23185e8a68`。本轮按用户最新边界，将完整通用应用、界面和原作 Boss 演出移入 thlib；RushBoss 默认改用 TH20 重建源码的公共演出。以下各项覆盖范围不同，不代表整作原游戏已经完全复刻。

- **355/355 Node 测试、52/52 原生 CTest**，严格 TypeScript / NodeNext 声明检查通过。原生 GPU 另验证纹理局部更新与目标纹理翻转，见 `reports/touhou-common/texture-region-gpu.json`。
- 公共资源含 **9 库、1318 动画脚本、2221 sprites、70 张 PNG、50 个唯一音效**。全部选中动画逐个创建、更新 240 帧、7 个时点绘制，无未实现异常或非有限顶点；六个阶段相机效果显式注入相机。见 `reports/touhou-common/prefab-audit/report.json`。这不是全部中断分支的穷举。
- 独立直接编译原 `converging_particles.cpp`：256 例、42,798 个字段一致；真实 ANM 的 42 个蓄力预置各完成 200 粒子生命周期。Billboard 与原 C++/系统 D3DX 的 216 例、2,712 个几何字段及 972 个旋转副作用字段全部 0 ULP。见 `reports/touhou-common/converging-source/`、`billboard-source/`。
- 独立原 `bitmap.cpp`、`fonts.cpp` 和原栅格函数，与新公共字图比较 12 组、1,249,280 字节，差异为零。本机实际字体回退路径通过，不扩张为所有系统字体配置的证明。见 `reports/touhou-common/original-bitmap-text/report.json`。Rush 中文名称显式选 CP936；原作公共默认仍为 CP932。
- 公共 Boss 演出 **13 场景 × 原始/公共两套素材 = 26 次 GPU 捕获**，完整状态和 RGBA 一致，包括 7 个开卡时点、4 个独立棋盘扭曲时点、道中与平移视口。额外修正源 layer32 视口偏移及 Bonus/History 左对齐。见 `reports/touhou-boss/public-framework/report.json`。
- RushBoss **12 个主页面/切换/战斗/暂停场景、27 个开卡关键帧、6 个角色射击/低速/Bomb 场景**通过。断言默认使用公共 99/108、4/5、13、17×17 网格，生产入口没有旧 Rush warp/ring/banner。见 `reports/rushboss/public-framework/`、`public-framework-intro/`、`public-framework-player/`；已查看代表截图。
- 公共自机 8 场景 × 两套素材共 **16 次 GPU 捕获**，状态/RGBA/PNG 全相同，并与上一轮已还原版本逐字节一致。见 `reports/touhou-common/public-framework/{graphics,comparison}.json`。公共框架独立示例另通过标题、选人、两角色 Bomb、暂停 5 个 GPU 场景；touhou20 Demo 的标题、射击、Bomb、暂停 4 场景通过。总计本轮上述 **96 次捕获**。
- touhou20 与上一轮的 4 个完整状态快照相同，标题 PNG 相同。射击、Bomb、暂停各有 1,450 个像素变化，全部位于界面矩形 `x=697..762, y=306..329`，对应移除魔石专属 `front` 脚本 13 标签；战斗区 `x=48..623, y=24..695` 没有变化。这项比较只覆盖上述固定捕获帧。
- RushBoss 116×600=69,600 帧的 Node/QuickJS 状态严格一致；TH20 公共组合两角色各 1080 游戏帧和绘制摘要一致。通用 7200 帧及原生输入录像检查也通过。图形检查期间有并行 CPU 验证，产生的 profile 仅供诊断，**不能作为本轮性能提升或稳定 60 FPS 的证据**。
- 实际 npm tarball 和默认本地 SDK 均在仓库外验证：双角色武器/Bomb，以及 300 帧主菜单→选人→游戏→暂停→重试→返标题流程通过。打包边界只包含引擎/thlib/通用资源/接口文档，排除两个 Demo；未发布。见 `build/{thlib-package-verification,sdk-verification}.json`。

原始素材对照证明的是公共资源筛选没有改变所测移植画面；独立原源码对照证明的是列出的数值与字图路径。没有运行原游戏可执行文件，也没有把这两类证据合并冒称整作逐像素一致。未接入的原作页面及其它缺口仍列于 [还原状态](status.md)。

## 2026-10-03：LuaSTG 设计参考与上一轮构建（历史）

上一轮原生程序 SHA-256：`8f33d0943846100d2d0ba00a9ff6910c888947c4c76cde850319f667b1dcfe6c`。参考仓库版本、阅读范围和分层决定见 [LuaSTG / THlib 设计参考](luastg-reference.md)。以下均为历史证据，其中 Rush 特效对应此前业务实现，不是现行公共默认。

- 最终 **321/321 Node 测试、50/50 原生 CTest** 通过；TypeScript 5.9.3 strict / NodeNext 通过。新增覆盖状态四边形、着色器作用域、系统矢量文字、公共三维演出、源演出时序及实际 ANM 命令流的混合状态边界。
- 性能改动先独立核验：RushBoss 12 个 GPU 场景的 PNG 和完整快照与优化前严格一致，见 `reports/rushboss/luastg-performance-after-cache/report.json`。随后按源码恢复开卡和背景，最终画面有意变化，不能沿用这项像素相同结论。最终独占性能测量与剩余慢帧见 [性能记录](performance.md)。
- 最终 RushBoss 实机检查：12 个标题/菜单过渡/战斗/暂停场景、三个 Boss 各 9 个开卡关键帧（1/15/20/30/40/60/75/90/120）、两角色各 3 个射击/低速/Bomb 场景全部通过，共 45 个捕获点。已检查代表截图。报告位于 `reports/rushboss/luastg-final-graphics/`、`spell-intro-final/`、`luastg-player-graphics/`。
- 完整公共角色最终回归：灵梦/魔理沙射击与 Bomb 早中晚共 8 个场景，每场分别使用原完整资源和公共裁选资源，共 16 次真实 GPU 捕获。全部状态、RGBA 和 PNG 字节与本轮优化前记录严格相同；没有以简化武器/Bomb 替换。见 `reports/touhou-common/luastg-final-regression/comparison.json`。
- 最终 touhou20 Demo 的标题、灵梦射击、魔理沙 Bomb、暂停四个 GPU 场景也与此前已还原版本的完整快照及 PNG 字节相同，见 `reports/th20/luastg-final-regression/comparison.json`。
- 独立 D3D11 直接编译原 `warp.fx`，与本机实际 GLSL 绘制比较 6 种颜色参数和圆外场景；同一输入、ANIS4/WRAP、125% 矩形下，7 例最大通道差均为 **1/255**，见 `reports/rushboss/warp-shader/report.json`。没有把旧网格近似作为对照真值。
- 使用实际 DirectXMath 的独立相机/四元数/矩阵参考程序：724 个 binary32 分量在 Node 和实际 QuickJS 上均 **0 ULP**，见 `reports/rushboss/presentation-numerics/report.json`。运动快速路径另有冻结旧实现 69,584 tick 对照，以及原 C++ MoveBody 1,080 和 MovingObject 1,500 组零差异检查；非 NaN 值保留 float32 位（含负零），NaN 只检查分类。
- RushBoss **116 × 600 = 69,600 帧** Node/QuickJS 完整序列化状态严格一致；报告中的所有玩法源码哈希与最终文件相同，见 `reports/rushboss/quickjs.json`。通用 7,200 帧组合检查和 1,800 帧原生输入录像回放也通过。
- 实际 npm 包安装到仓库外，独立 Node/QuickJS 两角色与完整 Bomb 120 帧通过。新增 `spell-common` 的三张原图/七个图案保留来源与哈希；公共 API 不反向引用 Demo。默认本地 SDK 已重新生成，并由仓库外消费方通过默认 `main.js` 加载 23 张公共图集、3 张开卡效果图及完整角色/Bomb，见 `build/sdk-verification.json`。SDK 目录白名单通过，不含两个 Demo、参考工程或系统字库；未发布。

以上证据分别证明已比较函数、资源与场景的结果，不等于原游戏整局逐帧、逐像素或音频采样一致。没有运行原游戏 EXE；仍未验收的范围见 [当前缺口](status.md)。

## 初始构建与组合场景（历史记录）

| 检查 | 结果 |
| --- | --- |
| C++ 宿主构建 | `build/Release/ts-stg.exe` 成功 |
| JS 规则/回归 | 184 / 184 通过，无跳过 |
| CTest | 31 / 31 通过，含用户 main.js 默认入口与模块边界负例 |
| 通用库与 Demo 声明的 TypeScript NodeNext 严格检查 | 通过；仅 thlib 是公开库入口 |
| thlib 独立消费 | 实际 npm 包安装到仓库外；含通用图像/音效，无游戏模块，Node/QuickJS 均独立运行；旧 th20 子入口不可用 |
| 本地打包边界 | 默认 SDK 只含引擎、thlib 与通用素材/必要文档；私用 Demo 单独打包；未发布 |
| 原作资源组合场景 | 灵梦、魔理沙各 1,080 个游戏帧；各 1,130 次输入更新、49 暂停帧 |
| Node 重复运行 | 选定完整快照和绘制流摘要相同 |
| Node / 实际嵌入 QuickJS | 快照严格相同，不使用数值容差；绘制摘要中的非整数按 float32 规范化 |
| 原生图形 | 标题、角色/HUD/敌弹、暂停捕获、网格扭曲、三类激光、原死亡投影特效已运行和检查截图 |
| 原生媒体 | 实际窗口/音频设备测试了播放、停止、循环段、暂停保留光标、继续及资源释放 |
| 黑边回归 | 原素材透明度/混合 8 项实际 GPU 像素检查通过；原贴图字节未修改 |
| 快速 quad 绘制 | 4,360 组 / 104,640 个数值字与 JS 展开逐位相同；24 组 GPU 对照、884,736 字节相同 |
| 精灵完整覆盖 | 连续切换贴图及 mesh/quad/sprite/rect，16 个矩形的 61,504 个内部像素与独立预期 RGBA 完全相同 |
| 标题灵梦立绘 | 实际标题第 300 帧，脸、上衣、裙身、裙摆、鞋共 5 个原图不透明取样点一致，并目视检查全身截图；旧程序后 4 点失败 |
| 字体缓存 | 756 组完整命令/布局对照与 802,816 个实际 GPU 字节相同 |
| 完整场景绘制路径 | 标题、灵梦射击、魔理沙 Bomb、暂停：mesh/quad PNG 哈希和完整状态全部一致 |

组合夹具硬断言每位角色发生射击、1 次 Bomb、3 类激光、9 次道具收取、1 次敌机击破、2 次失误与复活、1 次 Game Over/Continue、1 次符卡收取，并检查 9 个周期快照及最终状态。它使用真实导入的 ANM/SHT/字体/弹型，但关卡时间轴是验证用 JS，并为覆盖特定状态而安排受击与资源。因此它不等于原关卡通关或与原游戏的一致性验证。

本机 `reports/th20/runtime.json` 保留七个归档哈希、覆盖事件和峰值。最后记录的绘制摘要为灵梦 `cb82bd15`、魔理沙 `fb800141`；峰值分别为 32/33 敌弹、3 激光、126/34 自机弹、2,332/1,011 绘制命令。透明度阈值命令和新的 quad 表示会改变绘制流摘要与命令数；未来规则/渲染修改后应重新生成证据，摘要变化本身不是原作误差判断。

## 独立源码数值对照

| 对象 | 对照来源与结果 |
| --- | --- |
| 弹幕 13 种阵列 | 编译原 `shot_trajectory` 函数，1,560 组向量 float32 位一致 |
| 通用运动 | 原 `runtime_state/motion.cpp`，90 案例 / 720 帧 / 12,240 个浮点字一致 |
| ANM | 原 ANM VM/animation/math 源码，70 脚本 / 6,300 帧 / 每帧 44 个选定字段一致 |
| 自机、Bomb、道具、敌机、符卡、Boss HUD、继续游戏 | 独立转录的 C++ SSE 算式/状态夹具；Node 和 QuickJS 各 51,438 个数值比较，零差异 |
| 敌弹运行 | 60 组 / 24 帧运动状态，11,520 个数值位在 Node/QuickJS 一致 |
| 曲线激光 | 48 组路径案例 / 1,920 个数值位一致 |
| 通用背景扭曲 | 96 组、200,576 个数值位，在 Node/QuickJS 一致 |
| 标题网格 | 原背景算式/网格，21 组 / 451,647 个数值位一致 |
| 暂停捕获 | 3 组原噪声遍历和 6 组实际 D3DX9_43 缩放结果一致，包含原 255×255 噪声区 |
| 原投影死亡效果 | 原世界矩阵片段 + D3DX，900 组 / 14,400 浮点字与 7 组标准相机矩阵一致 |

这些验证分为直接编译原重建函数、提取源码片段和独立转录参考三种。报告明确记录来源、哈希和边界；没有执行原游戏 EXE。数值位一致只能支持实际比较的函数和字段，不能推导为整作逐帧、GPU 像素或声音采样一致。

## 2026-10-03：灵梦立绘缺半边回归

原生批绘制切换纹理时，新绘制记录恢复为四边形模式，随后提交的三角形顶点因此被错误解释。已修正建立图元模式与绑定纹理的顺序，并覆盖通用 Mesh、Mesh3D 和 LineStrip；保留合批，不修改原贴图或 thlib 动画数据。

此前 mesh 与 quad 的画面相同，仅说明两条路径一致；两条路径共用的丢失三角形问题不能由此排除。新增 `native/tests/mesh-texture-switch-gpu.js` 使用独立预期颜色检查两个三角的完整内部区域，`tests/fixtures/th20/title-coverage-gpu.js` 则读取实际标题画布并对照导入原图的不透明像素。两项检查均已用修复前程序验证能检出问题，再确认修复后通过。原图 SHA-256 另有校验，完整截图用于目视验收；5 个取样点不代表整幅原作逐像素一致。

复跑：`node tools/verify-quad.mjs`、`node tools/verify-th20-title.mjs`。本机证据保存在 `reports/native-quad/verification.json`、`reports/th20/title-coverage.json`；原素材透明度 8 项 GPU 检查、26 项 CTest 和 7,200 帧通用 Node/QuickJS 组合检查也重新通过。标题、灵梦射击、魔理沙 Bomb、暂停四个图形场景重新运行并检查截图，完整游戏状态与修复前相同；画面因恢复缺失三角形而有意变化，见 `reports/th20/full-quad-scenes.json`。

## 2026-10-03：通用库、业务 Demo 与发布边界

版本专属代码已迁至 `games/touhou20/src`，导入资源在 `games/touhou20/assets`。thlib 公开提供通用网格、可配置径向扭曲、分层绘制、按键连发和精灵图集/动画片段；不再导出 `@ts-stg/thlib/th20`。原生默认启动消费方的 `main.js`，不内置 Demo 入口。

抽取前后另做冻结实现对照：128 组网格、720 帧径向扭曲、64 帧场景网格、20 组分层队列完全相同；按键连发对照原实现 2,000 帧。标题、灵梦射击、魔理沙 Bomb、暂停四个原生场景的 PNG 哈希和完整状态均与抽取前一致，报告为 `reports/th20/layer-split-scenes.json`。两角色运行摘要仍为 `cb82bd15` / `fb800141`，没有以架构重构替代原作一致性验收。

通用素材包包含 23 张图集、612 个原始矩形、924 个可引用名称和 9 段纹理动画，另有 6 个通用音效。PNG 保留原字节并逐一校验 SHA-256；图集只选择通用弹幕、激光、Bomb、消弹和粒子等素材。`examples/common-assets/main.js` 仅依赖公开 `SpriteAtlas` / `SpriteClip`，实际加载全部 23 张图集；已目视核对 `build/common-assets-preview.png`，包括修正后的星弹和蓝色死亡圆环。纹理动画片段不等于完整 Bomb 演出。

`npm run test:package` 将真实 npm 包离线安装到仓库外，检查无业务模块、旧入口不可用、音效与图集齐全，并运行 Node / 嵌入 QuickJS 各 120 帧对照，全部通过。`node tools/verify-sdk.mjs` 检查本地 SDK 的目录白名单、可执行文件哈希，以及仓库外消费方的默认 `main.js` 入口：120 帧运行及 23 张纹理加载均通过，记录于 `build/sdk-verification.json`。

另外使用实际私用 Demo 包执行标题第 300 帧 GPU 检查，脸部至鞋的 5 处 RGBA 均零差异，已目视确认完整立绘；截图 SHA-256 为 `709106b14b1bbfd63c27ba9bcad61cb53be84a0476d05fd1afeb356d3635c1c7`，与打包前一致。证据位于 `reports/th20/title-layer-split-package/`。SDK 与 Demo 的可执行文件 SHA-256 均为 `4073717ca1df459a1cc7268e84f805640e801d1815dab5d0008485af9b7fd2be`。本轮只生成本地包，没有发布。

## 复跑

先按 README 导入本机资产并构建，然后：

```powershell
npm test
ctest --test-dir build -C Release --output-on-failure
node tools/verify-th20-patterns.mjs
node tools/verify-th20-motion.mjs
node tools/verify-th20-anm.mjs
node tools/verify-th20-player.mjs
node tools/verify-th20-background.mjs
node tools/verify-th20-projection.mjs
node tools/verify-th20-runtime.mjs
```

源码 oracle 工具当前使用本机 VS2019 和 Windows D3DX；其他开发环境需适配路径和依赖，不声明已验证跨平台。

保留的旧通用示例也重新通过了 7,200 帧重复执行、Node/QuickJS 对照和原生输入录像回放，经历 4 个 Boss 阶段和 3 次符卡收取。该证据只属于 `examples/danmaku` 通用模板，与原作还原证明分开。

## 性能与未完成验收

组合夹具同时计算完整绘制流摘要和周期状态，它不是纯更新或 GPU 帧率基准。此前性能优化的四个实际窗口场景，平均工作耗时为标题 52.85→8.99 ms、灵梦射击 30.33→15.64 ms、魔理沙 Bomb 23.49→12.43 ms、暂停 24.05→12.78 ms；这些是修复缺失三角形之前的历史结果。本次分层复跑验证画面与状态一致，不作为新的性能优化结论。密集段仍有超过 16.67 ms 的慢帧，尚未稳定全程 60 FPS；测量口径、P95 和复跑方式见 [性能记录](performance.md)。

原作整局逐帧输入/状态比对、逐像素比对、采样级音频比对、完整原生录像兼容和所有 UI/相机分支都没有完成。具体缺口在 [status.md](status.md)。

## RushBoss Demo 初版验证（2026-10-03，历史记录）

独立业务应用 `games/rushboss` 移植主页面、Sunny Milk 7 阶段／4 符卡、Monstone 9 阶段／5 符卡和 Artia 13 阶段／7 符卡。通用弹型图像优先使用 thlib，标准子弹尺寸与圆形、胶囊、矩形判定均来自公共 `StandardBulletPresets`；直线与曲线激光使用公共 `Laser` 几何。作品专属素材、阶段与参数留在应用，未加入发布 SDK。

- 全部 JS 测试 **249/249** 通过，原生 CTest **31/31** 通过。新增检查包含碰撞模板引用、旋转与触边、延迟和免疫、全部 16 张符卡菜单入口、暂停／重试／返回、菜单音量传入战斗、奖金整数衰减、生存奖金、跨阶段清弹、最终死亡延迟，以及 Monstone 最终冲刺的 Boss 本体接触范围。
- `verify-rushboss-runtime.mjs` 完整运行 **29 阶段 × 4 难度 = 116** 场景，共 **307,440 次更新**，逐帧检查 **126,274,760** 个实体状态。全部场景按时结束、弹幕有发射、生存捕获与结果正确，未出现 NaN／Infinity。夹具为无射击、无敌玩家；实际玩家命中与交互由专项测试覆盖。
- `verify-rushboss-quickjs.mjs` 在 Node 和原生 QuickJS 中分别运行同样的 **116 场景 × 600 帧 = 69,600 帧**，完整快照严格一致，不使用数值容差。两工具记录 11 个模拟源码 SHA-256，并断言运行期间源码未变；最终运行时哈希为 `cd186076b2c7c21a…`。
- 独立 C++ 数值对照 **5,880 项**通过，包含 MT19937、浮点及整数采样、力／阻力和移动。原仓库缺少 VirtualLib 向量与 Lerp 定义，运动 oracle 使用注明的独立适配公式；这不是原 EXE 完整状态对照。
- 实际 QuickJS/GPU 验证覆盖主页面、Sunny 符卡、Monstone 克隆、Artia 棱镜、最终激光、练习选择和暂停。优化保持 49×37 扭曲采样、公式及图案，七个捕获点的 PNG 字节与完整快照在缓存优化前后均一致。性能与慢帧限制见 [性能记录](performance.md)。
- 素材导入器对 190 个本机文件核对原始 SHA-256；通用音效、图像与专属素材各自记录来源。实际 thlib npm 包在仓库外以 Node／QuickJS 独立消费通过，默认 SDK 重新打包并核对没有 `games`、`examples`、`tools` 或 `tests`。

报告分别位于忽略目录 `reports/rushboss/runtime.json`、`quickjs.json`、`graphics/report.json` 和 `build/rushboss-numerics/report.json`。复跑命令见 [应用说明](../games/rushboss/README.md)。本轮没有执行原游戏机器码，没有进行原游戏全状态、逐像素或音频采样一致性验收；背景网格、自机及配套界面的明确差异也列在应用说明中。

## RushBoss 菜单动画与公共自机接入（2026-10-03，历史记录，已被下节替代）

修正初版只复用部分贴图、仍在业务层自行实现玩家射击与 Bomb 的问题。`RushPlayerAdapter` 现在连接实际的公共 `Player`、`Weapon`、`PlayerShot`、`Bomb`、`Item` 与 `Effect`，业务层仅转换坐标、事件和 Boss 交互。公共 `createPlayerCharacter` 提供灵梦的追踪符札／光球和魔理沙的星弹／激光／光束模板；`PlayerPresentation` 绘制子机、武器、Bomb、低速判定点及死亡效果，本体皮肤由应用回调提供。新增模板和声明包含在独立 thlib 包及 SDK 中。

主页面补上确认闪烁、选项移动、难度轮转、角色立绘滑动与介绍翻转、返回页面和进入战斗的波浪遮罩。原资源与专属时序保留在 RushBoss 应用；过渡期间锁定输入。新增 Boss／符卡选择页的过渡属于 demo；输入锁覆盖完整过渡，退出也增加闪烁与黑幕，因此不声称全部菜单行为与原 EXE 严格相同。

- 全部 JS 测试 **274/274**，原生 CTest **31/31**；公开 API 的 TypeScript strict NodeNext 消费检查通过。
- 通用集成运行 **7,200 帧**，重复 Node 模拟、QuickJS 对照与原生录像回放均通过。
- Boss 全时长 **116/116** 场景、**307,440** 次更新通过，共检查 **126,889,640** 个实体帧；现在包含公共玩家世界、待生成实体和子机位置。
- Boss **116 × 600 = 69,600 帧** Node／QuickJS 完整快照严格相同。另测两角色移动、低速、实际射击和 Bomb，共 **480** 次自机更新；游戏状态严格匹配，只有 9 个灵梦追踪弹位置值出现最高 **1.4210854715202004e-14** 的后端差异，对这些值采用 `1e-12` 绝对容差。实射专项报告明确为非严格数值一致。
- **18 个实际 QuickJS/GPU 场景**通过：12 个菜单／过渡／Boss／暂停场景，加两角色各 3 个射击、低速和 Bomb 场景。原生 VM 内断言公共类身份和绘制素材名称，并检查截图；修正了 Bomb 的加法混合及光球贴图过度放大。
- 实际 npm 包在仓库外安装，公开角色工厂和演出接口可用，Node／QuickJS 各 120 帧通过；SDK 目录白名单与默认入口也通过。无 demo 或作品专属素材进入 SDK，没有发布。

本节取代上述初版的当前状态。新证据为 `reports/rushboss/runtime.json`、`quickjs.json`、`shared-player.json`、`graphics/report.json` 与 `shared-player-graphics/report.json`；模拟报告记录并校验 19 个源码哈希。当前运行时为 `a0aa478f5e65d715…`，适配层为 `cdeb2f6e53757e4d…`。公共角色属于可配置通用模板，不是某一版的原始角色数据；本次检查也不是原 EXE 全状态或逐像素等价证明。

## 完整公共还原实现与素材迁入 thlib（2026-10-03，当前状态）

此前只共享 `Player/Weapon/PlayerPresentation` 简易模板与部分图像，没有复用已经还原的角色和 Bomb，未满足用户要求。本轮把实际实现迁入 `packages/thlib/src/touhou`：`TouhouPlayer`、射击、两种 Bomb、弹幕/激光、道具、小怪、特效、ANM、音效、字体、伤害及符卡等机制。旧 touhou20 模块仅重导出同一类对象；RushBoss 通过坐标、边界和 Boss 交互适配使用同一实现，不再使用旧简易角色替代它。

`assets/touhou-common` 包含 42 张图、50 个原音效、842 个完整动画脚本，以及灵梦 72 条／魔理沙 32 条基础射击记录。保留基础模式 0..14 和 profile 0，排除魔石派生数据。选定动画的指令、混合、旋转、子动画和中断完整保留；混合图集按选定矩形与 1 像素原采样边框保留 RGBA，其余区域透明。最初缺少采样边框确实造成少量像素不同，已经修正，没有放宽比较阈值。专属标题、背景、HUD、BGM、特定 Boss 和魔石仍在业务层；公共包不反向读取 Demo。

- 296 项 Node 测试、31 项原生 CTest 与公共 API 的 TypeScript strict 检查通过。包括公共类身份、真实基础数据、完整动画、所有 20 个 Rush 标准弹型颜色、延迟出场、消弹、擦弹颜色、矩形消弹边缘、回收线、重试和音效音量。
- 两角色各 360 帧，共 720 帧：原完整图集/完整 SHT 对公共裁选图集/基础数据，状态、所有绘制指令和声音事件严格一致。另用 Rush 实际适配器与 touhou20 的公共类执行相同输入，也逐帧严格一致，并通过 Node／QuickJS 的 JSON 状态与绘制流对照，无数值容差。
- 原生 GPU：灵梦与魔理沙的射击/低速、Bomb 早中晚，共 8 个场景、原/公共资源各运行一次，状态与 PNG 字节完全相同，差异像素为零。使用正式绘制队列与完整独立子动画调度，报告 `reports/touhou-common/graphics.json`。
- 原生完整 touhou20 Demo：标题、灵梦射击、魔理沙 Bomb、暂停四个场景，在公共资源接入前后完整状态和 PNG 哈希全部相同，报告 `reports/th20/common-extraction-comparison.json`。
- 7,200 帧通用集成和 1,800 帧原生录像回放通过。源码 oracle 再次通过：自机/道具/符卡 Node、QuickJS 各 51,438 比较；移动 12,240 浮点字；弹幕排列 1,560 向量；ANM 70 脚本/6,300 帧。
- RushBoss 的 29 阶段 × 4 难度全部完整运行，116 场景／307,440 次更新／126,274,760 个实体帧通过有限值与结果检查；116 × 600 = 69,600 帧的 Node／QuickJS 序列化状态严格相同。负零按两个宿主相同的 JSON 编码归一化，没有浮点容差。报告记录并核验当前实际公共实现和基础数据的源码哈希。
- RushBoss 实际 GPU 通过 12 个主页面、过渡、Boss 和暂停场景，加两角色各 3 个射击／低速／Bomb 场景，共 18 个。Bomb 视觉夹具单独增加目标血量，保证截取完整演出而不被结算面板遮住，实际应用 Boss 参数未改。报告分别为 `reports/rushboss/graphics/report.json` 和 `shared-player-graphics/report.json`，已查看代表截图。
- 单局动画 bank 销毁后从公共资源所有者注销；共享纹理/声音跨局复用，整体销毁只释放一次。重试不会保留已退役的整套模板，已释放的资源不允许再次创建 bank。
- 仓库外实际 npm 安装、Node／QuickJS 各 120 帧、两种实际 Bomb 及完整动画加载通过。默认 SDK 只含引擎、thlib、公共素材与必要说明/许可证；独立消费方的默认入口同样运行两角色和 Bomb 成功，不需要任一 Demo。没有发布。

原生程序 SHA-256 为 `d9de14481f8ea6528d5792d0b5e19ecd6dbe4485a8265f61b508fcafa717e374`。这些对照证明本次公共抽取没有改变已还原实现的受测行为和画面，不代表原游戏全关卡或全部原生渲染分支已验收；未完成范围仍见 `status.md`。
