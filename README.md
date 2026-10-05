# TS-STG

**C++ 平台宿主 + 纯 JavaScript thlib + 游戏业务层**的东方风格 STG 引擎。Windows x64 默认使用嵌入式 V8 JIT，也保留 QuickJS-NG 可切换；两者共用同一套纯 JS thlib。

| 层级 | 职责 |
| --- | --- |
| `native/` | 窗口、渲染、音频、输入、文件、时间和 JS 执行 |
| `packages/thlib/` | 完整公共应用流程、菜单/HUD/暂停/结算，以及已还原的自机、武器、Bomb、弹幕、小怪和原作通用 Boss 演出、动画、音效及素材 |
| `games/touhou20/` | 锦上京参考应用：专属标题美术、背景、BGM 和关卡组合；旧通用模块仅转发 thlib |
| `games/rushboss/` | 竖屏 TouhouRushBoss Demo：三个 Boss、29 阶段、16 符卡、完整对白，以及私有三关背景、Boss 精灵与立绘；采用公共应用框架、自机和演出 |
| `examples/danmaku/` | 不依赖原作资源的独立示例游戏 |
| `tools/spellcard-editor/` | 独立桌面符卡编辑器，内嵌真实 TS-STG 引擎预览；开发工具，不进入默认 SDK |

依赖方向为游戏业务层 → thlib → 平台适配器。thlib 不导入游戏模块，宿主不认识游戏名称。锦上京具体 Boss 和魔石不在参考应用实现范围内；通用 Boss、符卡和背景扭曲能力仍然保留。

## 运行通用示例

```powershell
cd D:\AIWorkspace\TS-STG
.\build.ps1 -Test
.\Play.cmd
```

Windows x64 构建同时包含 V8 JIT 和 QuickJS。默认 `auto` 选择 V8；可在启动参数中使用 `--backend quickjs` 或 `--backend v8` 对照同一应用。只构建解释器版本：`.\build.ps1 -QuickJSOnly`。不需要安装 Node.js 运行游戏；V8 已静态链接，thlib 的游戏规则和素材不随后端改变。双后端检查：`npm run test:backends`，说明见 [后端验证](docs/backend-verification.md)。

工作区的 `Play.cmd` 和 `run.ps1` 显式选择通用示例，无需原作资源。原生程序无参数启动则读取使用方项目的 `main.js`，不依赖任何 Demo。方向键移动/选择，Z 射击/确认，X Bomb/返回，Shift 低速，Esc 暂停，Enter 确认。

## 运行锦上京参考应用

```powershell
.\import-th20.ps1 -Reference D:\AIWorkspace\Touhou20Reconstruction
.\Play-TH20.cmd
# 直接检查角色
.\run.ps1 -Entry games/touhou20/reimu.js
.\run.ps1 -Entry games/touhou20/marisa.js
```

导入器只读取参考工程，不执行原游戏机器码。完整 Demo 资源放在忽略目录 `games/touhou20/assets/` 供对照；运行时的公共部分加载 thlib 的 `assets/touhou-common/`，包括完整动画、基础射击数据、角色本体和音效。混合图集剔除魔石等专属区域，记录保留区域、来源和哈希；`assets/reference-common/` 另供简单 SpriteAtlas 模板使用。该应用保留原作菜单、角色与界面，并使用验证模块组合的 JS 道中；它不是原关卡通关复刻，也尚未完成整作逐帧、逐像素或音频采样一致性验收。支持范围见 [还原状态](docs/status.md)，应用接口见 [业务接入说明](docs/th20-guide.md)。

已修复最终呈现重复透明混合产生的黑边、纹理切换导致立绘缺半边的问题，并保留标题、动画和字体优化。性能记录有明确测量版本与范围，见 [性能记录](docs/performance.md)；不承诺所有密集场景稳定 60 FPS。

## 运行 RushBoss Demo

```powershell
.\Play-RushBoss.cmd
# 更换工作区时：先导入公共原作资源，再导入私有美术、BGM 和对白
.\import-th20.ps1 -Reference D:\AIWorkspace\Touhou20Reconstruction
node tools/import-rushboss-portrait-assets.mjs D:\AIWorkspace\Touhou20Reconstruction
node tools/import-rushboss-assets.mjs --source D:\c++\TouhouRushBoss-main
node tools/import-rushboss-dialogue.mjs D:\c++\TouhouRushBoss-main
```

默认入口使用原作布局的竖屏应用：三 Boss 顺序衔接、四难度、两自机、整关/16 张符卡练习、原始 74 句对白、暂停/续关/结算、音量设置与保存/播放回放。灵梦、魔理沙、武器、Bomb、弹幕判定及 Boss 入场双圈、17×17 背景扭曲、倒计时、蓄力和 SpellCardAttack 都来自 thlib。RushBoss 业务层提供原弹幕、阶段、对白，以及三关透视背景、符卡背景、实际 Boss 精灵动画和对白／开卡立绘；这些私有内容均不进入 SDK，音乐仍沿用现有注入。旧宽屏菜单/演出保留作历史对照。尚未完成原 EXE 的逐帧、逐像素等价验收。运行方式、验证和具体边界见 [RushBoss 说明](games/rushboss/README.md)。

两个 Demo 共用 thlib 的 `TouhouGameplayCompositor`：根据原作回调顺序交替合成背景与前景，符卡开场双圈参与背景扭曲，敌弹主体在背景之后绘制，符卡名在最终界面合成之后绘制。接入与裁剪规则见 [公共图层合成](docs/touhou-rendering.md)，源码依据见 [图层审计](docs/TOUHOU_RENDER_SOURCE_AUDIT.md)。

## 可视化编辑符卡

运行 `start-spellcard-editor.cmd` 打开独立桌面编辑器。可视化编排弹幕、激光、Boss 移动、聚能、音效与消弹并生成 `.spell.js`，也可直接修改 JS 函数、循环和 thlib 调用。源码修改后自动加载到真实引擎预览，支持暂停、逐帧和跳转；保存的 ES 模块可直接导入游戏。首次启动需要安装编辑器自己的桌面依赖。结构、使用与范围见 [SpellCardEditor](docs/spellcard-editor.md)。

## 依赖 thlib 制作自己的游戏

```json
{ "dependencies": { "@ts-stg/thlib": "file:../TS-STG/packages/thlib" } }
```

```js
import { Game, Boss, Patterns, DrawList } from '@ts-stg/thlib';

const game = new Game({ seed: 42, title: 'My game', stageFactory: createStage });
// 游戏提供关卡、界面回调和平台适配器；每帧调用 update，再提交 render 的命令。
```

thlib 不依赖 Node、DOM 或 C++ 全局对象。`@ts-stg/thlib/touhou` 提供 `TouhouApplication`、`TouhouGame`、菜单/HUD/暂停/结算，以及已还原的角色、射击、两种 Bomb、弹幕/激光、道具、小怪、特效、ANM、字体与音效。`createTouhouPrefabCatalog` 枚举和创建公共预置体：两角色、50 类弹型的 800 种颜色组合、272 个小怪动画脚本和全部 193 个 effect 脚本。272 是姿态、转向和子动画数，并非敌人种类数。`createTouhouResources` 加载九个公共动画库及原音效；纯模拟也使用同一份基础数据。魔石、具体 Boss、作品标识/专属立绘、专属背景和关卡留在 Demo；通用 UI 布局及原动画属于 thlib。详见 [完整公共资源](packages/thlib/assets/TOUHOU-COMMON.md) 和 [Boss 演出接口](docs/touhou-boss-presentation.md)。

完整公共应用示例只依赖 thlib，不读取任一游戏目录：

```powershell
.\run.ps1 -Entry examples/touhou-framework/main.js
```

示例提供自绘背景和测试弹幕，主菜单、难度/角色选择、游戏 HUD、暂停、角色和 Boss 通用演出直接使用公共库。具体关卡与未接入页面需要使用方提供；它不是另一份原作关卡。

`@ts-stg/thlib/th20` 已移除。通用还原机制通过 `@ts-stg/thlib/touhou` 公开；锦上京旧模块仅转发同一公共类，专属场景没有通过 thlib 导出。迁移说明见 [架构](ARCHITECTURE.md)。

## 构建与验证

开发环境：Windows x64、VS2019/2022 C++ 工具、CMake 3.24+、Node.js 24+、Python 3（仅参考数据导入）。首次构建下载固定版本 raylib 5.5、QuickJS-NG 0.10.1 与 V8 12.3.219.9 静态 SDK，均校验 SHA-256。构建后的游戏无需 Node 或 Python。

```powershell
npm install --ignore-scripts
npm test
npm run test:package
npm run test:integration
npm run test:th20
node tools/verify-th20-title.mjs
ctest --test-dir build -C Release --output-on-failure
```

`test:package` 在仓库外安装真正的 thlib npm 压缩包，并以 Node/QuickJS 验证独立消费，包含通用素材，不携带参考应用及作品专属资源。`test:th20`、原作图形与数值检查需要先导入本机资产。更多源码对照见 [验证记录](docs/verification.md)。

**后续只发布底层引擎和 thlib。** `.\package.ps1` 生成纯 SDK，仅含引擎、thlib、通用素材及必要接口文档/许可证；不带任何 Demo、作品专属素材、测试或导入工具。`Run.cmd` 运行使用方编写的 `main.js`。`touhou20`、`rushboss` 都只作开发、展示和回归 Demo；`.\package.ps1 -WithReferenceAssets` 生成的本机私用锦上京 Demo 包不属于发布物。重打包会保留旧目录及存档；当前没有发布任何内容。

[原生接口](docs/native-api.md) · [ANM 实现与边界](docs/anm-restoration.md) · [第三方许可](THIRD_PARTY.md)

## Git 版本管理

本地仓库主分支为 `main`。源码、两个 Demo 的业务代码、工具、文档、原创示例素材和测试基准纳入版本管理；构建目录、依赖、发行包、存档、生成报告和导入原作素材由 `.gitignore` 排除。`reports/touhou/scene-transition/README.md` 是保留的手写验证说明。换行由 `.gitattributes` 统一，二进制素材保持原字节。

每项完整修改验证后，检查差异并按范围提交：

```powershell
git status
git diff
git add -- <本次修改的文件>
git diff --cached
git commit -m "描述本次修改"
```

克隆或检出到新目录后，按上面的构建与资源导入步骤恢复运行环境。被忽略的素材和存档不在 Git 历史中；本机现有文件继续保留。远程仓库尚未配置。
