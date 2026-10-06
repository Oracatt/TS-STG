# TouhouRushBoss 竖屏 Demo

默认入口 `main.js` 使用 TS-STG 和公开的 `@ts-stg/thlib/touhou`，将 RushBoss 的弹幕、对白、每关背景和 Boss 美术组合成原作风格的竖屏游戏。Windows x64 默认采用嵌入式 V8 JIT；传入 `--backend quickjs` 可使用解释器对照。业务层来自只读工程 `D:\c++\TouhouRushBoss-main`；通用应用框架、玩家、界面及 Boss 演出以 `Touhou20Reconstruction` 为基准。这是私有 Demo，不进入引擎/thlib SDK。

| Boss | 阶段（含非符） | 符卡 | 私有本体图像 |
| --- | ---: | ---: | --- |
| Sunny Milk | 7 | 4 | src_sunnymilk |
| Monstone | 9 | 5 | src_monstone |
| Artia | 13 | 7 | src_artia |

Game Start 顺序运行三个 Boss，保留自机生命、Bomb、能量、碎片、分数和擦弹；四难度、灵梦/魔理沙均可选。Practice 选择整关，Spell Practice 提供全部 16 张符卡（包括生存卡）。保留源工程的 74 句中文对白、战前/战后顺序、Boss 出现和 BGM 事件；源工程没有 Artia 战后对白，直接进入结算。

原作标题/难度/选人动画、竖屏 HUD、低速判定点、暂停、重试、续关和结算使用 thlib。Option 调节 BGM/音效音量；Manual 展示操作；Replay 可保存并播放最近五次记录。音量、高分、回放保存到 `userdata/rush-portrait-profile.json`。结算或暂停中的 Save Replay 保存真实逐帧输入与校验点；回放期间 Esc 退出，其他实时战斗输入不影响播放。

## 运行

```powershell
cd D:\AIWorkspace\TS-STG
.\Play-RushBoss.cmd
# 或
.\run.ps1 -Entry games/rushboss/main.js
```

本机资源已导入。更换工作区时：

```powershell
.\import-th20.ps1 -Reference D:\AIWorkspace\Touhou20Reconstruction
node tools/import-rushboss-portrait-assets.mjs D:\AIWorkspace\Touhou20Reconstruction
node tools/import-rushboss-assets.mjs --source D:\c++\TouhouRushBoss-main
node tools/import-rushboss-dialogue.mjs D:\c++\TouhouRushBoss-main
```

方向键移动/选择，Z 或 Enter 射击/确认，X Bomb/取消，Shift 低速/跳过对白，Esc 暂停。构建后运行无需 Node；Node 用于导入和开发。显式选择 V8：`run.ps1 -Entry games/rushboss/main.js --backend v8`；同一入口的 `--backend quickjs` 保留完全相同的 thlib、素材和弹幕。

## 架构与图像

`src/portrait-application.js` 组合公共应用、菜单、列表、对话、HUD、暂停、结算和回放模块。`sunny.js`、`monstone.js`、`artia.js` 保留 Rush 的发射时序、难度公式、运动、克隆、棱镜、雾、直线/曲线激光及阶段推进。`dialogue-data.js` 从源头自动提取 10 类、84 步事件、74 句文本。

原场地为 640×480、Y 向上；竖屏场地改为原作 384×448，在 960×720 画布内使用 `(48,24,576,672)` 视口。业务坐标仍 Y 向上；适配器转成 thlib 的 `x=-192..192/y=0..448`。绝对移动/发射锚点重新布局，反弹、雨列、冰栅、网格按新场地边界计算；局部环阵半径、弹速、夹角不做横向压缩。

公共 `TouhouPlayer`、原始基础射击表与 ANM 实现灵梦/魔理沙本体、子机、武器、攻击/擦弹/死亡特效、完整两种 Bomb。标准弹幕图像和碰撞统一来自 thlib 模板；火弹使用公共水滴 type43，心弹使用公共环形心弹 type22，没有 Rush 图像回退。激光使用公共材质和碰撞；自机适配层只转换坐标、Boss 伤害与消弹事件。

Boss 演出使用公共 `TouhouBossPresentation`：800粒子的黑雾出场、常驻光环99/108、开卡6→4/5双圈、13号 SpellCardAttack、原作字体和倒计时、七色攻击聚能/释放、死亡反色和冰雾预置体、17×17背景扭曲。每条激光的起点直接使用公共 `createTouhouLaserOrigin`（bullet58–73、绘制优先级39），与 `TouhouLaserField` 使用同一初始化；保留原始脉动和旋转。三个 Boss 的实际精灵、对白右侧立绘及开卡 cut-in 使用 Rush 原图与业务动画。

Demo 按用户要求省略符卡击破或超时换段后的蓝紫准备聚能及其音效，保留攻击前的绿色聚能、原有阶段等待和发弹时间。此选择只在 Demo 阶段配置中实现，thlib 的聚能预置体保持完整。详见 [阶段切换节奏](../../docs/rushboss-phase-rhythm.md)。

普通对白的 reveal 事件触发黑雾，在第101帧露出本体、第102帧启用光环/扭曲；即使提前跳完对白也要等待显形后才开战。显式跳过对白与符卡练习使用可见的 `flyIn`。名字下的星星和分段血条直接使用公共 `TouhouBossPhasePlan` 与 `TouhouBossHud` 的默认规则，按阶段实际 HP 计算，不读取 Rush `lifeBar` 比例。非符与下一张符卡共用血环，连续独立符卡各自一条血环；练习仅显示所选符卡，无后续星。生存符只隐藏血环，保留倒计时。入口改变了战斗开始帧，输入录像格式的游戏修订升为2，旧修订保留在列表并标为不可播放。

Rush 的直线及曲线激光沿用公共材质/判定，并按原 Rush `BLEND_STATE_BRIGHTEN` 使用 RGB `SRC_ALPHA / ONE`、Alpha `ONE / ONE` 的叠加。混合状态在每束绘制后恢复；`createRushPortraitGame(host,{laserBlend:'alpha'})` 或单束 `laserBlend` 可覆盖业务皮肤，不改变公共 thlib 激光动画的默认混合。源码依据为 Rush `EnemyBulletDeriver.h` 的 `highLight`、`GameScene.cpp` 的高亮队列，以及 VirtualLib `Renderer.cpp` 的混合因子。

`assets/` 保存私有 Rush 资源与来源清单；`src/artwork-assets.js` 只向竖屏应用提供舞台、符卡背景、Boss 精灵和立绘图像。`src/stage-artwork.js` 实现 GrassLand、RiverSide、FrozenForest 三关的源 3D 场景及各 Boss 符卡背景，保留原纹理、滚动、几何和摄像机规则，适配竖屏视口且不拉伸图片。`src/boss-artwork.js` 实现三个 Boss 的源精灵动画及残影；`src/boss-portraits.js` 实现 Sunny 的身体与表情叠层、Monstone 整身像、Artia 表情和三人的开卡立绘。具体图片与这些业务规则均不进入 thlib。

`assets/portrait/` 保留本机 TH20 业务皮肤和现有音乐注入资源。本次美术接入不改变 BGM 选择，也不导入锦上京具体 Boss 或魔石。公共库默认对白人物采用已剔除魔石的原作选人整身立绘，因为原始对话整身图嵌有魔石；左侧玩家立绘、气泡、文字及对白时间线仍由 thlib 提供，右侧 Boss 立绘由业务回调绘制。所有导入资源保留来源哈希及权利标记。

## 验证和边界

```powershell
npm test
npm run test:integration
node tools/verify-rushboss-portrait-runtime.mjs
node tools/verify-rushboss-portrait-graphics.mjs
node tools/verify-rushboss-dialogue.mjs
ctest --test-dir build -C Release --output-on-failure
```

- 应用验证覆盖三关衔接、全部练习入口、四难度/两自机、暂停/续关、设置持久化与录放一致。
- 每后端 232 例 Node/QuickJS/V8 验证覆盖 29 阶段×四难度×两自机，每例600帧；以完整固定统计 snapshot 严格比较。额外实体 binary64 数学字段诊断单独报告，不能据此声称所有内部双精度字段完全相等。24 个业务与 5 个通用 GPU 场景的两后端 PNG/RGBA、完整图形快照全等。性能与预热范围见 [后端验证](../../docs/backend-verification.md)。
- GPU 工具保存实际原生标题/转场/练习/对白/Boss 入场/开卡/三套符卡背景/两种 Bomb/暂停截图，并检查公共演出与竖屏视口。
- 对话计时独立编译原 `Dialog.h::OnUpdate`：40 案例、210000帧、840000状态字段完全一致。
- `build/rush-portrait-flow-probe.json` 验证完整对白和29阶段的流程衔接；它强制快速击破阶段，不是可通关难度证明。`build/rush-portrait-replay-probe.json` 验证真实420帧记录再播放，状态哈希一致。

当前包含 Rush 的三关 3D 背景、符卡背景及具体 Boss 美术，没有原 EXE 全状态/逐像素对照。自机、武器、Bomb、标准弹幕与碰撞使用 thlib 的原作公共规则，因此与 Rush 原自机及弹幕判定规则仍有明确差异。密集场景的原生性能仍需持续优化，不承诺所有场景稳定60FPS。具体背景、Boss 美术、BGM 及两个 Demo 均不属于发布内容。

旧 `src/game.js` 与 `verify-rushboss-{graphics,quickjs,presentation,warp}` 保留为宽屏历史对照工具。`Play-RushBoss.cmd` 与 `main.js` 已不使用这条路径；Rush 资产导入器同时为当前竖屏应用提供私有美术资源。

业务衍生代码为 GPL-3.0-only，见 [LICENSE](LICENSE)。引擎/thlib 采用各自许可证；原作素材保留其权利与来源标记，未发布任何内容。
