# TypeScript 开发与构建

TS-STG 的脚本实现使用 TypeScript：公共 thlib、两个 Demo、通用示例和符卡编辑器均维护 `.ts` 源码；Node ESM/CJS 工具入口分别用 `.mts` / `.cts`。原生渲染、音频和 JS 运行时继续由 C++ 实现。回归用例、故意传错参数的宿主测试以及现有导入/验证脚本保留 JavaScript，它们也验证旧 JS 游戏的兼容性。独立的 Touhou21 仓库也采用同一 TS 构建流程。

## 工作区

```powershell
npm ci
npm run build
npm run typecheck
npm test
.\build.ps1 -Test
```

`build` 按 thlib → 示例 → Demo → 编辑器原生预览适配器的顺序编译。所有项目开启 `strict` 和 `noEmitOnError`；thlib 不引入 Node、DOM 或宿主全局类型。动态组装的类以 `declare` 声明字段，沿用原来的构造/初始化赋值顺序，不额外插入字段初始化。

| 源码 | 构建产物 | 用途 |
| --- | --- | --- |
| `packages/thlib/src/**/*.ts` | `packages/thlib/dist/**/*.js`、`.d.ts` 和 maps | 公共 ESM 包及类型契约 |
| `examples/**/*.ts` | 源码旁的 `.js` 和 map | 现有示例入口路径 |
| `games/**/*.ts` | 源码旁的 `.js` 和 map | 两个本地 Demo |
| `tools/spellcard-editor/*.{ts,mts,cts}` | 对应 `.js/.mjs/.cjs` 和 map | 桌面工具与原生预览 |

生成文件不纳入 Git，也不作为编辑入口。修改源码后重新构建；`build.ps1` 会先编译脚本再构建 C++。原生程序加载编译后的 JS，不能直接执行含类型语法的 `.ts`。TS 文件中的相对 ESM 导入继续写 `.js` 后缀，TypeScript 在编译时解析对应 `.ts`。

独立桌面编辑器还需要自己的 Electron/CodeMirror 开发依赖：

```powershell
npm ci --prefix tools/spellcard-editor
npm run typecheck:editor
npm --prefix tools/spellcard-editor run build
```

编辑器构建入口 `build.mts` 由 Node 24 直接执行，先做完整类型检查与编译，再打包 CodeMirror。Electron 与前端依赖不进入 thlib、原生运行包或普通游戏。

## 游戏接入

使用公开入口，避免引用内部源码目录：

```ts
import { TouhouApplication, type TouhouApplicationOptions, type TouhouResources } from '@ts-stg/thlib/touhou';

export function createApplication(resources: TouhouResources) {
  const options: TouhouApplicationOptions = {
    resources,
    gameOptions: {
      stage(game, frame) {
        // 编写本作的敌人、弹幕和关卡事件。
      }
    }
  };
  return new TouhouApplication(options);
}
```

JS 使用方沿用相同导入，不需要迁移；TS 使用方自动获得从实现生成的声明。原生宿主优先加载 `packages/thlib/dist` 或 `node_modules/@ts-stg/thlib/dist`，不再回退到旧版包的 `src/*.js`。编译阶段不改变运行时后端、数值精度、碰撞、帧时序、随机种子或回放格式。

## SDK 与 npm 包

`npm pack -w @ts-stg/thlib` 自动先构建。压缩包同时携带 TS 源码、编译后的 JS、声明、maps、独立编译配置以及公共素材；消费预编译包无需运行构建。`.\package.ps1` 同样先构建 thlib，再按现有 SDK 白名单打包，默认仍不带 Demo。

验证包括 `node tools/verify-thlib-types.mjs` 的独立严格 TS 使用方、`npm run test:package` 的仓库外安装及原生加载、Node 回归、CMake/CTest 与 `npm run test:integration` 的确定性模拟/回放。原有资源归属、许可证与发布范围不变。
