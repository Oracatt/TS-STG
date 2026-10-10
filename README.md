# TS-STG

**C++ 平台宿主 + TypeScript thlib + 游戏业务层**的东方风格 STG 引擎。Windows x64 默认使用嵌入式 V8 JIT，也保留 QuickJS-NG 可切换；两者运行同一份由 TypeScript 编译的标准 JavaScript，不需要在游戏中安装 TypeScript 或 Node。

| 层级 | 职责 |
| --- | --- |
| `native/` | 窗口、渲染、音频、输入、文件、时间和 JS 执行 |
| `packages/thlib/` | 完整公共应用流程、菜单/HUD/暂停/结算，以及已还原的自机、武器、Bomb、弹幕、小怪和原作通用 Boss 演出、动画、音效及素材 |
| `examples/danmaku/` | 不依赖原作资源的独立示例游戏 |
| `tools/spellcard-editor/` | 独立桌面符卡编辑器，内嵌真实 TS-STG 引擎预览；开发工具，不进入默认 SDK |

依赖方向为游戏业务层 → thlib → 平台适配器。thlib 不导入游戏模块，宿主不认识游戏名称；通用 Boss、符卡和背景扭曲能力由 thlib 提供。

## 运行通用示例

```powershell
cd D:\AIWorkspace\TS-STG
npm ci
.\build.ps1 -Test
.\Play.cmd
```

Windows x64 构建同时包含 V8 JIT 和 QuickJS。默认 `auto` 选择 V8；可在启动参数中使用 `--backend quickjs` 或 `--backend v8` 对照同一应用。只构建解释器版本：`.\build.ps1 -QuickJSOnly`。不需要安装 Node.js 运行游戏；V8 已静态链接，thlib 的游戏规则和素材不随后端改变。双后端检查：`npm run test:backends`，说明见 [后端验证](docs/backend-verification.md)。

工作区的 `Play.cmd` 和 `run.ps1` 显式选择通用示例，无需原作资源。原生程序无参数启动则读取使用方项目的 `main.js`，不依赖任何 Demo。方向键移动/选择，Z 射击/确认，X Bomb/返回，Shift 低速，Esc 暂停，Enter 确认。

## TypeScript 符卡预览

运行 `start-spellcard-editor.cmd` 打开独立桌面符卡工具。在代码区编写 `.spell.ts`，通过内嵌 TS-STG 引擎实时预览，支持 `.ts` / `.mts`，也兼容原有 `.js` / `.mjs`。预览只编译临时副本，保存的始终是作者源码。支持语法高亮、查找替换、TS 语法诊断、运行时错误映回原文，以及暂停、逐帧和按固定种子跳转。首次启动需要安装编辑器自己的桌面依赖。结构、使用与范围见 [SpellCardEditor](docs/spellcard-editor.md)。

示例 [月折「借光的纸鹤」](examples/spellcard/moonfold.md) 用径向展开的青蓝纸翼、紫色残月与反复锁定的金针，演示一张可直接编辑的 TS 符卡：可留在缺口附近小幅诱导，也可观察弹间空隙主动换位。

## 依赖 thlib 制作自己的游戏

```json
{ "dependencies": { "@ts-stg/thlib": "file:../TS-STG/packages/thlib" } }
```

```js
import { Game, Boss, Patterns, DrawList } from '@ts-stg/thlib';

const game = new Game({ seed: 42, title: 'My game', stageFactory: createStage });
// 游戏提供关卡、界面回调和平台适配器；每帧调用 update，再提交 render 的命令。
```

thlib 不依赖 Node、DOM 或 C++ 全局对象。`@ts-stg/thlib/touhou` 提供 `TouhouApplication`、`TouhouGame`、菜单/HUD/暂停/结算，以及已还原的角色、射击、两种 Bomb、弹幕/激光、道具、小怪、特效、ANM、字体与音效。`createTouhouPrefabCatalog` 枚举和创建公共预置体：两角色、50 类弹型的 800 种颜色组合、272 个小怪动画脚本和全部 193 个 effect 脚本。272 是姿态、转向和子动画数，并非敌人种类数。`createTouhouResources` 加载九个公共动画库及原音效；纯模拟也使用同一份基础数据。具体 Boss、作品标识/专属立绘、专属背景和关卡由使用方提供；通用 UI 布局及原动画属于 thlib。详见 [完整公共资源](packages/thlib/assets/TOUHOU-COMMON.md) 和 [Boss 演出接口](docs/touhou-boss-presentation.md)。

完整公共应用示例只依赖 thlib，不读取任一游戏目录：

```powershell
.\run.ps1 -Entry examples/touhou-framework/main.js
```

示例提供自绘背景和测试弹幕，主菜单、难度/角色选择、游戏 HUD、暂停、角色和 Boss 通用演出直接使用公共库。具体关卡与未接入页面需要使用方提供；它不是另一份原作关卡。

`@ts-stg/thlib/th20` 已移除。通用还原机制通过 `@ts-stg/thlib/touhou` 公开。迁移说明见 [架构](ARCHITECTURE.md)。

## 构建与验证

开发环境：Windows x64、VS2019/2022 C++ 工具、CMake 3.24+、Node.js 24+、Python 3（仅参考数据导入）。首次构建下载固定版本 raylib 5.5、QuickJS-NG 0.10.1 与 V8 12.3.219.9 静态 SDK，均校验 SHA-256。构建后的游戏无需 Node 或 Python。

```powershell
npm ci
npm run build
npm run typecheck
npm test
npm run test:package
npm run test:integration
ctest --test-dir build -C Release --output-on-failure
```

`test:package` 在仓库外安装真正的 thlib npm 压缩包，并以 Node/QuickJS 验证独立消费，包含通用素材，不携带作品专属资源。原作图形与数值检查需要先导入本机资产。更多源码对照见 [验证记录](docs/verification.md)。

thlib、示例和编辑器维护 TypeScript 源码。thlib 的 JS、类型声明和 source map 由构建生成到 `packages/thlib/dist/`；示例的 JS 生成在源文件旁，以兼容现有原生入口路径。不要编辑生成的 JS。独立编辑器 UI 需先 `npm ci --prefix tools/spellcard-editor`，再运行 `npm run typecheck:editor` 和 `npm --prefix tools/spellcard-editor run build`。迁移边界、消费方式与构建约定见 [TypeScript 开发](docs/typescript.md)。

**后续只发布底层引擎和 thlib。** `.\package.ps1` 生成纯 SDK，仅含引擎、thlib、通用素材及必要接口文档/许可证；不带任何 Demo、作品专属素材、测试或导入工具。`Run.cmd` 运行使用方编写的 `main.js`。重打包会保留旧目录及存档；当前未发布 SDK 或 npm 版本。

[原生接口](docs/native-api.md) · [ANM 实现与边界](docs/anm-restoration.md) · [第三方许可](THIRD_PARTY.md)

## Git 版本管理

本地仓库主分支为 `main`。源码、thlib 三套完整公共素材及其来源说明、工具、文档、原创示例素材和测试基准纳入版本管理；构建目录、依赖、发行包、存档、生成报告和作品专属素材由 `.gitignore` 排除。`reports/touhou/scene-transition/README.md` 是保留的手写验证说明。换行由 `.gitattributes` 统一，二进制素材保持原字节。

每项完整修改验证后，检查差异并按范围提交：

```powershell
git status
git diff
git add -- <本次修改的文件>
git diff --cached
git commit -m "描述本次修改"
```

克隆或检出到新目录后，thlib 的 `reference-common`、`touhou-common`、`spell-common` 素材包已完整存在，无须执行导入器即可使用或打包 thlib。原作对照所需的作品专属素材仍按上面的步骤本机导入；存档不纳入 Git。远程仓库为 [Oracatt/TS-STG](https://github.com/Oracatt/TS-STG)。
